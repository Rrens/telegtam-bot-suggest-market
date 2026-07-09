import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

function cpuAverage() {
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

function getCpuUsage(): Promise<number> {
  return new Promise((resolve) => {
    const startMeasure = cpuAverage();
    setTimeout(() => {
      const endMeasure = cpuAverage();
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

async function getDiskUsage(): Promise<number> {
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
    console.error('Failed to get disk usage', err);
    return 0;
  }
}

async function getTopProcesses(sortBy: 'cpu' | 'mem'): Promise<string> {
  const isMac = os.platform() === 'darwin';
  let cmd = '';
  if (isMac) {
    if (sortBy === 'cpu') {
      cmd = 'ps -eo pid,pcpu,pmem,comm -r | head -n 6';
    } else {
      cmd = 'ps -eo pid,pcpu,pmem,comm -m | head -n 6';
    }
  } else {
    if (sortBy === 'cpu') {
      cmd = 'ps -eo pid,%cpu,%mem,comm --sort=-%cpu | head -n 6';
    } else {
      cmd = 'ps -eo pid,%cpu,%mem,comm --sort=-%mem | head -n 6';
    }
  }

  try {
    const { stdout } = await execAsync(cmd);
    return stdout.trim();
  } catch (err) {
    return `Error getting processes: ${(err as Error).message}`;
  }
}

function parsePsOutput(stdout: string): { pid: string; cpu: string; mem: string; name: string }[] {
  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return [];

  const results: { pid: string; cpu: string; mem: string; name: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length >= 4) {
      const pid = parts[0];
      const cpu = parts[1];
      const mem = parts[2];
      const fullCmd = parts.slice(3).join(' ');
      const name = fullCmd.split('/').pop() || fullCmd;
      results.push({ pid, cpu, mem, name: name.substring(0, 25) });
    }
  }
  return results;
}

async function main() {
  console.log('Calculating CPU usage (1s)...');
  const cpu = await getCpuUsage();
  console.log(`CPU: ${cpu}%`);

  const ram = Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
  console.log(`RAM: ${ram}%`);

  const disk = await getDiskUsage();
  console.log(`Disk: ${disk}%`);

  console.log('\nTop CPU Processes:');
  const cpuProc = await getTopProcesses('cpu');
  console.log(cpuProc);
  console.log('Parsed:', parsePsOutput(cpuProc));

  console.log('\nTop MEM Processes:');
  const memProc = await getTopProcesses('mem');
  console.log(memProc);
  console.log('Parsed:', parsePsOutput(memProc));
}

main().catch(console.error);
