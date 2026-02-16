export function formatDigest({ generatedAt, sentiment, topSignals, opened, closed, state, cycleInfo, strategyName }) {
  const lines = [];
  lines.push('📈 PolyPulse Digest (Paper Trading)');
  lines.push(`Time: ${new Date(generatedAt).toLocaleString()}`);
  lines.push(`Bankroll: $${state.bankroll.toFixed(2)} | Open: ${state.openPositions.length} | W/L: ${state.wins}/${state.losses}`);
  if (cycleInfo) lines.push(`Session: cycle ${cycleInfo.cycle}/${cycleInfo.maxCycles}, target +$${cycleInfo.targetProfit}`);
  if (strategyName) lines.push(`Strategy: ${strategyName}`);
  lines.push(`News sentiment: ${sentiment.score} (${sentiment.sample.slice(0,2).join(' | ') || 'n/a'})`);
  lines.push('');
  lines.push('🎯 Top 3 trades:');

  if (!topSignals.length) {
    lines.push('• No high-conviction setup this cycle.');
  } else {
    for (const s of topSignals) {
      const emo = s.action === 'LONG' ? '🟢' : '🔴';
      lines.push(`${emo} ${s.title} ${s.action}`);
      lines.push(`  score ${s.finalScore} (${s.confidence}) | px ${s.price.toFixed(4)} | 1h ${(s.change1h*100).toFixed(2)}% | 4h ${(s.change4h*100).toFixed(2)}%`);
      lines.push(`  components: momentum ${s.components.momentum}, sentiment ${s.components.sentiment}, tv ${s.components.tvBias ?? 0}`);
    }
  }

  if (opened.length) {
    lines.push('');
    lines.push('🧪 Opened:');
    for (const p of opened) lines.push(`• ${p.side} ${p.title} stake $${p.stake.toFixed(2)} @ ${p.entryPrice.toFixed(4)}`);
  }
  if (closed.length) {
    lines.push('');
    lines.push('💵 Closed:');
    for (const c of closed) lines.push(`• ${c.side} ${c.title} PnL ${c.pnl >= 0 ? '+' : ''}$${c.pnl.toFixed(2)} (${c.reason})`);
  }

  lines.push('');
  lines.push('Paper mode only. No real orders placed.');
  return lines.join('\n');
}
