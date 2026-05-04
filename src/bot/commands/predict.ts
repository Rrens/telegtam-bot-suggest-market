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
import { GeminiService } from '../../services/GeminiService';
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
        signal_id: null,
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

    // ── Send: Photo first, then technical analysis ─────────────────────────
    if (chartBuffer) {
      await ctx.replyWithPhoto(new InputFile(chartBuffer, `${symbol}_chart.png`));
    }
    await ctx.reply(fullMessage, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: false },
    });

    // ── AI Prediction (restricted to allowed users) ────────────────────────
    const aiCheck = await GeminiService.isAllowed(userId);
    if (aiCheck.allowed) {
      try {
        const aiLoadingMsg = await ctx.reply(`🤖 <b>Generating AI prediction...</b>`, { parse_mode: 'HTML' });
        const aiText = await GeminiService.predict(signal);

        await ctx.api.deleteMessage(ctx.chat!.id, aiLoadingMsg.message_id).catch(() => {});

        const aiMessage = `🤖 <b>AI Prediction — ${symbol}</b>\n<i>Powered by Gemini</i>\n\n${aiText}\n\n<i>⚠ AI predictions are probabilistic and not financial advice.</i>`;
        await ctx.reply(aiMessage, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });

        log.info('AI prediction sent', { userId, symbol });
      } catch (aiErr) {
        log.warn('AI prediction failed', { userId, symbol, error: (aiErr as Error).message });
        await ctx.reply(`🤖 <b>AI Prediction unavailable</b>: ${(aiErr as Error).message}`, { parse_mode: 'HTML' });
      }
    } else if (aiCheck.reason && !aiCheck.reason.includes('not authorized')) {
      // Only show reason if it's a rate limit issue (don't spam non-whitelisted users)
      await ctx.reply(`🤖 <b>AI Insight:</b> ${aiCheck.reason}`, { parse_mode: 'HTML' });
    }

    // Delete loading message
    await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => {});

    log.info('Predict command completed', { userId, symbol, trend: signal.trend, confidence: signal.confidence });
  } catch (err) {
    try {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        `Failed to analyze <b>${symbol}</b>: ${(err as Error).message}\n\nPlease verify the symbol and try again.`,
        { parse_mode: 'HTML' }
      );
    } catch {
      await ctx.reply(`Failed to analyze <b>${symbol}</b>: ${(err as Error).message}`);
    }
    log.error('Predict command failed', { userId, symbol, error: (err as Error).message });
  }
}

