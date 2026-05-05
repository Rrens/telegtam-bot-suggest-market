// ─────────────────────────────────────────────────────────────────────────────
// /alertrsi command: Set technical indicator-based alerts.
// Supported types:
//   /alertrsi <symbol> rsi <condition> <value>  → RSI threshold
//   /alertrsi <symbol> ma cross                 → MA50/MA200 Golden/Death Cross
//   /alertrsi stop <symbol>                     → Cancel all tech alerts for symbol
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context } from 'grammy';
import { db } from '../../db';
import { log } from '../../utils/logger';

export async function handleAlertRsi(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);
  const args = (ctx.match?.trim() ?? '').split(/\s+/).filter(Boolean);

  const usage = [
    `<b>📊 Technical Alert — Usage:</b>`,
    ``,
    `RSI Alert:`,
    `<code>/alertrsi BTCUSDT rsi lte 30</code>`,
    `<i>→ Alert when RSI drops to or below 30 (Oversold)</i>`,
    ``,
    `<code>/alertrsi BTCUSDT rsi gte 70</code>`,
    `<i>→ Alert when RSI reaches or exceeds 70 (Overbought)</i>`,
    ``,
    `MA Cross Alert:`,
    `<code>/alertrsi BTCUSDT ma cross</code>`,
    `<i>→ Alert when MA50 crosses MA200 (Golden/Death Cross)</i>`,
    ``,
    `Cancel:`,
    `<code>/alertrsi stop BTCUSDT</code>`,
  ].join('\n');

  if (args.length === 0) {
    await ctx.reply(usage, { parse_mode: 'HTML' });
    return;
  }

  // Cancel: /alertrsi stop BTCUSDT
  if (args[0].toLowerCase() === 'stop') {
    if (!args[1]) {
      await ctx.reply('Usage: /alertrsi stop &lt;symbol&gt;', { parse_mode: 'HTML' });
      return;
    }
    const symbol = args[1].toUpperCase();
    const count = await db('alerts')
      .where({ user_id: userId, symbol, active: true })
      .whereIn('alert_type', ['price_target']) // our tech alerts are stored as price_target with indicator set
      .whereNotNull('indicator')
      .update({ active: false });

    await ctx.reply(
      count > 0
        ? `✅ <b>${count}</b> technical alert untuk <b>${symbol}</b> dibatalkan.`
        : `ℹ️ Tidak ada technical alert aktif untuk <b>${symbol}</b>.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Need at least: <symbol> <type> <...>
  if (args.length < 3) {
    await ctx.reply(usage, { parse_mode: 'HTML' });
    return;
  }

  const symbol    = args[0].toUpperCase();
  const alertKind = args[1].toLowerCase(); // 'rsi' or 'ma'

  // ── RSI Alert ────────────────────────────────────────────────────────────────
  if (alertKind === 'rsi') {
    const condition = args[2]?.toLowerCase();
    const value     = parseFloat(args[3] ?? '');

    if ((condition !== 'lte' && condition !== 'gte') || isNaN(value) || value < 0 || value > 100) {
      await ctx.reply('❌ Format salah.\nContoh: <code>/alertrsi BTCUSDT rsi lte 30</code>', { parse_mode: 'HTML' });
      return;
    }

    const direction = condition === 'lte' ? '≤' : '≥';
    const label     = value <= 30 ? 'Oversold Zone' : value >= 70 ? 'Overbought Zone' : 'Custom Level';
    const desc      = `RSI ${direction} ${value} (${label})`;

    await db('alerts').insert({
      user_id: userId,
      symbol,
      alert_type: 'price_target', // Reusing the field; indicator column differentiates
      condition,
      target_value: value,
      active: true,
      indicator: 'rsi',
      timeframe: '1d',
      description: desc,
    });

    await ctx.reply([
      `✅ <b>RSI Alert diaktifkan!</b>`,
      ``,
      `📊 <b>${symbol}</b>`,
      `Kondisi: RSI ${direction} <b>${value}</b> (${label}) pada timeframe <b>1D</b>`,
      ``,
      `Bot akan mengecek setiap 15 menit.`,
      `Untuk cancel: <code>/alertrsi stop ${symbol}</code>`,
    ].join('\n'), { parse_mode: 'HTML' });

    log.info('RSI alert created', { userId, symbol, condition, value });
    return;
  }

  // ── MA Cross Alert ────────────────────────────────────────────────────────────
  if (alertKind === 'ma' && args[2]?.toLowerCase() === 'cross') {
    const desc = 'MA50/MA200 Cross (Golden/Death Cross)';

    // Check if already exists
    const existing = await db('alerts')
      .where({ user_id: userId, symbol, active: true, indicator: 'ma_cross' })
      .first();

    if (existing) {
      await ctx.reply(
        `ℹ️ Kamu sudah punya MA Cross alert aktif untuk <b>${symbol}</b>.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    await db('alerts').insert({
      user_id: userId,
      symbol,
      alert_type: 'price_target',
      condition: 'gte',
      target_value: 0,          // Not used for MA cross, logic is in AlertService
      active: true,
      indicator: 'ma_cross',
      timeframe: '1d',
      description: desc,
    });

    await ctx.reply([
      `✅ <b>MA Cross Alert diaktifkan!</b>`,
      ``,
      `📊 <b>${symbol}</b>`,
      `Kondisi: MA50 melintasi MA200 (Golden Cross <b>atau</b> Death Cross)`,
      `Timeframe: <b>1D</b>`,
      ``,
      `Bot akan mengecek setiap 15 menit.`,
      `Untuk cancel: <code>/alertrsi stop ${symbol}</code>`,
    ].join('\n'), { parse_mode: 'HTML' });

    log.info('MA Cross alert created', { userId, symbol });
    return;
  }

  // Unknown type
  await ctx.reply(usage, { parse_mode: 'HTML' });
}
