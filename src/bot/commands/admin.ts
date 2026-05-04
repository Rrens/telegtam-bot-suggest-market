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
