import express from 'express';
import cors from 'cors';
import path from 'path';
import { db } from '../db';
import { config } from '../config';
import { log } from '../utils/logger';

export function startWebServer() {
  const app = express();
  const port = config.app.port || 3000;

  const allowedOrigin = process.env.ALLOWED_ORIGIN || `http://localhost:${port}`;
  app.use(cors({ origin: allowedOrigin }));
  app.use(express.json());

  // Security Middleware for API (Dashboard only)
  app.use('/api', (req, res, next) => {
    // Skip security check for TMA (Mini App) endpoints
    if (req.path.startsWith('/tma')) {
      return next();
    }
    
    const token = req.query.token;
    if (!token || token !== config.app.dashboardSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  // Serve static HTML dashboard
  app.get('/dashboard', (req, res) => {
    // Basic security: require an admin token in the query
    const token = req.query.token;
    if (!token || token !== config.app.dashboardSecret) {
      return res.status(401).send('<h1>Unauthorized</h1><p>Please provide your admin token.</p>');
    }
    res.sendFile(path.join(process.cwd(), 'public', 'dashboard.html'));
  });

  // Serve TMA HTML
  app.get('/tma', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'tma.html'));
  });

  // Redirect root to /tma
  app.get('/', (req, res) => {
    res.redirect('/tma');
  });

  // API: Get System Stats
  app.get('/api/stats', async (req, res) => {
    try {
      const users = await db('users').count('id as cnt').first();
      const assets = await db('assets').count('id as cnt').first();
      const signals = await db('signals').count('id as cnt').first();
      const chats = await db('chat_log').count('id as cnt').first();
      
      let watchlists = { cnt: 0 };
      try {
        watchlists = await db('watchlist').count('id as cnt').first() as any;
      } catch (e) {
        // Ignored if table doesn't exist yet
      }

      const { Bot } = require('grammy');
      const botTemp = new Bot(config.bot.token);
      const me = await botTemp.api.getMe();

      res.json({
        botName: me.first_name,
        users: users?.cnt || 0,
        assets: assets?.cnt || 0,
        signals: signals?.cnt || 0,
        chats: chats?.cnt || 0,
        watchlists: watchlists?.cnt || 0,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // API: Get Recent Chat Logs
  app.get('/api/chats', async (req, res) => {
    try {
      const logs = await db('chat_log')
        .select('id', 'user_id', 'username', 'type', 'content', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(50);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch chats' });
    }
  });

  // API: Get Tracked Assets distribution
  app.get('/api/assets', async (req, res) => {
    try {
      const assets = await db('assets')
        .select('symbol')
        .count('id as count')
        .groupBy('symbol')
        .orderBy('count', 'desc');
      res.json(assets);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch assets' });
    }
  });

  // API: TMA Portfolio Data (No admin token required, just user_id for now)
  app.get('/api/tma/portfolio', async (req, res) => {
    try {
      const userId = req.query.user_id;
      if (!userId) return res.status(400).json({ error: 'Missing user_id' });

      // Usually we'd want to verify the Telegram InitData hash here to prove it's really the user
      // But for this simulation/demo we'll just trust the user_id

      const assets = await db('assets').where({ user_id: userId });
      let totalValue = 0;
      let totalCost = 0;

      const formattedAssets = await Promise.all(assets.map(async (a) => {
        const { PriceService } = require('../services/PriceService');
        const rate = PriceService.getLastUsdIdrRate() || 16000;
        try {
          const { price } = await PriceService.getPrice(a.symbol);
          const isIdr = a.symbol.endsWith('.JK') || a.symbol.endsWith('.ID');
          
          const usdPrice = isIdr ? price / rate : price;
          const usdAvgPrice = isIdr ? a.avg_price / rate : a.avg_price;
          
          const usdCurrentValue = a.amount * usdPrice;
          const usdCost = a.amount * usdAvgPrice;
          
          totalValue += usdCurrentValue;
          totalCost += usdCost;
          
          const nativeCurrentValue = a.amount * price;
          const nativeCost = a.amount * a.avg_price;
          
          return {
            symbol: a.symbol,
            amount: a.amount,
            avgPrice: parseFloat(a.avg_price),
            currentValue: nativeCurrentValue,
            pnl: nativeCurrentValue - nativeCost,
            currency: isIdr ? 'Rp' : '$'
          };
        } catch (e) {
          const isIdr = a.symbol.endsWith('.JK') || a.symbol.endsWith('.ID');
          return {
            symbol: a.symbol,
            amount: a.amount,
            avgPrice: parseFloat(a.avg_price),
            currentValue: 0,
            pnl: 0,
            currency: isIdr ? 'Rp' : '$'
          };
        }
      }));

      res.json({
        totalValue,
        pnl: totalValue - totalCost,
        assets: formattedAssets
      });

    } catch (err) {
      res.status(500).json({ error: 'Failed to load portfolio' });
    }
  });

  // API: TMA Watchlist Data
  app.get('/api/tma/watchlist', async (req, res) => {
    try {
      const userId = req.query.user_id;
      if (!userId) return res.status(400).json({ error: 'Missing user_id' });

      const watchItems = await db('watchlist').where({ user_id: userId }).orderBy('created_at', 'desc');
      
      const formattedItems = await Promise.all(watchItems.map(async (w) => {
        const { PriceService } = require('../services/PriceService');
        try {
          const { price, change24h } = await PriceService.getPrice(w.symbol);
          const isIdr = w.symbol.endsWith('.JK') || w.symbol.endsWith('.ID');
          return {
            symbol: w.symbol,
            type: w.asset_type,
            price,
            change24h,
            target: w.entry_price ? parseFloat(w.entry_price) : null,
            currency: isIdr ? 'Rp' : '$'
          };
        } catch {
          const isIdr = w.symbol.endsWith('.JK') || w.symbol.endsWith('.ID');
          return {
            symbol: w.symbol,
            type: w.asset_type,
            price: 0,
            change24h: 0,
            target: w.entry_price ? parseFloat(w.entry_price) : null,
            currency: isIdr ? 'Rp' : '$'
          };
        }
      }));

      res.json(formattedItems);
    } catch (err) {
      res.status(500).json({ error: 'Failed to load watchlist' });
    }
  });

  // API: TMA Market Pulse (Fear & Greed, Recent Signals, News)
  app.get('/api/tma/market-pulse', async (req, res) => {
    try {
      const { FearGreedService } = require('../services/FearGreedService');
      const { NewsService } = require('../services/NewsService');
      
      const [fearGreed, recentSignals, news] = await Promise.all([
        FearGreedService.getIndex(),
        db('signals').orderBy('created_at', 'desc').limit(5),
        NewsService.getNews('BTC', 5) // Default to BTC news for market pulse
      ]);

      res.json({
        fearGreed,
        signals: recentSignals,
        news: news.map((n: any) => ({
          title: n.title,
          source: n.source,
          url: n.url,
          sentiment: n.sentiment,
          time: n.publishedAt
        }))
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load market pulse' });
    }
  });

  // --- NEW: TMA WRITE ACTIONS ---

  // Add Asset
  app.post('/api/tma/assets/add', async (req, res) => {
    const { user_id, symbol, amount, avg_price } = req.body;
    if (!user_id || !symbol || !amount) return res.status(400).json({ error: 'Missing data' });
    try {
      await db('assets').insert({
        user_id, symbol: symbol.toUpperCase(), amount, avg_price: avg_price || 0
      }).onConflict(['user_id', 'symbol']).merge();
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to add asset' }); }
  });

  // Delete Asset/Watchlist
  app.post('/api/tma/delete', async (req, res) => {
    const { user_id, symbol, type } = req.body; // type: 'asset' | 'watchlist'
    if (!user_id || !symbol) return res.status(400).json({ error: 'Missing data' });
    try {
      const table = type === 'asset' ? 'assets' : 'watchlist';
      await db(table).where({ user_id, symbol: symbol.toUpperCase() }).delete();
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
  });

  // Add Technical Alert
  app.post('/api/tma/alerts/add', async (req, res) => {
    const { user_id, symbol, indicator, threshold, condition } = req.body;
    if (!user_id || !symbol || !indicator) return res.status(400).json({ error: 'Missing data' });
    try {
      await db('technical_alerts').insert({
        user_id, symbol: symbol.toUpperCase(), indicator, threshold, condition, is_active: true
      });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to add alert' }); }
  });

  app.listen(port, () => {
    log.info(`Web Dashboard is running at http://localhost:${port}/dashboard`);
  });
}
