import {
  SignalResult,
  PortfolioSummary,
  NewsItem,
  BacktestResult,
  DbSignal,
} from '../types';
import { DateTime } from 'luxon';
import { PriceService } from '../services/PriceService';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatAmount(amount: number): string {
  return parseFloat(amount.toFixed(8)).toString();
}

export function formatPrice(price: number, symbolOrCurrency = 'USD'): string {
  const rate = PriceService.getLastUsdIdrRate();
  const symbol = symbolOrCurrency.toUpperCase();
  
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

  const rate = PriceService.getLastUsdIdrRate();
  const score = signal.signalScore;
  const ind = signal.indicators;
  const macdBullish = ind.macdLine != null && ind.macdSignal != null && ind.macdLine > ind.macdSignal;
  const macdIcon = macdBullish ? '↑' : '↓';
  const macdLabel = macdBullish ? 'Bullish' : 'Bearish';

  // 1. Header Section
  const header = [
    `📊 <b>${signal.symbol.toUpperCase()} Analysis</b>`,
    `<i>${new Date(signal.timestamp).toUTCString()}</i>`,
    ''
  ].join('\n');

  // 2. Data Section (Monospace Code Block)
  const dataLines = [
    `Price:  $${signal.price.toLocaleString()}`,
    `        (Rp${Math.round(signal.price * rate).toLocaleString()})`,
    '',
    `Trend:  ${trendEmoji} ${signal.trend}`,
    `Score:  ${score >= 0 ? '+' : ''}${score} | Bias: ${signal.tradeBias.toUpperCase()}`,
    '',
    '',
    '── TECHNICAL ANALYSIS ──',
    '',
    `• RSI(14):    ${ind.rsi?.toFixed(1) ?? 'N/A'} (${getRsiLabel(ind.rsi ?? 50)})`,
    `• MACD:       ${macdIcon} ${macdLabel}`,
    `• DEMA20:     $${ind.dema20?.toLocaleString() ?? 'N/A'}`,
    `• DEMA50:     $${ind.ma50?.toLocaleString() ?? 'N/A'}`,
    `• DEMA200:    $${ind.ma200?.toLocaleString() ?? 'N/A'}`,
    `• SuperTrend: ${ind.superTrendDirection?.toUpperCase() ?? 'N/A'} ($${ind.superTrend?.toLocaleString() ?? 'N/A'})`,
    `• Bollinger:  ${ind.bbLower?.toFixed(0) ?? 'N/A'} - ${ind.bbUpper?.toFixed(0) ?? 'N/A'}`,
    '',
    '',
    '── RISK MANAGEMENT ──',
    '',
    `• SL:   $${signal.stopLoss?.toLocaleString() ?? 'N/A'}`,
    `• TP1:  $${signal.takeProfits?.[0]?.toLocaleString() ?? 'N/A'}`,
    `• R/R:  ${signal.riskRewardRatio?.toFixed(2) ?? 'N/A'}`,
    `• Size: ${signal.positionSizeAdvice}`,
    '',
    '',
    '── REASONING ──',
    '',
    ...signal.reasoning.slice(0, 3).map(r => `• ${r.length > 45 ? r.slice(0, 42) + '...' : r}`),
  ].filter(Boolean);

  const finalLines = [...dataLines];
  
  if (signal.newsItems.length > 0) {
    finalLines.push('', '── News Sentiment ──');
    signal.newsItems.slice(0, 3).forEach(item => {
      const sIcon = item.sentiment === 'positive' ? '▲' : item.sentiment === 'negative' ? '▼' : '–';
      finalLines.push(`${sIcon} ${item.title.slice(0, 50)}...`);
    });
  }

  finalLines.push('', '── Conclusion ──');
  finalLines.push(buildConclusion(signal));

  const dataBlock = `<pre><code class="language-python">${finalLines.join('\n')}</code></pre>`;
  const disclaimer = `\n<i>⚠ This is not financial advice.</i>`;

  return header + dataBlock + disclaimer;
}

function getRsiLabel(rsi: number): string {
  if (rsi < 30) return '(Oversold)';
  if (rsi > 70) return '(Overbought)';
  return '(Neutral)';
}

function buildConclusion(signal: SignalResult): string {
  const strength = signal.confidence >= 75 ? 'High' : signal.confidence >= 55 ? 'Moderate' : 'Low';
  const direction = signal.trend.includes('Bullish') ? 'upward' : signal.trend.includes('Bearish') ? 'downward' : 'sideways';
  return `${strength} probability ${direction} continuation with ${signal.confidence >= 75 ? 'strong' : 'some'} confluence.`;
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

Base News: <a href="${item.url}">${escapeHtml(item.title)}</a>
<b>Summary:</b> ${escapeHtml(item.summary ?? 'No summary available.')}

<b>Impact:</b> ${escapeHtml(item.impact ?? 'Neutral market impact expected.')}

<b>Source:</b> ${escapeHtml(item.source)}
<b>Time:</b> ${formatWibTime(item.publishedAt)}`;
}

export function formatWibTime(dateInput: Date | string | number): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return 'Invalid Date';
  
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

function timeAgo(dateInput: Date | string | number): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return 'unknown time';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
