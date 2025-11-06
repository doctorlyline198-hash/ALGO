import { computeATRSeries, midpoint, percentDifference } from './math.js';
import { detectSwings } from './swingDetection.js';
import { resolveSymbolProfile } from './profile.js';

function buildSignal({ pattern, direction, status, timeframe, contract, candles, confirmedIndex, keyLevels = {}, context = {}, confidence = 0.6 }) {
  const candle = candles[confirmedIndex] || {};
  const id = `${pattern}-${candle.time ?? confirmedIndex}`;
  return {
    id,
    pattern,
    direction,
    status,
    timeframe,
    contractCode: contract?.code || contract?.symbol || contract?.contractCode,
    confirmedAt: candle.time,
    triggerPrice: candle.close,
    triggerVolume: candle.volume,
    keyLevels,
    context,
    confidence
  };
}

function findBreakBelow({ candles, startIndex, level, atrSeries, volumeMA, volumeMultiplier, atrMultiplier = 1 }) {
  if (!Array.isArray(candles)) return null;
  const fallbackAtr = atrSeries?.length ? atrSeries[atrSeries.length - 1] || 0 : 0;
  const fallbackVolume = volumeMA?.length ? volumeMA[volumeMA.length - 1] || 0 : 0;
  for (let i = startIndex; i < candles.length; i += 1) {
    const close = Number(candles[i].close);
    const atr = Number.isFinite(atrSeries?.[i]) ? atrSeries[i] : fallbackAtr;
    const avgVolume = Number.isFinite(volumeMA?.[i]) ? volumeMA[i] : fallbackVolume;
    if (!Number.isFinite(close) || !Number.isFinite(level) || !Number.isFinite(atr) || atr === 0) {
      continue;
    }
    if (close <= level - atr * atrMultiplier && (!Number.isFinite(avgVolume) || avgVolume === 0 || candles[i].volume >= avgVolume * volumeMultiplier)) {
      return i;
    }
  }
  return null;
}

function findBreakAbove({ candles, startIndex, level, atrSeries, volumeMA, volumeMultiplier, atrMultiplier = 1 }) {
  if (!Array.isArray(candles)) return null;
  const fallbackAtr = atrSeries?.length ? atrSeries[atrSeries.length - 1] || 0 : 0;
  const fallbackVolume = volumeMA?.length ? volumeMA[volumeMA.length - 1] || 0 : 0;
  for (let i = startIndex; i < candles.length; i += 1) {
    const close = Number(candles[i].close);
    const atr = Number.isFinite(atrSeries?.[i]) ? atrSeries[i] : fallbackAtr;
    const avgVolume = Number.isFinite(volumeMA?.[i]) ? volumeMA[i] : fallbackVolume;
    if (!Number.isFinite(close) || !Number.isFinite(level) || !Number.isFinite(atr) || atr === 0) {
      continue;
    }
    if (close >= level + atr * atrMultiplier && (!Number.isFinite(avgVolume) || avgVolume === 0 || candles[i].volume >= avgVolume * volumeMultiplier)) {
      return i;
    }
  }
  return null;
}

function detectHeadAndShoulders(ctx) {
  const { candles, swings, atrSeries, volumeMA, profile, timeframe, contract } = ctx;
  const results = [];
  if (!swings || swings.length < 5) {
    return results;
  }
  for (let i = 2; i < swings.length - 2; i += 1) {
    const leftHigh = swings[i - 2];
    const leftLow = swings[i - 1];
    const head = swings[i];
    const rightLow = swings[i + 1];
    const rightHigh = swings[i + 2];
    if (!isHeadAndShouldersSequence(leftHigh, leftLow, head, rightLow, rightHigh)) {
      continue;
    }
    const diffLeft = Math.abs(percentDifference(head.price, leftHigh.price));
    const diffRight = Math.abs(percentDifference(head.price, rightHigh.price));
    if (diffLeft < profile.headShoulderDiffMin || diffRight < profile.headShoulderDiffMin) {
      continue;
    }
    if (diffLeft > profile.headShoulderDiffMax * 2 || diffRight > profile.headShoulderDiffMax * 2) {
      continue;
    }
    const neckline = midpoint(leftLow.price, rightLow.price);
    const confirmIndex = findBreakBelow({
      candles,
      startIndex: rightHigh.index + 1,
      level: neckline,
      atrSeries,
      volumeMA,
      volumeMultiplier: profile.headShoulderVolumeMultiplier,
      atrMultiplier: 1
    });
    if (confirmIndex === null) {
      continue;
    }
    const leftDistance = Math.abs(leftHigh.index - head.index);
    const rightDistance = Math.abs(rightHigh.index - head.index);
    const minDistance = Math.min(leftDistance, rightDistance);

    const leftMax = Math.abs(head.index - leftHigh.index);
    const rightMax = Math.abs(rightHigh.index - head.index);
    const maxDistance = Math.max(leftMax, rightMax, 1);

    const symmetryScore = 1 - minDistance / maxDistance;
    const confidence = Math.max(0.5, Math.min(0.95, (diffLeft + diffRight) / (profile.headShoulderDiffMin * 3) * 0.6 + symmetryScore * 0.3));
    results.push(
      buildSignal({
        pattern: 'Head and Shoulders',
        direction: 'bearish',
        status: 'confirmed',
        timeframe,
        contract,
        candles,
        confirmedIndex: confirmIndex,
        keyLevels: {
          neckline,
          head: head.price,
          leftShoulder: leftHigh.price,
          rightShoulder: rightHigh.price
        },
        context: {
          leftShoulderTime: leftHigh.time,
          headTime: head.time,
          rightShoulderTime: rightHigh.time
        },
        confidence
      })
    );
  }
  return dedupeSignals(results);
}

function detectInverseHeadAndShoulders(ctx) {
  const { candles, swings, atrSeries, volumeMA, profile, timeframe, contract } = ctx;
  const results = [];
  if (!swings || swings.length < 5) {
    return results;
  }
  for (let i = 2; i < swings.length - 2; i += 1) {
    const leftLow = swings[i - 2];
    const leftHigh = swings[i - 1];
    const head = swings[i];
    const rightHigh = swings[i + 1];
    const rightLow = swings[i + 2];
    if (!isInverseHeadAndShouldersSequence(leftLow, leftHigh, head, rightHigh, rightLow)) {
      continue;
    }
    const diffLeft = Math.abs(percentDifference(head.price, leftLow.price));
    const diffRight = Math.abs(percentDifference(head.price, rightLow.price));
    if (diffLeft < profile.headShoulderDiffMin || diffRight < profile.headShoulderDiffMin) {
      continue;
    }
    if (diffLeft > profile.headShoulderDiffMax * 2 || diffRight > profile.headShoulderDiffMax * 2) {
      continue;
    }
    const neckline = midpoint(leftHigh.price, rightHigh.price);
    const confirmIndex = findBreakAbove({
      candles,
      startIndex: rightLow.index + 1,
      level: neckline,
      atrSeries,
      volumeMA,
      volumeMultiplier: profile.headShoulderVolumeMultiplier,
      atrMultiplier: 1
    });
    if (confirmIndex === null) {
      continue;
    }
    const symmetryScore = 1 - Math.min(Math.abs(leftLow.index - head.index), Math.abs(rightLow.index - head.index)) / Math.max(head.index - leftLow.index, rightLow.index - head.index, 1);
    const confidence = Math.max(0.5, Math.min(0.95, (diffLeft + diffRight) / (profile.headShoulderDiffMin * 3) * 0.6 + symmetryScore * 0.3));
    results.push(
      buildSignal({
        pattern: 'Inverse Head and Shoulders',
        direction: 'bullish',
        status: 'confirmed',
        timeframe,
        contract,
        candles,
        confirmedIndex: confirmIndex,
        keyLevels: {
          neckline,
          head: head.price,
          leftShoulder: leftLow.price,
          rightShoulder: rightLow.price
        },
        context: {
          leftShoulderTime: leftLow.time,
          headTime: head.time,
          rightShoulderTime: rightLow.time
        },
        confidence
      })
    );
  }
  return dedupeSignals(results);
}

function detectDoubleTop(ctx) {
  const { candles, swings, atrSeries, volumeMA, profile, timeframe, contract } = ctx;
  const tolerance = profile.doubleTopTolerance;
  const results = [];
  if (!swings || swings.length < 3) {
    return results;
  }
  for (let i = 2; i < swings.length; i += 1) {
    const firstHigh = swings[i - 2];
    const valley = swings[i - 1];
    const secondHigh = swings[i];
    if (!isHighLowHigh(firstHigh, valley, secondHigh)) {
      continue;
    }
    const diff = Math.abs(percentDifference(secondHigh.price, firstHigh.price));
    if (diff > tolerance) {
      continue;
    }
    const confirmIndex = findBreakBelow({
      candles,
      startIndex: secondHigh.index + 1,
      level: valley.price,
      atrSeries,
      volumeMA,
      volumeMultiplier: 1.2,
      atrMultiplier: 0.6
    });
    if (confirmIndex === null) {
      continue;
    }
    const confidence = Math.max(0.5, Math.min(0.9, 1 - diff / (tolerance + 1e-6)));
    results.push(
      buildSignal({
        pattern: 'Double Top',
        direction: 'bearish',
        status: 'confirmed',
        timeframe,
        contract,
        candles,
        confirmedIndex: confirmIndex,
        keyLevels: {
          resistance: (firstHigh.price + secondHigh.price) / 2,
          trigger: valley.price
        },
        context: {
          firstHighTime: firstHigh.time,
          secondHighTime: secondHigh.time
        },
        confidence
      })
    );
  }
  return dedupeSignals(results);
}

function detectDoubleBottom(ctx) {
  const { candles, swings, atrSeries, volumeMA, profile, timeframe, contract } = ctx;
  const tolerance = profile.doubleBottomTolerance;
  const results = [];
  if (!swings || swings.length < 3) {
    return results;
  }
  for (let i = 2; i < swings.length; i += 1) {
    const firstLow = swings[i - 2];
    const peak = swings[i - 1];
    const secondLow = swings[i];
    if (!isLowHighLow(firstLow, peak, secondLow)) {
      continue;
    }
    const diff = Math.abs(percentDifference(secondLow.price, firstLow.price));
    if (diff > tolerance) {
      continue;
    }
    const confirmIndex = findBreakAbove({
      candles,
      startIndex: secondLow.index + 1,
      level: peak.price,
      atrSeries,
      volumeMA,
      volumeMultiplier: 1.2,
      atrMultiplier: 0.6
    });
    if (confirmIndex === null) {
      continue;
    }
    const confidence = Math.max(0.5, Math.min(0.9, 1 - diff / (tolerance + 1e-6)));
    results.push(
      buildSignal({
        pattern: 'Double Bottom',
        direction: 'bullish',
        status: 'confirmed',
        timeframe,
        contract,
        candles,
        confirmedIndex: confirmIndex,
        keyLevels: {
          support: (firstLow.price + secondLow.price) / 2,
          trigger: peak.price
        },
        context: {
          firstLowTime: firstLow.time,
          secondLowTime: secondLow.time
        },
        confidence
      })
    );
  }
  return dedupeSignals(results);
}

function detectAscendingTriangle(ctx) {
  const { candles, swings, atrSeries, volumeMA, profile, timeframe, contract } = ctx;
  const results = [];
  if (!swings || swings.length < 4) {
    return results;
  }
  for (let i = 3; i < swings.length; i += 1) {
    const firstHigh = swings[i - 3];
    const firstLow = swings[i - 2];
    const secondHigh = swings[i - 1];
    const secondLow = swings[i];
    if (!isHighLowHighLow(firstHigh, firstLow, secondHigh, secondLow)) {
      continue;
    }
    const diffHigh = Math.abs(percentDifference(secondHigh.price, firstHigh.price));
    if (diffHigh > profile.triangleFlatTolerance) {
      continue;
    }
    const lowHigher = secondLow.price > firstLow.price * (1 + profile.triangleRisingThreshold);
    if (!lowHigher) {
      continue;
    }
    const resistance = (firstHigh.price + secondHigh.price) / 2;
    const confirmIndex = findBreakAbove({
      candles,
      startIndex: secondLow.index + 1,
      level: resistance,
      atrSeries,
      volumeMA,
      volumeMultiplier: profile.volumeSpikeMultiplier,
      atrMultiplier: 0.8
    });
    if (confirmIndex === null) {
      continue;
    }
    const slopeScore = Math.min(1, Math.abs((secondLow.price - firstLow.price) / firstLow.price) / profile.triangleRisingThreshold);
    const confidence = Math.max(0.5, Math.min(0.9, 0.5 + slopeScore * 0.4));
    results.push(
      buildSignal({
        pattern: 'Ascending Triangle',
        direction: 'bullish',
        status: 'confirmed',
        timeframe,
        contract,
        candles,
        confirmedIndex: confirmIndex,
        keyLevels: {
          resistance,
          risingBase: secondLow.price
        },
        context: {
          firstHighTime: firstHigh.time,
          secondHighTime: secondHigh.time
        },
        confidence
      })
    );
  }
  return dedupeSignals(results);
}

function detectDescendingTriangle(ctx) {
  const { candles, swings, atrSeries, volumeMA, profile, timeframe, contract } = ctx;
  const results = [];
  if (!swings || swings.length < 4) {
    return results;
  }
  for (let i = 3; i < swings.length; i += 1) {
    const firstLow = swings[i - 3];
    const firstHigh = swings[i - 2];
    const secondLow = swings[i - 1];
    const secondHigh = swings[i];
    if (!isLowHighLowHigh(firstLow, firstHigh, secondLow, secondHigh)) {
      continue;
    }
    const diffLow = Math.abs(percentDifference(secondLow.price, firstLow.price));
    if (diffLow > profile.triangleFlatTolerance) {
      continue;
    }
    const highLower = secondHigh.price < firstHigh.price * (1 - profile.triangleFallingThreshold);
    if (!highLower) {
      continue;
    }
    const support = (firstLow.price + secondLow.price) / 2;
    const confirmIndex = findBreakBelow({
      candles,
      startIndex: secondHigh.index + 1,
      level: support,
      atrSeries,
      volumeMA,
      volumeMultiplier: profile.volumeSpikeMultiplier,
      atrMultiplier: 0.8
    });
    if (confirmIndex === null) {
      continue;
    }
    const slopeScore = Math.min(1, Math.abs((firstHigh.price - secondHigh.price) / firstHigh.price) / profile.triangleFallingThreshold);
    const confidence = Math.max(0.5, Math.min(0.9, 0.5 + slopeScore * 0.4));
    results.push(
      buildSignal({
        pattern: 'Descending Triangle',
        direction: 'bearish',
        status: 'confirmed',
        timeframe,
        contract,
        candles,
        confirmedIndex: confirmIndex,
        keyLevels: {
          support,
          fallingCeiling: secondHigh.price
        },
        context: {
          firstLowTime: firstLow.time,
          secondLowTime: secondLow.time
        },
        confidence
      })
    );
  }
  return dedupeSignals(results);
}

function detectBullFlag(ctx) {
  const { candles, atrSeries, volumeMA, profile, timeframe, contract } = ctx;
  const results = [];
  const window = profile.flagImpulseWindow;
  if (!Array.isArray(candles) || candles.length < window + 6) {
    return results;
  }
  for (let start = 0; start <= candles.length - (window + 6); start += 1) {
    const impulseEnd = start + window - 1;
    const impulseStartClose = candles[start].close;
    const impulseEndClose = candles[impulseEnd].close;
    const impulseMove = impulseEndClose - impulseStartClose;
    if (!Number.isFinite(impulseMove) || impulseMove <= 0) {
      continue;
    }
    const avgAtr = averageRange(atrSeries, start, impulseEnd);
    if (!Number.isFinite(avgAtr) || avgAtr <= 0) {
      continue;
    }
    if (impulseMove < avgAtr * profile.flagImpulseAtrMultiple) {
      continue;
    }
    const impulseHigh = Math.max(...candles.slice(start, impulseEnd + 1).map((c) => c.high));
    const pullbackStart = impulseEnd + 1;
    const pullbackEnd = Math.min(pullbackStart + 6, candles.length - 1);
    let pullbackLow = Infinity;
    let pullbackLowIndex = pullbackStart;
    for (let i = pullbackStart; i <= pullbackEnd; i += 1) {
      if (candles[i].close < pullbackLow) {
        pullbackLow = candles[i].close;
        pullbackLowIndex = i;
      }
    }
    if (!Number.isFinite(pullbackLow) || pullbackLow >= impulseHigh) {
      continue;
    }
    const retrace = Math.abs((impulseHigh - pullbackLow) / impulseMove);
    if (retrace < profile.flagPullbackDepthMin || retrace > profile.flagPullbackDepthMax) {
      continue;
    }
    const confirmIndex = findBreakAbove({
      candles,
      startIndex: pullbackLowIndex + 1,
      level: impulseHigh,
      atrSeries,
      volumeMA,
      volumeMultiplier: profile.volumeSpikeMultiplier,
      atrMultiplier: 0.5
    });
    if (confirmIndex === null) {
      continue;
    }
    const confidence = Math.max(0.55, Math.min(0.92, retrace * 1.2));
    results.push(
      buildSignal({
        pattern: 'Bull Flag',
        direction: 'bullish',
        status: 'confirmed',
        timeframe,
        contract,
        candles,
        confirmedIndex: confirmIndex,
        keyLevels: {
          flagHigh: impulseHigh,
          flagLow: pullbackLow
        },
        context: {
          impulseStartTime: candles[start].time,
          impulseEndTime: candles[impulseEnd].time
        },
        confidence
      })
    );
  }
  return dedupeSignals(results);
}

function detectBearFlag(ctx) {
  const { candles, atrSeries, volumeMA, profile, timeframe, contract } = ctx;
  const results = [];
  const window = profile.flagImpulseWindow;
  if (!Array.isArray(candles) || candles.length < window + 6) {
    return results;
  }
  for (let start = 0; start <= candles.length - (window + 6); start += 1) {
    const impulseEnd = start + window - 1;
    const impulseStartClose = candles[start].close;
    const impulseEndClose = candles[impulseEnd].close;
    const impulseMove = impulseEndClose - impulseStartClose;
    if (!Number.isFinite(impulseMove) || impulseMove >= 0) {
      continue;
    }
    const avgAtr = averageRange(atrSeries, start, impulseEnd);
    if (!Number.isFinite(avgAtr) || avgAtr <= 0) {
      continue;
    }
    if (Math.abs(impulseMove) < avgAtr * profile.flagImpulseAtrMultiple) {
      continue;
    }
    const impulseLow = Math.min(...candles.slice(start, impulseEnd + 1).map((c) => c.low));
    const pullbackStart = impulseEnd + 1;
    const pullbackEnd = Math.min(pullbackStart + 6, candles.length - 1);
    let pullbackHigh = -Infinity;
    let pullbackHighIndex = pullbackStart;
    for (let i = pullbackStart; i <= pullbackEnd; i += 1) {
      if (candles[i].close > pullbackHigh) {
        pullbackHigh = candles[i].close;
        pullbackHighIndex = i;
      }
    }
    if (!Number.isFinite(pullbackHigh) || pullbackHigh <= impulseLow) {
      continue;
    }
    const retrace = Math.abs((pullbackHigh - impulseLow) / impulseMove);
    if (retrace < profile.flagPullbackDepthMin || retrace > profile.flagPullbackDepthMax) {
      continue;
    }
    const confirmIndex = findBreakBelow({
      candles,
      startIndex: pullbackHighIndex + 1,
      level: impulseLow,
      atrSeries,
      volumeMA,
      volumeMultiplier: profile.volumeSpikeMultiplier,
      atrMultiplier: 0.5
    });
    if (confirmIndex === null) {
      continue;
    }
    const confidence = Math.max(0.55, Math.min(0.92, retrace * 1.2));
    results.push(
      buildSignal({
        pattern: 'Bear Flag',
        direction: 'bearish',
        status: 'confirmed',
        timeframe,
        contract,
        candles,
        confirmedIndex: confirmIndex,
        keyLevels: {
          flagLow: impulseLow,
          flagHigh: pullbackHigh
        },
        context: {
          impulseStartTime: candles[start].time,
          impulseEndTime: candles[impulseEnd].time
        },
        confidence
      })
    );
  }
  return dedupeSignals(results);
}

function detectCupAndHandle(ctx) {
  const { candles, atrSeries, volumeMA, profile, timeframe, contract } = ctx;
  const results = [];
  if (!Array.isArray(candles) || candles.length < profile.cupMinBars + 10) {
    return results;
  }
  const minBars = profile.cupMinBars;
  for (let start = 0; start <= candles.length - (minBars + 6); start += 1) {
    const end = start + minBars;
    const windowCandles = candles.slice(start, end + 1);
    const leftHigh = windowCandles[0].close;
    const rightHigh = windowCandles[windowCandles.length - 1].close;
    const lowestCandle = windowCandles.reduce((acc, candle, index) => {
      if (!acc || candle.close < acc.candle.close) {
        return { candle, index };
      }
      return acc;
    }, null);
    if (!lowestCandle) {
      continue;
    }
    const depth = Math.abs((lowestCandle.candle.close - leftHigh) / leftHigh);
    if (!Number.isFinite(depth) || depth < 0.02 || depth > 0.15) {
      continue;
    }
    const rimDifference = Math.abs(percentDifference(rightHigh, leftHigh));
    if (rimDifference > 0.01) {
      continue;
    }
    const handleStart = end + 1;
    const handleEnd = Math.min(handleStart + 6, candles.length - 1);
    let handleLow = Infinity;
    for (let i = handleStart; i <= handleEnd; i += 1) {
      handleLow = Math.min(handleLow, candles[i].close);
    }
    if (!Number.isFinite(handleLow)) {
      continue;
    }
    const handleRetrace = Math.abs((rightHigh - handleLow) / (rightHigh - lowestCandle.candle.close));
    if (handleRetrace > profile.cupHandleRetraceMax) {
      continue;
    }
    const confirmIndex = findBreakAbove({
      candles,
      startIndex: handleEnd,
      level: rightHigh,
      atrSeries,
      volumeMA,
      volumeMultiplier: profile.volumeSpikeMultiplier,
      atrMultiplier: 0.7
    });
    if (confirmIndex === null) {
      continue;
    }
    const symmetry = 1 - Math.abs((lowestCandle.index - windowCandles.length / 2) / (windowCandles.length / 2));
    const confidence = Math.max(0.55, Math.min(0.9, 0.6 + symmetry * 0.3));
    results.push(
      buildSignal({
        pattern: 'Cup and Handle',
        direction: 'bullish',
        status: 'confirmed',
        timeframe,
        contract,
        candles,
        confirmedIndex: confirmIndex,
        keyLevels: {
          breakout: rightHigh,
          baseLow: lowestCandle.candle.close
        },
        context: {
          cupStartTime: candles[start].time,
          cupEndTime: candles[end].time
        },
        confidence
      })
    );
  }
  return dedupeSignals(results);
}

function isHeadAndShouldersSequence(a, b, c, d, e) {
  return a?.type === 'high' && b?.type === 'low' && c?.type === 'high' && d?.type === 'low' && e?.type === 'high' && a.index < b.index && b.index < c.index && c.index < d.index && d.index < e.index;
}

function isInverseHeadAndShouldersSequence(a, b, c, d, e) {
  return a?.type === 'low' && b?.type === 'high' && c?.type === 'low' && d?.type === 'high' && e?.type === 'low' && a.index < b.index && b.index < c.index && c.index < d.index && d.index < e.index;
}

function isHighLowHigh(firstHigh, valley, secondHigh) {
  return firstHigh?.type === 'high' && valley?.type === 'low' && secondHigh?.type === 'high' && firstHigh.index < valley.index && valley.index < secondHigh.index;
}

function isLowHighLow(firstLow, peak, secondLow) {
  return firstLow?.type === 'low' && peak?.type === 'high' && secondLow?.type === 'low' && firstLow.index < peak.index && peak.index < secondLow.index;
}

function isHighLowHighLow(a, b, c, d) {
  return a?.type === 'high' && b?.type === 'low' && c?.type === 'high' && d?.type === 'low' && a.index < b.index && b.index < c.index && c.index < d.index;
}

function isLowHighLowHigh(a, b, c, d) {
  return a?.type === 'low' && b?.type === 'high' && c?.type === 'low' && d?.type === 'high' && a.index < b.index && b.index < c.index && c.index < d.index;
}

function averageRange(series, start, end) {
  if (!Array.isArray(series) || series.length === 0) {
    return 0;
  }
  let total = 0;
  let count = 0;
  for (let i = start; i <= end && i < series.length; i += 1) {
    const value = Number(series[i]);
    if (Number.isFinite(value)) {
      total += value;
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
}

function dedupeSignals(list) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const key = `${item.pattern}-${item.confirmedAt}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function evaluateChartPatterns({ candles, timeframe = '1m', contract }) {
  if (!Array.isArray(candles) || candles.length < 30) {
    return [];
  }
  const normalized = candles.map(normalizeCandle).filter(Boolean).sort((a, b) => a.time - b.time);
  if (normalized.length < 30) {
    return [];
  }
  const atrSeries = computeATRSeries(normalized, 14);
  const swings = detectSwings(normalized, 3, 3);
  const profile = resolveSymbolProfile(contract?.code || contract?.symbol || contract?.contractCode || contract);
  const volumeMA = computeVolumeMA(normalized, 20);
  const ctx = {
    candles: normalized,
    swings,
    atrSeries,
    volumeMA,
    profile,
    timeframe,
    contract
  };
  const signals = [
    ...detectHeadAndShoulders(ctx),
    ...detectInverseHeadAndShoulders(ctx),
    ...detectDoubleTop(ctx),
    ...detectDoubleBottom(ctx),
    ...detectAscendingTriangle(ctx),
    ...detectDescendingTriangle(ctx),
    ...detectBullFlag(ctx),
    ...detectBearFlag(ctx),
    ...detectCupAndHandle(ctx)
  ];
  return signals.sort((a, b) => (a.confirmedAt || 0) - (b.confirmedAt || 0));
}

function computeVolumeMA(candles, length) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }
  const volumes = candles.map((candle) => Number(candle.volume) || 0);
  const ma = [];
  let sum = 0;
  for (let i = 0; i < volumes.length; i += 1) {
    sum += volumes[i];
    if (i >= length) {
      sum -= volumes[i - length];
    }
    if (i >= length - 1) {
      ma[i] = sum / length;
    } else {
      ma[i] = null;
    }
  }
  return ma;
}

function normalizeCandle(candle) {
  if (!candle) {
    return null;
  }
  const time = Number(candle.time ?? candle.timestamp);
  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  const volume = Number(candle.volume) || 0;
  if ([time, open, high, low, close].some((value) => !Number.isFinite(value))) {
    return null;
  }
  return { time, open, high, low, close, volume };
}
