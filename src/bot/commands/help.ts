import { CommandContext, Context } from 'grammy';

export async function handleHelp(ctx: CommandContext<Context>): Promise<void> {
  const helpMessage = [
    `<b>🤖 Advanced Trading Assistant - Help Menu</b>`,
    ``,
    `<b>📈 Market Analysis</b>`,
    `• /predict &lt;symbol&gt; - Get a deep analysis, signal, and chart (e.g., <code>/predict BTCUSDT</code>).`,
    `• /news &lt;symbol&gt; - Get latest news and sentiment score for an asset.`,
    `• /history &lt;symbol&gt; - View recent signal history for an asset.`,
    `• /backtest &lt;symbol&gt; - Check the accuracy of historical signals.`,
    ``,
    `<b>📁 Portfolio Management</b>`,
    `• /add &lt;symbol&gt; &lt;amount&gt; &lt;avg_price&gt; - Add an asset to track your PnL.`,
    `• /list - List all your tracked assets.`,
    `• /delete &lt;symbol&gt; - Stop tracking an asset.`,
    `• /portfolio - See your total portfolio value and profit/loss.`,
    ``,
    `<b>🔔 Alerts</b>`,
    `• /alert &lt;symbol&gt; &lt;direction&gt; &lt;price&gt; - Set price alerts.`,
    `  <i>Direction: gte (&gt;=) or lte (&lt;=)</i>`,
    `• /alertnews &lt;symbol&gt; - Subscribe to high-impact news alerts for an asset.`,
    ``,
    `<b>⚙️ Settings & Info</b>`,
    `• /profile - Set your risk profile and preferred timeframe.`,
    `• /info - View bot status and system performance.`,
    `• /kurs - Check real-time USD/IDR exchange rate.`,
    `• /help - Show this message.`,
    ``,
    `<i>💡 Tip: Use symbols like BTCUSDT for Crypto, AAPL for Stocks, or EURUSD for Forex.</i>`,
  ].join('\n');

  await ctx.reply(helpMessage, { parse_mode: 'HTML' });
}
