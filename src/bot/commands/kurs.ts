import { CommandContext, Context } from 'grammy';
import { PriceService } from '../../services/PriceService';

export async function handleKurs(ctx: CommandContext<Context>): Promise<void> {
  try {
    const rate = await PriceService.getUsdIdrRate();
    const formattedRate = rate.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    await ctx.reply(
      `<b>💵 USD/IDR Exchange Rate</b>\n\n` +
      `Current Rate: <b>Rp${formattedRate}</b>\n\n` +
      `<i>Source: Yahoo Finance (USDIDR=X)</i>\n\n` +
      `💡 Tips: You can set an alert for the exchange rate using:\n` +
      `<code>/alert USDIDR=X gte 17500</code>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    await ctx.reply(`Failed to fetch exchange rate: ${(err as Error).message}`);
  }
}
