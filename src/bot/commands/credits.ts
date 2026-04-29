import { CommandContext, Context } from 'grammy';

export async function handleCredits(ctx: CommandContext<Context>): Promise<void> {
  await ctx.reply(
    `🚀 <b>About This Bot</b>\n\n` +
    `Advanced Trading Assistant Bot is designed to help traders analyze market trends using technical indicators, news sentiment, and fundamental data.\n\n` +
    `👨‍💻 <b>Developed by:</b>\n` +
    `<b>Rendy Yusuf</b>\n\n` +
    `🔗 <b>Connect with me:</b>\n` +
    `• <a href="https://www.linkedin.com/in/rendy-yusuf/">LinkedIn Profile</a>\n` +
    `• <a href="https://rrens.my.id">Personal Website</a>\n` +
    `• <a href="https://github.com/rrens">GitHub</a>\n\n` +
    `Built with TypeScript, Grammy, and BullMQ.`,
    { parse_mode: 'HTML', link_preview_options: { is_disabled: false } }
  );
}
