// ─────────────────────────────────────────────────────────────────────────────
// ServerMonitorService: Monitors system resources (CPU, RAM, Disk) and alerts 
// the admin when usage spikes, including the top 5 resource-consuming processes.
// ─────────────────────────────────────────────────────────────────────────────

import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Bot } from 'grammy';
import { config } from '../config';
import { redis } from '../cache/redis';
import { log } from '../utils/logger';
import { sendNotification } from '../utils/notifier';

const execAsync = promisify(exec);

export interface ProcessInfo {
  pid: string;
  cpu: string;
  mem: string;
  name: string;
}

export class ServerMonitorService {
  private static bot: Bot | null = null;

  static setBot(bot: Bot): void {
    this.bot = bot;
  }

  private static cpuAverage() {
    let totalIdle = 0;
    let totalTick = 0;
    const cpus = os.cpus();
    for (let i = 0; i < cpus.length; i++) {
      const cpu = cpus[i];
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }
    return { idle: totalIdle, total: totalTick };
  }

  /**
   * Calculates current CPU usage across all cores (summed, up to cores * 100%)
   */
  static getCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startMeasure = this.cpuAverage();
      setTimeout(() => {
        const endMeasure = this.cpuAverage();
        const idleDifference = endMeasure.idle - startMeasure.idle;
        const totalDifference = endMeasure.total - startMeasure.total;
        
        const cpus = os.cpus();
        const numCores = cpus.length;
        
        if (totalDifference === 0) {
          resolve(0);
          return;
        }
        
        const percentageCpu = Math.round((1 - idleDifference / totalDifference) * 100 * numCores);
        resolve(percentageCpu);
      }, 1000);
    });
  }

  /**
   * Returns disk space utilization percentage of the root directory
   */
  static async getDiskUsage(): Promise<number> {
    try {
      const { stdout } = await execAsync('df -h /');
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) return 0;
      const match = lines[1].match(/(\d+)%/);
      if (match) {
        return parseInt(match[1]);
      }
      return 0;
    } catch (err) {
      log.error('ServerMonitor: Failed to get disk usage', { error: (err as Error).message });
      return 0;
    }
  }

  /**
   * Executes platform-specific shell commands to retrieve the top 5 resource processes
   */
  static async getTopProcesses(sortBy: 'cpu' | 'mem'): Promise<ProcessInfo[]> {
    const isMac = os.platform() === 'darwin';
    let cmd = '';
    
    if (isMac) {
      if (sortBy === 'cpu') {
        cmd = 'ps -eo pid,pcpu,pmem,comm -r | head -n 6';
      } else {
        cmd = 'ps -eo pid,pcpu,pmem,comm -m | head -n 6';
      }
    } else {
      // Linux command
      if (sortBy === 'cpu') {
        cmd = 'ps -eo pid,%cpu,%mem,comm --sort=-%cpu | head -n 6';
      } else {
        cmd = 'ps -eo pid,%cpu,%mem,comm --sort=-%mem | head -n 6';
      }
    }

    try {
      const { stdout } = await execAsync(cmd);
      return this.parsePsOutput(stdout);
    } catch (err) {
      log.error('ServerMonitor: Failed to get top processes', { error: (err as Error).message });
      return [];
    }
  }

  private static parsePsOutput(stdout: string): ProcessInfo[] {
    const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return [];

    const results: ProcessInfo[] = [];
    // Skip header (lines[0])
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length >= 4) {
        const pid = parts[0];
        const cpu = parts[1];
        const mem = parts[2];
        const fullCmd = parts.slice(3).join(' ');
        const name = fullCmd.split('/').pop() || fullCmd;
        results.push({ pid, cpu, mem, name: name.substring(0, 20) });
      }
    }
    return results;
  }

  /**
   * Performs resource checks and broadcasts alert if any resource spikes
   */
  static async checkResources(): Promise<void> {
    if (!this.bot || !config.bot.adminId) {
      return;
    }

    try {
      const cpuUsage = await this.getCpuUsage();
      
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const ramUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);
      
      const diskUsage = await this.getDiskUsage();

      const numCores = os.cpus().length;
      const avgCpuUsage = Math.round(cpuUsage / numCores);

      const cpuThreshold = config.serverMonitor.cpuThreshold;
      const ramThreshold = config.serverMonitor.ramThreshold;
      const diskThreshold = config.serverMonitor.diskThreshold;

      let spiked = false;
      const spikeReasons: string[] = [];
      let topProcessesType: 'cpu' | 'mem' | null = null;

      if (avgCpuUsage >= cpuThreshold) {
        spiked = true;
        spikeReasons.push(`⚡ <b>High CPU:</b> ${avgCpuUsage}% (Threshold: ${cpuThreshold}%)`);
        topProcessesType = 'cpu';
      }
      if (ramUsage >= ramThreshold) {
        spiked = true;
        spikeReasons.push(`🧠 <b>High RAM:</b> ${ramUsage}% (Threshold: ${ramThreshold}%)`);
        if (!topProcessesType) topProcessesType = 'mem';
      }
      if (diskUsage >= diskThreshold) {
        spiked = true;
        spikeReasons.push(`💾 <b>High Disk:</b> ${diskUsage}% (Threshold: ${diskThreshold}%)`);
        if (!topProcessesType) topProcessesType = 'cpu'; // Default to CPU processes for disk
      }

      if (spiked) {
        const cooldownKey = 'server_monitor:alert_cooldown';
        const inCooldown = await redis.get(cooldownKey);
        
        if (inCooldown) {
          log.debug('ServerMonitor: Spike detected but monitor is in alert cooldown.');
          return;
        }

        const sortBy = topProcessesType || 'cpu';
        const topProcesses = await this.getTopProcesses(sortBy);
        
        let processTable = '';
        if (topProcesses.length > 0) {
          processTable = `\n📊 <b>Top 5 Processes (by ${sortBy.toUpperCase()}):</b>\n` +
            `<code>PID    CPU%  MEM%  COMMAND</code>\n` +
            topProcesses.map(p => 
              `<code>${p.pid.padEnd(7)}${p.cpu.padEnd(6)}${p.mem.padEnd(6)}${p.name}</code>`
            ).join('\n');
        }

        const host = config.serverMonitor.host || os.hostname();
        const dateStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

        const message = [
          `⚠️ <b>SERVER LIMIT ALERT</b>`,
          `🌐 Host: <b>${host}</b>`,
          `────────────────────`,
          `⚡ CPU: <b>${cpuUsage}%</b> (${numCores} Cores, Avg: ${avgCpuUsage}%)`,
          `🧠 RAM: <b>${ramUsage}%</b>`,
          `💾 Disk: <b>${diskUsage}%</b>`,
          `────────────────────`,
          `⏰ ${dateStr}`,
          ``,
          `🚨 <b>Spike Detected:</b>`,
          ...spikeReasons.map(r => `• ${r}`),
          processTable,
        ].join('\n');

        await sendNotification(this.bot, config.bot.adminId, message);
        log.warn('ServerMonitor: Resource limit alert sent', { cpuUsage, ramUsage, diskUsage });

        // Set cooldown period
        const cooldownSeconds = config.serverMonitor.cooldownMins * 60;
        await redis.setex(cooldownKey, cooldownSeconds, '1');
      }
    } catch (err) {
      log.error('ServerMonitor: Resource check failed', { error: (err as Error).message });
    }
  }
}
