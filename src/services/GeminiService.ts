// ─────────────────────────────────────────────────────────────────────────────
// GeminiService: AI-powered market prediction using Google Gemini API.
// Access is restricted to allowed Telegram user IDs only.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { config } from '../config';
import { log } from '../utils/logger';
import { SignalResult } from '../types';

export class GeminiService {
  /**
   * Check if a userId is allowed to access AI predictions.
   */
  static isAllowed(userId: string | number): boolean {
    const allowed = config.gemini.allowedUserIds;
    if (allowed.length === 0) return false;
    return allowed.includes(String(userId));
  }

  /**
   * Generate an AI market prediction using Gemini.
   * Sends a structured prompt built from signal data.
   */
  static async predict(signal: SignalResult): Promise<string> {
    const apiKey = config.gemini.apiKey;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    const prompt = this.buildPrompt(signal);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const res = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 600,
        },
      },
      { timeout: 20000 }
    );

    const text: string =
      res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!text) throw new Error('Gemini returned empty response');

    return text.trim();
  }

  /**
   * Build a structured prompt from signal data for Gemini.
   */
  private static buildPrompt(signal: SignalResult): string {
    const ind = signal.indicators;
    const rsiLine = ind.rsi != null ? `RSI(14): ${ind.rsi.toFixed(1)}` : '';
    const macdLine =
      ind.macdLine != null && ind.macdSignal != null
        ? `MACD: ${ind.macdLine > ind.macdSignal ? 'Bullish crossover' : 'Bearish crossover'}`
        : '';
    const ma50Line = ind.ma50 != null ? `MA50: ${ind.ma50.toFixed(2)}` : '';
    const ma200Line =
      ind.ma200 != null ? `MA200: ${ind.ma200.toFixed(2)}` : '';
    const demaLine =
      ind.dema20 != null ? `DEMA(20): ${ind.dema20.toFixed(2)}` : '';
    const bbLine =
      ind.bbLower != null && ind.bbUpper != null
        ? `Bollinger Bands: ${ind.bbLower.toFixed(2)} – ${ind.bbUpper.toFixed(2)}`
        : '';
    const supportLine =
      ind.supportLevel != null
        ? `Support: ${ind.supportLevel.toFixed(2)}`
        : '';
    const resistanceLine =
      ind.resistanceLevel != null
        ? `Resistance: ${ind.resistanceLevel.toFixed(2)}`
        : '';

    const indicators = [
      rsiLine,
      macdLine,
      ma50Line,
      ma200Line,
      demaLine,
      bbLine,
      supportLine,
      resistanceLine,
    ]
      .filter(Boolean)
      .join('\n');

    const tpLines =
      signal.takeProfits && signal.takeProfits.length > 0
        ? signal.takeProfits
            .map((tp, i) => `TP${i + 1}: ${tp.toFixed(4)}`)
            .join(', ')
        : signal.takeProfit != null
        ? `TP: ${signal.takeProfit.toFixed(4)}`
        : 'N/A';

    return `You are an expert quantitative trading analyst. Analyze the following market data and provide a concise AI-powered prediction.

Asset: ${signal.symbol}
Current Price: ${signal.price}
Technical Trend: ${signal.trend} (Score: ${signal.signalScore})
Trade Bias: ${signal.tradeBias}
Confidence: ${signal.confidence}%
Fundamental Rating: ${signal.fundamentalRating ?? 'N/A'}
News Sentiment: ${signal.newsSentiment ?? 'N/A'}

Technical Indicators:
${indicators}

Risk Management:
Stop Loss: ${signal.stopLoss?.toFixed(4) ?? 'N/A'}
${tpLines}

System Reasoning:
${signal.reasoning.slice(0, 5).join('\n')}

Based on this data, provide your AI prediction covering:
1. Your overall market outlook for ${signal.symbol} in the next 1–7 days
2. Key risks to watch out for
3. Entry strategy recommendation (when/how to enter)
4. One specific insight that the technical indicators alone might be missing

Keep your response concise (max 5 short paragraphs), use plain language suitable for Telegram, and do NOT use markdown headers or bullet symbols—use plain text only. End with a one-sentence conviction summary.`;
  }
}
