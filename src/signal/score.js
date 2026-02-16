function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function tvBiasForAsset(asset, tvSignals) {
  const hits = tvSignals.filter((s) => s.symbol && (s.symbol.includes(asset.label.replace('USD','')) || s.symbol.includes(asset.label)));
  if (!hits.length) return 0;
  let bias = 0;
  for (const h of hits) {
    const side = h.side;
    const c = clamp(Number(h.confidence || 0.5), 0, 1);
    if (side.includes('LONG') || side.includes('BUY')) bias += 0.15 * c;
    else if (side.includes('SHORT') || side.includes('SELL')) bias -= 0.15 * c;
  }
  return clamp(bias, -0.3, 0.3);
}

export function scoreTapeAsset(asset, sentiment = 0, strategy, tvSignals = []) {
  const m1h = clamp(asset.change1h / 0.01, -1, 1);
  const m4h = clamp(asset.change4h / 0.03, -1, 1);
  const momentum = 0.65 * m1h + 0.35 * m4h;

  const sentimentAdj = asset.kind === 'crypto' ? sentiment : 0;
  const tvBias = tvBiasForAsset(asset, tvSignals);

  const mw = strategy?.params?.momentumWeight ?? 0.75;
  const sw = strategy?.params?.sentimentWeight ?? 0.25;
  const finalScore = mw * momentum + sw * sentimentAdj + tvBias;

  const longT = strategy?.params?.longThreshold ?? 0.2;
  const shortT = strategy?.params?.shortThreshold ?? -0.2;

  const action = finalScore > longT ? 'LONG' : finalScore < shortT ? 'SHORT' : 'HOLD';
  const confidence = Math.abs(finalScore) > 0.75 ? 'HIGH' : Math.abs(finalScore) > 0.45 ? 'MEDIUM' : 'LOW';

  return {
    marketId: asset.label,
    title: `${asset.label} (${asset.kind})`,
    action,
    confidence,
    finalScore: Number(finalScore.toFixed(3)),
    components: {
      momentum: Number(momentum.toFixed(3)),
      sentiment: Number(sentimentAdj.toFixed(3)),
      tvBias: Number(tvBias.toFixed(3))
    },
    price: asset.price,
    kind: asset.kind,
    change1h: asset.change1h,
    change4h: asset.change4h
  };
}

export function pickTopTrades(signals, count = 3) {
  return signals
    .filter((s) => s.action !== 'HOLD')
    .sort((a, b) => Math.abs(b.finalScore) - Math.abs(a.finalScore))
    .slice(0, count);
}
