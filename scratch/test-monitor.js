require('dotenv').config();
const { connectDb } = require('../dist/src/db/index.js');
const { ServerMonitorService } = require('../dist/src/services/ServerMonitorService.js');
const { Bot } = require('grammy');
const { config } = require('../dist/src/config/index.js');
const { redis } = require('../dist/src/cache/redis.js');

async function test() {
  await connectDb();
  
  const bot = new Bot(config.bot.token);
  ServerMonitorService.setBot(bot);
  
  console.log('Current Configured Thresholds:');
  console.log(`- CPU: ${config.serverMonitor.cpuThreshold}%`);
  console.log(`- RAM: ${config.serverMonitor.ramThreshold}%`);
  console.log(`- Disk: ${config.serverMonitor.diskThreshold}%`);
  console.log(`- Admin ID: ${config.bot.adminId}`);
  
  console.log('\nOverriding thresholds to 1% to force trigger...');
  config.serverMonitor.cpuThreshold = 1;
  config.serverMonitor.ramThreshold = 1;
  config.serverMonitor.diskThreshold = 1;
  
  await redis.del('server_monitor:alert_cooldown');
  
  console.log('\nChecking resources and triggering alert...');
  await ServerMonitorService.checkResources();
  
  console.log('\nTest complete.');
  process.exit(0);
}

test().catch(console.error);
