import { logger } from './logger.js';

export class Monitor {
  constructor() {
    this.metrics = {
      trades: 0,
      quotes: 0,
      candlesCompleted: 0,
      candlesPartial: 0,
      lastTradeAt: null,
      lastQuoteAt: null,
      lastCandleAt: null,
      lastPartialAt: null,
      lastFinalizeAt: null,
      lastError: null
    };

    setInterval(() => {
      logger.info({ metrics: this.metrics }, 'Monitor heartbeat');
    }, 60_000).unref();
  }

  recordTrade() {
    this.metrics.trades += 1;
    this.metrics.lastTradeAt = new Date().toISOString();
  }

  recordQuote() {
    this.metrics.quotes += 1;
    this.metrics.lastQuoteAt = new Date().toISOString();
  }

  recordCandle({ completed }) {
    if (completed) {
      this.metrics.candlesCompleted += 1;
      this.metrics.lastCandleAt = new Date().toISOString();
    } else {
      this.metrics.candlesPartial += 1;
      this.metrics.lastPartialAt = new Date().toISOString();
    }
  }

  recordError(err, context) {
    const payload = { err: err?.message || err, context };
    this.metrics.lastError = { ...payload, at: new Date().toISOString() };
    logger.error(payload, 'Monitor captured error');
  }
}

export const monitor = new Monitor();
