export function detectSwings(candles, lookback = 3, lookahead = 3) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }
  const swings = [];
  for (let i = lookback; i < candles.length - lookahead; i += 1) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j += 1) {
      if (candles[i - j].high > current.high || candles[i - j].close > current.high) {
        isHigh = false;
      }
      if (candles[i - j].low < current.low || candles[i - j].close < current.low) {
        isLow = false;
      }
    }
    for (let j = 1; j <= lookahead; j += 1) {
      if (candles[i + j].high >= current.high || candles[i + j].close >= current.high) {
        isHigh = false;
      }
      if (candles[i + j].low <= current.low || candles[i + j].close <= current.low) {
        isLow = false;
      }
    }
    if (isHigh) {
      swings.push({
        type: 'high',
        index: i,
        time: current.time,
        price: current.high,
        close: current.close
      });
    } else if (isLow) {
      swings.push({
        type: 'low',
        index: i,
        time: current.time,
        price: current.low,
        close: current.close
      });
    }
  }
  return swings;
}
