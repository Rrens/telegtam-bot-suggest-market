// ─────────────────────────────────────────────────────────────────────────────
// /smartmoney command: Shows current tracked smart money wallets and allows
// manual scan trigger. Displays real-time activity of known profitable traders.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context } from 'grammy';
import { SmartMoneyService } from '../../services/SmartMoneyService';
import { log } from '../../utils/logger';

// Usage: /smartmoney         → shows tracked wallets list
// Usage: /smartmoney scan    → manually trigger scan now
export async function handleSmartMoney(ctx: CommandContext<Context>): Promise<void> {
  const arg = ctx.match?.trim().toLowerCase();

  if (!arg || arg !== 'scan') {
    // Show tracked wallets list
    const wallets = SmartMoneyService.getTrackedWallets();
    const walletList = wallets.map((w, i) => {
      const shortAddr = `${w.address.slice(0, 6)}...${w.address.slice(-4)}`;
      return `${i + 1}. <b>${w.label}</b>\n   <code>${shortAddr}</code>`;
    }).join('\n\n');

    await ctx.reply([
      `🐋 <b>Smart Money Tracker</b>`,
      ``,
      `Bot memantau dompet-dompet trader paling profitable di Solana.`,
      `Setiap kali mereka beli token baru, kamu akan dapat notifikasi di channel.`,
      ``,
      `<b>📋 Wallet yang dipantau:</b>`,
      walletList,
      ``,
      `<b>⚡ Scan sekarang:</b> <code>/smartmoney scan</code>`,
      `<b>🔄 Auto-scan:</b> Setiap 30 menit otomatis`,
      ``,
      `<i>⚠ Copy trading selalu memiliki risiko. DYOR!</i>`,
    ].join('\n'), { parse_mode: 'HTML' });
    return;
  }

  // Manual scan
  const loadingMsg = await ctx.reply(
    `🐋 <b>Scanning smart money wallets...</b>\n\nMengecek aktivitas ${SmartMoneyService.getTrackedWallets().length} dompet. Harap tunggu...`,
    { parse_mode: 'HTML' }
  );

  try {
    const moves = await SmartMoneyService.scanWallets();

    if (moves.length === 0) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        [
          `🐋 <b>Smart Money Scanner</b>`,
          ``,
          `😴 <b>Tidak ada aktivitas baru terdeteksi.</b>`,
          ``,
          `Semua token yang terdeteksi sedang dalam cooldown (2 jam).`,
          `Coba lagi nanti atau tunggu notifikasi otomatis.`,
        ].join('\n'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Delete loading message
    await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => {});

    // Header
    await ctx.reply(
      `🐋 <b>Smart Money Scan — ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</b>\n\nDitemukan <b>${moves.length}</b> aktivitas baru!`,
      { parse_mode: 'HTML' }
    );

    // Send each move
    const toShow = moves.slice(0, 5); // Max 5 per scan
    for (const move of toShow) {
      const message = SmartMoneyService.formatAlert(move);
      await ctx.reply(message, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });

      const escapedSymbol = move.tokenSymbol.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      await ctx.reply(`📋 <b>CA ${escapedSymbol}:</b>\n<code>${move.tokenAddress}</code>`, { parse_mode: 'HTML' });

      await SmartMoneyService.setCooldown(move.walletAddress, move.tokenAddress);
      await new Promise(r => setTimeout(r, 800));
    }

    log.info('SmartMoney manual scan triggered', {
      userId: ctx.from?.id,
      movesFound: moves.length,
    });
  } catch (err) {
    log.error('SmartMoney command failed', { error: (err as Error).message });
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      `❌ <b>Scan gagal.</b>\n\nCoba lagi nanti.`,
      { parse_mode: 'HTML' }
    ).catch(() => ctx.reply('❌ Gagal scan wallet.'));
  }
}
