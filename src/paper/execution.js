import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

const TRADES_PATH = path.join(PROJECT_ROOT, 'src/storage/trades.csv');

function ensureTradesCsv() {
  if (!existsSync(TRADES_PATH)) {
    writeFileSync(TRADES_PATH, 'timestamp,event,market_id,title,side,stake,entry,exit,pnl,reason\n');
  }
}

const nowIso = () => new Date().toISOString();

export function maybeClosePositions(state, pricesById, { profitTargetUsd = 5, maxHoldMinutes = 5 } = {}) {
  ensureTradesCsv();
  const stillOpen = [];
  const closed = [];

  for (const pos of state.openPositions) {
    const asset = pricesById.get(pos.marketId);
    if (!asset) {
      stillOpen.push(pos);
      continue;
    }

    const current = asset.price;
    const dir = pos.side === 'LONG' ? 1 : -1;
    const pnl = (current - pos.entryPrice) * pos.units * dir;
    const ageMinutes = (Date.now() - new Date(pos.openedAt).getTime()) / 60000;

    const reason = pnl >= profitTargetUsd ? `target_${profitTargetUsd}` : ageMinutes >= maxHoldMinutes ? `timeout_${maxHoldMinutes}m` : '';
    if (!reason) {
      stillOpen.push(pos);
      continue;
    }

    state.bankroll += pos.stake + pnl;
    state.realizedPnl = (state.realizedPnl || 0) + pnl;
    state.closedTrades += 1;
    if (pnl >= 0) state.wins += 1; else state.losses += 1;

    appendFileSync(TRADES_PATH, [nowIso(), 'CLOSE', pos.marketId, JSON.stringify(pos.title), pos.side, pos.stake, pos.entryPrice, current, pnl.toFixed(2), reason].join(',') + '\n');
    closed.push({ ...pos, exitPrice: current, pnl, reason });
  }

  state.openPositions = stillOpen;
  return closed;
}

export function openPosition(state, signal, asset, { riskPct = 0.02, minStake = 20, maxStake = 500 } = {}) {
  ensureTradesCsv();
  const desiredStake = Math.min(maxStake, Math.max(minStake, state.bankroll * riskPct));
  if (state.bankroll < desiredStake) return null;
  const entryPrice = asset.price;
  if (!entryPrice || entryPrice <= 0) return null;

  const units = desiredStake / entryPrice;
  const pos = {
    marketId: signal.marketId,
    title: signal.title,
    side: signal.action,
    stake: desiredStake,
    units,
    entryPrice,
    openedAt: nowIso()
  };

  state.bankroll -= desiredStake;
  state.openPositions.push(pos);

  appendFileSync(TRADES_PATH, [nowIso(), 'OPEN', pos.marketId, JSON.stringify(pos.title), pos.side, desiredStake, entryPrice, '', '', 'signal'].join(',') + '\n');
  return pos;
}
