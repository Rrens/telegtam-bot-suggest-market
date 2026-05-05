// ─────────────────────────────────────────────────────────────────────────────
// /smartmoney command: Track profitable Solana wallets with copyable addresses.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { SolanaScreenerService } from '../../services/SolanaScreenerService';
import { log } from '../../utils/logger';

export async function handleSmartMoney(ctx: CommandContext<Context> | Context): Promise<void> {
  const wallets = [
    { name: 'Raydium AMM', address: '5Q544fKrMJuWn6sZP6uPZ6XN9D4B53p7e8b6VfZe4j1' },
    { name: 'Smart Whale #1', address: 'GThUX1M8XfPZ2r3L2vY7w6y5t4r3e2w1q0p9o8n7m6hFMJ' }, // Contoh, sesuaikan wallet asli
    { name: 'Smart Whale #2', address: 'BQ72nSqWfPZ2r3L2vY7w6y5t4r3e2w1q0p9o8n7m6GQDV' },
    { name: 'Top Trader #1', address: 'AC5RDfWfPZ2r3L2vY7w6y5t4r3e2w1q0p9o8n7m6Yo65' },
  ];

  // Jika dipicu oleh callback "scan"
  if (ctx.callbackQuery?.data === 'exec_smartmoney_scan') {
    await ctx.answerCallbackQuery('🔍 Scanning wallets...');
    await ctx.reply('⏳ Sedang memproses data on-chain terbaru... mohon tunggu.');
    
    try {
      const results = await SolanaScreenerService.getWhaleMovements();
      if (results.length === 0) {
        return (ctx as any).reply('✅ Scan selesai: Tidak ada pergerakan whale baru dalam 30 menit terakhir.');
      }
      
      let msg = `🐋 <b>Whale Movements Detected!</b>\n\n`;
      results.forEach((r: any, i: number) => {
        msg += `${i+1}. <b>${r.symbol}</b>\n`;
        msg += `   Action: ${r.type.toUpperCase()}\n`;
        msg += `   Amount: $${r.usdAmount.toLocaleString()}\n`;
        msg += `   Wallet: <code>${r.wallet}</code>\n\n`;
      });
      return (ctx as any).reply(msg, { parse_mode: 'HTML' });
    } catch (e) {
      return (ctx as any).reply('❌ Gagal melakukan scan on-chain. Coba lagi nanti.');
    }
  }

  const message = [
    `🐋 <b>Smart Money Tracker</b>`,
    ``,
    `Bot memantau dompet-dompet trader paling profitable di Solana. Setiap kali mereka beli token baru, lo bakal dapet notifikasi.`,
    ``,
    `📋 <b>Wallet yang dipantau (Tap to Copy):</b>`,
    ...wallets.map((w, i) => `${i + 1}. <b>${w.name}</b>\n   <code>${w.address}</code>`),
    ``,
    `🔄 <b>Auto-scan:</b> Aktif (Setiap 30 menit)`,
    ``,
    `⚠️ <i>Copy trading selalu memiliki risiko. DYOR!</i>`,
  ].join('\n');

  const keyboard = new InlineKeyboard()
    .text('⚡ Scan Sekarang', 'exec_smartmoney_scan').row()
    .text('⬅️ Back to Menu', 'back_to_menu');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(message, { parse_mode: 'HTML', reply_markup: keyboard });
  } else {
    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}
