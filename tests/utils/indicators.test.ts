import { computeIndicators, aggregateCandles } from '../../src/utils/indicators';
import { OHLCVCandle } from '../../src/types';

describe('Indicators Utils', () => {
  // Use a fixed start time that aligns with 5m boundaries
  const baseTime = 1714064400000; // 00:00:00
  const mockCandles: OHLCVCandle[] = Array(100).fill(0).map((_, i) => ({
    time: baseTime + i * 60000, // 1m steps
    open: 100 + i,
    high: 105 + i,
    low: 95 + i,
    close: 100 + i,
    volume: 1000,
  }));

  it('should compute indicators correctly with enough data', () => {
    const result = computeIndicators(mockCandles);
    expect(result.rsi).toBeDefined();
    expect(result.ma50).toBeDefined();
  });

  it('should return empty indicators if data is insufficient', () => {
    const result = computeIndicators(mockCandles.slice(0, 10));
    expect(result.rsi).toBeNull();
    expect(result.breakoutDetected).toBe(false);
  });

  it('should aggregate 1m candles to 5m correctly', () => {
    const aggregated = aggregateCandles(mockCandles, 5);
    expect(aggregated.length).toBe(20); 
    expect(aggregated[0].volume).toBe(5000);
  });
});
