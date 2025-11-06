const DEFAULT_LINE_OPTIONS = {
  lineWidth: 2,
  priceLineVisible: false,
  crosshairMarkerVisible: false,
  lastValueVisible: false
};

const FALLBACK_SERIES_COLORS = [
  '#60a5fa',
  '#f97316',
  '#facc15',
  '#a855f7',
  '#22d3ee',
  '#fb7185',
  '#34d399',
  '#f472b6'
];

function resolveSeriesColor(id, title) {
  const key = String(id || title || '') || 'default';
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  const paletteIndex = hash % FALLBACK_SERIES_COLORS.length;
  return FALLBACK_SERIES_COLORS[paletteIndex];
}

const INDICATOR_ALIASES = {
  'Moving Average Cross': 'maCross',
  'VWAP Rejection': 'vwap',
  'VWAP Break': 'vwap',
  'VWAP Cross': 'vwap',
  'Bollinger Squeeze': 'bollinger',
  'Keltner Channel': 'keltnerChannel',
  'Keltner Channel Break': 'keltnerChannel',
  'Fair Value Gap': 'fairValueGap',
  'Order Block': 'orderBlock',
  'Break of Structure': 'structure',
  'Change of Character': 'structure',
  'Liquidity Sweep': 'liquiditySweep',
  'Equal Highs': 'equalHighs',
  'Equal Lows': 'equalLows',
  'Breaker Block': 'breakerBlock',
  'ICT Killzone': 'ictKillzone',
  'Opening Range Breakout': 'openingRangeBreakout'
};

const INDICATOR_IMPLEMENTATIONS = {
  maCross: {
    minBars: 30,
    builder: (candles) => {
      const fast = computeEma(candles, 9);
      const slow = computeEma(candles, 21);
      return {
        series: [
          createLineEntry('ema-9', 'EMA 9', fast, { color: '#38bdf8' }),
          createLineEntry('ema-21', 'EMA 21', slow, { color: '#c084fc' })
        ]
      };
    }
  },
  vwap: {
    minBars: 2,
    builder: (candles) => {
      const values = computeVwap(candles);
      return {
        series: [createLineEntry('vwap', 'VWAP', values, { color: '#facc15', lineWidth: 3 })]
      };
    }
  },
  bollinger: {
    minBars: 25,
    builder: (candles) => {
      const bands = computeBollinger(candles, 20, 2);
      return {
        series: [
          createLineEntry('bb-upper', 'BB Upper', bands.upper, { color: 'rgba(250, 204, 21, 0.85)', lineStyle: 2 }),
          createLineEntry('bb-mid', 'BB Basis', bands.middle, { color: 'rgba(148, 163, 184, 0.9)', lineWidth: 1 }),
          createLineEntry('bb-lower', 'BB Lower', bands.lower, { color: 'rgba(250, 204, 21, 0.85)', lineStyle: 2 })
        ]
      };
    }
  },
  keltnerChannel: {
    minBars: 20,
    builder: (candles) => {
      const channel = computeKeltnerChannels(candles, 20, 1.5);
      const { upper, middle, lower } = channel;
      return {
        series: [
          createLineEntry('kc-upper', 'Keltner Upper', upper, { color: 'rgba(250, 204, 21, 0.45)', lineStyle: 2 }),
          createLineEntry('kc-middle', 'Keltner Basis', middle, { color: 'rgba(148, 163, 184, 0.85)', lineWidth: 1 }),
          createLineEntry('kc-lower', 'Keltner Lower', lower, { color: 'rgba(250, 204, 21, 0.45)', lineStyle: 2 })
        ]
      };
    }
  },
  fairValueGap: {
    minBars: 10,
    builder: (candles) => {
      const zones = computeFairValueGaps(candles);
      if (process.env.NODE_ENV !== 'production') {
        safeDebugLog('[indicators] fairValueGap built zones:', Array.isArray(zones) ? zones.length : 0);
      }
      return { series: [], zones };
    }
  },
  orderBlock: {
    minBars: 20,
    builder: (candles) => {
      const zones = computeOrderBlocks(candles);
      if (process.env.NODE_ENV !== 'production') {
        safeDebugLog('[indicators] orderBlock built zones:', Array.isArray(zones) ? zones.length : 0);
      }
      return { series: [], zones };
    }
  },
  structure: {
    minBars: 30,
    builder: (candles, context = {}) => {
      const signals = computeStructureSignals(candles);
      const enrichedSignals = signals.map((signal) => ({
        ...signal,
        indicator: context.label || 'Structure',
        indicatorKey: context.baseKey || 'structure',
        timeframe: context.timeframe || undefined,
        contractCode:
          context.contract?.code ||
          context.contract?.symbol ||
          context.contract?.contractCode ||
          undefined,
        confirmedAt: signal.breakTime ?? signal.confirmedAt
      }));
      if (process.env.NODE_ENV !== 'production') {
        safeDebugLog('[indicators] structure built signals:', Array.isArray(enrichedSignals) ? enrichedSignals.length : 0);
      }
      return { series: [], zones: [], signals: enrichedSignals };
    }
  },
  liquiditySweep: {
    minBars: 40,
    builder: (candles) => {
      const signals = computeLiquiditySweeps(candles);
      if (process.env.NODE_ENV !== 'production') {
        safeDebugLog('[indicators] liquiditySweep signals:', Array.isArray(signals) ? signals.length : 0);
      }
      return { series: [], zones: [], signals };
    }
  },
  equalHighs: {
    minBars: 40,
    builder: (candles) => {
      const zones = computeEqualLiquidityPools(candles, { side: 'high' });
      if (process.env.NODE_ENV !== 'production') {
        safeDebugLog('[indicators] equalHighs zones:', Array.isArray(zones) ? zones.length : 0);
      }
      return { series: [], zones };
    }
  },
  equalLows: {
    minBars: 40,
    builder: (candles) => {
      const zones = computeEqualLiquidityPools(candles, { side: 'low' });
      if (process.env.NODE_ENV !== 'production') {
        safeDebugLog('[indicators] equalLows zones:', Array.isArray(zones) ? zones.length : 0);
      }
      return { series: [], zones };
    }
  },
  breakerBlock: {
    minBars: 50,
    builder: (candles) => {
      const zones = computeBreakerBlocks(candles);
      if (process.env.NODE_ENV !== 'production') {
        safeDebugLog('[indicators] breakerBlock zones:', Array.isArray(zones) ? zones.length : 0);
      }
      return { series: [], zones };
    }
  },
  ictKillzone: {
    minBars: 10,
    builder: (candles, context = {}) => {
      const zones = computeKillzoneWindows(candles, { contract: context.contract });
      if (process.env.NODE_ENV !== 'production') {
        safeDebugLog('[indicators] ictKillzone zones:', Array.isArray(zones) ? zones.length : 0);
      }
      return { series: [], zones };
    }
  },
  openingRangeBreakout: {
    minBars: 60,
    builder: (candles, context = {}) => {
      const { zones, signals } = computeOpeningRangeBreakouts(candles, { contract: context.contract });
      if (process.env.NODE_ENV !== 'production') {
        safeDebugLog('[indicators] openingRangeBreakout zones:', Array.isArray(zones) ? zones.length : 0, 'signals:', Array.isArray(signals) ? signals.length : 0);
      }
      return { series: [], zones, signals };
    }
  }
};

export function buildIndicatorPayload({ selections = [], candles = [], timeframe, contract } = {}) {
  if (!Array.isArray(selections) || !Array.isArray(candles)) {
    return { series: [], zones: [], signals: [], diagnostics: [] };
  }

  const diagnostics = [];
  const overlays = [];
  const zones = [];
  const signals = [];
  const baseApplied = new Set();
  const totalBars = candles.length;

  selections.forEach((label) => {
    const baseKey = INDICATOR_ALIASES[label] || label;
    const implementation = INDICATOR_IMPLEMENTATIONS[baseKey];

    if (!implementation) {
      diagnostics.push({ name: label, status: 'todo', message: 'Not implemented yet' });
      return;
    }

    if (baseApplied.has(baseKey)) {
      diagnostics.push({ name: label, status: 'ok', message: 'Overlay active (shared)' });
      return;
    }

    if (totalBars === 0) {
      diagnostics.push({ name: label, status: 'idle', message: 'Waiting for data' });
      return;
    }

    if (totalBars < (implementation.minBars ?? 1)) {
      diagnostics.push({
        name: label,
        status: 'pending',
        message: `Needs ${(implementation.minBars ?? 1)} bars`
      });
      return;
    }

  const builderContext = { timeframe, contract, label, baseKey };
  const built = implementation.builder(candles, builderContext) || [];
    const builtSeries = Array.isArray(built)
      ? built.filter(Boolean)
      : Array.isArray(built.series)
        ? built.series.filter(Boolean)
        : [];
  const builtZones = Array.isArray(built?.zones) ? built.zones.filter(Boolean) : [];
    const builtSignals = Array.isArray(built?.signals) ? built.signals.filter(Boolean) : [];

    if (!builtSeries.length && !builtZones.length && !builtSignals.length) {
      diagnostics.push({ name: label, status: 'idle', message: 'Waiting for data' });
      return;
    }

    if (builtSeries.length) {
      overlays.push(...builtSeries);
    }
    if (builtZones.length) {
      const annotatedZones = builtZones.map((zone, zoneIndex) => ({
        ...zone,
        indicator: zone?.indicator || label,
        indicatorKey: zone?.indicatorKey || baseKey,
        timeframe: zone?.timeframe || timeframe,
        contractCode:
          zone?.contractCode ||
          contract?.code ||
          contract?.symbol ||
          contract?.contractCode ||
          undefined,
        zoneIndex
      }));
      zones.push(...annotatedZones);
    }
    if (builtSignals.length) {
      const annotatedSignals = builtSignals.map((signal, signalIndex) => ({
        ...signal,
        indicator: signal?.indicator || label,
        indicatorKey: signal?.indicatorKey || baseKey,
        timeframe: signal?.timeframe || timeframe,
        contractCode:
          signal?.contractCode ||
          contract?.code ||
          contract?.symbol ||
          contract?.contractCode ||
          undefined,
        signalIndex
      }));
      signals.push(...annotatedSignals);
    }

    const summaryParts = [];
    if (builtSeries.length) {
      summaryParts.push(`${builtSeries.length} series`);
    }
    if (builtZones.length) {
      summaryParts.push(`${builtZones.length} zones`);
    }
    if (builtSignals.length) {
      summaryParts.push(`${builtSignals.length} signals`);
    }

    diagnostics.push({
      name: label,
      status: 'ok',
      message: summaryParts.length ? `Applied (${summaryParts.join(', ')})` : 'Applied'
    });
    baseApplied.add(baseKey);
  });

  return { series: overlays, zones, signals, diagnostics };
}

function createLineEntry(id, title, data, options = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  const color = options.color || resolveSeriesColor(id, title);
  return {
    id,
    title,
    data,
    options: { ...DEFAULT_LINE_OPTIONS, ...options, color }
  };
}

export function computeEma(candles, period) {
  if (!Array.isArray(candles) || candles.length === 0 || !Number.isFinite(period) || period <= 1) {
    return [];
  }
  const multiplier = 2 / (period + 1);
  const result = [];
  let ema = null;
  let initialized = false;

  candles.forEach((candle, index) => {
    const price = Number(candle?.close);
    if (!Number.isFinite(price)) {
      return;
    }

    if (!initialized) {
      ema = price;
      initialized = index >= period - 1;
      if (!initialized) {
        return;
      }
    } else {
      ema = (price - ema) * multiplier + ema;
    }

    result.push({ time: candle.time, value: Number(ema) });
  });

  return result;
}

export function computeVwap(candles) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }
  const series = [];
  let cumulativeVolume = 0;
  let cumulativePriceVolume = 0;

  candles.forEach((candle) => {
    const volume = Number(candle?.volume ?? 0);
    const high = Number(candle?.high);
    const low = Number(candle?.low);
    const close = Number(candle?.close);
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
      return;
    }
    const typicalPrice = (high + low + close) / 3;
    cumulativePriceVolume += typicalPrice * volume;
    cumulativeVolume += volume;
    if (cumulativeVolume > 0) {
      series.push({ time: candle.time, value: cumulativePriceVolume / cumulativeVolume });
    }
  });

  return series;
}

export function computeBollinger(candles, period = 20, multiplier = 2) {
  const values = [];
  const upper = [];
  const middle = [];
  const lower = [];
  const buffer = [];

  candles.forEach((candle) => {
    const close = Number(candle?.close);
    if (!Number.isFinite(close)) {
      return;
    }
    values.push({ time: candle.time, close });
  });
  values.forEach(({ time, close }) => {
    buffer.push(close);
    if (buffer.length > period) {
      buffer.shift();
    }
    if (buffer.length < period) {
      return;
    }
    const mean = buffer.reduce((acc, value) => acc + value, 0) / period;
    const variance = buffer.reduce((acc, value) => acc + (value - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    middle.push({ time, value: mean });
    upper.push({ time, value: mean + multiplier * stdDev });
    lower.push({ time, value: mean - multiplier * stdDev });
  });

  return { upper, middle, lower };
}

export function computeRsi(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length <= period) {
    return [];
  }
  let prevClose = Number(candles[0]?.close);
  if (!Number.isFinite(prevClose)) {
    return [];
  }
  let gainSum = 0;
  let lossSum = 0;
  let avgGain = 0;
  let avgLoss = 0;
  const result = [];

  for (let index = 1; index < candles.length; index += 1) {
    const close = Number(candles[index]?.close);
    if (!Number.isFinite(close)) {
      continue;
    }
    const change = close - prevClose;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (index <= period) {
      gainSum += gain;
      lossSum += loss;
      if (index === period) {
        avgGain = gainSum / period;
        avgLoss = lossSum / period;
        const rsi = resolveRsiValue(avgGain, avgLoss);
        if (Number.isFinite(rsi)) {
          result.push({ time: candles[index].time, value: rsi });
        }
      }
    } else {
      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;
      const rsi = resolveRsiValue(avgGain, avgLoss);
      if (Number.isFinite(rsi)) {
        result.push({ time: candles[index].time, value: rsi });
      }
    }

    prevClose = close;
  }

  return result;
}

function resolveRsiValue(avgGain, avgLoss) {
  if (!Number.isFinite(avgGain) && !Number.isFinite(avgLoss)) {
    return NaN;
  }
  if (avgLoss === 0) {
    return avgGain === 0 ? 50 : 100;
  }
  if (!Number.isFinite(avgLoss) || avgLoss < 0) {
    return NaN;
  }
  const rs = avgGain / avgLoss;
  const value = 100 - 100 / (1 + rs);
  return Number.isFinite(value) ? value : NaN;
}

export function computeKeltnerChannels(candles, period = 20, multiplier = 1.5) {
  if (!Array.isArray(candles) || candles.length < period) {
    return { upper: [], middle: [], lower: [] };
  }
  const typicalSeries = candles
    .map((candle) => {
      if (!isNumericCandle(candle)) {
        return null;
      }
      const typical = (Number(candle.high) + Number(candle.low) + Number(candle.close)) / 3;
      if (!Number.isFinite(typical)) {
        return null;
      }
      return { time: candle.time, close: typical };
    })
    .filter(Boolean);

  if (typicalSeries.length < period) {
    return { upper: [], middle: [], lower: [] };
  }

  const basisSeries = computeEma(typicalSeries, period);
  const basisMap = new Map(basisSeries.map((point) => [point.time, point.value]));
  const atrSeries = computeAtr(candles, period);
  const upper = [];
  const middle = [];
  const lower = [];

  candles.forEach((candle, index) => {
    const time = candle?.time;
    const basis = basisMap.get(time);
    const atr = Number(atrSeries[index]);
    if (!Number.isFinite(time) || !Number.isFinite(basis) || !Number.isFinite(atr)) {
      return;
    }
    const range = atr * multiplier;
    upper.push({ time, value: basis + range });
    middle.push({ time, value: basis });
    lower.push({ time, value: basis - range });
  });

  return { upper, middle, lower };
}

const MAX_OB_LOOKBACK = 400;
const MAX_OB_ZONES = 20;
const ATR_PERIOD_DEFAULT = 14;
const MIN_OB_IMPULSE_ATR = 1.5;
const MIN_STRUCTURE_BREAK_ATR = 0.3;
const PIVOT_WINDOW = 2;

export function computeAtr(candles, period = ATR_PERIOD_DEFAULT) {
  if (!Array.isArray(candles) || candles.length < 2 || !Number.isFinite(period) || period <= 0) {
    return [];
  }
  const result = new Array(candles.length).fill(null);
  let prevClose = Number(candles[0]?.close);
  if (!Number.isFinite(prevClose)) {
    prevClose = 0;
  }
  let runningSum = 0;
  let prevAtr = null;
  result[0] = null;

  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    if (!isNumericCandle(candle)) {
      result[index] = prevAtr;
      if (Number.isFinite(candle?.close)) {
        prevClose = Number(candle.close);
      }
      continue;
    }

    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    const trueRange = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    if (!Number.isFinite(trueRange)) {
      result[index] = prevAtr;
      prevClose = close;
      continue;
    }

    if (index < period) {
      runningSum += trueRange;
      result[index] = null;
    } else if (index === period) {
      runningSum += trueRange;
      prevAtr = runningSum / period;
      result[index] = prevAtr;
    } else {
      const prior = Number.isFinite(prevAtr) ? prevAtr : trueRange;
      prevAtr = ((prior * (period - 1)) + trueRange) / period;
      result[index] = prevAtr;
    }

    prevClose = close;
  }

  return result;
}

function computeOrderBlocks(
  candles,
  {
    lookback = MAX_OB_LOOKBACK,
    maxZones = MAX_OB_ZONES,
    atrPeriod = ATR_PERIOD_DEFAULT,
    impulseMultiple = MIN_OB_IMPULSE_ATR,
    minBreakAtr = MIN_STRUCTURE_BREAK_ATR
  } = {}
) {
  if (!Array.isArray(candles) || candles.length < 5) {
    return [];
  }

  const slice = candles.slice(-Math.min(lookback, candles.length));
  const atrValues = computeAtr(slice, atrPeriod);
  const { pivotHighs, pivotLows } = computePivotMarkers(slice, PIVOT_WINDOW, PIVOT_WINDOW);
  const lastHighIndex = buildLastPivotIndex(pivotHighs, slice.length);
  const lastLowIndex = buildLastPivotIndex(pivotLows, slice.length);
  const zones = [];
  const usedOrderBlockIndices = new Set();

  for (let index = atrPeriod; index < slice.length; index += 1) {
    const candle = slice[index];
    if (!isNumericCandle(candle)) {
      continue;
    }
    const atr = atrValues[index];
    if (!Number.isFinite(atr) || atr <= 0) {
      continue;
    }

    const body = Math.abs(Number(candle.close) - Number(candle.open));
    if (!Number.isFinite(body) || body < impulseMultiple * atr) {
      continue;
    }

    const isBullishImpulse = candle.close > candle.open;
    const pivotIndex = index > 0
      ? (isBullishImpulse ? lastHighIndex[index - 1] : lastLowIndex[index - 1])
      : -1;
    if (pivotIndex < 0) {
      continue;
    }

    const pivotCandle = slice[pivotIndex];
    if (!isNumericCandle(pivotCandle)) {
      continue;
    }

    const breakThreshold = atr * minBreakAtr;
    const brokeStructure = isBullishImpulse
      ? candle.close >= pivotCandle.high + breakThreshold
      : candle.close <= pivotCandle.low - breakThreshold;
    if (!brokeStructure) {
      continue;
    }

    let obIndex = index - 1;
    while (obIndex >= 0) {
      const candidate = slice[obIndex];
      if (!isNumericCandle(candidate)) {
        obIndex -= 1;
        continue;
      }
      const isOpposite = isBullishImpulse
        ? candidate.close < candidate.open
        : candidate.close > candidate.open;
      if (isOpposite) {
        break;
      }
      obIndex -= 1;
    }

    if (obIndex < 0 || usedOrderBlockIndices.has(obIndex)) {
      continue;
    }

    const obCandle = slice[obIndex];
    const bodyHigh = Math.max(Number(obCandle.open), Number(obCandle.close));
    const bodyLow = Math.min(Number(obCandle.open), Number(obCandle.close));
    if (!Number.isFinite(bodyHigh) || !Number.isFinite(bodyLow) || !(bodyHigh > bodyLow)) {
      continue;
    }

    const { filled, fillTime } = resolveOrderBlockFill(slice, index + 1, bodyLow, bodyHigh);
    zones.push({
      id: `ob-${isBullishImpulse ? 'bull' : 'bear'}-${obCandle.time}-${candle.time}`,
      type: 'zone',
      startTime: obCandle.time,
      endTime: filled ? fillTime : candle.time,
      extend: !filled,
      top: bodyHigh,
      bottom: bodyLow,
      direction: isBullishImpulse ? 'bullish' : 'bearish',
      filled,
      label: isBullishImpulse ? 'Bullish OB' : 'Bearish OB',
      size: bodyHigh - bodyLow
    });
    usedOrderBlockIndices.add(obIndex);
  }

  if (zones.length > maxZones) {
    return zones.slice(-maxZones);
  }

  return zones;
}

function resolveOrderBlockFill(candles, startIndex, bottom, top) {
  let fillTime = candles[candles.length - 1]?.time ?? null;
  for (let index = startIndex; index < candles.length; index += 1) {
    const candle = candles[index];
    if (!isNumericCandle(candle)) {
      continue;
    }
    const overlaps = candle.low <= top && candle.high >= bottom;
    if (overlaps) {
      fillTime = candle.time;
      return { filled: true, fillTime };
    }
  }
  return { filled: false, fillTime };
}

function computeStructureSignals(
  candles,
  {
    atrPeriod = ATR_PERIOD_DEFAULT,
    minBreakAtr = MIN_STRUCTURE_BREAK_ATR,
    pivotLeft = PIVOT_WINDOW,
    pivotRight = PIVOT_WINDOW
  } = {}
) {
  if (!Array.isArray(candles) || candles.length < atrPeriod + pivotLeft + pivotRight + 2) {
    return [];
  }

  const atrValues = computeAtr(candles, atrPeriod);
  const { pivotHighs, pivotLows } = computePivotMarkers(candles, pivotLeft, pivotRight);
  const lastHighIndex = buildLastPivotIndex(pivotHighs, candles.length);
  const lastLowIndex = buildLastPivotIndex(pivotLows, candles.length);
  const signals = [];
  const brokenHighs = new Set();
  const brokenLows = new Set();
  let lastTrend = null;

  for (let index = atrPeriod; index < candles.length; index += 1) {
    const atr = atrValues[index];
    if (!Number.isFinite(atr) || atr <= 0) {
      continue;
    }
    const candle = candles[index];
    const threshold = atr * minBreakAtr;

    const prevHighIndex = index > 0 ? lastHighIndex[index - 1] : -1;
    if (prevHighIndex >= 0 && !brokenHighs.has(prevHighIndex)) {
      const pivot = candles[prevHighIndex];
      if (isNumericCandle(pivot) && candle.close >= pivot.high + threshold) {
        brokenHighs.add(prevHighIndex);
        const idBase = `${pivot.time}-${candle.time}`;
        signals.push({
          id: `bos-up-${idBase}`,
          type: 'BOS',
          direction: 'bullish',
          pivotTime: pivot.time,
          breakTime: candle.time,
          keyLevels: {
            trigger: pivot.high,
            close: candle.close
          }
        });
        if (lastTrend === 'bearish') {
          signals.push({
            id: `choch-bull-${idBase}`,
            type: 'CHOCH',
            direction: 'bullish',
            pivotTime: pivot.time,
            breakTime: candle.time,
            keyLevels: {
              trigger: pivot.high,
              close: candle.close
            }
          });
        }
        lastTrend = 'bullish';
      }
    }

    const prevLowIndex = index > 0 ? lastLowIndex[index - 1] : -1;
    if (prevLowIndex >= 0 && !brokenLows.has(prevLowIndex)) {
      const pivot = candles[prevLowIndex];
      if (isNumericCandle(pivot) && candle.close <= pivot.low - threshold) {
        brokenLows.add(prevLowIndex);
        const idBase = `${pivot.time}-${candle.time}`;
        signals.push({
          id: `bos-down-${idBase}`,
          type: 'BOS',
          direction: 'bearish',
          pivotTime: pivot.time,
          breakTime: candle.time,
          keyLevels: {
            trigger: pivot.low,
            close: candle.close
          }
        });
        if (lastTrend === 'bullish') {
          signals.push({
            id: `choch-bear-${idBase}`,
            type: 'CHOCH',
            direction: 'bearish',
            pivotTime: pivot.time,
            breakTime: candle.time,
            keyLevels: {
              trigger: pivot.low,
              close: candle.close
            }
          });
        }
        lastTrend = 'bearish';
      }
    }
  }

  return signals;
}

function computePivotMarkers(candles, left = PIVOT_WINDOW, right = PIVOT_WINDOW) {
  const pivotHighs = new Set();
  const pivotLows = new Set();
  if (!Array.isArray(candles) || candles.length === 0) {
    return { pivotHighs, pivotLows };
  }

  const maxRight = right;
  const maxLeft = left;

  for (let index = maxLeft; index < candles.length - maxRight; index += 1) {
    const current = candles[index];
    if (!isNumericCandle(current)) {
      continue;
    }

    const candidateHigh = Number(current.high);
    let isHigh = Number.isFinite(candidateHigh);
    if (isHigh) {
      for (let offset = -maxLeft; offset <= maxRight; offset += 1) {
        if (offset === 0) continue;
        const compare = candles[index + offset];
        const compareHigh = Number(compare?.high);
        if (!Number.isFinite(compareHigh) || compareHigh > candidateHigh) {
          isHigh = false;
          break;
        }
      }
      if (isHigh) {
        pivotHighs.add(index);
      }
    }

    const candidateLow = Number(current.low);
    let isLow = Number.isFinite(candidateLow);
    if (isLow) {
      for (let offset = -maxLeft; offset <= maxRight; offset += 1) {
        if (offset === 0) continue;
        const compare = candles[index + offset];
        const compareLow = Number(compare?.low);
        if (!Number.isFinite(compareLow) || compareLow < candidateLow) {
          isLow = false;
          break;
        }
      }
      if (isLow) {
        pivotLows.add(index);
      }
    }
  }

  return { pivotHighs, pivotLows };
}

function buildLastPivotIndex(pivotSet, length) {
  const result = new Array(length).fill(-1);
  let last = -1;
  for (let index = 0; index < length; index += 1) {
    if (pivotSet.has(index)) {
      last = index;
    }
    result[index] = last;
  }
  return result;
}

const MAX_FVG_LOOKBACK = 400;
const MAX_FVG_ZONES = 20;
const FVG_MIN_ATR_MULTIPLE = 0.2;
const FVG_MIN_BODY_OVERLAP_RATIO = 0.5;
const MAX_LIQUIDITY_LOOKBACK = 300;
const LIQUIDITY_ATR_THRESHOLD = 0.2;
const MAX_EQUAL_LEVEL_LOOKBACK = 400;
const EQUAL_LEVEL_TOLERANCE_MIN = 0.1;
const EQUAL_LEVEL_TOLERANCE_MAX = 0.2;
const EQUAL_LEVEL_MIN_TOUCHES = 2;
const MAX_KILLZONE_LOOKBACK = 500;
const OPENING_RANGE_MINUTES = 30;
const OPENING_RANGE_VOLUME_MULTIPLIER = 1.5;
const OPENING_RANGE_ATR_BUFFER = 0.5;
const OPENING_RANGE_VOLUME_LOOKBACK = 20;

function computeFairValueGaps(
  candles,
  {
    lookback = MAX_FVG_LOOKBACK,
    maxZones = MAX_FVG_ZONES,
    atrPeriod = ATR_PERIOD_DEFAULT,
    minAtrMultiple = FVG_MIN_ATR_MULTIPLE,
    minBodyOverlapRatio = FVG_MIN_BODY_OVERLAP_RATIO
  } = {}
) {
  if (!Array.isArray(candles) || candles.length < Math.max(atrPeriod + 2, 3)) {
    return [];
  }

  const slice = candles.slice(-Math.min(lookback, candles.length));
  const atrSeries = computeAtr(slice, atrPeriod);
  const zones = [];

  for (let index = 1; index < slice.length - 1; index += 1) {
    const atr = Array.isArray(atrSeries) ? Number(atrSeries[index]) : null;
    if (!Number.isFinite(atr) || atr <= 0) {
      continue;
    }

    const left = slice[index - 1];
    const base = slice[index];
    const right = slice[index + 1];

    if (!isNumericCandle(left) || !isNumericCandle(base) || !isNumericCandle(right)) {
      continue;
    }

    const bullishGap = left.high < right.low;
    const bearishGap = left.low > right.high;

    if (!bullishGap && !bearishGap) {
      continue;
    }

    const rawTop = bullishGap ? right.low : left.low;
    const rawBottom = bullishGap ? left.high : right.high;

    if (!Number.isFinite(rawTop) || !Number.isFinite(rawBottom)) {
      continue;
    }

    const top = Math.max(rawTop, rawBottom);
    const bottom = Math.min(rawTop, rawBottom);
    const thickness = top - bottom;

    if (!(thickness > 0) || thickness < atr * minAtrMultiple) {
      continue;
    }

    const direction = bullishGap ? 'bullish' : 'bearish';
    const { filled, endTime, fillRatio } = resolveFairValueFill(slice, index + 1, top, bottom, {
      direction,
      minOverlapRatio: minBodyOverlapRatio
    });

    zones.push({
      id: `fvg-${direction === 'bullish' ? 'bull' : 'bear'}-${left.time}-${right.time}`,
      type: 'zone',
      indicatorKey: 'fairValueGap',
      startTime: base.time,
      endTime,
      extend: !filled,
      top,
      bottom,
      direction,
      filled,
      label: direction === 'bullish' ? 'Bullish FVG' : 'Bearish FVG',
      size: thickness,
      atrAtDetection: atr,
      atrMultiple: thickness / atr,
      fillRatio
    });
  }

  if (zones.length > maxZones) {
    return zones.slice(-maxZones);
  }

  return zones;
}

function resolveFairValueFill(
  candles,
  startIndex,
  top,
  bottom,
  { direction, minOverlapRatio = FVG_MIN_BODY_OVERLAP_RATIO } = {}
) {
  const thickness = top - bottom;
  if (!Number.isFinite(thickness) || thickness <= 0) {
    return { filled: false, endTime: candles[candles.length - 1]?.time ?? null, fillRatio: 0 };
  }

  let endTime = candles[candles.length - 1]?.time ?? null;
  let bestRatio = 0;

  for (let pointer = startIndex; pointer < candles.length; pointer += 1) {
    const candle = candles[pointer];
    if (!isNumericCandle(candle)) {
      continue;
    }

    const candleDirection = candle.close >= candle.open ? 'bullish' : 'bearish';
    if (direction && candleDirection === direction) {
      endTime = candle.time;
      continue;
    }

    const bodyHigh = Math.max(candle.open, candle.close);
    const bodyLow = Math.min(candle.open, candle.close);
    const overlapTop = Math.min(bodyHigh, top);
    const overlapBottom = Math.max(bodyLow, bottom);
    const overlap = overlapTop - overlapBottom;

    if (overlap <= 0) {
      endTime = candle.time;
      continue;
    }

    const ratio = overlap / thickness;
    bestRatio = Math.max(bestRatio, ratio);
    endTime = candle.time;

    if (ratio >= minOverlapRatio) {
      return { filled: true, endTime: candle.time, fillRatio: ratio };
    }
  }

  return { filled: false, endTime, fillRatio: bestRatio };
}

export function computeAverageRange(candles, lookback = 50) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return 0;
  }
  const start = Math.max(0, candles.length - lookback);
  let sum = 0;
  let count = 0;

  for (let index = start; index < candles.length; index += 1) {
    const candle = candles[index];
    if (!Number.isFinite(candle?.high) || !Number.isFinite(candle?.low)) {
      continue;
    }
    sum += Math.abs(candle.high - candle.low);
    count += 1;
  }

  return count > 0 ? sum / count : 0;
}

function computeLiquiditySweeps(
  candles,
  {
    lookback = MAX_LIQUIDITY_LOOKBACK,
    atrPeriod = ATR_PERIOD_DEFAULT,
    atrThreshold = LIQUIDITY_ATR_THRESHOLD,
    pivotLeft = PIVOT_WINDOW,
    pivotRight = PIVOT_WINDOW
  } = {}
) {
  if (!Array.isArray(candles) || candles.length < atrPeriod + pivotLeft + pivotRight + 2) {
    return [];
  }

  const slice = candles.slice(-Math.min(lookback, candles.length));
  const offset = candles.length - slice.length;
  const atrSeries = computeAtr(slice, atrPeriod);
  const { pivotHighs, pivotLows } = computePivotMarkers(slice, pivotLeft, pivotRight);
  const signals = [];

  const resolveAtr = (index) => {
    if (!Array.isArray(atrSeries)) {
      return null;
    }
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      const candidate = Number(atrSeries[cursor]);
      if (Number.isFinite(candidate) && candidate > 0) {
        return candidate;
      }
    }
    return null;
  };

  const checkSweep = (pivotIndex, type) => {
    const pivot = slice[pivotIndex];
    if (!isNumericCandle(pivot)) {
      return;
    }
    for (let pointer = pivotIndex + 1; pointer < slice.length; pointer += 1) {
      const candle = slice[pointer];
      if (!isNumericCandle(candle)) {
        continue;
      }
      const atr = resolveAtr(pointer);
      if (!Number.isFinite(atr) || atr <= 0) {
        continue;
      }

      if (type === 'high') {
        if (!(candle.high > pivot.high)) {
          continue;
        }
        const extension = candle.high - pivot.high;
        if (extension <= 0 || extension > atr * atrThreshold) {
          continue;
        }
        if (candle.close > pivot.high) {
          continue;
        }
        const wick = candle.high - Math.max(candle.open, candle.close);
        if (wick <= 0) {
          continue;
        }
        signals.push({
          id: `liq-high-${pivot.time}-${candle.time}`,
          type: 'Liquidity Sweep',
          direction: 'bearish',
          pivotTime: pivot.time,
          breakTime: candle.time,
          keyLevels: {
            swing: pivot.high,
            sweepExtreme: candle.high,
            close: candle.close
          },
          indicatorKey: 'liquiditySweep',
          atrMultiple: extension / atr,
          context: {
            pivotIndex: offset + pivotIndex,
            sweepIndex: offset + pointer
          }
        });
        return;
      }

      if (!(candle.low < pivot.low)) {
        continue;
      }
      const extension = pivot.low - candle.low;
      if (extension <= 0 || extension > atr * atrThreshold) {
        continue;
      }
      if (candle.close < pivot.low) {
        continue;
      }
      const wick = Math.min(candle.open, candle.close) - candle.low;
      if (wick <= 0) {
        continue;
      }
      signals.push({
        id: `liq-low-${pivot.time}-${candle.time}`,
        type: 'Liquidity Sweep',
        direction: 'bullish',
        pivotTime: pivot.time,
        breakTime: candle.time,
        keyLevels: {
          swing: pivot.low,
          sweepExtreme: candle.low,
          close: candle.close
        },
        indicatorKey: 'liquiditySweep',
        atrMultiple: extension / atr,
        context: {
          pivotIndex: offset + pivotIndex,
          sweepIndex: offset + pointer
        }
      });
      return;
    }
  };

  Array.from(pivotHighs)
    .sort((a, b) => a - b)
    .forEach((index) => checkSweep(index, 'high'));

  Array.from(pivotLows)
    .sort((a, b) => a - b)
    .forEach((index) => checkSweep(index, 'low'));

  return signals;
}

function computeEqualLiquidityPools(
  candles,
  {
    side = 'high',
    lookback = MAX_EQUAL_LEVEL_LOOKBACK,
    atrPeriod = ATR_PERIOD_DEFAULT,
    pivotLeft = PIVOT_WINDOW,
    pivotRight = PIVOT_WINDOW
  } = {}
) {
  if (!Array.isArray(candles) || candles.length < atrPeriod + pivotLeft + pivotRight + 2) {
    return [];
  }

  const slice = candles.slice(-Math.min(lookback, candles.length));
  const atrSeries = computeAtr(slice, atrPeriod);
  const { pivotHighs, pivotLows } = computePivotMarkers(slice, pivotLeft, pivotRight);
  const pivots = Array.from(side === 'high' ? pivotHighs : pivotLows).sort((a, b) => a - b);
  const levels = [];

  pivots.forEach((index) => {
    const candle = slice[index];
    if (!isNumericCandle(candle)) {
      return;
    }
    const price = side === 'high' ? candle.high : candle.low;
    const atr = Number(atrSeries?.[index]);
    if (!Number.isFinite(price) || !Number.isFinite(atr) || atr <= 0) {
      return;
    }
    const toleranceMax = Math.max(atr * EQUAL_LEVEL_TOLERANCE_MAX, 0.01);
    const toleranceMin = Math.max(atr * EQUAL_LEVEL_TOLERANCE_MIN, 0.005);
    let level = levels.find((entry) => Math.abs(entry.price - price) <= toleranceMax);
    if (!level) {
      level = {
        price,
        tolerance: toleranceMax,
        touches: 0,
        times: [],
        high: price,
        low: price
      };
      levels.push(level);
    } else {
      level.price = (level.price * level.touches + price) / (level.touches + 1);
      level.tolerance = Math.max(level.tolerance, toleranceMax);
      level.high = Math.max(level.high, price + toleranceMin / 2);
      level.low = Math.min(level.low, price - toleranceMin / 2);
    }
    level.touches += 1;
    level.times.push(candle.time);
  });

  return levels
    .filter((level) => level.touches >= EQUAL_LEVEL_MIN_TOUCHES)
    .map((level, idx) => {
      const band = Math.max(level.tolerance, Math.abs(level.high - level.low) || 0.01);
      const half = band / 2;
      const center = level.price;
      const top = center + half;
      const bottom = center - half;
      const startTime = Math.min(...level.times);
      const endTime = Math.max(...level.times);
      return {
        id: `equal-${side}-${startTime}-${idx}`,
        type: 'zone',
        indicatorKey: side === 'high' ? 'equalHighs' : 'equalLows',
        startTime,
        endTime,
        extend: true,
        top,
        bottom,
        direction: side === 'high' ? 'bearish' : 'bullish',
        filled: false,
        label: side === 'high' ? 'Equal Highs' : 'Equal Lows',
        touches: level.touches
      };
    });
}

function computeBreakerBlocks(candles, options = {}) {
  if (!Array.isArray(candles) || candles.length < 10) {
    return [];
  }
  const orderBlocks = computeOrderBlocks(candles, options);
  if (!Array.isArray(orderBlocks) || orderBlocks.length === 0) {
    return [];
  }

  const timeIndex = new Map();
  candles.forEach((candle, index) => {
    if (Number.isFinite(candle?.time)) {
      timeIndex.set(candle.time, index);
    }
  });

  const zones = [];

  orderBlocks.forEach((ob) => {
    const startIndex = timeIndex.get(ob.startTime);
    if (typeof startIndex !== 'number') {
      return;
    }
    let invalidateIndex = -1;
    for (let idx = startIndex + 1; idx < candles.length; idx += 1) {
      const candle = candles[idx];
      if (!isNumericCandle(candle)) {
        continue;
      }
      if (ob.direction === 'bullish' && candle.close < ob.bottom) {
        invalidateIndex = idx;
        break;
      }
      if (ob.direction === 'bearish' && candle.close > ob.top) {
        invalidateIndex = idx;
        break;
      }
    }

    if (invalidateIndex < 0) {
      return;
    }

    const breakerDirection = ob.direction === 'bullish' ? 'bearish' : 'bullish';
    const invalidateTime = candles[invalidateIndex]?.time;
    const retest = resolveBreakerRetest(candles, invalidateIndex + 1, ob.top, ob.bottom, breakerDirection);

    zones.push({
      id: `breaker-${breakerDirection}-${ob.id}`,
      type: 'zone',
      indicatorKey: 'breakerBlock',
      startTime: invalidateTime,
      endTime: retest.fillTime ?? invalidateTime,
      extend: !retest.filled,
      top: ob.top,
      bottom: ob.bottom,
      direction: breakerDirection,
      filled: retest.filled,
      label: 'Breaker Block',
      size: ob.top - ob.bottom,
      originOrderBlockId: ob.id,
      retestRatio: retest.fillRatio
    });
  });

  return zones;
}

function computeKillzoneWindows(
  candles,
  { lookback = MAX_KILLZONE_LOOKBACK, contract } = {}
) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }

  const slice = candles.slice(-Math.min(lookback, candles.length));
  const groups = groupCandlesByEasternDay(slice);
  if (!groups.size) {
    return [];
  }

  const definition = resolveKillzoneDefinition(contract);
  const zones = [];

  groups.forEach((entries) => {
    if (!entries || entries.length === 0) {
      return;
    }
    const dayHigh = entries.reduce((acc, entry) => Math.max(acc, Number(entry.candle.high) || -Infinity), -Infinity);
    const dayLow = entries.reduce((acc, entry) => Math.min(acc, Number(entry.candle.low) || Infinity), Infinity);
    entries.sort((a, b) => a.candle.time - b.candle.time);

    definition.forEach((window) => {
      const windowEntries = entries.filter(
        (entry) => entry.minutes >= window.startMinutes && entry.minutes < window.endMinutes
      );
      if (windowEntries.length === 0) {
        return;
      }
      const startTime = windowEntries[0].candle.time;
      const endTime = windowEntries[windowEntries.length - 1].candle.time;
      const windowHigh = windowEntries.reduce(
        (acc, entry) => Math.max(acc, Number(entry.candle.high) || -Infinity),
        -Infinity
      );
      const windowLow = windowEntries.reduce(
        (acc, entry) => Math.min(acc, Number(entry.candle.low) || Infinity),
        Infinity
      );
      const top = Number.isFinite(windowHigh) ? windowHigh : dayHigh;
      const bottom = Number.isFinite(windowLow) ? windowLow : dayLow;
      zones.push({
        id: `killzone-${window.label.replace(/\s+/g, '-').toLowerCase()}-${startTime}`,
        type: 'zone',
        indicatorKey: 'ictKillzone',
        startTime,
        endTime,
        extend: false,
        top,
        bottom,
        direction: window.bias || 'neutral',
        filled: false,
        label: window.label
      });
    });
  });

  return zones;
}

function computeOpeningRangeBreakouts(
  candles,
  {
    volumeMultiplier = OPENING_RANGE_VOLUME_MULTIPLIER,
    atrBuffer = OPENING_RANGE_ATR_BUFFER,
    rangeMinutes = OPENING_RANGE_MINUTES
  } = {}
) {
  if (!Array.isArray(candles) || candles.length < 10) {
    return { zones: [], signals: [] };
  }

  const atrSeries = computeAtr(candles, ATR_PERIOD_DEFAULT);
  const volumeSeries = candles.map((candle) => Number(candle?.volume) || 0);
  const volumeMA = computeSimpleMovingAverage(volumeSeries, OPENING_RANGE_VOLUME_LOOKBACK);
  const groups = groupCandlesByEasternDay(candles);

  if (!groups.size) {
    return { zones: [], signals: [] };
  }

  const zones = [];
  const signals = [];
  const openMinutes = 9 * 60 + 30;
  const rangeEnd = openMinutes + rangeMinutes;

  groups.forEach((entries) => {
    if (!entries || entries.length === 0) {
      return;
    }
    const openingEntries = entries.filter(
      (entry) => entry.minutes >= openMinutes && entry.minutes < rangeEnd
    );
    if (openingEntries.length < 2) {
      return;
    }

    const rangeHigh = openingEntries.reduce(
      (acc, entry) => Math.max(acc, Number(entry.candle.high) || -Infinity),
      -Infinity
    );
    const rangeLow = openingEntries.reduce(
      (acc, entry) => Math.min(acc, Number(entry.candle.low) || Infinity),
      Infinity
    );

    if (!Number.isFinite(rangeHigh) || !Number.isFinite(rangeLow)) {
      return;
    }

    const rangeId = `orb-${openingEntries[0].candle.time}`;
    zones.push({
      id: rangeId,
      type: 'zone',
      indicatorKey: 'openingRangeBreakout',
      startTime: openingEntries[0].candle.time,
      endTime: openingEntries[openingEntries.length - 1].candle.time,
      extend: false,
      top: rangeHigh,
      bottom: rangeLow,
      direction: 'neutral',
      filled: false,
      label: 'Opening Range'
    });

    let bullishTriggered = false;
    let bearishTriggered = false;

    entries.forEach((entry) => {
      if (entry.minutes < rangeEnd) {
        return;
      }
      const candle = entry.candle;
      if (!isNumericCandle(candle)) {
        return;
      }
      const atr = Number(atrSeries?.[entry.index]);
      if (!Number.isFinite(atr) || atr <= 0) {
        return;
      }
      const volume = Number(candle.volume) || 0;
      const avgVolume = Number(volumeMA?.[entry.index]);
      const hasVolume = !Number.isFinite(avgVolume) || avgVolume === 0 || volume >= avgVolume * volumeMultiplier;

      if (!bullishTriggered && candle.close >= rangeHigh + atr * atrBuffer && hasVolume) {
        signals.push({
          id: `${rangeId}-bull-${candle.time}`,
          type: 'Opening Range Breakout',
          direction: 'bullish',
          breakTime: candle.time,
          keyLevels: {
            rangeHigh,
            rangeLow,
            trigger: candle.close
          },
          indicatorKey: 'openingRangeBreakout'
        });
        bullishTriggered = true;
      }

      if (!bearishTriggered && candle.close <= rangeLow - atr * atrBuffer && hasVolume) {
        signals.push({
          id: `${rangeId}-bear-${candle.time}`,
          type: 'Opening Range Breakout',
          direction: 'bearish',
          breakTime: candle.time,
          keyLevels: {
            rangeHigh,
            rangeLow,
            trigger: candle.close
          },
          indicatorKey: 'openingRangeBreakout'
        });
        bearishTriggered = true;
      }
    });
  });

  return { zones, signals };
}

export function isNumericCandle(candle) {
  return Boolean(
    candle &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close)
  );
}

function resolveBreakerRetest(candles, startIndex, top, bottom, direction, minOverlapRatio = 0.3) {
  const thickness = top - bottom;
  if (!Number.isFinite(thickness) || thickness <= 0) {
    return { filled: false, fillTime: candles[candles.length - 1]?.time ?? null, fillRatio: 0 };
  }

  let lastTime = candles[candles.length - 1]?.time ?? null;
  let bestRatio = 0;

  for (let idx = startIndex; idx < candles.length; idx += 1) {
    const candle = candles[idx];
    if (!isNumericCandle(candle)) {
      continue;
    }
    lastTime = candle.time;
    const bodyHigh = Math.max(candle.open, candle.close);
    const bodyLow = Math.min(candle.open, candle.close);
    const overlapTop = Math.min(bodyHigh, top);
    const overlapBottom = Math.max(bodyLow, bottom);
    const overlap = overlapTop - overlapBottom;
    if (overlap <= 0) {
      continue;
    }
    const ratio = overlap / thickness;
    bestRatio = Math.max(bestRatio, ratio);
    const candleDirection = candle.close >= candle.open ? 'bullish' : 'bearish';
    if (ratio >= minOverlapRatio && candleDirection === direction) {
      return { filled: true, fillTime: candle.time, fillRatio: ratio };
    }
  }

  return { filled: false, fillTime: lastTime, fillRatio: bestRatio };
}

let cachedEasternFormatter = null;

/**
 * Returns a cached DateTimeFormat for Eastern Time.
 * If the timezone configuration changes, call clearEasternFormatterCache() to refresh.
 */
function getEasternFormatter() {
  if (cachedEasternFormatter) {
    return cachedEasternFormatter;
  }
  if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
    cachedEasternFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }
  return cachedEasternFormatter;
}

/**
 * Clears the cached Eastern formatter.
 * Call this if the timezone configuration changes and you need a fresh formatter.
 */
export function clearEasternFormatterCache() {
  cachedEasternFormatter = null;
}

function extractEasternComponents(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const formatter = getEasternFormatter();
  const date = new Date(timestamp * 1000);
  if (formatter && typeof formatter.formatToParts === 'function') {
    const bag = {};
    formatter.formatToParts(date).forEach((part) => {
      bag[part.type] = part.value;
    });
    return {
      year: Number(bag.year),
      month: Number(bag.month),
      day: Number(bag.day),
      hour: Number(bag.hour),
      minute: Number(bag.minute),
      second: Number(bag.second)
    };
  }
  const fallback = new Date(date.getTime() - 5 * 60 * 60 * 1000);
  return {
    year: fallback.getUTCFullYear(),
    month: fallback.getUTCMonth() + 1,
    day: fallback.getUTCDate(),
    hour: fallback.getUTCHours(),
    minute: fallback.getUTCMinutes(),
    second: fallback.getUTCSeconds()
  };
}

function groupCandlesByEasternDay(candles) {
  const groups = new Map();
  const componentsCache = new Map();
  candles.forEach((candle, index) => {
    const timestamp = candle?.time;
    if (!Number.isFinite(timestamp)) {
      return;
    }
    let components = componentsCache.get(timestamp);
    if (!components) {
      components = extractEasternComponents(timestamp);
      if (components) {
        componentsCache.set(timestamp, components);
      }
    }
    if (!components) {
      return;
    }
    const key = `${components.year}-${pad2(components.month)}-${pad2(components.day)}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push({
      index,
      candle,
      minutes: components.hour * 60 + components.minute,
      components
    });
  });
  return groups;
}

function pad2(value) {
  return value < 10 ? `0${value}` : String(value);
}

export function computeSimpleMovingAverage(values, period) {
  if (!Array.isArray(values) || values.length === 0 || !Number.isFinite(period) || period <= 0) {
    return [];
  }
  const result = [];
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += Number(values[index]) || 0;
    if (index >= period) {
      sum -= Number(values[index - period]) || 0;
    }
    if (index >= period - 1) {
      result[index] = sum / period;
    } else {
      result[index] = null;
    }
  }
  return result;
}

function resolveKillzoneDefinition(contract) {
  const code = extractContractCode(contract);
  const isGold = code.startsWith('GC') || code.startsWith('MGC');
  const london = { label: 'London Killzone', startMinutes: 2 * 60, endMinutes: 5 * 60, bias: 'neutral' };
  const newYorkDefault = { label: 'New York Killzone', startMinutes: 8 * 60, endMinutes: 11 * 60, bias: 'neutral' };
  const newYorkGold = { label: 'New York Killzone', startMinutes: 8 * 60, endMinutes: 10 * 60, bias: 'neutral' };
  return isGold ? [london, newYorkGold] : [london, newYorkDefault];
}

function extractContractCode(contract) {
  if (!contract) {
    return '';
  }
  if (typeof contract === 'string') {
    return contract.toUpperCase();
  }
  const code = contract.code || contract.symbol || contract.contractCode || contract.symbolId;
  return code ? String(code).toUpperCase() : '';
}
