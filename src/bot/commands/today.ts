// ─────────────────────────────────────────────────────────────────────────────
// /today command: One-shot market overview — top movers, Fear & Greed, kurs.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context } from 'grammy';
import { PriceService } from '../../services/PriceService';
import { FearGreedService } from '../../services/FearGreedService';
import { NewsService } from '../../services/NewsService';
import { formatPrice, formatPct } from '../../utils/formatter';
import { log } from '../../utils/logger';

const TOP_CRYPTO = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'];

export async function handleToday(ctx: CommandContext<Context>): Promise<void> {
  const loadingMsg = await ctx.reply('📊 <b>Compiling market overview...</b>', { parse_mode: 'HTML' });

  try {
    // Fetch all in parallel for speed
    const [priceResults, fearGreed, usdIdr] = await Promise.all([
      Promise.allSettled(TOP_CRYPTO.map(s => PriceService.getPrice(s))),
      FearGreedService.getIndex(),
      PriceService.getUsdIdrRate(),
    ]);

    // Build price table
    const prices = priceResults
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value);

    const sorted = [...prices].sort((a, b) => b.change24h - a.change24h);
    const gainers = sorted.slice(0, 3);
    const losers  = sorted.slice(-3).reverse();

    const priceRow = (p: any) => {
      const emoji = p.change24h >= 0 ? '🟢' : '🔴';
      const sym = p.symbol.replace('USDT', '');
      return `${emoji} <b>${sym}</b>: ${formatPrice(p.price)} (${p.change24h >= 0 ? '+' : ''}${formatPct(p.change24h)})`;
    };

    // Fear & Greed
    let fgText = '<i>N/A</i>';
    if (fearGreed) {
      const fgEmoji =
        fearGreed.value <= 20 ? '🔴' :
        fearGreed.value <= 40 ? '🟠' :
        fearGreed.value <= 60 ? '🟡' :
        fearGreed.value <= 80 ? '🟢' : '🔥';
      fgText = `${fgEmoji} <b>${fearGreed.value}/100</b> — ${fearGreed.classification}`;
    }

    // Kurs USD/IDR
    const idrFormatted = usdIdr.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

    // Latest BTC news sentiment
    let sentimentText = '<i>N/A</i>';
    try {
      const sentiment = await NewsService.getAggregateSentiment('BTCUSDT');
      const sEmoji = sentiment === 'positive' ? '🟢 Positif' : sentiment === 'negative' ? '🔴 Negatif' : '🟡 Netral';
      sentimentText = sEmoji;
    } catch {}

    const now = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const message = [
      `🌅 <b>Market Overview Hari Ini</b>`,
      `<i>${now} WIB</i>`,
      ``,
      `─────────────────────────`,
      `🚀 <b>Top Gainers 24h</b>`,
      ...gainers.map(priceRow),
      ``,
      `📉 <b>Top Losers 24h</b>`,
      ...losers.map(priceRow),
      ``,
      `─────────────────────────`,
      `📊 <b>Fear &amp; Greed Index:</b> ${fgText}`,
      `💬 <b>Sentimen Berita BTC:</b> ${sentimentText}`,
      `💱 <b>Kurs USD/IDR:</b> <b>${idrFormatted}</b>`,
      `─────────────────────────`,
      ``,
      `💡 <i>Gunakan /predict &lt;symbol&gt; untuk analisis lengkap.</i>`,
      `💡 <i>Gunakan /sentiment untuk detail Fear &amp; Greed.</i>`,
    ].join('\n');

    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, message, {
      parse_mode: 'HTML',
    });

    log.info('Today command executed', { userId: ctx.from?.id });
  } catch (err) {
    log.error('Today command failed', { error: (err as Error).message });
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      '❌ Gagal mengambil data market. Coba lagi nanti.',
      { parse_mode: 'HTML' }
    ).catch(() => {});
  }
}
