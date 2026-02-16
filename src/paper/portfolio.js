import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const STORAGE_DIR = path.resolve(process.cwd(), 'src/storage');

export function ensureStorageFiles() {
  if (!existsSync(STORAGE_DIR)) mkdirSync(STORAGE_DIR, { recursive: true });
}

function statePath(profile = 'default') {
  return path.join(STORAGE_DIR, `state.${profile}.json`);
}

export function loadState(defaultBankroll = 10000, profile = 'default') {
  ensureStorageFiles();
  const p = statePath(profile);
  if (!existsSync(p)) {
    const initial = {
      bankroll: defaultBankroll,
      openPositions: [],
      closedTrades: 0,
      wins: 0,
      losses: 0,
      realizedPnl: 0,
      updatedAt: new Date().toISOString()
    };
    writeFileSync(p, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function saveState(state, profile = 'default') {
  ensureStorageFiles();
  state.updatedAt = new Date().toISOString();
  writeFileSync(statePath(profile), JSON.stringify(state, null, 2));
}
