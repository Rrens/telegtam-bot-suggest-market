import { Context, CommandContext } from 'grammy';
import { NewsService } from '../../services/NewsService';
import { formatNews } from '../../utils/formatter';
import { isFeatureEnabled } from '../middleware/featureFlag';

// Usage: /news <symbol>
export async function handleNews(ctx: CommandContext<Context>): Promise<void> {
  if (!await isFeatureEnabled(ctx, 'news')) return;

  const symbol = ctx.match?.trim().toUpperCase();

  if (!symbol) {
    await ctx.reply('Usage: /news &lt;symbol&gt;\nExample: /news BTCUSDT', { parse_mode: 'HTML' });
    return;
  }

  const loadingMsg = await ctx.reply(`Fetching news for <b>${symbol}</b>...`, { parse_mode: 'HTML' });

  try {
    const news = await NewsService.getNews(symbol, 8);
    const message = formatNews(symbol, news);
    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, message, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      `Failed to fetch news for <b>${symbol}</b>.`,
      { parse_mode: 'HTML' }
    );
  }
}
