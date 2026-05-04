import { CommandContext, Context } from 'grammy';
import { db } from '../../db';
import { log } from '../../utils/logger';
import { config } from '../../config';

export async function handleAdmin(ctx: CommandContext<Context>): Promise<void> {
  const userId = ctx.from!.id.toString();

  // Simple security check (only allow specific admin IDs)
  if (!config.bot.adminId || userId !== config.bot.adminId) {
    log.warn('Unauthorized admin access attempt', { userId, expectedAdminId: config.bot.adminId });
    // If not admin, don't even acknowledge the command exists for security
    return;
  }

  const loadingMsg = await ctx.reply('📊 Loading admin dashboard...');

  try {
    // 1. Stats Summary
    const userCount = (await db('users').count('id as cnt'))[0].cnt;
    const totalChats = (await db('chat_log').count('id as cnt'))[0].cnt;
    const assetsCount = (await db('assets').count('id as cnt'))[0].cnt;
    
    // 2. Recent Active Users (last 24h)
    const activeUsers = await db('chat_log')
      .where('created_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .distinct('user_id');

    // 3. Last 10 Logs
    const recentLogs = await db('chat_log')
      .orderBy('created_at', 'desc')
      .limit(10);

    const logsText = recentLogs.map(l => 
      `• <b>${l.username || l.user_id}</b>: <code>${l.content.substring(0, 30)}</code>`
    ).join('\n');

    const message = [
      `👑 <b>Admin Dashboard</b>`,
      `--------------------------------------`,
      `👥 Total Users: <b>${userCount}</b>`,
      `🕒 Active (24h): <b>${activeUsers.length}</b>`,
      `📦 Total Assets Tracked: <b>${assetsCount}</b>`,
      `💬 Total Interactions: <b>${totalChats}</b>`,
      `--------------------------------------`,
      `📜 <b>Recent Activity:</b>`,
      logsText,
      `--------------------------------------`,
      `<i>Dashboard generated at ${new Date().toLocaleTimeString()}</i>`
    ].join('\n');

    // Add a button to open the Web Dashboard
    // Note: User should configure BASE_URL in .env (e.g., http://1.2.3.4:3000)
    const baseUrl = process.env.BASE_URL || `http://localhost:${config.app.port || 3000}`;
    const dashboardUrl = `${baseUrl}/dashboard?token=${config.bot.adminId}`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🌐 Open Web Dashboard', url: dashboardUrl }]
      ]
    };

    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, message, { 
      parse_mode: 'HTML',
      reply_markup: keyboard 
    });
  } catch (err) {
    log.error('Admin command failed', { error: (err as Error).message });
    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, '❌ Failed to load dashboard.');
  }
}

export async function handleBroadcast(ctx: CommandContext<Context>): Promise<void> {
  const userId = ctx.from!.id.toString();

  // Security check
  if (!config.bot.adminId || userId !== config.bot.adminId) {
    return;
  }

  const message = ctx.match?.trim();
  if (!message) {
    await ctx.reply('Usage: /broadcast &lt;pesan HTML&gt;\nContoh: /broadcast Halo semua, server sedang <b>maintenance</b>', { parse_mode: 'HTML' });
    return;
  }

  const loadingMsg = await ctx.reply('📢 Broadcasting message...');
  
  try {
    const users = await db('users').select('id');
    let successCount = 0;
    let failCount = 0;

    const broadcastText = `📢 <b>PENGUMUMAN ADMIN</b>\n\n${message}`;

    for (const user of users) {
      try {
        await ctx.api.sendMessage(user.id, broadcastText, { parse_mode: 'HTML' });
        successCount++;
      } catch (err) {
        failCount++;
      }
      // Delay 50ms to respect Telegram rate limits (max 30 msgs/sec)
      await new Promise(r => setTimeout(r, 50));
    }

    await ctx.api.editMessageText(
      ctx.chat!.id, 
      loadingMsg.message_id, 
      `✅ <b>Broadcast Selesai!</b>\n\nBerhasil dikirim ke: ${successCount} user\nGagal (blokir bot): ${failCount} user`,
      { parse_mode: 'HTML' }
    );
    log.info('Admin broadcasted message', { successCount, failCount });
  } catch (err) {
    log.error('Broadcast failed', { error: (err as Error).message });
    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, '❌ Failed to broadcast message.');
  }
}
