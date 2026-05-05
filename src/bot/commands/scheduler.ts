import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { jobOrchestrator } from '../../services/JobOrchestrator';
import { config } from '../../config';
import { log } from '../../utils/logger';

export async function handleScheduler(ctx: CommandContext<Context>): Promise<void> {
  const userId = ctx.from!.id.toString();

  // Admin only
  if (!config.bot.adminId || userId !== config.bot.adminId) {
    return;
  }

  const statuses = await jobOrchestrator.getAllStatuses();

  if (statuses.length === 0) {
    await ctx.reply('📭 No background jobs registered in Orchestrator.');
    return;
  }

  const message = [
    `⚙️ <b>Redis Job Orchestrator</b>`,
    `--------------------------------------`,
    ...statuses.map(s => {
      const icon = s.active > 0 ? '🔵' : '⚪';
      return `${icon} <b>${s.name}</b>\n` +
             `├ Wait: <code>${s.waiting}</code> | Act: <code>${s.active}</code> | Fail: <code>${s.failed}</code>\n` +
             `└ Next: <i>${s.nextRun}</i>`;
    }),
    `--------------------------------------`,
    `<i>Last updated: ${new Date().toLocaleTimeString()}</i>`
  ].join('\n');

  const keyboard = new InlineKeyboard();
  
  // Add "Run Now" buttons for each job
  statuses.forEach((s, i) => {
    keyboard.text(`🚀 Run ${s.name}`, `trigger_job:${s.name}`);
    if ((i + 1) % 2 === 0) keyboard.row();
  });
  
  keyboard.row().text('🔄 Refresh Status', 'refresh_jobs');

  await ctx.reply(message, { 
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

/**
 * Handle callback queries from the scheduler interface
 */
export async function handleSchedulerCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  if (data === 'refresh_jobs') {
    const statuses = await jobOrchestrator.getAllStatuses();
    const message = [
      `⚙️ <b>Redis Job Orchestrator</b>`,
      `--------------------------------------`,
      ...statuses.map(s => {
        const icon = s.active > 0 ? '🔵' : '⚪';
        return `${icon} <b>${s.name}</b>\n` +
               `├ Wait: <code>${s.waiting}</code> | Act: <code>${s.active}</code> | Fail: <code>${s.failed}</code>\n` +
               `└ Next: <i>${s.nextRun}</i>`;
      }),
      `--------------------------------------`,
      `<i>Last updated: ${new Date().toLocaleTimeString()}</i>`
    ].join('\n');

    await ctx.editMessageText(message, { parse_mode: 'HTML', reply_markup: ctx.callbackQuery?.message?.reply_markup });
    await ctx.answerCallbackQuery('Status Refreshed');
  }

  if (data.startsWith('trigger_job:')) {
    const jobName = data.split(':')[1];
    const result = await jobOrchestrator.triggerJob(jobName);
    
    if (result) {
      await ctx.answerCallbackQuery(`✅ Triggered ${jobName}`);
      log.info(`Manual job trigger: ${jobName} by ${ctx.from?.id}`);
    } else {
      await ctx.answerCallbackQuery(`❌ Failed to trigger ${jobName}`);
    }
  }
}
