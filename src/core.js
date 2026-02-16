import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config, assertConfig } from './config.js';
import { fetchMarketTape } from './collectors/market_tape.js';
import { fetchNewsSentiment } from './collectors/sentiment_news.js';
import { scoreTapeAsset, pickTopTrades } from './signal/score.js';
import { formatDigest } from './outputs/format_digest.js';
import { sendTelegramMessage } from './outputs/telegram.js';
import { loadState, saveState, ensureStorageFiles } from './paper/portfolio.js';
import { maybeClosePositions, openPosition } from './paper/execution.js';
import { consumeRecentTradingViewSignals, getActiveStrategy } from './strategy/engine.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function marketVolatility(signals) {
  if (!signals.length) return 0;
  return signals.reduce((a, s) => a + Math.abs(s.components.momentum || 0), 0) / signals.length;
}

function applyAdaptiveThresholds(signals, strategy) {
  const vol = marketVolatility(signals);
  const baseLong = strategy?.params?.longThreshold ?? 0.08;
  const baseShort = strategy?.params?.shortThreshold ?? -0.08;
  let longT = baseLong;
  let shortT = baseShort;
  if (vol < 0.12) {
    longT = Math.max(0.04, baseLong * 0.7);
    shortT = Math.min(-0.04, baseShort * 0.7);
  }
  return { longT, shortT, vol };
}

function pickTopTradesWithFallback(signals, count = 3) {
  const directional = pickTopTrades(signals, count);
  if (directional.length) return directional;
  return [...signals]
    .sort((a, b) => Math.abs(b.components.momentum || 0) - Math.abs(a.components.momentum || 0))
    .slice(0, count)
    .map((s) => ({ ...s, action: (s.components.momentum || 0) >= 0 ? 'LONG' : 'SHORT', confidence: s.confidence || 'LOW' }));
}

import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// core.js is in src/ so root is ../
// signals.csv is in src/storage/
const SIGNALS_PATH = path.resolve(__dirname, 'storage/signals.csv');

function ensureSignalsCsv() {
  ensureStorageFiles();
  const p = SIGNALS_PATH;
  if (!existsSync(p)) writeFileSync(p, 'timestamp,market_id,title,action,score,confidence,momentum,sentiment,tvBias,price,change1h,change4h\n');
  return p;
}

function logSignals(p, signals) {
  const ts = new Date().toISOString();
  for (const s of signals) {
    appendFileSync(p, [ts, s.marketId, JSON.stringify(s.title), s.action, s.finalScore, s.confidence, s.components.momentum, s.components.sentiment, s.components.tvBias ?? 0, s.price, s.change1h, s.change4h].join(',') + '\n');
  }
}

export async function runCycle({ profile = 'default', bankroll = config.paperBankroll, targetProfit = 5, maxCycles = 1, intervalMs = 30000, sendDigest = true, onProgress } = {}) {
  if (sendDigest) assertConfig();
  const emit = typeof onProgress === 'function' ? onProgress : () => { };

  const signalsPath = ensureSignalsCsv();
  const state = loadState(bankroll, profile);
  const startRealized = state.realizedPnl || 0;

  let lastDigest = '';
  let summary = {};

  emit({ type: 'log', message: `Starting trading cycle (${profile}, $${bankroll})` });

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    emit({ type: 'log', message: `Cycle ${cycle}/${maxCycles}: Fetching market data & sentiment...` });

    const [tape, sentiment] = await Promise.all([fetchMarketTape(), fetchNewsSentiment()]);

    emit({ type: 'tape', data: tape });
    emit({ type: 'log', message: `Market tape: ${tape.length} assets fetched` });
    emit({ type: 'sentiment', data: sentiment });
    emit({ type: 'log', message: `Sentiment: ${sentiment.score > 0 ? 'Bullish' : sentiment.score < 0 ? 'Bearish' : 'Neutral'} (${sentiment.score})` });

    const strategy = getActiveStrategy();
    const tvSignals = consumeRecentTradingViewSignals(30);

    emit({ type: 'log', message: 'Scoring signals...' });
    let signals = tape.map((a) => scoreTapeAsset(a, sentiment.score, strategy, tvSignals));

    const adaptive = applyAdaptiveThresholds(signals, strategy);
    signals = signals.map((s) => ({
      ...s,
      action: s.finalScore > adaptive.longT ? 'LONG' : s.finalScore < adaptive.shortT ? 'SHORT' : 'HOLD'
    }));
    logSignals(signalsPath, signals);

    emit({ type: 'signals', data: signals });
    emit({ type: 'log', message: `Signals scored: ${signals.filter(s => s.action !== 'HOLD').length} actionable out of ${signals.length}` });

    const pricesById = new Map(tape.map((a) => [a.label, a]));

    emit({ type: 'log', message: 'Checking positions for closes...' });
    const closed = maybeClosePositions(state, pricesById, { profitTargetUsd: targetProfit, maxHoldMinutes: 5 });
    if (closed.length) {
      emit({ type: 'log', message: `Closed ${closed.length} position(s): ${closed.map(c => `${c.marketId} ${c.pnl >= 0 ? '+' : ''}$${c.pnl.toFixed(2)}`).join(', ')}` });
    }

    const topSignals = pickTopTradesWithFallback(signals, 3);
    emit({ type: 'log', message: `Top signals: ${topSignals.map(s => `${s.action} ${s.marketId}`).join(', ') || 'none'}` });

    const opened = [];
    for (const s of topSignals) {
      const already = state.openPositions.some((p) => p.marketId === s.marketId && p.side === s.action);
      if (already) continue;
      const asset = pricesById.get(s.marketId);
      if (!asset) continue;
      const pos = openPosition(state, s, asset, { riskPct: 0.02, minStake: 20, maxStake: Math.max(50, bankroll * 0.05) });
      if (pos) opened.push(pos);
    }

    if (opened.length) {
      emit({ type: 'log', message: `Opened ${opened.length} position(s): ${opened.map(p => `${p.side} ${p.marketId} $${p.stake.toFixed(2)}`).join(', ')}` });
    }

    emit({ type: 'trades', data: { opened, closed } });

    saveState(state, profile);
    emit({ type: 'state', data: { ...state, profile } });

    lastDigest = formatDigest({
      generatedAt: new Date().toISOString(),
      sentiment,
      topSignals,
      opened,
      closed,
      state,
      strategyName: strategy.name,
      cycleInfo: { cycle, maxCycles, targetProfit }
    });

    summary = { cycle, profile, state: { ...state }, topSignals, allSignals: signals, closed, opened, strategy: strategy.name, tape, sentiment, adaptive };

    const sessionPnl = (state.realizedPnl || 0) - startRealized;
    if (sessionPnl >= targetProfit) {
      emit({ type: 'log', message: `Session target reached: +$${sessionPnl.toFixed(2)}` });
      lastDigest += `\n\n Session target reached: +$${sessionPnl.toFixed(2)} (target +$${targetProfit}).`;
      break;
    }

    emit({ type: 'log', message: `Cycle ${cycle} complete. Bankroll: $${state.bankroll.toFixed(2)}` });
    if (cycle < maxCycles) {
      emit({ type: 'log', message: `Waiting ${intervalMs / 1000}s before next cycle...` });
      await sleep(intervalMs);
    }
  }

  if (sendDigest) {
    await sendTelegramMessage({ botToken: config.telegramBotToken, chatId: config.telegramChatId, text: lastDigest });
  }

  emit({ type: 'log', message: 'Trading session complete!' });
  return { digest: lastDigest, summary };
}

export async function runThreeBankrollSimulations({ onProgress } = {}) {
  const emit = typeof onProgress === 'function' ? onProgress : () => { };
  const profiles = [
    { profile: 'sim_100', bankroll: 100 },
    { profile: 'sim_1000', bankroll: 1000 },
    { profile: 'sim_10000', bankroll: 10000 }
  ];

  const outputs = [];
  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    emit({ type: 'log', message: `\n--- Simulation ${i + 1}/3: $${p.bankroll} bankroll ---` });
    outputs.push(await runCycle({ ...p, targetProfit: 5, maxCycles: 6, intervalMs: 10000, onProgress }));
  }
  return outputs;
}
