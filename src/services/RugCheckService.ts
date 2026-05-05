import axios from 'axios';
import { cacheGet, cacheSet } from '../cache/redis';
import { log } from '../utils/logger';

export interface RugCheckReport {
  mint: string;
  name: string;
  symbol: string;
  score: number;           
  riskLevel: 'GOOD' | 'WARN' | 'DANGER';
  risks: RugRisk[];
  lpLocked: boolean;
  lpBurned: boolean;
  mintAuthRevoked: boolean;
  freezeAuthRevoked: boolean;
  topHoldersPct: number;
  chain?: string;
  details?: any;
}

export interface RugRisk {
  name: string;
  description: string;
  level: 'info' | 'warn' | 'danger';
}

export class RugCheckService {
  private static SOL_URL = 'https://api.rugcheck.xyz/v1';
  private static GOPLUS_URL = 'https://api.gopluslabs.io/api/v1/token_security';

  static async getReport(mintAddress: string): Promise<RugCheckReport | null> {
    const cacheKey = `security_check:${mintAddress}`;
    const cached = await cacheGet<RugCheckReport>(cacheKey);
    if (cached) return cached;

    if (mintAddress.startsWith('0x')) {
      return this.checkEVM(mintAddress);
    } else {
      return this.checkSolana(mintAddress);
    }
  }

  private static async checkSolana(mint: string): Promise<RugCheckReport | null> {
    try {
      const res = await axios.get(`${this.SOL_URL}/tokens/${mint}/report`, { timeout: 10000 });
      const raw = res.data;
      if (!raw) return null;

      const risks: RugRisk[] = (raw.risks ?? []).map((r: any) => ({
        name: r.name ?? 'Unknown Risk',
        description: r.description ?? '',
        level: r.level === 'danger' ? 'danger' : r.level === 'warn' ? 'warn' : 'info',
      }));

      const markets = raw.markets ?? [];
      const holders = raw.topHolders ?? [];
      const topHoldersPct = holders.slice(0, 10).reduce((sum: number, h: any) => sum + (parseFloat(h.pct || '0')), 0);

      const report: RugCheckReport = {
        mint,
        name: raw.tokenMeta?.name || 'Unknown',
        symbol: raw.tokenMeta?.symbol || '???',
        score: raw.score ?? 0,
        riskLevel: risks.some(r => r.level === 'danger') ? 'DANGER' : (raw.score > 100 ? 'WARN' : 'GOOD'),
        risks,
        lpLocked: markets.some((m: any) => m.lpLockedPct > 80),
        lpBurned: markets.some((m: any) => m.lpBurned === true),
        mintAuthRevoked: raw.token?.mintAuthority === null,
        freezeAuthRevoked: raw.token?.freezeAuthority === null,
        topHoldersPct: parseFloat(topHoldersPct.toFixed(1)),
        chain: 'Solana'
      };

      await cacheSet(`security_check:${mint}`, report, 600);
      return report;
    } catch (err) { return null; }
  }

  private static async checkEVM(mint: string): Promise<RugCheckReport | null> {
    const chains = ['1', '56', '8453', '137']; 
    for (const chainId of chains) {
      try {
        const res = await axios.get(`${this.GOPLUS_URL}/${chainId}?contract_addresses=${mint}`, { timeout: 5000 });
        const data = res.data?.result?.[mint.toLowerCase()];
        if (data && data.token_name) {
          const risks: RugRisk[] = [];
          if (data.is_honeypot === '1') risks.push({ name: 'HONEYPOT', description: 'Cannot sell', level: 'danger' });
          
          const report: RugCheckReport = {
            mint,
            name: data.token_name,
            symbol: data.token_symbol,
            score: data.is_honeypot === '1' ? 1000 : 0,
            riskLevel: data.is_honeypot === '1' ? 'DANGER' : 'GOOD',
            risks,
            lpLocked: data.lp_locked === '1',
            lpBurned: parseFloat(data.lp_burned || '0') > 80,
            mintAuthRevoked: data.can_take_back_ownership !== '1',
            freezeAuthRevoked: data.is_blacklisted !== '1',
            topHoldersPct: parseFloat(data.creator_percent || '0'),
            chain: this.getChainName(chainId)
          };
          await cacheSet(`security_check:${mint}`, report, 600);
          return report;
        }
      } catch (e) { continue; }
    }
    return null;
  }

  private static getChainName(id: string): string {
    const names: any = { '1': 'Ethereum', '56': 'BSC', '8453': 'Base', '137': 'Polygon' };
    return names[id] || 'EVM';
  }
}
