import { CommandContext, Context } from 'grammy';
import { db } from '../../db';
import { redis } from '../../cache/redis';
import { config } from '../../config';
import { log } from '../../utils/logger';
import os from 'os';

export async function handleInfo(ctx: CommandContext<Context>): Promise<void> {
  const loadingMsg = await ctx.reply('🔍 Gathering system information...');

  try {
    // 1. Bot & Channel Info
    const me = await ctx.api.getMe();
    let channelInfo = 'Not configured';
    let memberCount = 0;

    if (config.bot.channelId) {
      try {
        const chat = await ctx.api.getChat(config.bot.channelId);
        memberCount = await ctx.api.getChatMemberCount(config.bot.channelId);
        channelInfo = `<b>${chat.type === 'channel' ? (chat as any).title : 'Private'}</b> (@${(chat as any).username || 'N/A'}) [${chat.id}]`;
      } catch (err) {
        channelInfo = `Configured (${config.bot.channelId}) but inaccessible ✗`;
      }
    }

    // 2. Database Stats
    let dbStatus = 'Connected ✓';
    let userCount = 0;
    let assetCount = 0;
    let alertCount = 0;
    let newsCount = 0;
    let signalCount = 0;

    try {
      userCount = (await db('users').count('id as cnt'))[0].cnt as number;
      assetCount = (await db('assets').count('id as cnt'))[0].cnt as number;
      alertCount = (await db('alerts').count('id as cnt'))[0].cnt as number;
      newsCount = (await db('news_cache').count('id as cnt'))[0].cnt as number;
      signalCount = (await db('signals').count('id as cnt'))[0].cnt as number;
    } catch (err) {
      dbStatus = 'Error ✗';
    }

    // 3. Redis Stats
    let redisStatus = 'Connected ✓';
    let redisMemory = 'N/A';
    try {
      const info = await redis.info('memory');
      const match = info.match(/used_memory_human:(\S+)/);
      if (match) redisMemory = match[1];
    } catch (err) {
      redisStatus = 'Error ✗';
    }

    // 4. System Info
    const uptimeSeconds = Math.floor(process.uptime());
    const uptime = formatUptime(uptimeSeconds);
    const nodeVer = process.version;
    const platform = `${os.platform()} ${os.release()} (${os.arch()})`;
    const loadAvg = os.loadavg().map(l => l.toFixed(2)).join(', ');
    const totalMem = (os.totalmem() / (1024 ** 3)).toFixed(2);
    const freeMem = (os.freemem() / (1024 ** 3)).toFixed(2);

    const message = [
      `🤖 <b>Bot Information</b>`,
      `Name: ${me.first_name}`,
      `Username: @${me.username}`,
      `ID: <code>${me.id}</code>`,
      ``,
      `📢 <b>Channel Status</b>`,
      `Channel: ${channelInfo}`,
      `Members: ${memberCount.toLocaleString()}`,
      ``,
      `📊 <b>Platform Statistics</b>`,
      `Users: ${userCount.toLocaleString()}`,
      `Tracked Assets: ${assetCount.toLocaleString()}`,
      `Active Alerts: ${alertCount.toLocaleString()}`,
      `Total Signals: ${signalCount.toLocaleString()}`,
      `News in Cache: ${newsCount.toLocaleString()}`,
      ``,
      `⚙️ <b>System Status</b>`,
      `Database: ${dbStatus}`,
      `Redis: ${redisStatus} (Memory: ${redisMemory})`,
      `Uptime: ${uptime}`,
      `Load Avg: ${loadAvg}`,
      `Memory: ${freeMem}GB / ${totalMem}GB free`,
      `Node.js: ${nodeVer}`,
      `OS: ${platform}`,
    ].join('\n');

    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, message, { parse_mode: 'HTML' });
  } catch (err) {
    log.error('Info command failed', { error: (err as Error).message });
    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, `❌ Failed to retrieve system information: ${(err as Error).message}`);
  }
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}
