function scoreHeadline(text) {
  const t = text.toLowerCase();
  const pos = ['surge', 'rally', 'bull', 'breakout', 'approval', 'inflow', 'beat', 'growth', 'higher', 'adoption', 'record high', 'recovery'];
  const neg = ['crash', 'drop', 'bear', 'selloff', 'hack', 'exploit', 'outflow', 'ban', 'lawsuit', 'lower', 'liquidation', 'recession', 'fraud'];
  let s = 0;
  for (const w of pos) if (t.includes(w)) s += 1;
  for (const w of neg) if (t.includes(w)) s -= 1;
  return s;
}

function extractTitles(xml) {
  const titles = [];
  const re = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/gi;
  let m;
  while ((m = re.exec(xml)) && titles.length < 30) {
    const title = (m[1] || m[2] || '').trim();
    if (title && !/^(coindesk|cointelegraph|decrypt|the block)/i.test(title)) titles.push(title);
  }
  return titles;
}

async function fetchRss(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'polypulse/0.2' } });
  if (!res.ok) return [];
  const xml = await res.text();
  return extractTitles(xml);
}

async function fetchFearGreedScore() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) return 0;
    const data = await res.json();
    const value = Number(data?.data?.[0]?.value || 50); // 0-100
    return Math.max(-1, Math.min(1, (value - 50) / 50));
  } catch {
    return 0;
  }
}

export async function fetchNewsSentiment() {
  const sources = [
    'https://www.coindesk.com/arc/outboundfeeds/rss/',
    'https://cointelegraph.com/rss',
    'https://decrypt.co/feed',
    'https://www.theblock.co/rss.xml'
  ];

  const allTitles = [];
  for (const src of sources) {
    try {
      const titles = await fetchRss(src);
      allTitles.push(...titles);
    } catch {}
  }

  const headlineScore = allTitles.length
    ? allTitles.map(scoreHeadline).reduce((a, b) => a + b, 0) / Math.max(allTitles.length, 1)
    : 0;
  const headlineNorm = Math.max(-1, Math.min(1, headlineScore / 2));

  const fearGreed = await fetchFearGreedScore();

  // 70% headlines + 30% market fear/greed regime
  const blended = 0.7 * headlineNorm + 0.3 * fearGreed;

  return {
    score: Number(blended.toFixed(3)),
    components: {
      headlines: Number(headlineNorm.toFixed(3)),
      fearGreed: Number(fearGreed.toFixed(3))
    },
    sample: allTitles.slice(0, 6)
  };
}
