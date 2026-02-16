import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const STRATEGY_PATH = path.resolve(process.cwd(), 'src/storage/strategies.json');
const TV_SIGNALS_PATH = path.resolve(process.cwd(), 'src/storage/tradingview-signals.json');

const defaultStrategy = {
  id: 'default_momo_sentiment_v1',
  name: 'Momentum + News Sentiment v1',
  enabled: true,
  params: {
    momentumWeight: 0.75,
    sentimentWeight: 0.25,
    longThreshold: 0.08,
    shortThreshold: -0.08
  }
};

function ensureStrategies() {
  if (!existsSync(STRATEGY_PATH)) {
    writeFileSync(STRATEGY_PATH, JSON.stringify({ active: defaultStrategy.id, strategies: [defaultStrategy] }, null, 2));
  }
  if (!existsSync(TV_SIGNALS_PATH)) {
    writeFileSync(TV_SIGNALS_PATH, JSON.stringify({ signals: [] }, null, 2));
  }
}

export function getStrategies() {
  ensureStrategies();
  return JSON.parse(readFileSync(STRATEGY_PATH, 'utf8'));
}

export function addStrategy(strategy) {
  const data = getStrategies();
  const id = String(strategy.id || strategy.name || `strategy_${Date.now()}`).replace(/\s+/g, '_').toLowerCase();
  const item = {
    id,
    name: strategy.name || id,
    enabled: strategy.enabled !== false,
    params: {
      momentumWeight: Number(strategy.params?.momentumWeight ?? 0.75),
      sentimentWeight: Number(strategy.params?.sentimentWeight ?? 0.25),
      longThreshold: Number(strategy.params?.longThreshold ?? 0.2),
      shortThreshold: Number(strategy.params?.shortThreshold ?? -0.2)
    }
  };
  data.strategies = data.strategies.filter((s) => s.id !== id);
  data.strategies.push(item);
  writeFileSync(STRATEGY_PATH, JSON.stringify(data, null, 2));
  return item;
}

export function setActiveStrategy(id) {
  const data = getStrategies();
  const exists = data.strategies.some((s) => s.id === id);
  if (!exists) throw new Error(`Unknown strategy: ${id}`);
  data.active = id;
  writeFileSync(STRATEGY_PATH, JSON.stringify(data, null, 2));
  return data;
}

export function getActiveStrategy() {
  const data = getStrategies();
  const strategy = data.strategies.find((s) => s.id === data.active) || data.strategies[0] || defaultStrategy;
  return strategy;
}

export function pushTradingViewSignal(signal) {
  ensureStrategies();
  const data = JSON.parse(readFileSync(TV_SIGNALS_PATH, 'utf8'));
  const normalized = {
    ts: new Date().toISOString(),
    symbol: String(signal.symbol || signal.ticker || '').toUpperCase(),
    side: String(signal.side || signal.action || '').toUpperCase(),
    confidence: Number(signal.confidence ?? 0.5),
    source: 'tradingview',
    raw: signal
  };
  data.signals.push(normalized);
  data.signals = data.signals.slice(-200);
  writeFileSync(TV_SIGNALS_PATH, JSON.stringify(data, null, 2));
  return normalized;
}

export function consumeRecentTradingViewSignals(maxAgeMinutes = 30) {
  ensureStrategies();
  const data = JSON.parse(readFileSync(TV_SIGNALS_PATH, 'utf8'));
  const cutoff = Date.now() - maxAgeMinutes * 60_000;
  const recent = data.signals.filter((s) => new Date(s.ts).getTime() >= cutoff);
  return recent;
}
