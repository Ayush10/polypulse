function pct(a, b) {
  if (!a || !b) return 0;
  return (a - b) / b;
}

async function fetchYahooChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`;
  const res = await fetch(url, { headers: { 'user-agent': 'polypulse/0.1' } });
  if (!res.ok) throw new Error(`Yahoo ${symbol} ${res.status}`);
  const data = await res.json();
  const r = data?.chart?.result?.[0];
  const closes = r?.indicators?.quote?.[0]?.close?.filter((x) => Number.isFinite(x)) || [];
  if (closes.length < 4) throw new Error(`Insufficient bars for ${symbol}`);
  const last = closes[closes.length - 1];
  const oneHourAgo = closes[Math.max(0, closes.length - 12)];
  const fourHourAgo = closes[Math.max(0, closes.length - 48)] || closes[0];
  return {
    symbol,
    price: last,
    change1h: pct(last, oneHourAgo),
    change4h: pct(last, fourHourAgo),
    bars: closes.length
  };
}

export async function fetchMarketTape() {
  const universe = [
    { symbol: 'BTC-USD', kind: 'crypto', label: 'BTCUSD' },
    { symbol: 'ETH-USD', kind: 'crypto', label: 'ETHUSD' },
    { symbol: 'SOL-USD', kind: 'crypto', label: 'SOLUSD' },
    { symbol: 'EURUSD=X', kind: 'forex', label: 'EURUSD' },
    { symbol: 'GBPUSD=X', kind: 'forex', label: 'GBPUSD' },
    { symbol: 'USDJPY=X', kind: 'forex', label: 'USDJPY' }
  ];

  const out = [];
  for (const u of universe) {
    try {
      const q = await fetchYahooChart(u.symbol);
      out.push({ ...u, ...q });
    } catch {}
  }
  return out;
}
