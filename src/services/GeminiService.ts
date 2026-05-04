import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { log } from '../utils/logger';

export class GeminiService {
  private static genAI: GoogleGenerativeAI | null = null;

  private static getClient(): GoogleGenerativeAI {
    if (!this.genAI) {
      if (!config.gemini.apiKey) {
        throw new Error('GEMINI_API_KEY is not configured');
      }
      this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    }
    return this.genAI;
  }

  /**
   * Summarize a news item and provide market context.
   */
  static async summarizeNews(symbol: string, title: string, summary: string): Promise<string | null> {
    try {
      const model = this.getClient().getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const prompt = `
        You are a financial analyst assistant for a Telegram Trading Bot.
        Analyze the following news for the asset "${symbol}":
        
        Title: ${title}
        Summary: ${summary}
        
        Task:
        1. Provide a very concise summary (max 2 sentences) in Indonesian.
        2. Explain the direct implication for the asset's price (Bullish/Bearish/Neutral) and why.
        3. Keep the tone professional but easy to understand.
        
        Output format (Indonesian):
        💡 <b>AI Insight:</b> [Your summary here]
        📈 <b>Impact:</b> [Your implication analysis]
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (err) {
      log.warn('GeminiService: failed to summarize news', { symbol, error: (err as Error).message });
      return null;
    }
  }

  /**
   * Check if a user is allowed to use AI features.
   */
  static isAllowed(userId: string): boolean {
    // If no specific IDs are set, allow everyone (or you can restrict it)
    if (config.gemini.allowedUserIds.length === 0) return true;
    return config.gemini.allowedUserIds.includes(userId);
  }

  /**
   * Generate a full AI market prediction based on signal data.
   */
  static async predict(signal: any): Promise<string> {
    try {
      const model = this.getClient().getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const prompt = `
        You are a world-class trading analyst. 
        Analyze the following signal data for ${signal.symbol}:
        - Trend: ${signal.trend} (Confidence: ${signal.confidence}%)
        - Price: ${signal.price}
        - Indicators: ${JSON.stringify(signal.indicators)}
        - Sentiment: ${signal.sentiment}
        
        Task:
        Provide a 3-sentence expert verdict in Indonesian. 
        Be specific about whether the entry is good and what to watch out for.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (err) {
      throw new Error(`AI Prediction failed: ${(err as Error).message}`);
    }
  }
}
