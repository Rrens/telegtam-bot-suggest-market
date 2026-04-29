import {
  SignalResult,
  PortfolioSummary,
  NewsItem,
  BacktestResult,
  DbSignal,
} from '../types';
import { DateTime } from 'luxon';
import { PriceService } from '../services/PriceService';

// ─────────────────────────────────────────────────────────────────────────────
// Currency / Number formatting
// ─────────────────────────────────────────────────────────────────────────────

export function formatAmount(amount: number): string {
  // Remove trailing zeros, up to 8 decimal places
  return parseFloat(amount.toFixed(8)).toString();
}

export function formatPrice(price: number, symbolOrCurrency = 'USD'): string {
  const rate = PriceService.getLastUsdIdrRate();
  const symbol = symbolOrCurrency.toUpperCase();
  
  // Auto-detect currency from symbol
  const isIdr = symbol === 'IDR' || symbol.endsWith('.JK') || symbol.endsWith('.ID');
  
  if (isIdr) {
    const rp = `Rp${price.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const usd = `$${(price / rate).toFixed(2)}`;
    return `${rp} (${usd})`;
  }
  
  const usd = price >= 1000 
    ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : price >= 1 ? `$${price.toFixed(4)}` : `$${price.toFixed(8)}`;
    
  const rp = `Rp${(price * rate).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return `${usd} (${rp})`;
}

export function formatPct(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatVolume(vol: number): string {
  if (vol >= 1e9) return `$${(vol / 1e9).toFixed(2)}B`;
  if (vol >= 1e6) return `$${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e3) return `$${(vol / 1e3).toFixed(2)}K`;
  return `$${vol.toFixed(2)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal message formatter
// ─────────────────────────────────────────────────────────────────────────────

export function formatSignal(signal: SignalResult): string {
  const trendEmoji = {
    'Strong Bullish': '🟢',
    'Bullish': '🟩',
    'Neutral': '⬜',
    'Bearish': '🟥',
    'Strong Bearish': '🔴',
  }[signal.trend] ?? '⬜';

  const biasEmoji = signal.tradeBias === 'long' ? '📈' : signal.tradeBias === 'short' ? '📉' : '⏸';
  const sentimentEmoji = signal.newsSentiment === 'positive' ? '(Positive)' : signal.newsSentiment === 'negative' ? '(Negative)' : '(Neutral)';

  const lines: string[] = [
    `<b>📊 ${signal.symbol.toUpperCase()} Analysis</b>`,
    `<i>${new Date(signal.timestamp).toUTCString()}</i>`,
    '',
    `<b>Price:</b> ${formatPrice(signal.price, signal.symbol)}`,
    `<b>Trend:</b> ${trendEmoji} ${signal.trend}`,
    `<b>Confidence:</b> ${signal.confidence.toFixed(0)}%`,
    `<b>Signal Score:</b> ${signal.signalScore >= 0 ? '+' : ''}${signal.signalScore}`,
    `<b>Trade Bias:</b> ${biasEmoji} ${signal.tradeBias.charAt(0).toUpperCase() + signal.tradeBias.slice(1)}`,
    '',
    '<b>── Technical Analysis ──</b>',
  ];

  const ind = signal.indicators;
  if (ind.rsi !== null) lines.push(`• RSI(14): ${ind.rsi.toFixed(1)} ${getRsiLabel(ind.rsi)}`);
  if (ind.macdLine !== null && ind.macdSignal !== null) {
    const macdLabel = ind.macdLine > ind.macdSignal ? '↑ Bullish crossover' : '↓ Bearish crossover';
    lines.push(`• MACD: ${macdLabel}`);
  }
  if (ind.ma50 !== null) lines.push(`• MA50: ${formatPrice(ind.ma50, signal.symbol)} ${signal.price > ind.ma50 ? '(Price above ✓)' : '(Price below ✗)'}`);
  if (ind.ma200 !== null) lines.push(`• MA200: ${formatPrice(ind.ma200, signal.symbol)} ${signal.price > ind.ma200 ? '(Price above ✓)' : '(Price below ✗)'}`);
  if (ind.bbUpper !== null && ind.bbLower !== null) lines.push(`• BB Range: ${formatPrice(ind.bbLower, signal.symbol)} – ${formatPrice(ind.bbUpper, signal.symbol)}`);
  if (ind.supportLevel !== null) lines.push(`• Support: ${formatPrice(ind.supportLevel, signal.symbol)}`);
  if (ind.resistanceLevel !== null) lines.push(`• Resistance: ${formatPrice(ind.resistanceLevel, signal.symbol)}`);
  if (ind.volumeSpike) lines.push(`• Volume: Significant spike detected ⚠`);
  if (ind.breakoutDetected) lines.push(`• Breakout: ${ind.breakoutDirection === 'up' ? 'Upside breakout confirmed 🚀' : 'Downside breakout confirmed 📉'}`);

  // Fundamental
  if (signal.fundamentalRating) {
    lines.push('');
    lines.push('<b>── Fundamentals ──</b>');
    lines.push(`Rating: ${signal.fundamentalRating.charAt(0).toUpperCase() + signal.fundamentalRating.slice(1)}`);
  }

  // News
  if (signal.newsItems.length > 0) {
    lines.push('');
    lines.push(`<b>── News Sentiment: ${sentimentEmoji} ──</b>`);
    signal.newsItems.slice(0, 3).forEach((item) => {
      const sIcon = item.sentiment === 'positive' ? '▲' : item.sentiment === 'negative' ? '▼' : '–';
      lines.push(`${sIcon} <a href="${item.url}">${item.title.slice(0, 80)}${item.title.length > 80 ? '…' : ''}</a>`);
    });
  }

  // Risk Management
  if (signal.stopLoss || signal.takeProfit) {
    lines.push('');
    lines.push('<b>── Risk Management ──</b>');
    if (signal.stopLoss) lines.push(`• Stop Loss: ${formatPrice(signal.stopLoss, signal.symbol)}`);
    if (signal.takeProfit) lines.push(`• Take Profit: ${formatPrice(signal.takeProfit, signal.symbol)}`);
    if (signal.riskRewardRatio) lines.push(`• Risk/Reward: 1:${signal.riskRewardRatio.toFixed(2)}`);
    if (signal.positionSizeAdvice) lines.push(`• Position Size: ${signal.positionSizeAdvice}`);
  }

  // Reasoning
  if (signal.reasoning.length > 0) {
    lines.push('');
    lines.push('<b>── Reasoning ──</b>');
    signal.reasoning.forEach((r) => lines.push(`• ${r}`));
  }

  // Invalidation
  if (signal.invalidationConditions.length > 0) {
    lines.push('');
    lines.push('<b>── Signal Invalidation ──</b>');
    signal.invalidationConditions.forEach((c) => lines.push(`⚠ ${c}`));
  }

  lines.push('');
  lines.push('<b>── Conclusion ──</b>');
  lines.push(buildConclusion(signal));
  lines.push('');
  lines.push('<i>⚠ This is not financial advice. Signals are probabilistic estimates only.</i>');

  return lines.join('\n');
}

function getRsiLabel(rsi: number): string {
  if (rsi < 30) return '→ Oversold (reversal potential)';
  if (rsi > 70) return '→ Overbought (pullback risk)';
  return '→ Neutral zone';
}

function buildConclusion(signal: SignalResult): string {
  const strength = signal.confidence >= 75 ? 'High' : signal.confidence >= 55 ? 'Moderate' : 'Low';
  const direction = signal.trend.includes('Bullish') ? 'upward' : signal.trend.includes('Bearish') ? 'downward' : 'sideways';
  return `${strength} probability ${direction} continuation with ${signal.confidence >= 75 ? 'strong' : 'some'} confluence across indicators.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio formatter
// ─────────────────────────────────────────────────────────────────────────────

export function formatPortfolio(portfolio: PortfolioSummary): string {
  const pnlSign = portfolio.totalPnL >= 0 ? '+' : '';
  const lines: string[] = [
    '<b>📁 Portfolio Summary</b>',
    '',
    `Total Value: <b>${formatPrice(portfolio.totalValue)}</b>`,
    `Total Cost:  ${formatPrice(portfolio.totalCost)}`,
    `Total PnL:   <b>${pnlSign}${formatPrice(portfolio.totalPnL)} (${formatPct(portfolio.totalPnLPct)})</b>`,
    '',
    '<b>── Assets ──</b>',
  ];

  portfolio.assets.forEach((a) => {
    const currency = a.currency || 'USD';
    const pnlStr = a.pnl >= 0 ? `+${formatPrice(a.pnl, currency)}` : formatPrice(a.pnl, currency);
    lines.push(
      `\n<b>${a.symbol.toUpperCase()}</b>`,
      `  Amount: ${a.amount}`,
      `  Avg Buy: ${formatPrice(a.avgPrice, currency)} → Now: ${formatPrice(a.currentPrice, currency)}`,
      `  Value: ${formatPrice(a.value, currency)} | PnL: ${pnlStr} (${formatPct(a.pnlPct)})`
    );
  });

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// News formatter
// ─────────────────────────────────────────────────────────────────────────────

export function formatNews(symbol: string, items: NewsItem[]): string {
  if (items.length === 0) return `No recent news found for <b>${symbol.toUpperCase()}</b>.`;

  const lines: string[] = [`<b>📰 News: ${symbol.toUpperCase()}</b>`, ''];

  items.slice(0, 8).forEach((item, i) => {
    const icon = item.sentiment === 'positive' ? '🟢' : item.sentiment === 'negative' ? '🔴' : '⬜';
    lines.push(`${i + 1}. ${icon} <a href="${item.url}">${item.title.slice(0, 90)}${item.title.length > 90 ? '…' : ''}</a>`);
    lines.push(`   <i>${item.source} · ${timeAgo(item.publishedAt)}</i>`);
  });

  return lines.join('\n');
}

export function formatNewsBroadcast(symbol: string, item: NewsItem): string {
  const sentimentStr = 
    item.sentiment === 'positive' ? 'Positive 🟢' : 
    item.sentiment === 'negative' ? 'Negative 🔴' : 
    'Neutral ⚪';

  return `🚨 <b>MARKET NEWS ALERT</b>

<b>${symbol.toUpperCase()}</b> — ${sentimentStr}

📰 <a href="${item.url}">${item.title}</a>
<b>Summary:</b> ${item.summary ?? 'No summary available.'}

<b>Impact:</b> ${item.impact ?? 'Neutral market impact expected.'}

<b>Source:</b> ${item.source}
<b>Time:</b> ${formatWibTime(item.publishedAt)}`;
}

export function formatWibTime(date: Date): string {
  const dt = DateTime.fromJSDate(date).setZone('Asia/Jakarta');
  return `${dt.toFormat('dd LLL yyyy, HH:mm')} WIB (≈ ${timeAgo(date)})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backtest formatter
// ─────────────────────────────────────────────────────────────────────────────

export function formatBacktest(result: BacktestResult): string {
  const lines: string[] = [
    `<b>🔬 Backtest: ${result.symbol.toUpperCase()}</b>`,
    '',
    `Total Signals: <b>${result.totalSignals}</b>`,
    `Win Rate: <b>${(result.winRate * 100).toFixed(1)}%</b>  (${result.winCount}W / ${result.lossCount}L / ${result.pendingCount} pending)`,
    `Avg Return: <b>${formatPct(result.avgReturn)}</b>`,
    `Best: ${formatPct(result.bestReturn)} | Worst: ${formatPct(result.worstReturn)}`,
    '',
    '<b>── Recent Signals ──</b>',
  ];

  result.signals.slice(0, 8).forEach((s) => {
    const outcomeIcon = s.outcome === 'win' ? '✅' : s.outcome === 'loss' ? '❌' : '⏳';
    const retStr = s.returnPct !== null ? ` (${formatPct(s.returnPct)})` : '';
    lines.push(`${outcomeIcon} ${s.date.toLocaleDateString()} | ${s.trend} ${s.confidence.toFixed(0)}%${retStr}`);
  });

  lines.push('');
  lines.push('<i>⚠ Past results do not guarantee future performance.</i>');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// History formatter
// ─────────────────────────────────────────────────────────────────────────────

export function formatHistory(symbol: string, signals: DbSignal[]): string {
  if (signals.length === 0) return `No signal history found for <b>${symbol.toUpperCase()}</b>.`;

  const lines: string[] = [`<b>📜 Signal History: ${symbol.toUpperCase()}</b>`, ''];

  signals.forEach((s) => {
    const biasIcon = s.trade_bias === 'long' ? '📈' : s.trade_bias === 'short' ? '📉' : '⏸';
    lines.push(
      `${biasIcon} <b>${s.trend}</b> — Confidence: ${s.confidence.toFixed(0)}%`,
      `   Score: ${s.signal_score >= 0 ? '+' : ''}${s.signal_score} | ${new Date(s.created_at).toLocaleDateString()}`
    );
  });

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
