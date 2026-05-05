// ─────────────────────────────────────────────────────────────────────────────
// /sentiment command: Shows the Crypto Fear & Greed Index.
// Data source: alternative.me (free, updates daily).
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context } from 'grammy';
import { FearGreedService } from '../../services/FearGreedService';
import { log } from '../../utils/logger';

export async function handleSentiment(ctx: CommandContext<Context>): Promise<void> {
  const loadingMsg = await ctx.reply('📊 Fetching market sentiment...', { parse_mode: 'HTML' });

  try {
    const data = await FearGreedService.getIndex();

    if (!data) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        '❌ <b>Failed to fetch sentiment data.</b>\n\nCoba lagi beberapa saat.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const { value, classification, timestamp } = data;
    const date = new Date(timestamp).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    // Build gauge bar (20 chars wide)
    const filledCount = Math.round((value / 100) * 20);
    const gauge = '█'.repeat(filledCount) + '░'.repeat(20 - filledCount);

    // Determine color emoji and trading implication
    let emoji = '';
    let color = '';
    let advice = '';
    if (value <= 20)       { emoji = '🔴'; color = 'Extreme Fear';  advice = 'Pasar sangat takut. Ini sering menjadi <b>peluang beli</b> bagi contrarian trader. DYOR!'; }
    else if (value <= 40)  { emoji = '🟠'; color = 'Fear';          advice = 'Sentimen negatif dominan. Hati-hati, volatilitas tinggi. Wait and see.'; }
    else if (value <= 60)  { emoji = '🟡'; color = 'Neutral';       advice = 'Pasar sedang seimbang. Tidak ada sinyal kuat ke arah mana pun.'; }
    else if (value <= 80)  { emoji = '🟢'; color = 'Greed';         advice = 'Pasar mulai serakah. Pertimbangkan untuk <b>take profit</b> sebagian.'; }
    else                   { emoji = '🔴'; color = 'Extreme Greed'; advice = '⚠️ Pasar sangat serakah. Ini sering mendahului <b>koreksi tajam</b>. Waspada!'; }

    const message = [
      `📊 <b>Crypto Fear &amp; Greed Index</b>`,
      ``,
      `${emoji} <b>${value} / 100</b> — ${classification}`,
      ``,
      `<code>[${gauge}]</code>`,
      `<code> 0   Extreme Fear           Extreme Greed 100</code>`,
      ``,
      `📅 Data: <i>${date}</i>`,
      ``,
      `─────────────────────────`,
      `💡 <b>Interpretasi:</b>`,
      advice,
      `─────────────────────────`,
      ``,
      `<i>Skala:</i>`,
      `<i>0-24: Extreme Fear  |  25-44: Fear</i>`,
      `<i>45-55: Neutral  |  56-75: Greed  |  76-100: Extreme Greed</i>`,
      ``,
      `<i>⚠ Bukan saran finansial. Selalu lakukan riset sendiri.</i>`,
    ].join('\n');

    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, message, {
      parse_mode: 'HTML',
    });

    log.info('Sentiment command', { userId: ctx.from?.id, value, classification });
  } catch (err) {
    log.error('Sentiment command failed', { error: (err as Error).message });
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      '❌ Gagal mengambil data sentimen.',
      { parse_mode: 'HTML' }
    ).catch(() => {});
  }
}
