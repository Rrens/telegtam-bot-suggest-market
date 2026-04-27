import { PriceService } from '../../src/services/PriceService';

describe('PriceService', () => {
  describe('detectAssetType', () => {
    it('should detect crypto symbols correctly', () => {
      expect(PriceService.detectAssetType('BTCUSDT')).toBe('crypto');
      expect(PriceService.detectAssetType('ETHBTC')).toBe('crypto');
    });

    it('should detect forex symbols correctly', () => {
      expect(PriceService.detectAssetType('EURUSD')).toBe('forex');
    });

    it('should detect stock symbols correctly', () => {
      expect(PriceService.detectAssetType('AAPL')).toBe('stock');
    });
  });

  describe('normalizeCryptoSymbol', () => {
    it('should return the same symbol if it ends with BTC/ETH/USDT', () => {
      expect(PriceService.normalizeCryptoSymbol('BTC')).toBe('BTC');
      expect(PriceService.normalizeCryptoSymbol('ETH')).toBe('ETH');
      expect(PriceService.normalizeCryptoSymbol('SOLBTC')).toBe('SOLBTC');
    });

    it('should add USDT suffix if not a base pair or crypto suffix', () => {
      expect(PriceService.normalizeCryptoSymbol('SOL')).toBe('SOLUSDT');
      expect(PriceService.normalizeCryptoSymbol('DOGE')).toBe('DOGEUSDT');
    });
  });
});
