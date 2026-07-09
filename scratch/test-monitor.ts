import 'dotenv/config';
import { connectDb } from '../src/db/index';
import { ServerMonitorService } from '../src/services/ServerMonitorService';
import { Bot } from 'grammy';
import { config } from '../src/config/index';

async function test() {
  await connectDb();
  
  // Initialize mock bot
  const bot = new Bot(config.bot.token);
  ServerMonitorService.setBot(bot);
  
  console.log('Current Configured Thresholds:');
  console.log(`- CPU: ${config.serverMonitor.cpuThreshold}%`);
  console.log(`- RAM: ${config.serverMonitor.ramThreshold}%`);
  console.log(`- Disk: ${config.serverMonitor.diskThreshold}%`);
  console.log(`- Host: ${config.serverMonitor.host || 'N/A'}`);
  console.log(`- Cooldown: ${config.serverMonitor.cooldownMins} mins`);
  console.log(`- Admin ID: ${config.bot.adminId}`);
  
  // Temporarily override thresholds to 1% to trigger the alert
  console.log('\nOverriding thresholds to 1% to force trigger the alert...');
  config.serverMonitor.cpuThreshold = 1;
  config.serverMonitor.ramThreshold = 1;
  config.serverMonitor.diskThreshold = 1;
  
  // Clear any existing cooldown in Redis to ensure alert triggers
  const { redis } = await import('../src/cache/redis');
  await redis.del('server_monitor:alert_cooldown');
  
  console.log('\nChecking resources and triggering alert...');
  await ServerMonitorService.checkResources();
  
  console.log('\nTesting completed.');
  process.exit(0);
}

test().catch(console.error);
