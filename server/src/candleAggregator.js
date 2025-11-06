import EventEmitter from 'events';
import { logger } from './logger.js';
import { monitor } from './monitor.js';
import { config } from './config.js';

const DEFAULT_MAX_HISTORY = 4320;
const MAX_HISTORY = Number.isFinite(Number(config.historyLimit)) && Number(config.historyLimit) > 0 ? Number(config.historyLimit) : DEFAULT_MAX_HISTORY;

export class CandleAggregator extends EventEmitter {
  constructor() {
    super();
    this.state = new Map(); // symbol -> { bucket, candle }
    this.history = new Map(); // symbol -> [candles]
    this.samples = { trade: false, quote: false };
    this.lastTrade = new Map();
    this.lastQuote = new Map();
  }

  seedHistory(symbol, candles = []) {
    if (!symbol || !Array.isArray(candles) || candles.length === 0) {
      return;
    }

    const normalized = candles
      .map(normalizeSeedCandle)
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (!normalized.length) {
      return;
    }

    this.state.delete(symbol);
    this.history.set(symbol, normalized.slice(-MAX_HISTORY));
    const last = normalized[normalized.length - 1];
    if (last && Number.isFinite(last.close)) {
      this.lastTrade.set(symbol, {
        price: Number(last.close),
        timestamp: Number(last.timestamp) * 1000,
        source: 'seed'
      });
    }
    this.emit('seed', { symbol, candles: this.getSnapshot(symbol) });
  }

  handleTrade(symbol, payload) {
    const trade = normalizeTrade(payload);
    if (!trade) {
      if (!this.samples.trade) {
        logger.warn({ symbol, payload }, 'Unable to normalize trade payload');
        this.samples.trade = true;
      }
      return;
    }
    this.process(symbol, trade);
  }

  handleQuote(symbol, payload) {
    const trade = normalizeTrade(payload);
    if (!trade) {
      if (!this.samples.quote) {
        logger.warn({ symbol, payload }, 'Unable to normalize quote payload');
        this.samples.quote = true;
      }
      return;
    }
    trade.quantity = 0;
    this.process(symbol, trade, true);
  }

  process(symbol, trade, isQuote = false) {
    const bucket = Math.floor(trade.timestamp / 60_000) * 60_000;
    if (isQuote) {
      this.lastQuote.set(symbol, { price: trade.price, timestamp: trade.timestamp, source: 'quote' });
    } else {
      this.lastTrade.set(symbol, { price: trade.price, timestamp: trade.timestamp, source: 'trade' });
    }
    const state = this.state.get(symbol);

    if (!state || state.bucket !== bucket) {
      if (state) {
        this.persist(symbol, state.candle, true);
        this.state.delete(symbol);
      }
      const candle = {
        timestamp: bucket / 1000,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.quantity,
        source: isQuote ? 'quote' : 'trade'
      };
      this.state.set(symbol, { bucket, candle });
      this.emit('partial', { symbol, candle: { ...candle, completed: false } });
      return;
    }

    const candle = state.candle;
    candle.high = Math.max(candle.high, trade.price);
    candle.low = Math.min(candle.low, trade.price);
    candle.close = trade.price;
    candle.volume += trade.quantity;
    candle.source = isQuote ? 'quote' : candle.source;
    this.emit('partial', { symbol, candle: { ...candle, completed: false } });
  }

  finalizeOpenBuckets(now = Date.now()) {
    for (const [symbol, state] of this.state.entries()) {
      if (!state) continue;
      if (state.bucket <= now - 60_000) {
        this.persist(symbol, state.candle, true);
        this.state.delete(symbol);
      }
    }
  }

  persist(symbol, candle, isFinal = true) {
    if (!this.history.has(symbol)) {
      this.history.set(symbol, []);
    }
    const arr = this.history.get(symbol);
    const enriched = { ...candle, completed: isFinal };
    arr.push(enriched);
    if (arr.length > MAX_HISTORY) arr.splice(0, arr.length - MAX_HISTORY);
    this.emit('candle', { symbol, candle: enriched });
    if (isFinal) {
      monitor.metrics.lastFinalizeAt = new Date().toISOString();
    }
  }

  getSnapshot(symbol) {
    return (this.history.get(symbol) || []).slice(-MAX_HISTORY);
  }

  getLatestCandle(symbol) {
    const list = this.history.get(symbol);
    if (!list || list.length === 0) {
      return null;
    }
    return list[list.length - 1];
  }

  getLastPrice(symbol) {
    if (this.lastTrade.has(symbol)) {
      return this.lastTrade.get(symbol);
    }
    if (this.lastQuote.has(symbol)) {
      return this.lastQuote.get(symbol);
    }
    const latest = this.getLatestCandle(symbol);
    if (latest && Number.isFinite(latest.close)) {
      return {
        price: Number(latest.close),
        timestamp: Number(latest.timestamp) * 1000,
        source: 'candle'
      };
    }
    return null;
  }
}

function normalizeTrade(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    const [price, quantity, timestamp] = payload;
    return normalizeTrade({ price, quantity, timestamp });
  }
  const price = firstNumber(
    payload.price,
    payload.lastPrice,
    payload.LastPrice,
    payload.tradePrice,
    payload.TradePrice,
    payload.bestBid,
    payload.bestAsk,
    payload.bid,
    payload.ask
  );
  const quantity = firstNumber(
    payload.quantity,
    payload.qty,
    payload.Quantity,
    payload.size,
    payload.Size,
    payload.volume,
    payload.Volume,
    1
  );
  const tsRaw = payload.timestamp || payload.Timestamp || payload.tradeTime || payload.TradeTime || payload.time || Date.now();
  let ts = typeof tsRaw === 'string' ? Date.parse(tsRaw) : Number(tsRaw);
  if (!Number.isFinite(ts)) {
    return null;
  }
  if (ts < 10_000_000_000) {
    ts *= 1000;
  }
  if (!price || Number.isNaN(ts)) return null;
  return {
    price: Number(price),
    quantity: Number(quantity) || 1,
    timestamp: ts || Date.now()
  };
}

function normalizeSeedCandle(payload) {
  if (!payload) return null;

  let timestamp = payload.timestamp ?? payload.time ?? payload.t;
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    timestamp = Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
  }
  if (typeof timestamp === 'number' && timestamp > 10_000_000_000) {
    timestamp = Math.floor(timestamp / 1000);
  }
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const open = firstNumber(payload.open, payload.o, payload.Open);
  const high = firstNumber(payload.high, payload.h, payload.High);
  const low = firstNumber(payload.low, payload.l, payload.Low);
  const close = firstNumber(payload.close, payload.c, payload.Close);
  const volume = firstNumber(payload.volume, payload.v, payload.Volume, 0);

  if ([open, high, low, close].some((value) => value === undefined)) {
    return null;
  }

  return {
    timestamp: Number(timestamp),
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume || 0),
    completed: payload.completed === false ? false : true,
    source: payload.source || 'history'
  };
}

function firstNumber(...values) {
  for (const val of values) {
    if (val === undefined || val === null) continue;
    const num = Number(val);
    if (!Number.isNaN(num)) {
      return num;
    }
  }
  return undefined;
}
