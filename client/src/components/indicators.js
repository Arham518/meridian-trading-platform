export const sma = (d, n) => { const out = []; let sum = 0; d.forEach((c, i) => { sum += c.close; if (i >= n) sum -= d[i - n].close; if (i >= n - 1) out.push({ time: c.time, value: sum / n }); }); return out; };
export const ema = (d, n) => { const k = 2 / (n + 1); const out = []; let prev; d.forEach((c, i) => { prev = i === 0 ? c.close : c.close * k + prev * (1 - k); if (i >= n - 1) out.push({ time: c.time, value: prev }); }); return out; };
export const bollinger = (d, n = 20, m = 2) => {
  const up = []; const lo = [];
  for (let i = n - 1; i < d.length; i++) {
    const w = d.slice(i - n + 1, i + 1).map((c) => c.close); const mean = w.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    up.push({ time: d[i].time, value: mean + m * sd }); lo.push({ time: d[i].time, value: mean - m * sd });
  }
  return { up, lo };
};
export const rsi = (d, n = 14) => {
  const out = []; let gain = 0; let loss = 0;
  for (let i = 1; i < d.length; i++) {
    const ch = d[i].close - d[i - 1].close; const g = Math.max(ch, 0); const l = Math.max(-ch, 0);
    if (i <= n) { gain += g; loss += l; if (i === n) { gain /= n; loss /= n; out.push({ time: d[i].time, value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) }); } }
    else { gain = (gain * (n - 1) + g) / n; loss = (loss * (n - 1) + l) / n; out.push({ time: d[i].time, value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) }); }
  }
  return out;
};
