import express from 'express';
import cors from 'cors';
import path from 'path';
import { db } from '../db';
import { config } from '../config';
import { log } from '../utils/logger';

export function startWebServer() {
  const app = express();
  const port = config.app.port || 3000;

  app.use(cors());
  app.use(express.json());

  // Serve static HTML dashboard
  app.get('/dashboard', (req, res) => {
    // Basic security: require an admin token in the query
    const token = req.query.token;
    if (!token || token !== config.bot.adminId) {
      return res.status(401).send('<h1>Unauthorized</h1><p>Please provide your admin token.</p>');
    }
    res.sendFile(path.join(process.cwd(), 'public', 'dashboard.html'));
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

  app.listen(port, () => {
    log.info(`Web Dashboard is running at http://localhost:${port}/dashboard`);
  });
}
