import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

const STORAGE = path.join(PROJECT_ROOT, 'src/storage');
const TRADES = path.join(STORAGE, 'trades.csv');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function loadTrades() {
  if (!existsSync(TRADES)) return [];
  const lines = readFileSync(TRADES, 'utf8').trim().split('\n');
  if (lines.length <= 1) return [];
  const rows = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const [timestamp, event, market_id, title, side, stake, entry, exit, pnl, reason] = parseCsvLine(line);
    rows.push({
      timestamp,
      event,
      market_id,
      title,
      side,
      stake: Number(stake || 0),
      entry: Number(entry || 0),
      exit: Number(exit || 0),
      pnl: Number(pnl || 0),
      reason
    });
  }
  return rows;
}

function loadState(profile) {
  const p = path.join(STORAGE, `state.${profile}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function profileStats(profile) {
  const state = loadState(profile);
  if (!state) return null;

  const start = profile === 'sim_100' ? 100 : profile === 'sim_1000' ? 1000 : profile === 'sim_10000' ? 10000 : 10000;
  const realized = Number(state.realizedPnl || 0);
  const openExposure = Number((state.openPositions || []).reduce((a, p) => a + Number(p.stake || 0), 0));
  const totalTrades = Number(state.closedTrades || 0);
  const winRate = totalTrades ? Number(((state.wins || 0) / totalTrades * 100).toFixed(1)) : 0;

  return {
    profile,
    start,
    bankroll: Number(state.bankroll || start),
    realizedPnl: Number(realized.toFixed(2)),
    roiPct: Number((realized / start * 100).toFixed(2)),
    totalTrades,
    winRate,
    openExposure: Number(openExposure.toFixed(2)),
    wins: Number(state.wins || 0),
    losses: Number(state.losses || 0)
  };
}

export function computeDashboard() {
  const trades = loadTrades();
  const profiles = ['sim_100', 'sim_1000', 'sim_10000'];
  const leaderboard = profiles.map(profileStats).filter(Boolean).sort((a, b) => b.realizedPnl - a.realizedPnl);

  const closed = trades.filter((t) => t.event === 'CLOSE');
  const bySymbol = new Map();
  for (const t of closed) {
    const x = bySymbol.get(t.market_id) || { symbol: t.market_id, pnl: 0, trades: 0 };
    x.pnl += t.pnl;
    x.trades += 1;
    bySymbol.set(t.market_id, x);
  }
  const symbols = [...bySymbol.values()].sort((a, b) => b.pnl - a.pnl);

  let running = 0;
  const equityCurve = [];
  for (const t of closed.slice(-100)) {
    running += Number(t.pnl || 0);
    equityCurve.push({ ts: t.timestamp, pnl: Number(running.toFixed(2)) });
  }

  return {
    leaderboard,
    bestSymbol: symbols[0] || null,
    worstSymbol: symbols[symbols.length - 1] || null,
    closedTrades: closed.length,
    equityCurve
  };
}
