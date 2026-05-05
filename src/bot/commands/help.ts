// ─────────────────────────────────────────────────────────────────────────────
// /help command: Detailed guide to all bot features.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context } from 'grammy';

export async function handleHelp(ctx: CommandContext<Context> | Context): Promise<void> {
  const me = await ctx.api.getMe();
  const helpMessage = [
    `<b>🤖 ${me.first_name} Intelligence - Panduan Lengkap</b>`,
    ``,
    `<b>🚀 MARKET INTELLIGENCE</b>`,
    `• <code>/today</code> - Rangkuman pasar, koin teraktif, dan top gainer hari ini.`,
    `• <code>/sentiment</code> - Cek Fear & Greed Index terbaru.`,
    `• <code>/solana</code> - Scan koin micin Solana yang berpotensi "gem" secara otomatis.`,
    `• <code>/smartmoney</code> - Pantau dompet "Smart Money" yang cuan gede di Solana.`,
    `• <code>/predict &lt;symbol&gt;</code> - Analisis teknikal mendalam + prediksi AI (contoh: <code>/predict BTC</code>).`,
    ``,
    `<b>🛡️ SECURITY & ON-CHAIN</b>`,
    `• <code>/check &lt;CA&gt;</code> - Scan keamanan koin Solana (LP Lock, Burn, Auth) via RugCheck.`,
    `• <code>/watch &lt;symbol&gt; [target]</code> - Tambahkan koin ke watchlist (bisa pake target harga).`,
    `• <code>/watchlist</code> - Lihat daftar koin incaran lo dan harga real-time.`,
    ``,
    `<b>📊 TECHNICAL ALERTS</b>`,
    `• <code>/alertrsi</code> - Setel alert otomatis (RSI Oversold/Bought atau MA Cross).`,
    `• <code>/alert &lt;symbol&gt; &lt;direction&gt; &lt;price&gt;</code> - Alert harga tradisional.`,
    ``,
    `<b>📱 MINI APP & OTHERS</b>`,
    `• <code>/app</code> - Buka Dashboard Interaktif (Mini App) buat pengalaman lebih pro.`,
    `• <code>/kurs</code> - Cek nilai tukar real-time USD ke IDR.`,
    `• <code>/paper</code> - Mulai simulasi trading (Paper Trading) tanpa modal beneran.`,
    ``,
    `─── <b>TIPS</b> ───`,
    `💡 Gunakan tombol <b>/menu</b> buat navigasi cepat tanpa perlu menghafal semua command.`,
    `💡 Pasang bot di <b>Channel</b> lo buat dapet alert Whale & Pump.fun otomatis.`,
    ``,
    `<i>Butuh bantuan lebih lanjut? Hubungi Admin.</i>`,
  ].join('\n');

  if (ctx.callbackQuery) {
    // If triggered from menu callback
    await ctx.reply(helpMessage, { parse_mode: 'HTML' });
  } else {
    await ctx.reply(helpMessage, { parse_mode: 'HTML' });
  }
}
