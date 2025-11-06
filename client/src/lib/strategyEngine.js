import { evaluateChartPatterns } from '@shared/patterns/index.js';
import { detectSwings } from '@shared/patterns/swingDetection.js';
import {
  computeAtr,
  computeEma,
  computeVwap,
  computeBollinger,
  computeSimpleMovingAverage,
  computeAverageRange,
  computeRsi,
  computeKeltnerChannels
} from './indicators.js';

const ATR_PERIOD = 14;
const RSI_PERIOD = 14;
const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;
const BOLLINGER_PERIOD = 20;
const BOLLINGER_SQUEEZE_THRESHOLD = 0.05;
const KELTNER_PERIOD = 20;
const KELTNER_MULTIPLIER = 1.5;
const RSI_KELTNER_BULL_THRESHOLD = 55;
const RSI_KELTNER_BEAR_THRESHOLD = 45;
const RSI_KELTNER_TIMEFRAMES = new Set(['1m', '2m', '3m', '4m', '5m']);
const RSI_KELTNER_MAX_LOSS = 50;
const RSI_KELTNER_MIN_MICROS = 1;
const RSI_KELTNER_MAX_MICROS = 3;
const ATR_EXPANSION_MULTIPLE = 1.5;
const MOMENTUM_ATR_MULTIPLE = 1.5;
const MOMENTUM_VOLUME_MULTIPLE = 1.5;
const VWAP_REJECTION_THRESHOLD = 0.1;
const MA_LENGTHS_NQ = { fast: 9, slow: 21 };
const MA_LENGTHS_GC = { fast: 20, slow: 50 };
const EMA_RIBBON_LENGTHS = [8, 13, 21, 34, 55];
const EMA_RIBBON_ATR_RATIO = 0.3;
const STATUS_SCORE = {
  confirmed: 0.2,
  active: 0.15,
  validated: 0.15,
  filled: 0.12,
  mitigated: 0.12,
  reaction: 0.12,
  range: 0.1,
  volatility: 0.1,
  developing: 0.08,
  compression: 0.06,
  signal: 0.05,
  setup: 0.05,
  watchlist: 0.04,
  session: 0.04
};
const URGENCY_NOW = new Set(['confirmed', 'active', 'validated', 'filled', 'mitigated', 'range', 'volatility', 'reaction']);
const URGENCY_WATCH = new Set(['developing', 'signal', 'setup', 'compression', 'session', 'watchlist']);

export function evaluateStrategies({
  candles = [],
  timeframe,
  contract,
  indicatorPayload = {},
  patternSignals = null
} = {}) {
  const normalized = normalizeCandles(candles);
  if (!normalized.length) {
    return createEmptyStrategyBundle();
  }

  const atrSeries = computeAtr(normalized, ATR_PERIOD);
  const volumeSeries = normalized.map((candle) => Number(candle.volume) || 0);
  const volumeMA20 = computeSimpleMovingAverage(volumeSeries, 20);
  const basePatterns = Array.isArray(patternSignals)
    ? patternSignals
    : evaluateChartPatterns({ candles: normalized, timeframe, contract });

  const smc = buildSmcSignals({ indicatorPayload, timeframe, contract });
  const wyckoff = detectWyckoffPhases({ candles: normalized, atrSeries, volumeMA20, timeframe, contract });
  const volume = detectVolumePatterns({ candles: normalized, atrSeries, volumeMA20, timeframe, contract });
  const candlestick = detectCandlestickPatterns({ candles: normalized, atrSeries, timeframe, contract });
  const indicator = detectIndicatorPatterns({
    candles: normalized,
    atrSeries,
    volumeMA20,
    timeframe,
    contract
  });
  const actions = synthesizeStrategyActions({
    smc: smc.signals,
    wyckoff: wyckoff.signals,
    volume: volume.signals,
    candlestick: candlestick.signals,
    indicator: indicator.signals
  });

  return {
    chart: basePatterns,
    smc: smc.signals,
    wyckoff: wyckoff.signals,
    volume: volume.signals,
    candlestick: candlestick.signals,
    indicator: indicator.signals,
    actions,
    diagnostics: [
      ...smc.diagnostics,
      ...wyckoff.diagnostics,
      ...volume.diagnostics,
      ...candlestick.diagnostics,
      ...indicator.diagnostics
    ]
  };
}

function createEmptyStrategyBundle() {
  return {
    chart: [],
    smc: [],
    wyckoff: [],
    volume: [],
    candlestick: [],
    indicator: [],
    actions: [],
    diagnostics: []
  };
}

function normalizeCandles(candles) {
  return (Array.isArray(candles) ? candles : [])
    .map((candle) => {
      if (!candle) return null;
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
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
}

function buildSmcSignals({ indicatorPayload = {}, timeframe, contract }) {
  const zones = Array.isArray(indicatorPayload.zones) ? indicatorPayload.zones : [];
  const signals = Array.isArray(indicatorPayload.signals) ? indicatorPayload.signals : [];
  const result = [];
  const diagnostics = [];
  const contractCode = resolveContractCode(contract);

  zones.forEach((zone) => {
    if (!zone || !zone.indicatorKey) return;
    const base = {
      timeframe,
      contractCode,
      source: 'indicator',
      confirmedAt: zone.startTime,
      triggerPrice: zone.bottom,
      keyLevels: { top: zone.top, bottom: zone.bottom },
      context: { extend: zone.extend, filled: zone.filled }
    };
    switch (zone.indicatorKey) {
      case 'fairValueGap':
        result.push(
          createStrategySignal({
            pattern: 'Fair Value Gap',
            category: 'Smart Money Concepts',
            direction: zone.direction,
            status: zone.filled ? 'filled' : 'active',
            confidence: clampRatio(zone.atrMultiple, 0.2, 2),
            ...base
          })
        );
        break;
      case 'orderBlock':
        result.push(
          createStrategySignal({
            pattern: 'Order Block',
            category: 'Smart Money Concepts',
            direction: zone.direction,
            status: zone.filled ? 'mitigated' : 'active',
            confidence: clampRatio(zone.size, 0.25, 8),
            ...base
          })
        );
        break;
      case 'equalHighs':
        result.push(
          createStrategySignal({
            pattern: 'Equal Highs',
            category: 'Smart Money Concepts',
            direction: 'bearish',
            status: 'liquidity',
            confidence: clampRatio(zone.touches, 2, 6),
            ...base
          })
        );
        break;
      case 'equalLows':
        result.push(
          createStrategySignal({
            pattern: 'Equal Lows',
            category: 'Smart Money Concepts',
            direction: 'bullish',
            status: 'liquidity',
            confidence: clampRatio(zone.touches, 2, 6),
            ...base
          })
        );
        break;
      case 'breakerBlock':
        result.push(
          createStrategySignal({
            pattern: 'Breaker Block',
            category: 'Smart Money Concepts',
            direction: zone.direction,
            status: zone.filled ? 'validated' : 'watchlist',
            confidence: clampRatio(zone.retestRatio ?? 0.3, 0.1, 1),
            ...base
          })
        );
        break;
      case 'ictKillzone':
        result.push(
          createStrategySignal({
            pattern: 'ICT Killzone',
            category: 'Smart Money Concepts',
            direction: zone.direction || 'neutral',
            status: 'session',
            confidence: 0.6,
            ...base,
            keyLevels: {
              windowTop: zone.top,
              windowBottom: zone.bottom
            }
          })
        );
        break;
      case 'openingRangeBreakout':
        result.push(
          createStrategySignal({
            pattern: 'Opening Range Breakout',
            category: 'Smart Money Concepts',
            direction: 'neutral',
            status: 'range',
            confidence: 0.55,
            ...base,
            keyLevels: {
              rangeHigh: zone.top,
              rangeLow: zone.bottom
            }
          })
        );
        break;
      default:
        break;
    }
  });

  signals.forEach((signal) => {
    if (!signal) return;
    const base = {
      timeframe,
      contractCode,
      source: signal.indicatorKey || 'indicator',
      confirmedAt: signal.breakTime || signal.confirmedAt,
      triggerPrice: signal.keyLevels?.trigger || signal.triggerPrice,
      keyLevels: signal.keyLevels || {},
      context: signal.context || {}
    };
    switch (signal.indicatorKey) {
      case 'structure':
        if (signal.type === 'CHOCH') {
          result.push(
            createStrategySignal({
              pattern: 'Change of Character',
              category: 'Smart Money Concepts',
              direction: signal.direction,
              status: 'confirmed',
              confidence: 0.65,
              ...base
            })
          );
        } else {
          result.push(
            createStrategySignal({
              pattern: 'Break of Structure',
              category: 'Smart Money Concepts',
              direction: signal.direction,
              status: 'confirmed',
              confidence: 0.7,
              ...base
            })
          );
        }
        break;
      case 'liquiditySweep':
        result.push(
          createStrategySignal({
            pattern: 'Liquidity Sweep',
            category: 'Smart Money Concepts',
            direction: signal.direction,
            status: 'confirmed',
            confidence: clampRatio(signal.atrMultiple ?? 0.1, 0.1, 0.6),
            ...base
          })
        );
        break;
      case 'openingRangeBreakout':
        result.push(
          createStrategySignal({
            pattern: 'Opening Range Breakout',
            category: 'Smart Money Concepts',
            direction: signal.direction,
            status: 'confirmed',
            confidence: 0.7,
            ...base
          })
        );
        break;
      default:
        break;
    }
  });

  return { signals: dedupeById(result), diagnostics };
}

function detectWyckoffPhases({ candles, atrSeries, volumeMA20, timeframe, contract }) {
  const diagnostics = [];
  if (candles.length < 80) {
    diagnostics.push({ scope: 'Wyckoff', status: 'insufficient-data', message: 'Need 80+ candles for Wyckoff analysis.' });
    return { signals: [], diagnostics };
  }

  const lookback = 80;
  const window = candles.slice(-lookback);
  const rangeHigh = Math.max(...window.map((c) => c.high));
  const rangeLow = Math.min(...window.map((c) => c.low));
  const rangeMid = (rangeHigh + rangeLow) / 2;
  const rangeHeight = rangeHigh - rangeLow;
  const atrWindow = averageSubseries(atrSeries, candles.length - lookback, candles.length - 1);
  const contractCode = resolveContractCode(contract);
  const signals = [];

  if (Number.isFinite(rangeHeight) && Number.isFinite(rangeMid) && rangeHeight > 0 && atrWindow > 0) {
    const compactRange = rangeHeight <= atrWindow * 4;
    const priorWindow = candles.slice(-lookback * 2, -lookback);
    const priorTrend = priorWindow.length
      ? priorWindow[priorWindow.length - 1].close - priorWindow[0].close
      : 0;
    const swings = detectSwings(candles, 3, 3).filter((swing) => swing.index >= candles.length - lookback);
    const lowSwings = swings.filter((swing) => swing.type === 'low');
    const highSwings = swings.filter((swing) => swing.type === 'high');

    if (compactRange && priorTrend < 0 && lowSwings.length >= 2) {
      const risingLows = isMonotonic(lowSwings.map((swing) => swing.price), true);
      const volumeSupport = assessVolumeSupport({ candles: window, volumeMA20 });
      if (risingLows && volumeSupport.accumulationScore > 0.5) {
        signals.push(
          createStrategySignal({
            pattern: 'Accumulation',
            category: 'Wyckoff',
            direction: 'bullish',
            status: 'developing',
            timeframe,
            contractCode,
            confidence: Math.min(0.9, 0.6 + volumeSupport.accumulationScore * 0.3),
            confirmedAt: window[window.length - 1].time,
            triggerPrice: rangeMid,
            keyLevels: { rangeHigh, rangeLow },
            context: { compactRange, risingLows, priorTrend }
          })
        );
      }
    }

    if (compactRange && priorTrend > 0 && highSwings.length >= 2) {
      const fallingHighs = isMonotonic(highSwings.map((swing) => swing.price), false);
      const volumeResistance = assessVolumeSupport({ candles: window, volumeMA20 });
      if (fallingHighs && volumeResistance.distributionScore > 0.5) {
        signals.push(
          createStrategySignal({
            pattern: 'Distribution',
            category: 'Wyckoff',
            direction: 'bearish',
            status: 'developing',
            timeframe,
            contractCode,
            confidence: Math.min(0.9, 0.6 + volumeResistance.distributionScore * 0.3),
            confirmedAt: window[window.length - 1].time,
            triggerPrice: rangeMid,
            keyLevels: { rangeHigh, rangeLow },
            context: { compactRange, fallingHighs, priorTrend }
          })
        );
      }
    }

    const lastClose = window[window.length - 1].close;
    const atr = atrSeries[atrSeries.length - 1] || atrWindow;
    if (Number.isFinite(atr) && atr > 0) {
      const breakdown = window[window.length - 1];
      if (breakdown.low < rangeLow - atr * 0.3 && lastClose > rangeLow) {
        signals.push(
          createStrategySignal({
            pattern: 'Spring',
            category: 'Wyckoff',
            direction: 'bullish',
            status: 'confirmed',
            timeframe,
            contractCode,
            confidence: 0.65,
            confirmedAt: breakdown.time,
            triggerPrice: lastClose,
            keyLevels: { rangeLow, rangeHigh },
            context: { atr }
          })
        );
      }
      if (breakdown.high > rangeHigh + atr * 0.3 && lastClose < rangeHigh) {
        signals.push(
          createStrategySignal({
            pattern: 'Upthrust',
            category: 'Wyckoff',
            direction: 'bearish',
            status: 'confirmed',
            timeframe,
            contractCode,
            confidence: 0.65,
            confirmedAt: breakdown.time,
            triggerPrice: lastClose,
            keyLevels: { rangeHigh, rangeLow },
            context: { atr }
          })
        );
      }
    }
  } else {
    diagnostics.push({ scope: 'Wyckoff', status: 'no-range', message: 'Unable to resolve Wyckoff range.' });
  }

  return { signals: dedupeById(signals), diagnostics };
}

function detectVolumePatterns({ candles, atrSeries, volumeMA20, timeframe, contract }) {
  const diagnostics = [];
  if (candles.length < 20) {
    diagnostics.push({ scope: 'Volume', status: 'insufficient-data', message: 'Need 20+ candles for volume studies.' });
    return { signals: [], diagnostics };
  }

  const signals = [];
  const lastIndex = candles.length - 1;
  const last = candles[lastIndex];
  const prev = candles[lastIndex - 1];
  const atr = atrSeries[lastIndex] || computeAverageRange(candles.slice(-14));
  const avgVolume = volumeMA20[lastIndex] || average(volumeMA20.slice(-5));

  if (Number.isFinite(atr) && atr > 0 && Number.isFinite(avgVolume) && avgVolume > 0) {
    const upperWick = last.high - Math.max(last.open, last.close);
    const lowerWick = Math.min(last.open, last.close) - last.low;
    const wick = Math.max(upperWick, lowerWick);
    if (last.volume >= avgVolume * 2 && wick >= atr * 0.5) {
      const direction = lowerWick > upperWick ? 'bullish' : 'bearish';
      signals.push(
        createStrategySignal({
          pattern: 'Volume Climax',
          category: 'Volume',
          direction,
          status: 'confirmed',
          timeframe,
          contractCode: resolveContractCode(contract),
          confidence: Math.min(0.95, last.volume / (avgVolume * 2.2)),
          confirmedAt: last.time,
          triggerPrice: last.close,
          keyLevels: { high: last.high, low: last.low },
          context: { wick }
        })
      );
    }

    const pullbackWindow = candles.slice(-4);
    if (pullbackWindow.length === 4) {
      const trendReference = candles.slice(-10, -4);
      const trendMove = trendReference.length ? pullbackWindow[0].close - trendReference[0].close : 0;
      const pullbackMove = pullbackWindow[pullbackWindow.length - 1].close - pullbackWindow[0].close;
      const pullbackVolume = average(pullbackWindow.map((c) => c.volume));
      if (trendMove * pullbackMove < 0 && pullbackVolume <= avgVolume * 0.5) {
        signals.push(
          createStrategySignal({
            pattern: 'Low Volume Pullback',
            category: 'Volume',
            direction: trendMove > 0 ? 'bullish' : 'bearish',
            status: 'developing',
            timeframe,
            contractCode: resolveContractCode(contract),
            confidence: 0.6,
            confirmedAt: pullbackWindow[pullbackWindow.length - 1].time,
            triggerPrice: pullbackWindow[pullbackWindow.length - 1].close,
            keyLevels: { start: pullbackWindow[0].close, end: pullbackWindow[pullbackWindow.length - 1].close },
            context: { pullbackVolume, avgVolume }
          })
        );
      }
    }
  }

  return { signals: dedupeById(signals), diagnostics };
}

function detectCandlestickPatterns({ candles, atrSeries, timeframe, contract }) {
  const diagnostics = [];
  if (candles.length < 3) {
    diagnostics.push({ scope: 'Candlestick', status: 'insufficient-data', message: 'Need 3+ candles for candlestick patterns.' });
    return { signals: [], diagnostics };
  }

  const signals = [];
  const contractCode = resolveContractCode(contract);
  const atr = atrSeries[atrSeries.length - 1] || computeAverageRange(candles.slice(-14));
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];
  const range = last.high - last.low;
  if (Number.isFinite(atr) && atr > 0 && range > 0) {
    const body = Math.abs(last.close - last.open);
    const lowerWick = Math.min(last.open, last.close) - last.low;
    const upperWick = last.high - Math.max(last.open, last.close);
    const bodyRatio = body / range;
    const lowerRatio = lowerWick / range;
    const upperRatio = upperWick / range;

    if (bodyRatio <= 0.3 && lowerRatio >= 0.5 && body <= atr * 0.6) {
      const priorTrend = prev.close - prev2.close;
      if (priorTrend < 0) {
        signals.push(
          createStrategySignal({
            pattern: 'Hammer',
            category: 'Candlestick',
            direction: 'bullish',
            status: 'confirmed',
            timeframe,
            contractCode,
            confidence: 0.65,
            confirmedAt: last.time,
            triggerPrice: last.close,
            keyLevels: { low: last.low, high: last.high }
          })
        );
      }
    }
    if (bodyRatio <= 0.3 && upperRatio >= 0.5 && body <= atr * 0.6) {
      const priorTrend = prev.close - prev2.close;
      if (priorTrend > 0) {
        signals.push(
          createStrategySignal({
            pattern: 'Hanging Man',
            category: 'Candlestick',
            direction: 'bearish',
            status: 'confirmed',
            timeframe,
            contractCode,
            confidence: 0.65,
            confirmedAt: last.time,
            triggerPrice: last.close,
            keyLevels: { low: last.low, high: last.high }
          })
        );
      }
    }
    if (bodyRatio <= 0.1) {
      signals.push(
        createStrategySignal({
          pattern: 'Doji',
          category: 'Candlestick',
          direction: 'neutral',
          status: 'signal',
          timeframe,
          contractCode,
          confidence: 0.5,
          confirmedAt: last.time,
          triggerPrice: last.close,
          keyLevels: { low: last.low, high: last.high }
        })
      );
    }
  }

  if (prev && last) {
    const prevBody = prev.close - prev.open;
    const lastBody = last.close - last.open;
    const engulfing = Math.abs(lastBody) > Math.abs(prevBody) && Math.sign(lastBody) !== Math.sign(prevBody) && last.open <= Math.max(prev.open, prev.close) && last.close >= Math.min(prev.open, prev.close);
    if (engulfing) {
      signals.push(
        createStrategySignal({
          pattern: 'Engulfing',
          category: 'Candlestick',
          direction: lastBody > 0 ? 'bullish' : 'bearish',
          status: 'confirmed',
          timeframe,
          contractCode,
          confidence: 0.7,
          confirmedAt: last.time,
          triggerPrice: last.close,
          keyLevels: { engulfOpen: prev.open, engulfClose: prev.close }
        })
      );
    }
  }

  if (prev2 && prev && last) {
    const firstBody = prev2.close - prev2.open;
    const thirdBody = last.close - last.open;
    const smallSecondBody = Math.abs(prev.close - prev.open) <= (atr || (prev.high - prev.low)) * 0.3;
    if (firstBody < 0 && smallSecondBody && thirdBody > 0 && last.close > prev2.open) {
      signals.push(
        createStrategySignal({
          pattern: 'Morning Star',
          category: 'Candlestick',
          direction: 'bullish',
          status: 'confirmed',
          timeframe,
          contractCode,
          confidence: 0.7,
          confirmedAt: last.time,
          triggerPrice: last.close
        })
      );
    }
    if (firstBody > 0 && smallSecondBody && thirdBody < 0 && last.close < prev2.open) {
      signals.push(
        createStrategySignal({
          pattern: 'Evening Star',
          category: 'Candlestick',
          direction: 'bearish',
          status: 'confirmed',
          timeframe,
          contractCode,
          confidence: 0.7,
          confirmedAt: last.time,
          triggerPrice: last.close
        })
      );
    }
  }

  return { signals: dedupeById(signals), diagnostics };
}

function detectIndicatorPatterns({ candles, atrSeries, volumeMA20, timeframe, contract }) {
  const diagnostics = [];
  if (candles.length < Math.max(MACD_SLOW + MACD_SIGNAL, BOLLINGER_PERIOD + 5)) {
    diagnostics.push({ scope: 'Indicator', status: 'insufficient-data', message: 'Need more history for indicator strategies.' });
  }

  const contractCode = resolveContractCode(contract);
  const atr = atrSeries[atrSeries.length - 1] || computeAverageRange(candles.slice(-14));
  const closingPrices = candles.map((c) => c.close);
  const volumeMA = volumeMA20;
  const bollinger = computeBollinger(candles, BOLLINGER_PERIOD, 2);
  const rsiSeries = computeRsi(candles, RSI_PERIOD);
  const keltnerChannels = computeKeltnerChannels(candles, KELTNER_PERIOD, KELTNER_MULTIPLIER);
  const macdSeries = computeMacd(candles);
  const vwapSeries = computeVwap(candles);
  const maLengths = selectMaLengths(contractCode);
  const fastMa = computeEma(candles, maLengths.fast);
  const slowMa = computeEma(candles, maLengths.slow);
  const signals = [];

  if (fastMa.length && slowMa.length) {
    const lastFast = fastMa[fastMa.length - 1]?.value;
    const prevFast = fastMa[fastMa.length - 2]?.value;
    const lastSlow = slowMa[slowMa.length - 1]?.value;
    const prevSlow = slowMa[slowMa.length - 2]?.value;
    if (Number.isFinite(lastFast) && Number.isFinite(prevFast) && Number.isFinite(lastSlow) && Number.isFinite(prevSlow)) {
      const crossedUp = prevFast <= prevSlow && lastFast > lastSlow;
      const crossedDown = prevFast >= prevSlow && lastFast < lastSlow;
      if (crossedUp || crossedDown) {
        signals.push(
          createStrategySignal({
            pattern: 'Moving Average Cross',
            category: 'Indicator',
            direction: crossedUp ? 'bullish' : 'bearish',
            status: 'confirmed',
            timeframe,
            contractCode,
            confidence: 0.65,
            confirmedAt: candles[candles.length - 1].time,
            triggerPrice: candles[candles.length - 1].close,
            keyLevels: { fast: lastFast, slow: lastSlow }
          })
        );
      }
    }
  }

  if (macdSeries.macd.length && macdSeries.signal.length) {
    const lastMacd = macdSeries.macd[macdSeries.macd.length - 1];
    const prevMacd = macdSeries.macd[macdSeries.macd.length - 2];
    const lastSignal = macdSeries.signal[macdSeries.signal.length - 1];
    const prevSignal = macdSeries.signal[macdSeries.signal.length - 2];
    if (Number.isFinite(lastMacd) && Number.isFinite(prevMacd) && Number.isFinite(lastSignal) && Number.isFinite(prevSignal)) {
      const crossedUp = prevMacd <= prevSignal && lastMacd > lastSignal;
      const crossedDown = prevMacd >= prevSignal && lastMacd < lastSignal;
      if (crossedUp || crossedDown) {
        signals.push(
          createStrategySignal({
            pattern: 'MACD Crossover',
            category: 'Indicator',
            direction: crossedUp ? 'bullish' : 'bearish',
            status: 'confirmed',
            timeframe,
            contractCode,
            confidence: 0.65,
            confirmedAt: candles[candles.length - 1].time,
            triggerPrice: candles[candles.length - 1].close
          })
        );
      }
    }
  }

  if (bollinger.upper.length && bollinger.lower.length) {
    const idx = bollinger.upper.length - 1;
    const upper = bollinger.upper[idx]?.value;
    const lower = bollinger.lower[idx]?.value;
    const middle = bollinger.middle[idx]?.value;
    if (Number.isFinite(upper) && Number.isFinite(lower) && Number.isFinite(middle) && middle !== 0) {
      const bandwidth = (upper - lower) / middle;
      if (bandwidth <= BOLLINGER_SQUEEZE_THRESHOLD) {
        signals.push(
          createStrategySignal({
            pattern: 'Bollinger Squeeze',
            category: 'Indicator',
            direction: 'neutral',
            status: 'compression',
            timeframe,
            contractCode,
            confidence: 0.6,
            confirmedAt: candles[candles.length - 1].time,
            triggerPrice: candles[candles.length - 1].close,
            context: { bandwidth }
          })
        );
      }
    }
  }

  if (Number.isFinite(atr) && atr > 0) {
    const atrWindow = averageSubseries(atrSeries, atrSeries.length - 10, atrSeries.length - 2);
    if (Number.isFinite(atrWindow) && atrWindow > 0 && atr >= atrWindow * ATR_EXPANSION_MULTIPLE) {
      signals.push(
        createStrategySignal({
          pattern: 'ATR Expansion',
          category: 'Indicator',
          direction: 'neutral',
          status: 'volatility',
          timeframe,
          contractCode,
          confidence: Math.min(0.9, atr / (atrWindow * ATR_EXPANSION_MULTIPLE)),
          confirmedAt: candles[candles.length - 1].time,
          triggerPrice: candles[candles.length - 1].close
        })
      );
    }

    const momentumVolume = volumeMA[candles.length - 1] || average(volumeMA.slice(-5));
    const lastCandle = candles[candles.length - 1];
    const candleRange = lastCandle.high - lastCandle.low;
    const lastVolume = lastCandle.volume;
    if (candleRange >= atr * MOMENTUM_ATR_MULTIPLE && Number.isFinite(momentumVolume) && momentumVolume > 0 && lastVolume >= momentumVolume * MOMENTUM_VOLUME_MULTIPLE) {
      signals.push(
        createStrategySignal({
          pattern: 'Momentum Breakout',
          category: 'Indicator',
          direction: lastCandle.close > lastCandle.open ? 'bullish' : 'bearish',
          status: 'confirmed',
          timeframe,
          contractCode,
          confidence: 0.7,
          confirmedAt: lastCandle.time,
          triggerPrice: lastCandle.close
        })
      );
    }
  }

  if (vwapSeries.length && Number.isFinite(atr) && atr > 0) {
    const lastIndex = vwapSeries.length - 1;
    const vwap = vwapSeries[lastIndex]?.value;
    const price = candles[candles.length - 1].close;
    if (Number.isFinite(vwap) && Number.isFinite(price)) {
      const distance = Math.abs(price - vwap);
      if (distance <= atr * VWAP_REJECTION_THRESHOLD) {
        signals.push(
          createStrategySignal({
            pattern: 'VWAP Rejection',
            category: 'Indicator',
            direction: price < vwap ? 'bearish' : 'bullish',
            status: 'reaction',
            timeframe,
            contractCode,
            confidence: 0.55,
            confirmedAt: candles[candles.length - 1].time,
            triggerPrice: price,
            keyLevels: { vwap }
          })
        );
      } else if (distance >= atr) {
        signals.push(
          createStrategySignal({
            pattern: 'VWAP Break',
            category: 'Indicator',
            direction: price > vwap ? 'bullish' : 'bearish',
            status: 'confirmed',
            timeframe,
            contractCode,
            confidence: 0.6,
            confirmedAt: candles[candles.length - 1].time,
            triggerPrice: price,
            keyLevels: { vwap }
          })
        );
      }
    }
  }

  const emaRibbon = EMA_RIBBON_LENGTHS.map((length) => computeEma(candles, length));
  if (emaRibbon.every((series) => series.length)) {
    const latestValues = emaRibbon
      .map((series) => series[series.length - 1]?.value)
      .filter((value) => Number.isFinite(value));
    if (latestValues.length === EMA_RIBBON_LENGTHS.length) {
      const max = Math.max(...latestValues);
      const min = Math.min(...latestValues);
      if (Number.isFinite(atr) && atr > 0 && max - min <= atr * EMA_RIBBON_ATR_RATIO) {
        signals.push(
          createStrategySignal({
            pattern: 'EMA Ribbon Compression',
            category: 'Indicator',
            direction: 'neutral',
            status: 'compression',
            timeframe,
            contractCode,
            confidence: 0.6,
            confirmedAt: candles[candles.length - 1].time,
            triggerPrice: candles[candles.length - 1].close,
            context: { spread: max - min }
          })
        );
      }
    }
  }

  if (Number.isFinite(atr) && atr > 0) {
    const lastPrice = candles[candles.length - 1].close;
    const mean20 = average(closingPrices.slice(-20));
    const std20 = standardDeviation(closingPrices.slice(-20));
    if (Number.isFinite(mean20) && Number.isFinite(std20) && Number.isFinite(lastPrice)) {
      const deviation = Math.abs(lastPrice - mean20);
      if (std20 > 0 && deviation >= std20 * 2) {
        signals.push(
          createStrategySignal({
            pattern: 'Mean Reversion',
            category: 'Indicator',
            direction: lastPrice > mean20 ? 'bearish' : 'bullish',
            status: 'setup',
            timeframe,
            contractCode,
            confidence: 0.55,
            confirmedAt: candles[candles.length - 1].time,
            triggerPrice: lastPrice,
            keyLevels: { mean: mean20, deviation }
          })
        );
      }
    }
  }

    const timeframeKey = normalizeTimeframeKey(timeframe);
    const normalizedContract = normalizeContractCode(contractCode);

    // Extracted RSI + Keltner strategy logic
    const { rsiKeltnerSignals, rsiKeltnerDiagnostics } = detectRsiKeltnerStrategy({
      candles,
      atrSeries,
      rsiSeries,
      keltnerChannels,
      timeframe,
      contractCode,
      timeframeKey,
      normalizedContract
    });
    signals.push(...rsiKeltnerSignals);
    diagnostics.push(...rsiKeltnerDiagnostics);

    diagnostics.push({ scope: 'Indicator', status: 'todo', message: 'Additional indicator strategies (Supertrend, ADX, Ichimoku, Delta, OI, Fibonacci, OBV, CMF, Hull, Parabolic SAR, Pivot) pending implementation.' });

  return { signals: dedupeById(signals), diagnostics };
}

function synthesizeStrategyActions(groups = {}) {
  const pool = [];
  Object.values(groups).forEach((list) => {
    if (!Array.isArray(list)) {
      return;
    }
    list.forEach((signal) => {
      const action = mapSignalToAction(signal);
      if (action) {
        pool.push(action);
      }
    });
  });
  pool.sort((a, b) => b.score - a.score);
  return pool.slice(0, 12);
}

function mapSignalToAction(signal) {
  if (!signal || !signal.id) {
    return null;
  }
  const direction = normalizeDirection(signal.direction);
  const urgency = resolveUrgency(signal.status);
  const action = resolveActionFromDirection(direction, urgency);
  const confidence = Number.isFinite(signal.confidence) ? signal.confidence : 0.5;
  const statusKey = typeof signal.status === 'string' ? signal.status.toLowerCase() : '';
  const statusBonus = STATUS_SCORE[statusKey] || 0;
  const recencyBonus = computeRecencyBoost(signal.confirmedAt);
  const score = Math.max(0, Math.min(1, confidence + statusBonus + recencyBonus));

  return {
    id: `${signal.id}-action`,
    action,
    bias: direction,
    urgency,
    score,
    signalId: signal.id,
    pattern: signal.pattern,
    category: signal.category,
    timeframe: signal.timeframe,
    contractCode: signal.contractCode,
    triggerPrice: signal.triggerPrice,
    source: signal.source || 'strategy',
    status: signal.status,
    keyLevels: signal.keyLevels || {},
    context: signal.context || {}
  };
}

function resolveUrgency(status) {
  const key = typeof status === 'string' ? status.toLowerCase() : '';
  if (URGENCY_NOW.has(key)) {
    return 'now';
  }
  if (URGENCY_WATCH.has(key)) {
    return 'watch';
  }
  return 'monitor';
}

function resolveActionFromDirection(direction, urgency) {
  if (direction === 'bullish') {
    return urgency === 'now' ? 'enter-long' : urgency === 'watch' ? 'monitor-long' : 'observe-long';
  }
  if (direction === 'bearish') {
    return urgency === 'now' ? 'enter-short' : urgency === 'watch' ? 'monitor-short' : 'observe-short';
  }
  return 'monitor';
}

function normalizeDirection(direction) {
  const key = typeof direction === 'string' ? direction.toLowerCase() : '';
  if (key === 'bullish' || key === 'bearish') {
    return key;
  }
  return 'neutral';
}

function computeRecencyBoost(timestamp) {
  const seconds = normalizeTimestamp(timestamp);
  if (!Number.isFinite(seconds)) {
    return 0;
  }
  const now = Math.floor(Date.now() / 1000);
  const age = Math.max(0, now - seconds);
  if (age <= 300) {
    return 0.15;
  }
  if (age <= 900) {
    return 0.1;
  }
  if (age <= 1800) {
    return 0.05;
  }
  return 0;
}

function normalizeTimestamp(value) {
  if (!Number.isFinite(value)) {
    return NaN;
  }
  if (value > 1e12) {
    return Math.floor(value / 1000);
  }
  if (value > 1e9) {
    return Math.floor(value);
  }
  return value;
}

function createStrategySignal({
  pattern,
  category,
  direction,
  status,
  timeframe,
  contractCode,
  confidence = 0.6,
  confirmedAt,
  triggerPrice,
  keyLevels = {},
  context = {},
  source = 'strategy'
}) {
  const idBase = confirmedAt || Date.now();
  return {
    id: `${pattern}-${idBase}`,
    pattern,
    category,
    direction,
    status,
    timeframe,
    contractCode,
    confidence: Math.max(0, Math.min(confidence, 1)),
    confirmedAt,
    triggerPrice,
    keyLevels,
    context,
    source
  };
}

function dedupeById(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item || !item.id) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function resolveContractCode(contract) {
  if (!contract) return undefined;
  if (typeof contract === 'string') {
    return contract;
  }
  return contract.code || contract.symbol || contract.contractCode || contract.symbolId;
}

function normalizeTimeframeKey(timeframe) {
  return typeof timeframe === 'string' ? timeframe.toLowerCase() : '';
}

function normalizeContractCode(contractCode) {
  return contractCode ? String(contractCode).toUpperCase() : '';
}

function clampRatio(value, min, max) {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0.3, Math.min(0.95, (value - min) / Math.max(max - min, 1e-6)));
}

function averageSubseries(series, start, end) {
  if (!Array.isArray(series) || !series.length) {
    return NaN;
  }
  const s = Math.max(0, start);
  const e = Math.min(series.length - 1, end);
  let total = 0;
  let count = 0;
  for (let i = s; i <= e; i += 1) {
    const value = Number(series[i]);
    if (Number.isFinite(value)) {
      total += value;
      count += 1;
    }
  }
  return count > 0 ? total / count : NaN;
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return NaN;
  }
  const sum = values.reduce((acc, value) => (Number.isFinite(value) ? acc + value : acc), 0);
  const count = values.reduce((acc, value) => (Number.isFinite(value) ? acc + 1 : acc), 0);
  return count > 0 ? sum / count : NaN;
}

function standardDeviation(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return NaN;
  }
  const mean = average(values);
  if (!Number.isFinite(mean)) {
    return NaN;
  }
  const variance = average(values.map((value) => (Number.isFinite(value) ? (value - mean) ** 2 : 0)));
  return Number.isFinite(variance) ? Math.sqrt(variance) : NaN;
}

function isMonotonic(values, increasing) {
  if (!Array.isArray(values) || values.length < 2) {
    return false;
  }
  for (let i = 1; i < values.length; i += 1) {
    if (!Number.isFinite(values[i]) || !Number.isFinite(values[i - 1])) {
      return false;
    }
    if (increasing) {
      if (values[i] <= values[i - 1]) {
        return false;
      }
    } else if (values[i] >= values[i - 1]) {
      return false;
    }
  }
  return true;
}

function assessVolumeSupport({ candles, volumeMA20 }) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return { accumulationScore: 0, distributionScore: 0 };
  }
  const lows = candles.filter((candle) => {
    const range = candle.high - candle.low;
    return Number.isFinite(range) && range > 0 && candle.close <= candle.low + range * 0.25;
  });
  const highs = candles.filter((candle) => {
    const range = candle.high - candle.low;
    return Number.isFinite(range) && range > 0 && candle.close >= candle.high - range * 0.25;
  });
  const lowVolume = average(lows.map((candle) => candle.volume));
  const highVolume = average(highs.map((candle) => candle.volume));
  const maSample = average(volumeMA20.slice(-candles.length));
  const accumulationScore = Number.isFinite(lowVolume) && Number.isFinite(maSample) && maSample > 0 ? Math.max(0, Math.min(1, lowVolume / (maSample * 1.5))) : 0;
  const distributionScore = Number.isFinite(highVolume) && Number.isFinite(maSample) && maSample > 0 ? Math.max(0, Math.min(1, highVolume / (maSample * 1.5))) : 0;
  return { accumulationScore, distributionScore };
}

function selectMaLengths(contractCode) {
  if (!contractCode) {
    return MA_LENGTHS_NQ;
  }
  return contractCode.startsWith('GC') ? MA_LENGTHS_GC : MA_LENGTHS_NQ;
}

function computeMacd(candles) {
  const fastSeries = computeEma(candles, MACD_FAST);
  const slowSeries = computeEma(candles, MACD_SLOW);
  const fastMap = new Map(fastSeries.map((point) => [point.time, point.value]));
  const slowMap = new Map(slowSeries.map((point) => [point.time, point.value]));
  const macd = candles.map((candle) => {
    const fastValue = fastMap.get(candle.time);
    const slowValue = slowMap.get(candle.time);
    if (Number.isFinite(fastValue) && Number.isFinite(slowValue)) {
      return fastValue - slowValue;
    }
    return null;
  });

  const macdSeries = macd
    .map((value, index) => (Number.isFinite(value) ? { time: candles[index].time, close: value } : null))
    .filter(Boolean);
  const signalSeries = computeEma(macdSeries, MACD_SIGNAL);
  const signalMap = new Map(signalSeries.map((point) => [point.time, point.value]));
  const signal = candles.map((candle) => signalMap.get(candle.time) ?? null);
  return { macd, signal };
}

// Extracted RSI + Keltner strategy logic
function detectRsiKeltnerStrategy({
  candles,
  atrSeries,
  rsiSeries,
  keltnerChannels,
  timeframe,
  contractCode,
  timeframeKey,
  normalizedContract
}) {
  const signals = [];
  const diagnostics = [];
  const isIntradayScope = RSI_KELTNER_TIMEFRAMES.has(timeframeKey);
  const isGoldContract = normalizedContract.startsWith('GC') || normalizedContract.startsWith('MGC');

  if (isGoldContract && isIntradayScope) {
    if (rsiSeries.length > 1 && Array.isArray(keltnerChannels.upper) && keltnerChannels.upper.length) {
      const rsiMap = new Map(rsiSeries.map((point) => [point.time, point.value]));
      const upperMap = new Map(keltnerChannels.upper.map((point) => [point.time, point.value]));
      const lowerMap = new Map(keltnerChannels.lower.map((point) => [point.time, point.value]));
      const basisMap = new Map(keltnerChannels.middle.map((point) => [point.time, point.value]));
      const lookbackStart = Math.max(1, candles.length - 150);

      for (let index = lookbackStart; index < candles.length; index += 1) {
        const candle = candles[index];
        const prev = candles[index - 1];
        if (!candle || !prev) {
          continue;
        }
        const currentRsi = rsiMap.get(candle.time);
        const prevRsi = rsiMap.get(prev.time);
        if (!Number.isFinite(currentRsi) || !Number.isFinite(prevRsi)) {
          continue;
        }

        const upper = upperMap.get(candle.time);
        const prevUpper = upperMap.get(prev.time);
        if (Number.isFinite(upper) && Number.isFinite(prevUpper)) {
          const brokeUpper = prev.close <= prevUpper && candle.close > upper;
          const crossedUp = prevRsi < RSI_KELTNER_BULL_THRESHOLD && currentRsi >= RSI_KELTNER_BULL_THRESHOLD;
          if (brokeUpper && crossedUp) {
            const lower = lowerMap.get(candle.time);
            const atrValue = Number(atrSeries[index]);
            const channelWidth = Number.isFinite(upper) && Number.isFinite(lower) ? Math.abs(upper - lower) : NaN;
            const widthRatio = Number.isFinite(channelWidth) && Number.isFinite(atrValue) && atrValue > 0
              ? Math.min(1, Math.max(channelWidth / (atrValue * 2), 0))
              : 0.3;
            const rsiDistance = Math.min(1, Math.abs(currentRsi - 50) / 40);
            const confidence = Math.max(0.55, Math.min(0.9, 0.5 + rsiDistance * 0.3 + widthRatio * 0.2));
            signals.push(
              createStrategySignal({
                pattern: 'RSI + Keltner Intraday (Gold)',
                category: 'Indicator',
                direction: 'bullish',
                status: 'confirmed',
                timeframe,
                contractCode,
                confidence,
                confirmedAt: candle.time,
                triggerPrice: candle.close,
                keyLevels: {
                  upperBand: upper,
                  lowerBand: lower,
                  basis: basisMap.get(candle.time),
                  rsi: currentRsi
                },
                context: {
                  maxLoss: RSI_KELTNER_MAX_LOSS,
                  sizeRange: { min: RSI_KELTNER_MIN_MICROS, max: RSI_KELTNER_MAX_MICROS },
                  timeframeScope: '1-5m'
                },
                source: 'strategy'
              })
            );
          }
        }

        const lower = lowerMap.get(candle.time);
        const prevLower = lowerMap.get(prev.time);
        if (Number.isFinite(lower) && Number.isFinite(prevLower)) {
          const brokeLower = prev.close >= prevLower && candle.close < lower;
          const crossedDown = prevRsi > RSI_KELTNER_BEAR_THRESHOLD && currentRsi <= RSI_KELTNER_BEAR_THRESHOLD;
          if (brokeLower && crossedDown) {
            const upperForWidth = upperMap.get(candle.time);
            const atrValue = Number(atrSeries[index]);
            const channelWidth = Number.isFinite(upperForWidth) && Number.isFinite(lower) ? Math.abs(upperForWidth - lower) : NaN;
            const widthRatio = Number.isFinite(channelWidth) && Number.isFinite(atrValue) && atrValue > 0
              ? Math.min(1, Math.max(channelWidth / (atrValue * 2), 0))
              : 0.3;
            const rsiDistance = Math.min(1, Math.abs(currentRsi - 50) / 40);
            const confidence = Math.max(0.55, Math.min(0.9, 0.5 + rsiDistance * 0.3 + widthRatio * 0.2));
            signals.push(
              createStrategySignal({
                pattern: 'RSI + Keltner Intraday (Gold)',
                category: 'Indicator',
                direction: 'bearish',
                status: 'confirmed',
                timeframe,
                contractCode,
                confidence,
                confirmedAt: candle.time,
                triggerPrice: candle.close,
                keyLevels: {
                  upperBand: upperForWidth,
                  lowerBand: lower,
                  basis: basisMap.get(candle.time),
                  rsi: currentRsi
                },
                context: {
                  maxLoss: RSI_KELTNER_MAX_LOSS,
                  sizeRange: { min: RSI_KELTNER_MIN_MICROS, max: RSI_KELTNER_MAX_MICROS },
                  timeframeScope: '1-5m'
                },
                source: 'strategy'
              })
            );
          }
        }
      }
    } else {
      diagnostics.push({
        scope: 'RSI+Keltner',
        status: 'insufficient-data',
        message: 'Need additional history to evaluate RSI + Keltner intraday strategy.'
      });
    }
  } else if (normalizedContract && isGoldContract && !isIntradayScope) {
    diagnostics.push({
      scope: 'RSI+Keltner',
      status: 'timeframe',
      message: 'RSI + Keltner intraday strategy requires a 1–5 minute chart.'
    });
  } else if (normalizedContract && !isGoldContract) {
    diagnostics.push({
      scope: 'RSI+Keltner',
      status: 'instrument',
      message: 'RSI + Keltner intraday strategy is limited to gold futures (GC/MGC).'
    });
  }

  return { rsiKeltnerSignals: signals, rsiKeltnerDiagnostics: diagnostics };
}
