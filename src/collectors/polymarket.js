function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseOutcomePrices(market) {
  // Gamma API sometimes returns outcomePrices as array OR JSON string.
  const raw = market.outcomePrices;
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { arr = []; }
  }

  if (arr.length >= 2) {
    const yes = toNum(arr[0], NaN);
    const no = toNum(arr[1], NaN);
    if (Number.isFinite(yes) && Number.isFinite(no)) return { yes, no };
  }

  // Fallback if separate fields exist.
  const yes = toNum(market.yesPrice, NaN);
  const no = toNum(market.noPrice, NaN);
  if (Number.isFinite(yes) && Number.isFinite(no)) return { yes, no };

  return { yes: 0.5, no: 0.5 };
}

function normalizeMarket(m) {
  const { yes, no } = parseOutcomePrices(m);
  const title = m.question || m.title || 'Untitled market';

  // Momentum proxies from whatever fields are available.
  const change1h = toNum(m.oneHourPriceChange ?? m.priceChange1h ?? m.change1h, 0);
  const change24h = toNum(m.oneDayPriceChange ?? m.priceChange24h ?? m.change24h, 0);

  return {
    id: String(m.id ?? m.slug ?? title).slice(0, 200),
    title,
    yesPrice: yes,
    noPrice: no,
    change30m: change1h / 2, // proxy when only 1h change exists
    change1h,
    change24h,
    volume24h: toNum(m.volume24hr ?? m.volume24h ?? m.volume, 0),
    liquidity: toNum(m.liquidity ?? 0, 0),
    endDate: m.endDate ?? null,
    url: m.url ?? (m.slug ? `https://polymarket.com/event/${m.slug}` : 'https://polymarket.com')
  };
}

export async function fetchPolymarketSnapshot() {
  const url = 'https://gamma-api.polymarket.com/markets?closed=false&archived=false&active=true&limit=100';
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Polymarket fetch failed: ${res.status}`);

  const data = await res.json();
  const rawMarkets = Array.isArray(data) ? data : [];
  const markets = rawMarkets
    .map(normalizeMarket)
    .filter((m) => m.volume24h > 1000 && m.liquidity > 5000)
    .slice(0, 60);

  return {
    generatedAt: new Date().toISOString(),
    markets
  };
}
