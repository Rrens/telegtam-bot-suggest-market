// ─────────────────────────────────────────────────────────────────────────────
// /predict command: The core signal analysis command.
// Generates full technical + fundamental + news analysis with chart.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context } from 'grammy';
import { InputFile } from 'grammy';
import { db } from '../../db';
import { SignalEngine } from '../../services/SignalEngine';
import { ChartService } from '../../services/ChartService';
import { PriceService } from '../../services/PriceService';
import { formatSignal } from '../../utils/formatter';
import { log } from '../../utils/logger';
import { RiskProfile } from '../../types';

// Usage: /predict <symbol>
export async function handlePredict(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);
  let symbol = ctx.match?.trim().toUpperCase() ?? '';
  if (symbol.length === 4 && !symbol.includes('.') && !symbol.endsWith('USDT')) {
    symbol = `${symbol}.JK`;
  }

  if (!symbol) {
    await ctx.reply(
      'Usage: /predict &lt;symbol&gt;\n\nExamples:\n/predict BTCUSDT\n/predict ETHUSDT\n/predict AAPL\n/predict EURUSD',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const loadingMsg = await ctx.reply(`Analyzing <b>${symbol}</b> — please wait...`, { parse_mode: 'HTML' });

  try {
    // Fetch user's risk profile
    const user = await db('users').where({ id: userId }).first();
    const riskProfile: RiskProfile = user?.risk_profile ?? 'moderate';

    // Generate signal
    const signal = await SignalEngine.generate(symbol, riskProfile);

    // Save to signal history for this user
    await db('signal_history')
      .insert({
        user_id: userId,
        signal_id: null, // latest signal was persisted by engine
        symbol: symbol,
        outcome: 'pending',
        entry_price: signal.price,
      })
      .catch(() => {});

    // Generate chart
    const candles = await PriceService.getOHLCV(symbol, '1d', 80).catch(() => []);
    const chartBuffer = candles.length >= 20
      ? await ChartService.generateChart(symbol, candles, signal.indicators)
      : null;

    // Build message
    const message = formatSignal(signal);
    const tvLink = ChartService.getTradingViewLink(symbol);

    const fullMessage = message + `\n\n📊 <a href="${tvLink}">View on TradingView</a>`;

    // Send result: Photo first, then message (to avoid 1024 char caption limit)
    if (chartBuffer) {
      await ctx.replyWithPhoto(new InputFile(chartBuffer, `${symbol}_chart.png`));
      await ctx.reply(fullMessage, { 
        parse_mode: 'HTML', 
        link_preview_options: { is_disabled: false } 
      });
    } else {
      await ctx.reply(fullMessage, { 
        parse_mode: 'HTML', 
        link_preview_options: { is_disabled: false } 
      });
    }

    // THEN delete loading message only after success
    await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => {});

    log.info('Predict command completed', { userId, symbol, trend: signal.trend, confidence: signal.confidence });
  } catch (err) {
    // Only try to edit if the message likely still exists
    try {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        `Failed to analyze <b>${symbol}</b>: ${(err as Error).message}\n\nPlease verify the symbol and try again.`,
        { parse_mode: 'HTML' }
      );
    } catch {
      // If edit fails (e.g. message already deleted), just send a new message
      await ctx.reply(`Failed to analyze <b>${symbol}</b>: ${(err as Error).message}`);
    }
    log.error('Predict command failed', { userId, symbol, error: (err as Error).message });
  }
}
