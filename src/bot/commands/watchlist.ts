// ─────────────────────────────────────────────────────────────────────────────
// /watch command: Add/remove assets from personal watchlist.
// /watchlist: Show current watchlist with live prices.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context } from 'grammy';
import { db } from '../../db';
import { PriceService } from '../../services/PriceService';
import { formatPrice, formatPct } from '../../utils/formatter';
import { log } from '../../utils/logger';

// Usage:
//   /watch BTCUSDT            → Add to watchlist
//   /watch BTCUSDT 95000      → Add with entry target
//   /watch remove BTCUSDT     → Remove from watchlist
//   /watchlist                → Show watchlist with live prices

const MAX_WATCHLIST = 15;

export async function handleWatch(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);
  const args = (ctx.match?.trim() ?? '').split(/\s+/).filter(Boolean);

  if (!args.length) {
    await ctx.reply([
      `👁 <b>Watchlist — Cara Pakai:</b>`,
      ``,
      `<code>/watch BTCUSDT</code> — Tambah ke watchlist`,
      `<code>/watch BTCUSDT 95000</code> — Tambah dengan target harga`,
      `<code>/watch remove BTCUSDT</code> — Hapus dari watchlist`,
      `<code>/watchlist</code> — Lihat semua koin incaran`,
    ].join('\n'), { parse_mode: 'HTML' });
    return;
  }

  // Remove
  if (args[0].toLowerCase() === 'remove') {
    const symbol = args[1]?.toUpperCase();
    if (!symbol) {
      await ctx.reply('Usage: <code>/watch remove BTCUSDT</code>', { parse_mode: 'HTML' });
      return;
    }
    const deleted = await db('watchlist').where({ user_id: userId, symbol }).delete();
    await ctx.reply(
      deleted > 0
        ? `✅ <b>${symbol}</b> dihapus dari watchlist.`
        : `ℹ️ <b>${symbol}</b> tidak ada di watchlist kamu.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Add
  const symbol = args[0].toUpperCase();
  const entryPrice = args[1] ? parseFloat(args[1]) : null;

  // Max watchlist check
  const count = await db('watchlist').where({ user_id: userId }).count('id as c').first();
  if (parseInt(String((count as any)?.c ?? 0)) >= MAX_WATCHLIST) {
    await ctx.reply(
      `⚠️ Watchlist penuh! Maksimum <b>${MAX_WATCHLIST} item</b>.\nHapus dulu yang tidak diperlukan: <code>/watch remove &lt;symbol&gt;</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Validate by fetching price
  let currentPrice: number | null = null;
  try {
    const priceData = await PriceService.getPrice(symbol);
    currentPrice = priceData.price;
  } catch {
    // Not a standard crypto, might be Solana token CA — allow it anyway
  }

  await db('watchlist')
    .insert({
      user_id: userId,
      symbol,
      asset_type: currentPrice !== null ? 'crypto' : 'solana_token',
      entry_price: entryPrice ?? null,
    })
    .onConflict(['user_id', 'symbol'])
    .merge({ entry_price: entryPrice ?? null });

  const lines = [
    `✅ <b>${symbol}</b> ditambahkan ke watchlist!`,
  ];
  if (currentPrice) lines.push(`Harga sekarang: <b>${formatPrice(currentPrice)}</b>`);
  if (entryPrice) lines.push(`Target entry: <b>${formatPrice(entryPrice)}</b>`);
  lines.push(``, `Lihat semua: /watchlist`);

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });

  log.info('Watchlist add', { userId, symbol, entryPrice });
}

export async function handleWatchlist(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);
  const loadingMsg = await ctx.reply('👁 <b>Fetching watchlist prices...</b>', { parse_mode: 'HTML' });

  const items = await db('watchlist').where({ user_id: userId }).orderBy('created_at', 'asc');

  if (items.length === 0) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      [
        `👁 <b>Watchlist Kamu Kosong</b>`,
        ``,
        `Tambahkan koin incaran:`,
        `<code>/watch BTCUSDT</code>`,
        `<code>/watch SOLUSDT 170</code> <i>(dengan target harga)</i>`,
      ].join('\n'),
      { parse_mode: 'HTML' }
    );
    return;
  }

  const rows: string[] = [];
  for (const item of items) {
    try {
      const priceData = await PriceService.getPrice(item.symbol);
      const changeEmoji = priceData.change24h >= 0 ? '🟢' : '🔴';
      const entryLine = item.entry_price
        ? ` | Target: <b>${formatPrice(parseFloat(item.entry_price))}</b>`
        : '';
      rows.push(
        `${changeEmoji} <b>${item.symbol}</b>: ${formatPrice(priceData.price)} (${priceData.change24h >= 0 ? '+' : ''}${formatPct(priceData.change24h)})${entryLine}`
      );
    } catch {
      rows.push(`⚪ <b>${item.symbol}</b>: <i>Harga tidak tersedia</i>`);
    }
  }

  const message = [
    `👁 <b>Watchlist — ${items.length} Aset</b>`,
    ``,
    rows.join('\n'),
    ``,
    `<i>Update: ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</i>`,
    ``,
    `Hapus: <code>/watch remove &lt;symbol&gt;</code>`,
  ].join('\n');

  await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, message, {
    parse_mode: 'HTML',
  });
}
