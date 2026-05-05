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

  // API: Get System Stats
  app.get('/api/stats', async (req, res) => {
    try {
      const users = await db('users').count('id as cnt').first();
      const assets = await db('assets').count('id as cnt').first();
      const signals = await db('signals').count('id as cnt').first();
      const chats = await db('chat_log').count('id as cnt').first();

      res.json({
        users: users?.cnt || 0,
        assets: assets?.cnt || 0,
        signals: signals?.cnt || 0,
        chats: chats?.cnt || 0,
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
        // We need the current price, but for speed we might want to use a cache or PriceService
        // To avoid async issues in map without proper PriceService import, we'll try to require it
        const { PriceService } = require('../services/PriceService');
        try {
          const { price } = await PriceService.getPrice(a.symbol);
          const currentValue = a.amount * price;
          const cost = a.amount * a.avg_price;
          totalValue += currentValue;
          totalCost += cost;
          
          return {
            symbol: a.symbol,
            amount: a.amount,
            avgPrice: parseFloat(a.avg_price),
            currentValue,
            pnl: currentValue - cost
          };
        } catch (e) {
          return {
            symbol: a.symbol,
            amount: a.amount,
            avgPrice: parseFloat(a.avg_price),
            currentValue: 0,
            pnl: 0
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

  app.listen(port, () => {
    log.info(`Web Dashboard is running at http://localhost:${port}/dashboard`);
  });
}
