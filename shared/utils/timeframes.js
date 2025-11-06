export function parseTimeframeToSeconds(timeframe) {
  if (typeof timeframe !== 'string') {
    return 60;
  }
  const match = timeframe.match(/(\d+)([smhd])/i);
  if (!match) {
    return 60;
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 60;
  }
}

export function resampleCandles(source, timeframe) {
  if (!Array.isArray(source) || source.length === 0) {
    return [];
  }
  const interval = parseTimeframeToSeconds(timeframe);
  if (interval <= 60) {
    return source.slice();
  }
  const buckets = new Map();
  for (const candle of source) {
    if (!candle || !Number.isFinite(candle.time)) {
      continue;
    }
    const bucket = Math.floor(candle.time / interval) * interval;
    if (!buckets.has(bucket)) {
      buckets.set(bucket, {
        time: bucket,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0
      });
      continue;
    }
    const target = buckets.get(bucket);
    target.high = Math.max(target.high, candle.high);
    target.low = Math.min(target.low, candle.low);
    target.close = candle.close;
    target.volume += candle.volume || 0;
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}
