import { SentimentLabel } from '../types';
import Sentiment from 'sentiment';

const sentimentAnalyzer = new Sentiment();

// Domain-specific positive/negative word boosters for financial news
const POSITIVE_WORDS = [
  'bullish', 'rally', 'surge', 'breakout', 'inflow', 'adoption', 'approval',
  'partnership', 'upgrade', 'beat', 'profit', 'growth', 'record', 'all-time-high',
  'etf', 'launch', 'integration', 'expansion', 'positive', 'strong', 'recover',
  'rebound', 'jump', 'soar', 'gain', 'outperform', 'regulation easing',
];

const NEGATIVE_WORDS = [
  'bearish', 'crash', 'drop', 'hack', 'exploit', 'ban', 'sanction', 'fraud',
  'liquidation', 'bankruptcy', 'dump', 'panic', 'fear', 'loss', 'miss',
  'downgrade', 'warning', 'risk', 'concern', 'regulation', 'crackdown',
  'sell-off', 'correction', 'plunge', 'collapse', 'scam', 'investigation',
];

interface SentimentResult {
  label: SentimentLabel;
  score: number; // -1 to +1 normalized
  rawScore: number;
}

/**
 * Score a single news headline using keyword + AFINN sentiment analysis.
 */
export function scoreText(text: string): SentimentResult {
  const lower = text.toLowerCase();

  // AFINN base score
  const result = sentimentAnalyzer.analyze(text);
  let score = result.comparative; // normalized by word count

  // Domain boosters
  let boost = 0;
  POSITIVE_WORDS.forEach((word) => {
    if (lower.includes(word)) boost += 0.3;
  });
  NEGATIVE_WORDS.forEach((word) => {
    if (lower.includes(word)) boost -= 0.3;
  });

  const totalScore = Math.max(-3, Math.min(3, score + boost));
  const normalizedScore = totalScore / 3; // -1 to +1

  let label: SentimentLabel;
  if (normalizedScore > 0.1) label = 'positive';
  else if (normalizedScore < -0.1) label = 'negative';
  else label = 'neutral';

  return {
    label,
    score: parseFloat(normalizedScore.toFixed(4)),
    rawScore: totalScore,
  };
}

/**
 * Aggregate sentiment from multiple headlines for a symbol.
 */
export function aggregateSentiment(texts: string[]): {
  label: SentimentLabel;
  avgScore: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
} {
  if (texts.length === 0) {
    return { label: 'neutral', avgScore: 0, positiveCount: 0, negativeCount: 0, neutralCount: 0 };
  }

  const scores = texts.map((t) => scoreText(t));
  const avgScore = scores.reduce((a, b) => a + b.score, 0) / scores.length;
  const positiveCount = scores.filter((s) => s.label === 'positive').length;
  const negativeCount = scores.filter((s) => s.label === 'negative').length;
  const neutralCount = scores.filter((s) => s.label === 'neutral').length;

  let label: SentimentLabel;
  if (avgScore > 0.1) label = 'positive';
  else if (avgScore < -0.1) label = 'negative';
  else label = 'neutral';

  return { label, avgScore, positiveCount, negativeCount, neutralCount };
}

/**
 * Generate a content hash for deduplication.
 */
export function hashContent(title: string, url: string): string {
  const str = `${title}|${url}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
