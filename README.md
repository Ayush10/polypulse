# PolyPulse - Automated Paper Trading Terminal

A real-time paper trading system that combines live market data, news sentiment analysis, and configurable strategies to generate trading signals and execute simulated trades across crypto and forex markets.

## Features

- **Live Market Tape** - Real-time price data from Yahoo Finance for BTC, ETH, SOL, EUR/USD, GBP/USD, USD/JPY
- **Multi-Source Sentiment Analysis** - Aggregates headlines from CoinDesk, Cointelegraph, Decrypt, The Block + Fear/Greed Index
- **Signal Scoring Engine** - Momentum + sentiment + TradingView webhook bias scoring with adaptive thresholds
- **Paper Trading Execution** - Simulated position management with risk controls (2% risk per trade, profit targets, max hold times)
- **3-Bankroll Simulation** - Concurrent simulations at $100, $1,000, and $10,000 bankrolls
- **Real-Time Dashboard** - Server-Sent Events (SSE) powered UI with live activity feed, market cards, signal table, equity curve
- **Strategy Management** - Create, configure, and switch between trading strategies from the UI
- **TradingView Webhook Integration** - Accept external signals from TradingView alerts
- **Telegram Notifications** - Optional digest delivery via Telegram bot
- **Persistent State** - All trades logged to CSV, portfolio state saved to JSON

## Prerequisites

- **Node.js** v18+ (uses ES modules, native `fetch`)
- **npm** (comes with Node.js)

## Installation

```bash
# Clone or unzip the project
cd polypulse

# Install dependencies (none required - zero external deps!)
# The project uses only Node.js built-in modules

# Copy the environment template
cp .env.example .env

# Edit .env with your settings (see Configuration section)
```

## Configuration

Edit the `.env` file:

```env
# Required for Telegram notifications (optional for UI-only use)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# Dashboard port (default: 8787)
UI_PORT=8787

# Optional: TradingView webhook authentication secret
TRADINGVIEW_WEBHOOK_SECRET=
```

**Note:** Telegram credentials are only required if you want to receive trading digests via Telegram. The web dashboard works without them.

### Getting Telegram Credentials (Optional)

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Create a new bot with `/newbot`
3. Copy the bot token to `TELEGRAM_BOT_TOKEN`
4. Start a chat with your bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your `chat_id`
5. Set `TELEGRAM_CHAT_ID` to your chat ID

## Running the Project

### Start the Web Dashboard (Recommended)

```bash
npm run ui
```

Then open **http://localhost:8787** in your browser.

From the dashboard you can:
- **Run Once** - Execute a single trading cycle with real-time progress
- **Run 3 Simulations** - Run 3 concurrent simulations ($100, $1K, $10K bankrolls) with 6 cycles each
- **Demo Mode** - Run simulations and generate a markdown summary report

### Command Line

```bash
# Run a single trading cycle (requires Telegram config)
npm start

# Run one cycle
npm run run:once

# Run 3-bankroll simulations
npm run simulate:3
```

## How It Works

### Trading Cycle

Each cycle performs these steps:

1. **Fetch Market Tape** - Pulls 5-minute OHLC bars from Yahoo Finance for 6 assets (3 crypto, 3 forex)
2. **Analyze Sentiment** - Scrapes RSS feeds from 4 crypto news sources + Fear/Greed Index
3. **Score Signals** - For each asset: `score = momentum_weight * momentum + sentiment_weight * sentiment + tv_bias`
4. **Apply Adaptive Thresholds** - Loosens thresholds in quiet markets to maintain activity
5. **Close Positions** - Check open positions against profit target ($5) or max hold time (5 min)
6. **Open Positions** - Execute top 3 signals with 2% risk per trade
7. **Save State** - Persist portfolio state and log trades to CSV

### Signal Scoring

```
momentum = 0.65 * (1h_change / 1%) + 0.35 * (4h_change / 3%)   [clamped -1..1]
sentiment = headline_score * 0.7 + fear_greed * 0.3              [crypto only]
tv_bias = TradingView signal direction * 0.15 * confidence       [optional]

final_score = momentum_weight * momentum + sentiment_weight * sentiment + tv_bias
```

- **LONG** if score > long_threshold
- **SHORT** if score < short_threshold
- **HOLD** otherwise

### Strategy Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| momentumWeight | 0.75 | Weight for momentum component |
| sentimentWeight | 0.25 | Weight for sentiment component |
| longThreshold | 0.08 | Score threshold to go long |
| shortThreshold | -0.08 | Score threshold to go short |

## TradingView Webhook Integration

PolyPulse can accept external signals from TradingView alerts.

### Webhook Endpoint

```
POST http://<YOUR_IP>:8787/api/tradingview/webhook
```

### Payload Format

```json
{
  "symbol": "BTCUSD",
  "side": "BUY",
  "confidence": 0.8,
  "secret": "your_optional_secret"
}
```

### Setup in TradingView

1. Create an alert on your TradingView chart
2. Set the webhook URL to your PolyPulse endpoint
3. Use the JSON payload format above in the alert message
4. If you set `TRADINGVIEW_WEBHOOK_SECRET` in `.env`, include the `secret` field or `x-tv-secret` header

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Web dashboard |
| GET | `/api/run-once/stream` | SSE stream - run single cycle with live progress |
| GET | `/api/simulate3/stream` | SSE stream - run 3 simulations with live progress |
| GET | `/api/demo/stream` | SSE stream - run simulations + generate report |
| POST | `/api/run-once` | Run single cycle (JSON response) |
| POST | `/api/simulate3` | Run 3 simulations (JSON response) |
| POST | `/api/demo-run` | Run simulations + report (JSON response) |
| GET | `/api/dashboard` | Get leaderboard, equity curve, symbol stats |
| GET | `/api/strategies` | List all strategies |
| POST | `/api/strategies` | Add a new strategy |
| POST | `/api/strategies/active` | Set active strategy |
| POST | `/api/tradingview/webhook` | Receive TradingView signal |

## Project Structure

```
polypulse/
├── .env.example              # Environment template
├── package.json              # Project metadata
├── README.md                 # This file
├── src/
│   ├── index.js              # CLI entry point
│   ├── core.js               # Main trading cycle logic
│   ├── config.js             # Configuration loader
│   ├── collectors/
│   │   ├── market_tape.js    # Yahoo Finance price fetcher
│   │   ├── sentiment_news.js # RSS + Fear/Greed sentiment
│   │   └── polymarket.js     # Polymarket prediction markets
│   ├── signal/
│   │   └── score.js          # Signal scoring engine
│   ├── strategy/
│   │   └── engine.js         # Strategy management + TV webhooks
│   ├── paper/
│   │   ├── portfolio.js      # State management
│   │   └── execution.js      # Trade execution
│   ├── outputs/
│   │   ├── format_digest.js  # Telegram digest formatter
│   │   └── telegram.js       # Telegram bot API
│   ├── ui/
│   │   ├── index.html        # Dashboard frontend
│   │   ├── server.js         # HTTP server + SSE streaming
│   │   └── analytics.js      # Dashboard metrics computation
│   └── storage/
│       ├── strategies.json   # Strategy definitions
│       ├── trades.csv        # Trade log (OPEN/CLOSE events)
│       ├── signals.csv       # Signal log
│       └── state.*.json      # Portfolio state per profile
└── reports/                  # Generated summary reports
```

## Data Sources

| Source | Data | Update |
|--------|------|--------|
| Yahoo Finance | Crypto/forex 5m OHLC bars | Each cycle |
| CoinDesk RSS | Crypto news headlines | Each cycle |
| Cointelegraph RSS | Crypto news headlines | Each cycle |
| Decrypt RSS | Crypto news headlines | Each cycle |
| The Block RSS | Crypto news headlines | Each cycle |
| Alternative.me | Fear & Greed Index | Each cycle |
| TradingView | External signals via webhook | On receive |

## Troubleshooting

**Port already in use:**
```bash
# Kill the existing process
lsof -ti:8787 | xargs kill -9
npm run ui
```

**Yahoo Finance returns no data:**
- Yahoo Finance may rate-limit or block requests. The system gracefully handles missing assets and continues with available data.

**No signals generated:**
- In quiet markets, adaptive thresholds automatically loosen to generate signals. If still no signals, the fallback mechanism selects the strongest momentum assets.

## License

MIT
