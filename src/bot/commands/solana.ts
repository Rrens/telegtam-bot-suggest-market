// ─────────────────────────────────────────────────────────────────────────────
// /solana command: Scan for new Solana gems with direct action button.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { SolanaScreenerService } from '../../services/SolanaScreenerService';
import { isFeatureEnabled } from '../middleware/featureFlag';

export async function handleSolana(ctx: CommandContext<Context> | Context): Promise<void> {
  if (!await isFeatureEnabled(ctx, 'solanaScreener')) return;

  // Jika dipicu oleh callback
  if (ctx.callbackQuery?.data === 'exec_solana_scan') {
    await ctx.answerCallbackQuery('🔍 Scanning Solana Network...');
    await ctx.reply('⏳ Mencari koin yang baru graduate dari Pump.fun... mohon tunggu.');
    
    try {
      const gems = await SolanaScreenerService.getGraduatedTokens();
      if (gems.length === 0) {
        return (ctx as any).reply('✅ Scan selesai: Belum ditemukan koin baru yang memenuhi kriteria premium.');
      }
      
      let msg = `💎 <b>New Solana Gems Detected!</b>\n\n`;
      gems.forEach((g: any, i: number) => {
        msg += `${i+1}. <b>${g.symbol}</b> | Price: $${g.price.toFixed(6)}\n`;
        msg += `   CA: <code>${g.address}</code>\n`;
        msg += `   Volume 24h: $${g.volume24h.toLocaleString()}\n`;
        msg += `   <a href="https://rugcheck.xyz/tokens/${g.address}">Check Security</a> | <a href="https://dexscreener.com/solana/${g.address}">Chart</a>\n\n`;
      });
      return (ctx as any).reply(msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (e) {
      return (ctx as any).reply('❌ Gagal menarik data dari DexScreener. Coba lagi nanti.');
    }
  }

  const message = [
    `🚀 <b>Solana Gem Hunter</b>`,
    ``,
    `Bot memantau koin yang baru "Graduate" dari Launchpad (Pump.fun) ke Raydium dengan kriteria:`,
    `• Liquidity terjamin`,
    `• Volume organik`,
    `• Fresh listing (under 24h)`,
    ``,
    `Klik tombol di bawah buat nyari koin potensial sekarang:`,
  ].join('\n');

  const keyboard = new InlineKeyboard()
    .text('💎 Scan Gems Sekarang', 'exec_solana_scan').row()
    .text('⬅️ Back to Menu', 'back_to_menu');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(message, { parse_mode: 'HTML', reply_markup: keyboard });
  } else {
    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}
