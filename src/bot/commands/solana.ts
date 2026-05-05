// ─────────────────────────────────────────────────────────────────────────────
// /solana command: Manually trigger the Solana hidden gem screener on demand.
// Shows results directly in the chat instead of broadcasting to channel.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context } from 'grammy';
import { SolanaScreenerService, SolanaToken } from '../../services/SolanaScreenerService';
import { log } from '../../utils/logger';

// Usage: /solana
// Usage: /solana force  → bypass cooldown cache (fresh scan)
export async function handleSolana(ctx: CommandContext<Context>): Promise<void> {
  const arg = ctx.match?.trim().toLowerCase();
  const forceBypass = arg === 'force';

  const loadingMsg = await ctx.reply(
    `🔍 <b>Scanning Solana for hidden gems...</b>\n\n` +
    `Fetching data from DexScreener + RugCheck. Please wait...`,
    { parse_mode: 'HTML' }
  );

  try {
    const gems = await SolanaScreenerService.screen();

    if (gems.length === 0) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        [
          `🔍 <b>Solana Gem Screener</b>`,
          ``,
          `😴 <b>No gems found this scan.</b>`,
          ``,
          `Current criteria:`,
          `• Liquidity: $50K – $5M`,
          `• Volume 24h: &gt; $100K`,
          `• Price change 1h: &gt; +5%`,
          `• Price change 6h: &gt; +15%`,
          `• Token age: &lt; 7 days`,
          ``,
          `<i>Market mungkin sedang sideways. Coba lagi beberapa menit kemudian.</i>`
        ].join('\n'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Filter by cooldown (unless force flag is used)
    const toShow: SolanaToken[] = [];
    const skipped: SolanaToken[] = [];

    for (const gem of gems) {
      const onCooldown = await SolanaScreenerService.isOnCooldown(gem.address);
      if (onCooldown && !forceBypass) {
        skipped.push(gem);
      } else {
        toShow.push(gem);
      }
    }

    // Delete loading message before sending results
    await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => {});

    if (toShow.length === 0) {
      // All tokens are on cooldown
      const skippedList = skipped.map(t => {
        const escapedSymbol = t.symbol.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `• <b>${escapedSymbol}</b> — cooldown aktif`;
      }).join('\n');

      await ctx.reply(
        [
          `🔍 <b>Solana Gem Screener</b>`,
          ``,
          `⏳ <b>${skipped.length} token ditemukan tapi sedang dalam 4-jam cooldown:</b>`,
          skippedList,
          ``,
          `Gunakan <code>/solana force</code> untuk bypass cooldown dan lihat detail tetap.`,
        ].join('\n'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Send header summary first
    const headerLines = [
      `🚀 <b>Solana Gem Screener — ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</b>`,
      ``,
      `Found <b>${toShow.length}</b> potential gem(s).${skipped.length > 0 ? ` (${skipped.length} skipped: cooldown)` : ''}`,
      ``,
      `<i>Data: DexScreener + RugCheck • Bukan saran finansial!</i>`,
    ];

    await ctx.reply(headerLines.join('\n'), { parse_mode: 'HTML' });

    // Send each gem as a separate message with action buttons
    for (const token of toShow) {
      const message = SolanaScreenerService.formatAlert(token);

      const birdeyeUrl = `https://birdeye.so/token/${token.address}?chain=solana`;
      const jupiterUrl = `https://jup.ag/tokens/${token.address}`;
      const dexUrl     = token.dexUrl;

      // Inline keyboard: quick action buttons right under each alert
      const keyboard = {
        inline_keyboard: [[
          { text: '📊 DexScreener', url: dexUrl },
          { text: '🐦 Birdeye',     url: birdeyeUrl },
          { text: '⚡ Buy Jupiter', url: jupiterUrl },
        ]],
      };

      await ctx.reply(message, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard,
      });

      // Send CA as a separate copyable block
      const caMessage = `📋 <b>CA ${token.symbol}:</b>\n<code>${token.address}</code>`;
      await ctx.reply(caMessage, { parse_mode: 'HTML' });

      // Small delay between messages
      await new Promise(r => setTimeout(r, 800));
    }

    log.info('Solana manual screener triggered', {
      userId: ctx.from?.id,
      gemsFound: gems.length,
      shown: toShow.length,
      skipped: skipped.length,
      forceBypass,
    });
  } catch (err) {
    log.error('Solana command failed', { error: (err as Error).message });
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      `❌ <b>Screener failed.</b>\n\nGagal mengambil data dari DexScreener. Coba lagi nanti.`,
      { parse_mode: 'HTML' }
    ).catch(() =>
      ctx.reply(`❌ Screener gagal. Coba lagi nanti.`)
    );
  }
}
