// Minimal harness to run just the Express web server with stubbed DB
// Black-box pentest target setup

const express = require('express');
const cors = require('cors');
const path = require('path');

// Stub config matching real app structure
const config = {
  app: { port: 3001 },
  bot: { adminId: '123456789' }  // simulate a real admin ID
};

// Stub db that returns fake data
const db = (table) => {
  const fakeData = {
    users: [{ id: 1, telegram_id: '123456789', username: 'admin' }],
    assets: [{ id: 1, symbol: 'BTC', user_id: 1 }],
    signals: [{ id: 1, symbol: 'BTC', bias: 'long' }],
    chat_log: [{ id: 1, user_id: '111111', username: 'attacker', type: 'message', content: 'test', created_at: new Date() }],
  };
  const rows = fakeData[table] || [];
  const chain = {
    count: (col) => { chain._count = col; return chain; },
    select: (...cols) => chain,
    orderBy: (...args) => chain,
    limit: (n) => chain,
    groupBy: (...args) => chain,
    first: async () => ({ cnt: rows.length }),
    then: (resolve) => resolve(rows),
    [Symbol.asyncIterator]: undefined,
  };
  chain.then = (resolve) => Promise.resolve(rows).then(resolve);
  return chain;
};

const app = express();
const port = config.app.port || 3001;

app.use(cors());
app.use(express.json());

// Replicate exact middleware from server/index.ts
app.use('/api', (req, res, next) => {
  const token = req.query.token;
  if (!token || token !== config.bot.adminId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.get('/dashboard', (req, res) => {
  const token = req.query.token;
  if (!token || token !== config.bot.adminId) {
    return res.status(401).send('<h1>Unauthorized</h1><p>Please provide your admin token.</p>');
  }
  res.send('<html><body><h1>Dashboard - Authenticated</h1></body></html>');
});

app.get('/api/stats', async (req, res) => {
  try {
    const users = await db('users').count('id as cnt').first();
    const assets = await db('assets').count('id as cnt').first();
    const signals = await db('signals').count('id as cnt').first();
    const chats = await db('chat_log').count('id as cnt').first();
    res.json({ users: users?.cnt || 0, assets: assets?.cnt || 0, signals: signals?.cnt || 0, chats: chats?.cnt || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

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
  console.log(`[TARGET] Pentest server running at http://localhost:${port}`);
});
