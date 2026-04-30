// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript types for the entire application
// ─────────────────────────────────────────────────────────────────────────────

export type AssetType = 'crypto' | 'stock' | 'forex';
export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';
export type PreferredTimeframe = 'scalping' | 'swing' | 'long-term';
export type AlertType = 'price_target' | 'pct_change' | 'portfolio_threshold';
export type AlertCondition = 'gte' | 'lte';
export type TradeBias = 'long' | 'short' | 'wait';
export type FundamentalRating = 'strong' | 'neutral' | 'weak';
export type SentimentLabel = 'positive' | 'neutral' | 'negative';
export type SignalOutcome = 'win' | 'loss' | 'pending';
export type TrendLabel = 'Strong Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Strong Bearish';
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

// ─────────────────────────────────────────────────────────────────────────────
// Database row types
// ─────────────────────────────────────────────────────────────────────────────

export interface DbUser {
  id: string; // Telegram user ID (bigint as string)
  username: string | null;
  risk_profile: RiskProfile;
  preferred_timeframe: PreferredTimeframe;
  created_at: Date;
}

export interface DbAsset {
  id: number;
  user_id: string;
  symbol: string;
  asset_type: AssetType;
  amount: number;
  avg_price: number;
  created_at: Date;
}

export interface DbAlert {
  id: number;
  user_id: string;
  symbol: string;
  alert_type: AlertType;
  condition: AlertCondition;
  target_value: number;
  active: boolean;
  triggered_at: Date | null;
  created_at: Date;
}

export interface DbSignal {
  id: number;
  symbol: string;
  timeframe: string;
  trend: TrendLabel;
  confidence: number;
  signal_score: number;
  trade_bias: TradeBias;
  rsi: number | null;
  macd_line: number | null;
  macd_signal: number | null;
  ma50: number | null;
  ma200: number | null;
  volume_spike: boolean;
  fundamental_rating: FundamentalRating | null;
  news_sentiment: SentimentLabel | null;
  invalidation_conditions: string[];
  reasoning: string;
  stop_loss: number | null;
  take_profit: number | null;
  entry_price: number | null;
  risk_reward_ratio: number | null;
  created_at: Date;
}

export interface DbSignalHistory {
  id: number;
  user_id: string;
  signal_id: number;
  symbol: string;
  outcome: SignalOutcome;
  entry_price: number | null;
  exit_price: number | null;
  return_pct: number | null;
  resolved_at: Date | null;
  created_at: Date;
}

export interface DbNewsCache {
  id: number;
  symbol: string;
  source: string;
  title: string;
  url: string;
  sentiment: SentimentLabel;
  sentiment_score: number;
  published_at: Date;
  hash: string;
}

export interface DbNewsAlert {
  id: number;
  user_id: string;
  symbol: string;
  active: boolean;
  last_alerted: Date | null;
  created_at: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service-level types
// ─────────────────────────────────────────────────────────────────────────────

export interface PriceData {
  symbol: string;
  price: number;
  change24h: number; // percentage
  volume24h: number;
  marketCap?: number;
  high24h?: number;
  low24h?: number;
  timestamp: number;
}

export interface OHLCVCandle {
  time: number; // unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorResult {
  rsi: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  ma50: number | null;
  ma200: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  dema20: number | null;
  superTrend: number | null;
  superTrendDirection: 'up' | 'down' | null;
  volumeSpike: boolean;
  supportLevel: number | null;
  resistanceLevel: number | null;
  breakoutDetected: boolean;
  breakoutDirection: 'up' | 'down' | null;
}

export interface SignalResult {
  symbol: string;
  price: number;
  trend: TrendLabel;
  confidence: number;
  signalScore: number;
  tradeBias: TradeBias;
  indicators: IndicatorResult;
  fundamentalRating: FundamentalRating | null;
  newsSentiment: SentimentLabel | null;
  newsItems: NewsItem[];
  reasoning: string[];
  invalidationConditions: string[];
  stopLoss: number | null;
  takeProfit: number | null; // Primary TP
  takeProfits: number[];      // Multiple TP layers
  riskRewardRatio: number | null;
  positionSizeAdvice: string;
  chartBuffer?: Buffer;
  timeframe: string;
  timestamp: number;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  sentiment: SentimentLabel;
  sentimentScore: number;
  publishedAt: Date;
  summary?: string;
  impact?: string;
}

export interface FundamentalData {
  symbol: string;
  rating: FundamentalRating;
  marketCap?: number;
  peRatio?: number | null;
  revenue?: number | null;
  earnings?: number | null;
  revenueGrowth?: number | null;
  supply?: number | null;
  circulatingSupply?: number | null;
  details: string[];
}

export interface BacktestResult {
  symbol: string;
  totalSignals: number;
  winCount: number;
  lossCount: number;
  pendingCount: number;
  winRate: number;
  avgReturn: number;
  bestReturn: number;
  worstReturn: number;
  signals: BacktestSignalEntry[];
}

export interface BacktestSignalEntry {
  date: Date;
  trend: TrendLabel;
  confidence: number;
  entryPrice: number | null;
  exitPrice: number | null;
  returnPct: number | null;
  outcome: SignalOutcome;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalPnL: number;
  totalPnLPct: number;
  assets: PortfolioAsset[];
}

export interface PortfolioAsset {
  symbol: string;
  amount: number;
  avgPrice: number;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlPct: number;
  currency?: string;
}
