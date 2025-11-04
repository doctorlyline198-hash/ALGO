const DEFAULT_LINE_OPTIONS = {
  lineWidth: 2,
  priceLineVisible: false,
  crosshairMarkerVisible: false,
  lastValueVisible: false
};

const INDICATOR_ALIASES = {
  'Moving Average Cross': 'maCross',
  'VWAP Rejection': 'vwap',
  'VWAP Break': 'vwap',
  'VWAP Cross': 'vwap',
  'Bollinger Squeeze': 'bollinger'
};

const INDICATOR_IMPLEMENTATIONS = {
  maCross: {
    minBars: 30,
    builder: (candles) => {
      const fast = computeEma(candles, 9);
      const slow = computeEma(candles, 21);
      return [
        createLineEntry('ema-9', 'EMA 9', fast, { color: '#38bdf8' }),
        createLineEntry('ema-21', 'EMA 21', slow, { color: '#c084fc' })
      ];
    }
  },
  vwap: {
    minBars: 2,
    builder: (candles) => {
      const values = computeVwap(candles);
      return [createLineEntry('vwap', 'VWAP', values, { color: '#facc15', lineWidth: 3 })];
    }
  },
  bollinger: {
    minBars: 25,
    builder: (candles) => {
      const bands = computeBollinger(candles, 20, 2);
      return [
        createLineEntry('bb-upper', 'BB Upper', bands.upper, { color: 'rgba(250, 204, 21, 0.85)', lineStyle: 2 }),
        createLineEntry('bb-mid', 'BB Basis', bands.middle, { color: 'rgba(148, 163, 184, 0.9)', lineWidth: 1 }),
        createLineEntry('bb-lower', 'BB Lower', bands.lower, { color: 'rgba(250, 204, 21, 0.85)', lineStyle: 2 })
      ];
    }
  }
};

export function buildIndicatorPayload({ selections = [], candles = [] } = {}) {
  if (!Array.isArray(selections) || !Array.isArray(candles)) {
    return { series: [], diagnostics: [] };
  }

  const diagnostics = [];
  const overlays = [];
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

    const built = implementation.builder(candles) || [];
    const series = built.filter(Boolean);

    if (!series.length) {
      diagnostics.push({ name: label, status: 'idle', message: 'Waiting for data' });
      return;
    }

    overlays.push(...series);
    diagnostics.push({ name: label, status: 'ok', message: 'Applied' });
    baseApplied.add(baseKey);
  });

  return { series: overlays, diagnostics };
}

function createLineEntry(id, title, data, options = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  return {
    id,
    title,
    data,
    options: { ...DEFAULT_LINE_OPTIONS, ...options }
  };
}

function computeEma(candles, period) {
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

function computeVwap(candles) {
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

function computeBollinger(candles, period = 20, multiplier = 2) {
  const values = [];
  const upper = [];
  const middle = [];
  const lower = [];

  candles.forEach((candle) => {
    const close = Number(candle?.close);
    if (!Number.isFinite(close)) {
      return;
    }
    values.push({ time: candle.time, close });
  });
  const window = [];
  values.forEach(({ time, close }) => {
    window.push(close);
    if (window.length > period) {
      window.shift();
    }
    if (window.length < period) {
      return;
    }
    const mean = window.reduce((acc, value) => acc + value, 0) / period;
    const variance = window.reduce((acc, value) => acc + (value - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    middle.push({ time, value: mean });
    upper.push({ time, value: mean + multiplier * stdDev });
    lower.push({ time, value: mean - multiplier * stdDev });
  });

  return { upper, middle, lower };
}
