import { formatWibTime, formatPrice, formatPct } from '../../src/utils/formatter';

describe('Formatter Utils', () => {
  describe('formatWibTime', () => {
    it('should format Date to WIB string correctly', () => {
      const date = new Date('2024-04-25T17:00:00Z');
      const formatted = formatWibTime(date);
      expect(formatted).toContain('WIB');
      expect(formatted).toContain('26 Apr 2024'); // 17:00 UTC + 7 = 00:00 WIB
    });
  });

  describe('formatPrice', () => {
    it('should format large prices correctly', () => {
      expect(formatPrice(65000)).toBe('$65,000.00 (Rp1.040.000.000)');
    });

    it('should format small prices with more decimals', () => {
      expect(formatPrice(0.00012345)).toBe('$0.00012345 (Rp2)');
    });

    it('should format IDR prices correctly', () => {
      expect(formatPrice(5200, 'IDR')).toBe('Rp5.200 ($0.33)');
    });
  });

  describe('formatPct', () => {
    it('should add + sign for positive values', () => {
      expect(formatPct(5.5)).toBe('+5.50%');
    });

    it('should handle negative values correctly', () => {
      expect(formatPct(-2.1)).toBe('-2.10%');
    });
  });
});
