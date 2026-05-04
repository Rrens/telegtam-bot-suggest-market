import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  bot: {
    token: required('BOT_TOKEN'),
    channelId: optional('TELEGRAM_CHANNEL_ID', ''),
    adminId: optional('TELEGRAM_ADMIN_ID', ''),
  },
  db: {
    host: optional('DB_HOST', 'localhost'),
    port: parseInt(optional('DB_PORT', '5432')),
    user: optional('DB_USER', 'tradingbot'),
    password: required('DB_PASSWORD'),
    database: optional('DB_NAME', 'tradingbot_db'),
    ssl: optional('DB_SSL', 'true') === 'true',
  },
  redis: {
    host: optional('REDIS_HOST', 'localhost'),
    port: parseInt(optional('REDIS_PORT', '6379')),
    password: optional('REDIS_PASSWORD', ''),
  },
  apis: {
    coingeckoUrl: optional('COINGECKO_API_URL', 'https://api.coingecko.com/api/v3'),
    binanceWsUrl: optional('BINANCE_WS_URL', 'wss://stream.binance.com:9443/ws'),
    binanceRestUrl: optional('BINANCE_REST_URL', 'https://api.binance.com/api/v3'),
    binanceEnabled: optional('BINANCE_ENABLED', 'true') === 'true',
    cryptoPanicKey: optional('CRYPTOPANIC_API_KEY', ''),
    cryptoPanicUrl: optional('CRYPTOPANIC_API_URL', 'https://cryptopanic.com/api/v1'),
    newsApiKey: optional('NEWSAPI_KEY', ''),
    newsApiUrl: optional('NEWSAPI_URL', 'https://newsapi.org/v2'),
    proxyUrl: optional('PROXY_URL', ''),
  },
  app: {
    nodeEnv: optional('NODE_ENV', 'development'),
    logLevel: optional('LOG_LEVEL', 'info'),
    port: parseInt(optional('PORT', '3000')),
    dashboardSecret: required('ADMIN_DASHBOARD_SECRET'),
  },
  intervals: {
    pricePollMs: parseInt(optional('PRICE_POLL_INTERVAL_MS', '30000')),
    newsPollMs: parseInt(optional('NEWS_POLL_INTERVAL_MS', '300000')),
    alertCheckMs: parseInt(optional('ALERT_CHECK_INTERVAL_MS', '15000')),
    signalRecalcMs: parseInt(optional('SIGNAL_RECALC_INTERVAL_MS', '300000')),
    newsAlertCooldownMs: parseInt(optional('NEWS_ALERT_COOLDOWN_MS', '3600000')),
  },
  gemini: {
    apiKey: optional('GEMINI_API_KEY', ''),
    // Comma-separated list of Telegram user IDs allowed to receive AI predictions
    allowedUserIds: optional('AI_PREDICT_ALLOWED_IDS', '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  },
};
