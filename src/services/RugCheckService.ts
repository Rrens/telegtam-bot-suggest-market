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

    // 1. DETEKSI EVM (0x) vs SOLANA
    if (mintAddress.startsWith('0x')) {
      return this.checkEVM(mintAddress);
    } else {
      return this.checkSolana(mintAddress);
    }
  }

  // --- SOLANA CHECK (via RugCheck.xyz) ---
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

      const hasDanger = risks.some(r => r.level === 'danger');
      const score = raw.score ?? 0;
      
      const report: RugCheckReport = {
        mint,
        name: raw.tokenMeta?.name || 'Unknown',
        symbol: raw.tokenMeta?.symbol || '???',
        score: score,
        riskLevel: hasDanger || score > 500 ? 'DANGER' : score > 100 ? 'WARN' : 'GOOD',
        risks,
        chain: 'Solana'
      };

      await cacheSet(`security_check:${mint}`, report, 600);
      return report;
    } catch (err) {
      return null;
    }
  }

  // --- EVM CHECK (via GoPlus) ---
  private static async checkEVM(mint: string): Promise<RugCheckReport | null> {
    // Kita coba scan di chain populer (1=ETH, 56=BSC, 8453=Base, 137=Polygon)
    const chains = ['1', '56', '8453', '137']; 
    
    for (const chainId of chains) {
      try {
        const res = await axios.get(`${this.GOPLUS_URL}/${chainId}?contract_addresses=${mint}`, { timeout: 5000 });
        const data = res.data?.result?.[mint.toLowerCase()];
        
        if (data && data.token_name) {
          const risks: RugRisk[] = [];
          let score = 0;

          if (data.is_honeypot === '1') { risks.push({ name: 'HONEYPOT', description: 'Cannot sell!', level: 'danger' }); score += 1000; }
          if (data.is_mintable === '1') { risks.push({ name: 'MINTABLE', description: 'Owner can print more', level: 'warn' }); score += 300; }
          if (parseFloat(data.buy_tax) > 10) { risks.push({ name: 'HIGH BUY TAX', description: `${data.buy_tax}% tax`, level: 'warn' }); score += 200; }
          if (parseFloat(data.sell_tax) > 10) { risks.push({ name: 'HIGH SELL TAX', description: `${data.sell_tax}% tax`, level: 'danger' }); score += 400; }

          const report: RugCheckReport = {
            mint,
            name: data.token_name,
            symbol: data.token_symbol,
            score,
            riskLevel: score > 500 ? 'DANGER' : score > 100 ? 'WARN' : 'GOOD',
            risks,
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
