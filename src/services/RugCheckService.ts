// ─────────────────────────────────────────────────────────────────────────────
// RugCheckService: Analyzes a Solana token contract for rug pull risks.
// Uses RugCheck.xyz public API (free, no API key required).
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { cacheGet, cacheSet } from '../cache/redis';
import { log } from '../utils/logger';

export interface RugCheckReport {
  mint: string;
  name: string;
  symbol: string;
  score: number;           // 0-100, lower = safer
  riskLevel: 'GOOD' | 'WARN' | 'DANGER';
  risks: RugRisk[];
  lpLocked: boolean;
  lpBurned: boolean;
  mintAuthRevoked: boolean;
  freezeAuthRevoked: boolean;
  topHoldersPct: number;   // % held by top 10 holders
  totalSupply: string;
}

export interface RugRisk {
  name: string;
  description: string;
  level: 'info' | 'warn' | 'danger';
}

export class RugCheckService {
  private static BASE_URL = 'https://api.rugcheck.xyz/v1';

  static async getReport(mintAddress: string): Promise<RugCheckReport | null> {
    const cacheKey = `rugcheck:${mintAddress}`;
    const cached = await cacheGet<RugCheckReport>(cacheKey);
    if (cached) return cached;

    try {
      const res = await axios.get(`${this.BASE_URL}/tokens/${mintAddress}/report`, {
        timeout: 15000,
      });

      const raw = res.data;
      if (!raw) return null;

      // Parse risks
      const risks: RugRisk[] = (raw.risks ?? []).map((r: any) => ({
        name: r.name ?? 'Unknown Risk',
        description: r.description ?? '',
        level: r.level === 'danger' ? 'danger' : r.level === 'warn' ? 'warn' : 'info',
      }));

      // Determine overall risk level
      const hasDanger = risks.some(r => r.level === 'danger');
      const hasWarn = risks.some(r => r.level === 'warn');
      const score = raw.score ?? 0;
      const riskLevel: RugCheckReport['riskLevel'] = hasDanger ? 'DANGER' : hasWarn ? 'WARN' : 'GOOD';

      // LP status
      const lockers = raw.lockerOwners ?? {};
      const markets = raw.markets ?? [];
      const lpLocked = markets.some((m: any) => m.lpLockedPct > 80);
      const lpBurned = markets.some((m: any) => m.lpBurned === true);
      const mintRevoked = raw.token?.mintAuthority === null || raw.token?.mintAuthority === 'null';
      const freezeRevoked = raw.token?.freezeAuthority === null || raw.token?.freezeAuthority === 'null';

      // Top holders %
      const holders: any[] = raw.topHolders ?? [];
      const topHoldersPct = holders
        .slice(0, 10)
        .reduce((sum: number, h: any) => sum + (parseFloat(h.pct ?? '0')), 0);

      const report: RugCheckReport = {
        mint: mintAddress,
        name: raw.tokenMeta?.name ?? raw.token?.name ?? 'Unknown',
        symbol: raw.tokenMeta?.symbol ?? raw.token?.symbol ?? '???',
        score,
        riskLevel,
        risks,
        lpLocked,
        lpBurned,
        mintAuthRevoked: mintRevoked,
        freezeAuthRevoked: freezeRevoked,
        topHoldersPct: parseFloat(topHoldersPct.toFixed(1)),
        totalSupply: raw.token?.supply?.toString() ?? '?',
      };

      // Cache for 10 minutes (risk changes quickly for new tokens)
      await cacheSet(cacheKey, report, 600);
      return report;
    } catch (err) {
      log.warn('RugCheckService: report fetch failed', {
        mint: mintAddress,
        error: (err as Error).message,
      });
      return null;
    }
  }

  static formatReport(report: RugCheckReport): string {
    const escape = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const riskEmoji = report.riskLevel === 'GOOD' ? '🟢' : report.riskLevel === 'WARN' ? '🟡' : '🔴';
    const riskLabel = report.riskLevel === 'GOOD' ? 'AMAN' : report.riskLevel === 'WARN' ? 'HATI-HATI' : 'BAHAYA';

    const lpStatus = report.lpBurned
      ? '🔥 LP BURNED (Aman!)'
      : report.lpLocked
      ? '🔒 LP Locked (Aman)'
      : '⚠️ LP Tidak Terkunci (RISIKO)';

    const mintStatus = report.mintAuthRevoked ? '✅ Mint Authority Revoked' : '⚠️ Mint Authority AKTIF (bisa minting lagi!)';
    const freezeStatus = report.freezeAuthRevoked ? '✅ Freeze Authority Revoked' : '⚠️ Freeze Authority AKTIF';

    const topRisks = report.risks.filter(r => r.level === 'danger' || r.level === 'warn').slice(0, 4);
    const riskLines = topRisks.length > 0
      ? topRisks.map(r => {
          const emoji = r.level === 'danger' ? '🔴' : '🟡';
          return `  ${emoji} ${escape(r.name)}`;
        }).join('\n')
      : '  ✅ Tidak ada risiko signifikan terdeteksi';

    const arkhamUrl = `https://platform.arkhamintelligence.com/explorer/address/${report.mint}`;
    const rugCheckUrl = `https://rugcheck.xyz/tokens/${report.mint}`;

    return [
      `🛡️ <b>RUGCHECK REPORT</b>`,
      ``,
      `<b>${escape(report.name)} (${escape(report.symbol)})</b>`,
      `Risk Level: ${riskEmoji} <b>${riskLabel}</b>`,
      `Risk Score: <b>${report.score}/1000</b> <i>(lebih rendah = lebih aman)</i>`,
      ``,
      `─────────── Keamanan ───────────`,
      `${lpStatus}`,
      `${mintStatus}`,
      `${freezeStatus}`,
      `👥 Top 10 Holder: <b>${report.topHoldersPct}%</b> ${report.topHoldersPct > 50 ? '⚠️ Concentrated!' : '✅ Tersebar'}`,
      ``,
      `─────────── Risiko ─────────────`,
      riskLines,
      ``,
      `─────────── Links ──────────────`,
      `🔗 <a href="${rugCheckUrl}">Detail di RugCheck.xyz</a>`,
      `🔍 <a href="${arkhamUrl}">Arkham Explorer</a>`,
      ``,
      `<i>⚠ Laporan ini bukan jaminan keamanan 100%. DYOR!</i>`,
    ].join('\n');
  }
}
