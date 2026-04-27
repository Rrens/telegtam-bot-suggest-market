import { CommandContext, Context } from 'grammy';
import { AlertService } from '../../services/AlertService';
import { formatPortfolio } from '../../utils/formatter';

export async function handlePortfolio(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);
  const loadingMsg = await ctx.reply('Computing portfolio...');

  try {
    const portfolio = await AlertService.buildPortfolio(userId);

    if (portfolio.assets.length === 0) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        'Your portfolio is empty. Use /add to start tracking assets.'
      );
      return;
    }

    const text = formatPortfolio(portfolio);
    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, text, { parse_mode: 'HTML' });
  } catch (err) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      `Failed to fetch portfolio: ${(err as Error).message}`
    );
  }
}
