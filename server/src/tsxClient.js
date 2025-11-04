import axios from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';
import { monitor } from './monitor.js';
import { normalizeOrderPayload, ORDER_TYPES } from './orderEnums.js';

const UNIT_ALIAS = {
  second: 1,
  seconds: 1,
  '1s': 1,
  minute: 2,
  minutes: 2,
  '1m': 2,
  hour: 3,
  hours: 3,
  '1h': 3,
  day: 4,
  days: 4,
  '1d': 4,
  week: 5,
  weeks: 5,
  '1w': 5,
  month: 6,
  months: 6,
  '1mo': 6
};

const UNIT_MS = {
  1: 1_000,
  2: 60_000,
  3: 3_600_000,
  4: 86_400_000,
  5: 604_800_000,
  6: 2_592_000_000
};

const TOKEN_REFRESH_BUFFER_MS = 60_000;

export class TsxClient {
  constructor() {
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  async post(path, body = {}, context = {}) {
    const token = await this.getToken();
    const url = `${config.apiEndpoint}${path}`;
    try {
      const response = await axios.post(url, body, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data || {};
    } catch (error) {
      monitor.recordError(error, {
        phase: context.phase || 'tsx-post',
        path,
        meta: context.meta
      });
      logger.error(
        {
          err: error,
          response: error.response?.data,
          path,
          meta: context.meta
        },
        'TSX request failed'
      );
      throw error;
    }
  }

  async getToken() {
    const now = Date.now();
    if (this.token && now < this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return this.token;
    }
    return this.authenticate();
  }

  async authenticate() {
    const url = `${config.apiEndpoint}/api/Auth/loginKey`;
    try {
      const response = await axios.post(url, {
        userName: config.username,
        apiKey: config.apiKey
      });
      const { token, expiresIn } = response.data || {};
      if (!token) {
        throw new Error('No token present in loginKey response');
      }
      this.token = token;
      this.tokenExpiresAt = Date.now() + ((expiresIn || 3600) * 1000);
      return this.token;
    } catch (error) {
      logger.warn({ err: error, response: error.response?.data }, 'TSX loginKey failed');
      if (config.password) {
        return this.authenticateWithPassword();
      }
      monitor.recordError(error, { phase: 'loginKey' });
      throw error;
    }
  }

  async authenticateWithPassword() {
    const url = `${config.apiEndpoint}/api/Auth/login`;
    const payload = {
      username: config.username,
      password: config.password,
      apiKey: config.apiKey
    };
    const response = await axios.post(url, payload);
    const { token, expiresIn } = response.data || {};
    if (!token) {
      throw new Error('No token present in login response');
    }
    this.token = token;
    this.tokenExpiresAt = Date.now() + ((expiresIn || 3600) * 1000);
    return this.token;
  }

  async getAccounts({ onlyActiveAccounts = true } = {}) {
    try {
      const data = await this.searchAccounts({ onlyActiveAccounts });
      if (data.success === false) {
        const error = new Error(data.errorMessage || 'Account search failed');
        error.code = data.errorCode;
        monitor.recordError(error, { phase: 'accounts-fetch', response: data });
        logger.error({ response: data }, 'TSX accounts fetch failed');
        throw error;
      }
      return data.accounts || [];
    } catch (error) {
      monitor.recordError(error, { phase: 'accounts-fetch' });
      logger.error({ err: error }, 'TSX accounts fetch failed');
      throw error;
    }
  }

  async searchAccounts({ onlyActiveAccounts = true } = {}) {
    return this.post(
      '/api/Account/search',
      { onlyActiveAccounts },
      { phase: 'accounts-search' }
    );
  }

  async getAvailableContracts({ live = true } = {}) {
    try {
      const data = await this.post(
        '/api/Contract/available',
        { live },
        { phase: 'contracts-available' }
      );
      if (data.success === false) {
        const error = new Error(data.errorMessage || 'Contract availability failed');
        error.code = data.errorCode;
        monitor.recordError(error, { phase: 'contracts-available', response: data });
        logger.error({ response: data }, 'TSX contract availability failed');
        throw error;
      }
      return data.contracts || data.items || [];
    } catch (error) {
      monitor.recordError(error, { phase: 'contracts-available' });
      logger.error({ err: error }, 'TSX contract availability failed');
      throw error;
    }
  }

  async searchOpenOrders({ accountId } = {}) {
    const numericAccountId = Number(accountId);
    if (!Number.isFinite(numericAccountId)) {
      throw new Error('accountId is required to search open orders');
    }

    const data = await this.post(
      '/api/Order/searchOpen',
      { accountId: numericAccountId },
      {
        phase: 'orders-open-search',
        meta: { accountId: numericAccountId }
      }
    );

    if (data.success === false) {
      const error = new Error(data.errorMessage || 'Open order search failed');
      error.code = data.errorCode;
      monitor.recordError(error, {
        phase: 'orders-open-search',
        response: data,
        meta: { accountId: numericAccountId }
      });
      logger.error({ response: data }, 'TSX open order search failed');
      throw error;
    }

    return data;
  }

  async searchOpenPositions({ accountId } = {}) {
    const numericAccountId = Number(accountId);
    if (!Number.isFinite(numericAccountId)) {
      throw new Error('accountId is required to search open positions');
    }

    const data = await this.post(
      '/api/Position/searchOpen',
      { accountId: numericAccountId },
      {
        phase: 'positions-open-search',
        meta: { accountId: numericAccountId }
      }
    );

    if (data.success === false) {
      const error = new Error(data.errorMessage || 'Open position search failed');
      error.code = data.errorCode;
      monitor.recordError(error, {
        phase: 'positions-open-search',
        response: data,
        meta: { accountId: numericAccountId }
      });
      logger.error({ response: data }, 'TSX open position search failed');
      throw error;
    }

    return data;
  }

  async searchTrades({ accountId, startTimestamp, endTimestamp } = {}) {
    const numericAccountId = Number(accountId);
    if (!Number.isFinite(numericAccountId)) {
      throw new Error('accountId is required to search trades');
    }

    const payload = {
      accountId: numericAccountId
    };

    if (startTimestamp) {
      payload.startTimestamp = new Date(startTimestamp).toISOString();
    }
    if (endTimestamp) {
      payload.endTimestamp = new Date(endTimestamp).toISOString();
    }

    const data = await this.post(
      '/api/Trade/search',
      payload,
      {
        phase: 'trades-search',
        meta: { accountId: numericAccountId }
      }
    );

    if (data.success === false) {
      const error = new Error(data.errorMessage || 'Trade history search failed');
      error.code = data.errorCode;
      monitor.recordError(error, {
        phase: 'trades-search',
        response: data,
        meta: { accountId: numericAccountId }
      });
      logger.error({ response: data }, 'TSX trade search failed');
      throw error;
    }

    return data;
  }

  async cancelOrder({ accountId, orderId } = {}) {
    const numericAccountId = Number(accountId);
    const numericOrderId = Number(orderId);
    if (!Number.isFinite(numericAccountId) || !Number.isFinite(numericOrderId)) {
      throw new Error('accountId and orderId are required to cancel an order');
    }

    const data = await this.post(
      '/api/Order/cancel',
      { accountId: numericAccountId, orderId: numericOrderId },
      {
        phase: 'order-cancel',
        meta: { accountId: numericAccountId, orderId: numericOrderId }
      }
    );

    if (data.success === false) {
      const error = new Error(data.errorMessage || 'Order cancellation failed');
      error.code = data.errorCode;
      monitor.recordError(error, {
        phase: 'order-cancel',
        response: data,
        meta: { accountId: numericAccountId, orderId: numericOrderId }
      });
      logger.error({ response: data }, 'TSX order cancellation failed');
      throw error;
    }

    return data;
  }

  async closeContractPosition({ accountId, contractId } = {}) {
    const numericAccountId = Number(accountId);
    if (!Number.isFinite(numericAccountId)) {
      throw new Error('accountId is required to close a position');
    }
    if (!contractId) {
      throw new Error('contractId is required to close a position');
    }

    const data = await this.post(
      '/api/Position/closeContract',
      { accountId: numericAccountId, contractId },
      {
        phase: 'position-close',
        meta: { accountId: numericAccountId, contractId }
      }
    );

    if (data.success === false) {
      const error = new Error(data.errorMessage || 'Position close failed');
      error.code = data.errorCode;
      monitor.recordError(error, {
        phase: 'position-close',
        response: data,
        meta: { accountId: numericAccountId, contractId }
      });
      logger.error({ response: data }, 'TSX position close failed');
      throw error;
    }

    return data;
  }

  async partialCloseContractPosition({ accountId, contractId, size } = {}) {
    const numericAccountId = Number(accountId);
    const numericSize = Number(size);
    if (!Number.isFinite(numericAccountId)) {
      throw new Error('accountId is required to partially close a position');
    }
    if (!contractId) {
      throw new Error('contractId is required to partially close a position');
    }
    if (!Number.isFinite(numericSize) || numericSize <= 0) {
      throw new Error('size must be greater than zero to partially close a position');
    }

    const data = await this.post(
      '/api/Position/partialCloseContract',
      { accountId: numericAccountId, contractId, size: numericSize },
      {
        phase: 'position-partial-close',
        meta: { accountId: numericAccountId, contractId, size: numericSize }
      }
    );

    if (data.success === false) {
      const error = new Error(data.errorMessage || 'Partial position close failed');
      error.code = data.errorCode;
      monitor.recordError(error, {
        phase: 'position-partial-close',
        response: data,
        meta: { accountId: numericAccountId, contractId, size: numericSize }
      });
      logger.error({ response: data }, 'TSX partial position close failed');
      throw error;
    }

    return data;
  }

  async placeOrder(order = {}) {
    const payload = normalizeOrderPayload(order);

    if (!Number.isFinite(payload.accountId)) {
      throw new Error('accountId is required to place an order');
    }

    if (!payload.contractId) {
      throw new Error('contractId is required to place an order');
    }

    if (!Number.isFinite(payload.size) || payload.size <= 0) {
      throw new Error('size must be greater than zero');
    }

    if (!Number.isFinite(payload.side)) {
      throw new Error('side is required to place an order');
    }

    if (!Number.isFinite(payload.type)) {
      throw new Error('order type is required to place an order');
    }

    const requiresLimitPrice = [ORDER_TYPES.Limit?.id, ORDER_TYPES.StopLimit?.id].filter((value) => Number.isFinite(value));
    if (requiresLimitPrice.includes(payload.type) && payload.limitPrice === undefined && payload.price === undefined) {
      throw new Error('price is required for this order type');
    }

    if (payload.type === ORDER_TYPES.Stop.id && payload.stopPrice === undefined) {
      throw new Error('stop price is required for stop orders');
    }

    logger.info({ payload }, 'Posting order to TSX');

    const data = await this.post('/api/Order/place', payload, {
      phase: 'order-place',
      meta: {
        accountId: payload.accountId,
        contractId: payload.contractId,
        type: payload.type,
        side: payload.side,
        size: payload.size
      }
    });
    if (data.success === false) {
      const error = new Error(data.errorMessage || 'Order placement failed');
      error.code = data.errorCode;
      monitor.recordError(error, {
        phase: 'order-place',
        response: data,
        meta: {
          accountId: payload.accountId,
          contractId: payload.contractId,
          type: payload.type,
          side: payload.side,
          size: payload.size,
          takeProfitPrice: payload.takeProfitPrice,
          stopLossPrice: payload.stopLossPrice
        }
      });
      logger.error({ response: data }, 'TSX order placement failed');
      throw error;
    }
    return data;
  }

  async getHistoricalBars({
    contractId,
    unit = 'minute',
    unitNumber = 1,
    limit = 720,
    endTime = new Date(),
    startTime,
    live = false,
    includePartialBar = false
  } = {}) {
    if (!contractId) {
      throw new Error('contractId is required for historical bars');
    }

    const unitCode = typeof unit === 'number' ? unit : UNIT_ALIAS[String(unit).toLowerCase()];
    if (!unitCode || !UNIT_MS[unitCode]) {
      throw new Error(`Unsupported historical unit: ${unit}`);
    }

    const safeEnd = new Date(endTime);
    if (Number.isNaN(safeEnd.getTime())) {
      throw new Error('Invalid endTime provided for history request');
    }

    const durationMs = Math.max(1, Number(unitNumber)) * Math.max(1, Number(limit)) * UNIT_MS[unitCode];
    const inferredStart = startTime ? new Date(startTime) : new Date(safeEnd.getTime() - durationMs);
    if (Number.isNaN(inferredStart.getTime())) {
      throw new Error('Invalid startTime provided for history request');
    }

    const body = {
      contractId,
      live,
      startTime: inferredStart.toISOString(),
      endTime: safeEnd.toISOString(),
      unit: unitCode,
      unitNumber: Number(unitNumber) || 1,
      limit: Number(limit) || 720,
      includePartialBar
    };

    try {
      const token = await this.getToken();
      const url = `${config.apiEndpoint}/api/History/retrieveBars`;
      const response = await axios.post(
        url,
        body,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const data = response.data || {};
      if (data.success === false) {
        const error = new Error(data.errorMessage || 'Historical bars request failed');
        monitor.recordError(error, { phase: 'history-fetch', response: data, request: body });
        logger.warn({ response: data, request: body }, 'TSX historical bars returned error');
        return [];
      }

      const bars = Array.isArray(data.bars) ? data.bars : [];
      return bars
        .map((bar) => normalizeBar(bar))
        .filter(Boolean)
        .sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      monitor.recordError(error, { phase: 'history-fetch', request: body });
      logger.warn({ err: error, response: error.response?.data, request: body }, 'TSX historical bars fetch failed');
      return [];
    }
  }
}

function normalizeBar(bar) {
  if (!bar) return null;
  const epochMs = Date.parse(bar.t || bar.timestamp || bar.time);
  if (Number.isNaN(epochMs)) {
    return null;
  }
  const timestamp = Math.floor(epochMs / 1000);
  const open = Number(bar.o ?? bar.open);
  const high = Number(bar.h ?? bar.high);
  const low = Number(bar.l ?? bar.low);
  const close = Number(bar.c ?? bar.close);
  const volume = Number(bar.v ?? bar.volume ?? 0);

  if ([open, high, low, close].some((value) => Number.isNaN(value))) {
    return null;
  }

  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    completed: true,
    source: 'history'
  };
}
