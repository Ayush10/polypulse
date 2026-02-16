import { runCycle, runThreeBankrollSimulations } from './core.js';

const args = process.argv.slice(2);
if (args.includes('--simulate-3')) {
  runThreeBankrollSimulations().then(() => console.log('3 simulations complete.')).catch((e) => {
    console.error(e?.stack || e?.message || String(e));
    process.exit(1);
  });
} else {
  runCycle({ maxCycles: 1 }).then(() => console.log('PolyPulse run complete.')).catch((e) => {
    console.error(e?.stack || e?.message || String(e));
    process.exit(1);
  });
}
