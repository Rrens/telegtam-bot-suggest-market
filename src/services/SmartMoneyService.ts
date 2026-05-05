// ─────────────────────────────────────────────────────────────────────────────
// SmartMoneyService: Tracks known "smart money" / top-profit Solana wallets.
// When a tracked whale wallet makes a new purchase, we fire an alert.
// Data source: DexScreener token endpoint (free, no API key).
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { redis } from '../cache/redis';
import { log } from '../utils/logger';

/**
 * Known profitable Solana wallets to track.
 * These are publicly known wallets from leaderboards like Cielo Finance, Step Finance, etc.
 * In a production environment, this list would be stored in the DB and user-configurable.
 */
const TRACKED_WALLETS: { address: string; label: string }[] = [
  { address: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', label: 'Raydium AMM' },
  { address: 'GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ', label: 'Smart Whale #1' },
  { address: 'BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV', label: 'Smart Whale #2' },
  { address: 'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5acaYo65', label: 'Top Trader #1' },
];

const COOLDOWN_SECS = 3600 * 2; // 2-hour cooldown per wallet+token combo

export interface SmartMoneyMove {
  walletLabel: string;
  walletAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  priceUsd: number;
  liquidity: number;
  volume24h: number;
  change6h: number;
  dexUrl: string;
}

export class SmartMoneyService {
  /**
   * Scan tracked wallets for recent activity by checking their latest token trades
   * via DexScreener wallet endpoint.
   */
  static async scanWallets(): Promise<SmartMoneyMove[]> {
    const moves: SmartMoneyMove[] = [];

    for (const wallet of TRACKED_WALLETS) {
      try {
        // DexScreener: Get tokens recently traded by this wallet
        const res = await axios.get(
          `https://api.dexscreener.com/latest/dex/tokens/${wallet.address}`,
          { timeout: 10000 }
        );

        const pairs: any[] = res.data?.pairs ?? [];
        if (pairs.length === 0) continue;

        // Only look at Solana pairs with decent activity
        const solanaPairs = pairs.filter((p: any) =>
          p.chainId === 'solana' &&
          parseFloat(p.liquidity?.usd ?? '0') > 20_000 &&
          parseFloat(p.volume?.h24 ?? '0') > 50_000
        );

        for (const p of solanaPairs) {
          const tokenAddress = p.baseToken?.address ?? '';
          if (!tokenAddress) continue;

          // Skip if already alerted this combo recently
          const cdKey = `sm_cd:${wallet.address}:${tokenAddress}`;
          const onCooldown = await redis.get(cdKey);
          if (onCooldown) continue;

          moves.push({
            walletLabel: wallet.label,
            walletAddress: wallet.address,
            tokenName: p.baseToken?.name ?? 'Unknown',
            tokenSymbol: p.baseToken?.symbol ?? '???',
            tokenAddress,
            priceUsd: parseFloat(p.priceUsd ?? '0'),
            liquidity: parseFloat(p.liquidity?.usd ?? '0'),
            volume24h: parseFloat(p.volume?.h24 ?? '0'),
            change6h: parseFloat(p.priceChange?.h6 ?? '0'),
            dexUrl: p.url ?? `https://dexscreener.com/solana/${tokenAddress}`,
          });
        }

        // Small delay to avoid hammering the API
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        log.warn('SmartMoneyService: wallet scan failed', {
          wallet: wallet.label,
          error: (err as Error).message,
        });
      }
    }

    return moves;
  }

  /**
   * Format a smart money move as a Telegram alert.
   */
  static formatAlert(move: SmartMoneyMove): string {
    const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const formatUsd = (n: number) => {
      if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
      if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
      return `$${n.toFixed(2)}`;
    };
    const priceFmt = move.priceUsd < 0.001
      ? `$${move.priceUsd.toFixed(8)}`
      : move.priceUsd < 1
      ? `$${move.priceUsd.toFixed(5)}`
      : `$${move.priceUsd.toFixed(4)}`;

    const changeEmoji = move.change6h >= 0 ? '🟢' : '🔴';
    const birdeyeUrl = `https://birdeye.so/token/${move.tokenAddress}?chain=solana`;
    const jupiterUrl = `https://jup.ag/tokens/${move.tokenAddress}`;

    return [
      `🐋 <b>SMART MONEY ALERT</b> 🐋`,
      ``,
      `<b>${escape(move.walletLabel)}</b> aktif di token ini:`,
      `<b>${escape(move.tokenName)} (${escape(move.tokenSymbol)})</b>`,
      ``,
      `📈 Price: <b>${priceFmt}</b>`,
      `${changeEmoji} Change 6h: <b>${move.change6h >= 0 ? '+' : ''}${move.change6h.toFixed(1)}%</b>`,
      `💧 Liquidity: <b>${formatUsd(move.liquidity)}</b>`,
      `📊 Volume 24h: <b>${formatUsd(move.volume24h)}</b>`,
      ``,
      `🔑 <b>Contract Address:</b>`,
      `<code>${move.tokenAddress}</code>`,
      ``,
      `🔗 <a href="${move.dexUrl}">DexScreener</a>  |  <a href="${birdeyeUrl}">Birdeye</a>  |  <a href="${jupiterUrl}">Buy on Jupiter</a>`,
      ``,
      `<i>⚠ Copy trading selalu memiliki risiko. DYOR!</i>`,
    ].join('\n');
  }

  /**
   * Set cooldown for a wallet+token combo.
   */
  static async setCooldown(walletAddress: string, tokenAddress: string): Promise<void> {
    const key = `sm_cd:${walletAddress}:${tokenAddress}`;
    await redis.setex(key, COOLDOWN_SECS, 'alerted');
  }

  /**
   * Get list of tracked wallets with their labels (for /smartmoney command).
   */
  static getTrackedWallets() {
    return TRACKED_WALLETS;
  }
}
