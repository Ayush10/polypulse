import http from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { runCycle, runThreeBankrollSimulations } from '../core.js';
import { addStrategy, getStrategies, setActiveStrategy, pushTradingViewSignal } from '../strategy/engine.js';
import { computeDashboard } from './analytics.js';

const HTML_PATH = path.resolve(process.cwd(), 'src/ui/index.html');
const REPORTS_DIR = path.resolve(process.cwd(), 'reports');

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

function sseStart(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    'access-control-allow-origin': '*'
  });
}

function sseSend(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeSummaryReport({ dashboard, runs }) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const lines = [];
  lines.push('# PolyPulse Hackathon Demo Summary');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Leaderboard');
  for (const l of dashboard.leaderboard) {
    lines.push(`- ${l.profile}: realizedPnL $${l.realizedPnl}, ROI ${l.roiPct}%, winRate ${l.winRate}%, trades ${l.totalTrades}`);
  }
  lines.push('');
  lines.push(`Best symbol: ${dashboard.bestSymbol ? `${dashboard.bestSymbol.symbol} ($${dashboard.bestSymbol.pnl.toFixed(2)})` : 'n/a'}`);
  lines.push(`Worst symbol: ${dashboard.worstSymbol ? `${dashboard.worstSymbol.symbol} ($${dashboard.worstSymbol.pnl.toFixed(2)})` : 'n/a'}`);
  lines.push('');
  lines.push('## Simulation snapshots');
  for (const r of runs || []) {
    lines.push(`- cycle ${r.cycle}, strategy ${r.strategy}, bankroll $${Number(r.state?.bankroll || 0).toFixed(2)}, wins ${r.state?.wins || 0}, losses ${r.state?.losses || 0}`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('- Paper-trading only. No live execution.');
  lines.push('- Uses live tape + multi-source sentiment + optional TradingView webhook bias.');

  const outPath = path.join(REPORTS_DIR, 'latest-summary.md');
  writeFileSync(outPath, lines.join('\n'));
  return outPath;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-tv-secret'
    });
    res.end();
    return;
  }

  // Serve index.html
  if (req.method === 'GET' && url.pathname === '/') {
    const html = readFileSync(HTML_PATH, 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Serve static assets
  if (req.method === 'GET' && (url.pathname === '/logo.png' || url.pathname === '/favicon.png' || url.pathname === '/favicon.ico')) {
    const filePath = path.join(path.dirname(HTML_PATH), url.pathname === '/favicon.ico' ? 'favicon.png' : path.basename(url.pathname));
    try {
      const img = readFileSync(filePath);
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(img);
    } catch {
      res.writeHead(404);
      res.end();
    }
    return;
  }

  // --- SSE Streaming endpoints ---

  if (req.method === 'GET' && url.pathname === '/api/run-once/stream') {
    sseStart(res);
    try {
      const out = await runCycle({
        maxCycles: 1,
        sendDigest: false,
        onProgress: (data) => sseSend(res, data)
      });
      const dashboard = computeDashboard();
      sseSend(res, { type: 'dashboard', data: dashboard });
      sseSend(res, { type: 'done', data: out.summary });
    } catch (err) {
      sseSend(res, { type: 'error', message: err.message });
    }
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/simulate3/stream') {
    sseStart(res);
    try {
      const runs = await runThreeBankrollSimulations({
        onProgress: (data) => sseSend(res, data)
      });
      const dashboard = computeDashboard();
      sseSend(res, { type: 'dashboard', data: dashboard });
      sseSend(res, { type: 'done', data: runs.map((x) => x.summary) });
    } catch (err) {
      sseSend(res, { type: 'error', message: err.message });
    }
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/demo/stream') {
    sseStart(res);
    try {
      const runs = await runThreeBankrollSimulations({
        onProgress: (data) => sseSend(res, data)
      });
      const dashboard = computeDashboard();
      const reportPath = writeSummaryReport({ dashboard, runs: runs.map((x) => x.summary) });
      sseSend(res, { type: 'dashboard', data: dashboard });
      sseSend(res, { type: 'report', path: reportPath });
      sseSend(res, { type: 'done', data: runs.map((x) => x.summary) });
    } catch (err) {
      sseSend(res, { type: 'error', message: err.message });
    }
    res.end();
    return;
  }

  // --- REST endpoints ---

  if (req.method === 'GET' && url.pathname === '/api/strategies') {
    return json(res, 200, getStrategies());
  }

  if (req.method === 'POST' && url.pathname === '/api/strategies') {
    try {
      const body = await parseBody(req);
      const item = addStrategy(body);
      return json(res, 200, { ok: true, strategy: item });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/strategies/active') {
    try {
      const body = await parseBody(req);
      const out = setActiveStrategy(body.id);
      return json(res, 200, { ok: true, ...out });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/run-once') {
    try {
      const out = await runCycle({ maxCycles: 1, sendDigest: false });
      return json(res, 200, { ok: true, summary: out.summary, digest: out.digest });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/simulate3') {
    try {
      const out = await runThreeBankrollSimulations();
      return json(res, 200, { ok: true, runs: out.map((x) => x.summary) });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/demo-run') {
    try {
      const runs = await runThreeBankrollSimulations();
      const dashboard = computeDashboard();
      const reportPath = writeSummaryReport({ dashboard, runs: runs.map((x) => x.summary) });
      return json(res, 200, { ok: true, dashboard, reportPath, runs: runs.map((x) => x.summary) });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard') {
    try {
      return json(res, 200, { ok: true, ...computeDashboard() });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/tradingview/webhook') {
    const body = await parseBody(req);
    if (config.tradingViewWebhookSecret) {
      const key = req.headers['x-tv-secret'] || body.secret;
      if (key !== config.tradingViewWebhookSecret) return json(res, 401, { ok: false, error: 'unauthorized' });
    }
    const s = pushTradingViewSignal(body);
    return json(res, 200, { ok: true, signal: s });
  }

  json(res, 404, { ok: false, error: 'not_found' });
});

server.listen(config.uiPort, () => {
  console.log(`PolyPulse UI running at http://localhost:${config.uiPort}`);
});
