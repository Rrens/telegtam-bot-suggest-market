# Advanced Trading Assistant — Telegram Bot

A production-grade Telegram bot providing probabilistic trading signals for crypto, stocks, and forex.

> ⚠ **Disclaimer**: All signals are probabilistic estimates. This is not financial advice.

---

## Features

| Feature | Details |
|---|---|
| Trading Signals | RSI, MACD, MA50/200, BB, Volume, Breakout |
| Multi-timeframe | 1h, 4h, 1d analysis with confluence |
| Fundamental Analysis | CoinGecko (crypto), Yahoo Finance (stocks) |
| News Sentiment | CryptoPanic + NewsAPI with AFINN scoring |
| Chart Generation | Server-side PNG via chartjs-node-canvas |
| WebSocket | Binance live prices with auto-reconnect |
| Portfolio Tracking | PnL, cost basis, unrealized gains |
| Price Alerts | Price target, % change, portfolio threshold |
| News Alerts | Real-time with 1-hour cooldown anti-spam |
| Signal History | Stored per symbol with accuracy tracking |
| Backtesting | Win rate, avg return from stored signals |
| Risk Management | Stop-loss, take-profit, position size |
| User Profiles | conservative / moderate / aggressive |
| Background Workers | BullMQ (price, news, alerts, signals) |
| Caching | Redis (30s crypto, 60s stock, 5m OHLCV) |

---

## Setup

### 1. Clone and install

```bash
cd telegram-bot-suggest-market
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in:
# - BOT_TOKEN (from @BotFather)
# - CRYPTOPANIC_API_KEY (from cryptopanic.com)
# - NEWSAPI_KEY (from newsapi.org)
```

### 3. Start infrastructure

```bash
docker-compose up -d postgres redis
```

### 4. Run in development

```bash
npm run dev
```

### 5. Run full stack via Docker

```bash
docker-compose up --build
```

---

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Welcome and command list |
| `/predict <symbol>` | Full signal analysis + chart |
| `/news <symbol>` | Latest news with sentiment |
| `/add <symbol> <amount> <avg_price>` | Add asset to portfolio |
| `/list` | List tracked assets |
| `/delete <symbol>` | Remove an asset |
| `/portfolio` | Full portfolio PnL |
| `/alert <symbol> <gte\|lte> <value>` | Set price alert |
| `/alert <symbol> <gte\|lte> <pct> pct` | Set % change alert |
| `/alertnews <symbol>` | Subscribe to news alerts |
| `/alertnews stop <symbol>` | Unsubscribe from news alerts |
| `/history <symbol>` | Past signal history |
| `/backtest <symbol>` | Backtest stored signals |
| `/profile` | View trading profile |
| `/profile risk <conservative\|moderate\|aggressive>` | Update risk profile |
| `/profile timeframe <scalping\|swing\|long-term>` | Update preferred timeframe |

---

## Example Output

```
📊 BTCUSDT Analysis

Price: $63,200
Trend: 🟢 Strong Bullish
Confidence: 82%
Signal Score: +5
Trade Bias: 📈 Long

── Technical Analysis ──
• RSI(14): 28.4 → Oversold (reversal potential)
• MACD: ↑ Bullish crossover confirmed with positive histogram
• MA50: $61,500 (Price above ✓)
• MA200: $58,200 (Price above ✓)
• Volume: Significant spike detected ⚠
• Breakout: Upside breakout confirmed 🚀

── Fundamentals ──
Rating: Strong

── News Sentiment: (Positive) ──
▲ ETF inflows hit record high as institutional demand surges…
▲ SEC signals regulatory clarity for crypto markets…

── Risk Management ──
• Stop Loss: $60,900
• Take Profit: $68,750
• Risk/Reward: 1:2.50
• Position Size: 2–5% of portfolio (moderate profile)

── Reasoning ──
• RSI oversold (<30) — strong reversal potential
• MACD bullish crossover confirmed with positive histogram
• Golden cross: MA50 > MA200 (long-term bullish structure)
• Volume-confirmed upside breakout above resistance
• Multi-timeframe confluence: 3/3 timeframes bullish

── Signal Invalidation ──
⚠ Price closes below MA50 ($61,500)
⚠ Price breaks below support ($60,200)

── Conclusion ──
High probability upward continuation with strong confluence.

⚠ Not financial advice. Signals are probabilistic.
```

---

## Architecture

```
src/
├── bot/            → Grammy bot + command handlers
├── services/       → PriceService, SignalEngine, etc.
├── workers/        → BullMQ background jobs
├── websocket/      → Binance WS manager
├── db/             → Knex + PostgreSQL
├── cache/          → Redis client
├── utils/          → Indicators, formatter, sentiment
└── config/         → Environment config
```

---

## Database Tables

- `users` — Telegram users with risk profiles
- `assets` — Portfolio positions
- `alerts` — Price and % change alerts
- `signals` — All generated signals with full analysis
- `signal_history` — Per-user signal tracking + outcomes
- `news_cache` — Deduplicated news with sentiment scores
- `news_alerts` — News alert subscriptions with cooldown

---

## Environment Variables

See `.env.example` for the full list. Required:
- `BOT_TOKEN` — From [@BotFather](https://t.me/BotFather)
- `CRYPTOPANIC_API_KEY` — From [cryptopanic.com](https://cryptopanic.com/developers/api/)
- `NEWSAPI_KEY` — From [newsapi.org](https://newsapi.org)
