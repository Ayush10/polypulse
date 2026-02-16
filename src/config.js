import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/config.js -> root is one up (src) then one up (root)? 
// No, config is in src/, so root is ../
const PROJECT_ROOT = path.resolve(__dirname, '../');

function loadEnvFile() {
  const envPath = path.resolve(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

export const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  paperBankroll: Number(process.env.PAPER_BANKROLL || 10000),
  minSignalThreshold: Number(process.env.SIGNAL_THRESHOLD || 0.35),
  uiPort: Number(process.env.UI_PORT || 8787),
  tradingViewWebhookSecret: process.env.TRADINGVIEW_WEBHOOK_SECRET || ""
};

export function assertConfig() {
  const missing = [];
  if (!config.telegramBotToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (!config.telegramChatId) missing.push('TELEGRAM_CHAT_ID');
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}
