export function sma(values, length) {
  if (!Array.isArray(values) || values.length < length || length <= 0) {
    return [];
  }
  const result = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = Number(values[i]);
    sum += Number.isFinite(value) ? value : 0;
    if (i >= length) {
      const prev = Number(values[i - length]);
      sum -= Number.isFinite(prev) ? prev : 0;
    }
    if (i >= length - 1) {
      result[i] = sum / length;
    }
  }
  return result;
}

export function ema(values, length) {
  if (!Array.isArray(values) || values.length === 0 || length <= 0) {
    return [];
  }
  const result = new Array(values.length).fill(null);
  const multiplier = 2 / (length + 1);
  let previous;
  for (let i = 0; i < values.length; i += 1) {
    const value = Number(values[i]);
    if (!Number.isFinite(value)) {
      continue;
    }
    if (previous === undefined) {
      previous = value;
      result[i] = value;
      continue;
    }
    const current = (value - previous) * multiplier + previous;
    result[i] = current;
    previous = current;
  }
  return result;
}

export function computeTrueRange(candle, prevClose) {
  if (!candle) {
    return 0;
  }
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  const prev = Number(prevClose);
  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
    return 0;
  }
  if (!Number.isFinite(prev)) {
    return high - low;
  }
  return Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev));
}

export function computeATRSeries(candles, length = 14) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }
  const tr = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i += 1) {
    const prevClose = i > 0 ? candles[i - 1].close : undefined;
    tr[i] = computeTrueRange(candles[i], prevClose);
  }
  return ema(tr, length);
}

export function averageVolume(candles, length = 20) {
  if (!Array.isArray(candles) || candles.length < length) {
    return 0;
  }
  const volumes = candles.map((candle) => Number(candle.volume) || 0);
  const ma = sma(volumes, length);
  return ma.length ? ma[ma.length - 1] || 0 : 0;
}

export function percentDifference(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
    return 0;
  }
  return (a - b) / b;
}

export function midpoint(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return undefined;
  }
  return (a + b) / 2;
}

export function slope(a, b) {
  const dy = Number(b.price) - Number(a.price);
  const dx = Number(b.index) - Number(a.index);
  if (!Number.isFinite(dy) || !Number.isFinite(dx) || dx === 0) {
    return 0;
  }
  return dy / dx;
}
