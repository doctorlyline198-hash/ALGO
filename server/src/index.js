import http from 'http';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { TsxClient } from './tsxClient.js';
import { SignalRBridge } from './signalRBridge.js';
import { CandleAggregator } from './candleAggregator.js';
import { CandleRouter } from './candleRouter.js';
import { logger, logUnhandledErrors } from './logger.js';
import { monitor } from './monitor.js';
import { resolveContract, resolveContractCode } from './contracts.js';
import { normalizeOrderPayload, ORDER_TYPES, ORDER_SIDES } from './orderEnums.js';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const tsxClient = new TsxClient();
const bridge = new SignalRBridge({ tsxClient });
const aggregator = new CandleAggregator();

const DEFAULT_TICK_SIZE = 0.25;
const DEFAULT_TICK_VALUE = 12.5;

const router = new CandleRouter({
  server,
  path: '/ws',
  getSnapshot: (symbol) => aggregator.getSnapshot(symbol)
});

aggregator.on('seed', (event) => {
  router.broadcast('snapshot', event);
});

bridge.on('trade', ({ cid, payload, contract }) => {
  const symbol = resolveSymbol({ cid, payload, contract: contract || bridge.getCurrentContract() });
  monitor.recordTrade();
  aggregator.handleTrade(symbol, payload);
});

bridge.on('quote', ({ cid, payload, contract }) => {
  const symbol = resolveSymbol({ cid, payload, contract: contract || bridge.getCurrentContract() });
  monitor.recordQuote();
  aggregator.handleQuote(symbol, payload);
});

aggregator.on('candle', (event) => {
  monitor.recordCandle({ completed: event.candle.completed });
  router.broadcast('candle', event);
  logger.debug({ event }, 'Completed candle broadcast');
});

aggregator.on('partial', (event) => {
  monitor.recordCandle({ completed: false });
  router.broadcast('partial', event);
});

setInterval(() => aggregator.finalizeOpenBuckets(), 5_000).unref();

logUnhandledErrors();

bridge
  .start(config.defaultContract?.id || config.defaultContract?.code)
  .then(() => backfillHistory(bridge.getCurrentContract()))
  .catch((error) => {
    monitor.recordError(error, { phase: 'initial-bridge-start' });
    logger.error({ err: error }, 'bridge initial start failed');
  });

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    contract: bridge.getCurrentContract(),
    metrics: monitor.metrics
  });
});

app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await tsxClient.getAccounts();
    res.json({ success: true, accounts });
  } catch (error) {
    monitor.recordError(error, { route: 'GET /api/accounts' });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/accounts/search', async (req, res) => {
  const { onlyActiveAccounts = true } = req.body || {};
  try {
    const data = await tsxClient.searchAccounts({ onlyActiveAccounts });
    if (data.success === false) {
      return res.status(502).json({
        success: false,
        errorCode: data.errorCode,
        errorMessage: data.errorMessage,
        accounts: data.accounts || []
      });
    }
    res.json({ success: true, accounts: data.accounts || [] });
  } catch (error) {
    monitor.recordError(error, { route: 'POST /api/accounts/search' });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/contracts/available', async (req, res) => {
  const { live = true } = req.body || {};
  try {
    const contracts = await tsxClient.getAvailableContracts({ live });
    res.json({ success: true, contracts });
  } catch (error) {
    monitor.recordError(error, { route: 'POST /api/contracts/available' });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/contracts', async (req, res) => {
  try {
    const contracts = await tsxClient.getAvailableContracts({ live: true });
    res.json({ success: true, contracts });
  } catch (error) {
    monitor.recordError(error, { route: 'GET /api/contracts' });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/orders/open', async (req, res) => {
  const accountId = Number.parseInt(req.query.accountId, 10);
  const contractFilter = req.query.contractId || req.query.symbol || req.query.contractCode;
  if (!Number.isFinite(accountId)) {
    return res.status(400).json({ success: false, error: 'accountId is required' });
  }

  try {
    const data = await tsxClient.searchOpenOrders({ accountId });
    let orders = Array.isArray(data.orders) ? data.orders : [];
    if (contractFilter) {
      orders = orders.filter((order) => {
        const orderContract = order.contractId || order.contractCode || order.symbolId;
        return orderContract === contractFilter;
      });
    }
    const enriched = orders.map(enrichOrderWithMarketContext);
    res.json({ success: true, orders: enriched });
  } catch (error) {
    monitor.recordError(error, { route: 'GET /api/orders/open', accountId, contractId: contractFilter });
    const status = error.code ? 502 : 500;
    res.status(status).json({ success: false, error: error.message, code: error.code });
  }
});

app.get('/api/positions/open', async (req, res) => {
  const accountId = Number.parseInt(req.query.accountId, 10);
  if (!Number.isFinite(accountId)) {
    return res.status(400).json({ success: false, error: 'accountId is required' });
  }

  try {
    const data = await tsxClient.searchOpenPositions({ accountId });
    const positions = Array.isArray(data.positions) ? data.positions : [];
    const enriched = positions.map(enrichPositionWithMarketContext).filter(Boolean);
    const summary = summarizePositions(enriched);
    res.json({ success: true, positions: enriched, summary });
  } catch (error) {
    monitor.recordError(error, { route: 'GET /api/positions/open', accountId });
    const status = error.code ? 502 : 500;
    res.status(status).json({ success: false, error: error.message, code: error.code });
  }
});

app.get('/api/trades/history', async (req, res) => {
  const accountId = Number.parseInt(req.query.accountId, 10);
  if (!Number.isFinite(accountId)) {
    return res.status(400).json({ success: false, error: 'accountId is required' });
  }

  const end = req.query.end ? new Date(req.query.end) : new Date();
  const defaultLookbackHours = Number.isFinite(Number(req.query.hours)) ? Number(req.query.hours) : 48;
  const start = req.query.start ? new Date(req.query.start) : new Date(end.getTime() - defaultLookbackHours * 3_600_000);

  try {
    const data = await tsxClient.searchTrades({
      accountId,
      startTimestamp: start,
      endTimestamp: end
    });
    const tradesRaw = Array.isArray(data.trades) ? data.trades : [];
    const trades = tradesRaw.map(normalizeExecutedTrade).filter(Boolean).sort((a, b) => b.timestamp - a.timestamp);
    const summary = summarizeTrades(trades);
    res.json({ success: true, trades, summary });
  } catch (error) {
    monitor.recordError(error, { route: 'GET /api/trades/history', accountId });
    const status = error.code ? 502 : 500;
    res.status(status).json({ success: false, error: error.message, code: error.code });
  }
});

app.post('/api/positions/close', async (req, res) => {
  const { accountId, contractId, size } = req.body || {};
  const numericAccountId = Number(accountId);
  if (!Number.isFinite(numericAccountId)) {
    return res.status(400).json({ success: false, error: 'accountId is required' });
  }
  if (!contractId) {
    return res.status(400).json({ success: false, error: 'contractId is required' });
  }

  try {
    let result;
    const numericSize = Number(size);
    if (Number.isFinite(numericSize) && numericSize > 0) {
      result = await tsxClient.partialCloseContractPosition({ accountId: numericAccountId, contractId, size: numericSize });
    } else {
      result = await tsxClient.closeContractPosition({ accountId: numericAccountId, contractId });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    monitor.recordError(error, { route: 'POST /api/positions/close', accountId: numericAccountId, contractId });
    const status = error.code ? 502 : 500;
    res.status(status).json({ success: false, error: error.message, code: error.code });
  }
});

app.post('/api/brackets/adjust', async (req, res) => {
  const { accountId, contractId, direction, size, price, targetType, cancelOrderId, timeInForce } = req.body || {};
  const numericAccountId = Number(accountId);
  const numericSize = Number(size);
  const numericPrice = Number(price);
  if (!Number.isFinite(numericAccountId)) {
    return res.status(400).json({ success: false, error: 'accountId is required' });
  }
  if (!contractId) {
    return res.status(400).json({ success: false, error: 'contractId is required' });
  }
  if (!Number.isFinite(numericSize) || numericSize <= 0) {
    return res.status(400).json({ success: false, error: 'size must be greater than zero' });
  }
  if (!Number.isFinite(numericPrice)) {
    return res.status(400).json({ success: false, error: 'price is required' });
  }

  const resolvedDirection = resolvePositionDirection(direction);
  if (resolvedDirection === null) {
    return res.status(400).json({ success: false, error: 'direction must be long or short' });
  }

  const normalizedTarget = String(targetType ?? '').toLowerCase();
  const isTakeProfit = normalizedTarget === 'takeprofit' || normalizedTarget === 'tp' || normalizedTarget === 'target';
  const isStopLoss = normalizedTarget === 'stoploss' || normalizedTarget === 'sl' || normalizedTarget === 'stop';
  if (!isTakeProfit && !isStopLoss) {
    return res.status(400).json({ success: false, error: 'targetType must be takeProfit or stopLoss' });
  }

  const orderSide = resolvedDirection ? ORDER_SIDES.Sell : ORDER_SIDES.Buy;
  const basePayload = {
    accountId: numericAccountId,
    contractId,
    size: Math.abs(numericSize),
    timeInForce: timeInForce || 'GTC',
    side: orderSide.id,
    orderSide: orderSide.label,
    direction: orderSide.id,
    tag: `chart-${isTakeProfit ? 'tp' : 'sl'}`
  };

  if (isTakeProfit) {
    basePayload.orderType = ORDER_TYPES.Limit.label;
    basePayload.type = ORDER_TYPES.Limit.id;
    basePayload.orderTypeId = ORDER_TYPES.Limit.id;
    basePayload.limitPrice = numericPrice;
    basePayload.price = numericPrice;
  } else {
    basePayload.orderType = ORDER_TYPES.Stop.label;
    basePayload.type = ORDER_TYPES.Stop.id;
    basePayload.orderTypeId = ORDER_TYPES.Stop.id;
    basePayload.stopPrice = numericPrice;
    basePayload.price = numericPrice;
  }

  try {
    const cancelIdNumeric = Number(cancelOrderId);
    if (Number.isFinite(cancelIdNumeric)) {
      await tsxClient.cancelOrder({ accountId: numericAccountId, orderId: cancelIdNumeric }).catch((cancelError) => {
        logger.warn({ err: cancelError, accountId: numericAccountId, cancelOrderId: cancelIdNumeric }, 'Bracket cancel attempt failed');
      });
    }

    const result = await tsxClient.placeOrder(basePayload);
    res.json({ success: true, data: result });
  } catch (error) {
    monitor.recordError(error, {
      route: 'POST /api/brackets/adjust',
      accountId: numericAccountId,
      contractId,
      targetType: normalizedTarget
    });
    const status = error.code ? 502 : 500;
    res.status(status).json({ success: false, error: error.message, code: error.code });
  }
});

app.post('/api/orders', async (req, res) => {
  const draft = normalizeOrderPayload(req.body || {});

  if (!Number.isFinite(draft.accountId)) {
    return res.status(400).json({ success: false, error: 'accountId is required' });
  }

  if (!draft.contractId) {
    return res.status(400).json({ success: false, error: 'contractId is required' });
  }

  if (!Number.isFinite(draft.size) || draft.size <= 0) {
    return res.status(400).json({ success: false, error: 'size must be greater than zero' });
  }

  if (!Number.isFinite(draft.side)) {
    return res.status(400).json({ success: false, error: 'side is required' });
  }

  if (!Number.isFinite(draft.type)) {
    return res.status(400).json({ success: false, error: 'orderType is required' });
  }

  if (draft.type === ORDER_TYPES.Market.id) {
    const contractMeta = resolveContract(draft.contractId || draft.symbol);
    const symbolCode = contractMeta?.code || resolveContractCode(draft.symbol) || resolveContractCode(draft.contractId) || draft.symbol || draft.contractId;
    const lastPricePoint = symbolCode ? aggregator.getLastPrice(symbolCode) : null;
    const fallbackCandle = symbolCode ? aggregator.getLatestCandle(symbolCode) : null;
    const derivedPrice = pickFirstFinite(
      lastPricePoint?.price,
      fallbackCandle?.close,
      draft.price,
      draft.limitPrice
    );

    if (Number.isFinite(derivedPrice)) {
      const limitValue = Number(derivedPrice);
      draft.type = ORDER_TYPES.Limit.id;
      draft.orderType = ORDER_TYPES.Limit.label;
      draft.orderTypeId = ORDER_TYPES.Limit.id;
      draft.price = limitValue;
      draft.limitPrice = limitValue;
      draft.marketConverted = true;
      if (!draft.symbol && contractMeta?.code) {
        draft.symbol = contractMeta.code;
      }
      if (!draft.contractCode && contractMeta?.code) {
        draft.contractCode = contractMeta.code;
      }
      logger.info({ symbol: symbolCode, price: limitValue }, 'Converted market order to limit using last price');
    } else {
      draft.price = 0;
      draft.limitPrice = 0;
      logger.warn({ symbol: symbolCode }, 'Unable to derive price for market order conversion; defaulting to zero');
    }
  }

  const requiresLimitPrice = [ORDER_TYPES.Limit?.id, ORDER_TYPES.StopLimit?.id].filter((value) => Number.isFinite(value));
  if (requiresLimitPrice.includes(draft.type) && draft.limitPrice === undefined && draft.price === undefined) {
    return res.status(400).json({ success: false, error: 'price is required for this order type' });
  }

  if (draft.type === ORDER_TYPES.Stop.id && draft.stopPrice === undefined) {
    return res.status(400).json({ success: false, error: 'stopPrice is required for stop orders' });
  }

  try {
    const result = await tsxClient.placeOrder(draft);
    res.json({
      success: true,
      orderId: result.orderId || result.id,
      data: result
    });
  } catch (error) {
    monitor.recordError(error, {
      route: 'POST /api/orders',
      accountId: draft.accountId,
      contractId: draft.contractId
    });
    const status = error.code ? 502 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }
});

app.post('/api/symbol', async (req, res) => {
  const { symbol, contractId } = req.body || {};
  const target = resolveContract(contractId || symbol);
  if (!target?.id) {
    return res.status(400).json({ error: 'symbol is required' });
  }
  if (target.id === bridge.contractId) {
    return res.json({ ok: true, symbol: target.code, contractId: target.id, unchanged: true });
  }
  try {
    await bridge.start(target.id);
    await backfillHistory(target);
    res.json({ ok: true, symbol: target.code, contractId: target.id });
  } catch (error) {
    monitor.recordError(error, { route: 'POST /api/symbol', symbol: target.code, contractId: target.id });
    res.status(500).json({ error: error.message });
  }
});

server.listen(config.port, () => {
  logger.info({ port: config.port }, 'Server listening');
});

function resolveSymbol({ cid, payload, contract }) {
  const candidate =
    payload?.symbol ||
    payload?.Symbol ||
    payload?.symbolId ||
    payload?.name ||
    payload?.code ||
    payload?.contractName ||
    payload?.contractId ||
    cid ||
    contract?.code ||
    contract?.id;

  return resolveContractCode(candidate);
}

async function backfillHistory(contract) {
  const target = contract || bridge.getCurrentContract();
  if (!target?.id) {
    return;
  }

  try {
    const candles = await tsxClient.getHistoricalBars({
      contractId: target.id,
      unit: 'minute',
      unitNumber: 1,
      limit: 720,
      includePartialBar: false,
      live: false
    });

    if (candles.length) {
      aggregator.seedHistory(target.code, candles);
      logger.info({ count: candles.length, contractId: target.id, code: target.code }, 'Seeded historical candles');
    }
  } catch (error) {
    monitor.recordError(error, { phase: 'history-backfill', contractId: target.id, code: target.code });
    logger.warn({ err: error, contractId: target.id, code: target.code }, 'Historical backfill failed');
  }
}

function pickFirstFinite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return undefined;
}

function getSymbolContext(contractLike) {
  const meta = resolveContract(contractLike);
  const code = meta?.code || meta?.symbolId || contractLike;
  const tickSize = Number.isFinite(meta?.tickSize) && meta.tickSize > 0 ? Number(meta.tickSize) : DEFAULT_TICK_SIZE;
  const tickValue = Number.isFinite(meta?.tickValue) && meta.tickValue !== 0 ? Math.abs(Number(meta.tickValue)) : DEFAULT_TICK_VALUE;
  return { meta, code, tickSize, tickValue };
}

function readLastPrice(symbolCode) {
  if (!symbolCode) {
    return { price: undefined, timestamp: undefined };
  }
  const lastPoint = aggregator.getLastPrice(symbolCode);
  if (lastPoint && Number.isFinite(lastPoint.price)) {
    return { price: Number(lastPoint.price), timestamp: Number(lastPoint.timestamp) || undefined, source: lastPoint.source };
  }
  const fallback = aggregator.getLatestCandle(symbolCode);
  if (fallback && Number.isFinite(fallback.close)) {
    return {
      price: Number(fallback.close),
      timestamp: Number(fallback.timestamp) ? Number(fallback.timestamp) * 1000 : undefined,
      source: 'candle'
    };
  }
  return { price: undefined, timestamp: undefined };
}

function enrichOrderWithMarketContext(order) {
  if (!order) {
    return order;
  }
  const context = getSymbolContext(order.contractId || order.contractCode || order.symbolId || order.symbol);
  const last = readLastPrice(context.code);
  const referencePrice = pickFirstFinite(order.limitPrice, order.stopPrice, order.price);
  const size = Number.isFinite(order.size) ? Math.abs(Number(order.size)) : 0;
  let distanceTicks;
  let distanceValue;
  if (Number.isFinite(last.price) && Number.isFinite(referencePrice) && context.tickSize > 0) {
    distanceTicks = (referencePrice - last.price) / context.tickSize;
    if (size > 0) {
      distanceValue = distanceTicks * context.tickValue * size;
    } else {
      distanceValue = distanceTicks * context.tickValue;
    }
  }

  return {
    ...order,
    symbol: context.code,
    contractCode: context.meta?.code || order.contractCode || order.symbol,
    tickSize: context.tickSize,
    tickValue: context.tickValue,
    lastPrice: last.price,
    lastPriceTimestamp: last.timestamp,
    distanceTicks,
    distanceValue
  };
}

function enrichPositionWithMarketContext(position) {
  if (!position) {
    return null;
  }

  const context = getSymbolContext(position.contractId || position.symbolId || position.symbol);
  const last = readLastPrice(context.code);
  const averagePrice = pickFirstFinite(position.averagePrice, position.avgPrice, position.price, position.entryPrice);
  const size = Number.isFinite(position.size) ? Math.abs(Number(position.size)) : 0;
  const directionId = Number(position.type);
  const direction = determinePositionDirection(directionId); // 1 = Long, 2 = Short

  let pnlTicks;
  let pnlValue;
  if (Number.isFinite(last.price) && Number.isFinite(averagePrice) && context.tickSize > 0 && size > 0) {
    const priceDiff = last.price - averagePrice;
    const adjustedDiff = direction === 1 ? priceDiff : -priceDiff;
    pnlTicks = adjustedDiff / context.tickSize;
    pnlValue = pnlTicks * context.tickValue * size;
  }

  const unrealized = pickFirstFinite(position.unrealizedPnL, position.unrealizedProfitLoss, position.unrealizedPL, position.openPnL);
  const realized = pickFirstFinite(position.realizedPnL, position.realizedProfitLoss, position.realizedPL, position.realized ?? 0);
  const rtpl = Number.isFinite(pnlValue)
    ? pnlValue + (Number.isFinite(realized) ? realized : 0)
    : Number.isFinite(unrealized)
      ? unrealized
      : undefined;

  return {
    ...position,
    symbol: context.code,
    contractCode: context.meta?.code || position.contractCode || position.symbol,
    tickSize: context.tickSize,
    tickValue: context.tickValue,
    lastPrice: last.price,
    lastPriceTimestamp: last.timestamp,
    averagePrice,
    direction: direction === 1 ? 'long' : 'short',
    pnlTicks,
    pnlValue,
    rtplContribution: rtpl,
    size
  };
}

/**
 * Determines position direction based on type id.
 * @param {number} directionId
 * @returns {number} 1 for long, -1 for short
 */
function determinePositionDirection(directionId) {
  return directionId === 2 ? -1 : 1;
}

function summarizePositions(positions = []) {
  return positions.reduce(
    (acc, position) => {
      if (!position) {
        return acc;
      }
      const size = Number.isFinite(position.size) ? Number(position.size) : 0;
      const pnlTicks = Number(position.pnlTicks);
      const pnlValue = Number(position.pnlValue);
      const rtpl = Number(position.rtplContribution);
      acc.totalSize += size;
      if (Number.isFinite(pnlTicks)) {
        acc.pnlTicks += pnlTicks;
      }
      if (Number.isFinite(pnlValue)) {
        acc.pnlValue += pnlValue;
      }
      if (Number.isFinite(rtpl)) {
        acc.rtpl += rtpl;
      }
      return acc;
    },
    { totalSize: 0, pnlTicks: 0, pnlValue: 0, rtpl: 0 }
  );
}

function normalizeExecutedTrade(trade) {
  if (!trade) {
    return null;
  }
  const context = getSymbolContext(trade.contractId || trade.symbolId || trade.symbol);
  const timestamp = trade.creationTimestamp ? Date.parse(trade.creationTimestamp) : Date.now();
  const pnlValue = Number(trade.profitAndLoss ?? trade.pnl ?? trade.profit ?? 0);
  const size = Number.isFinite(trade.size) ? Math.abs(Number(trade.size)) : 0;
  const pnlTicks = context.tickValue !== 0 && size > 0 ? pnlValue / (context.tickValue * size) : undefined;
  const side = Number(trade.side);
  const direction = side === 1 ? 'sell' : 'buy';

  return {
    ...trade,
    symbol: context.code,
    contractCode: context.meta?.code || trade.contractCode || trade.symbol,
    tickSize: context.tickSize,
    tickValue: context.tickValue,
    pnlValue,
    pnlTicks,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    direction,
    size,
    isWin: pnlValue > 0
  };
}

function summarizeTrades(trades = []) {
  if (!Array.isArray(trades) || trades.length === 0) {
    return { count: 0, wins: 0, losses: 0, winRate: 0, grossProfit: 0, grossLoss: 0, net: 0 };
  }
  const summary = trades.reduce(
    (acc, trade) => {
      const pnl = Number(trade.pnlValue);
      if (Number.isFinite(pnl)) {
        acc.net += pnl;
        if (pnl > 0) {
          acc.wins += 1;
          acc.grossProfit += pnl;
        } else if (pnl < 0) {
          acc.losses += 1;
          acc.grossLoss += pnl;
        }
      }
      acc.count += 1;
      return acc;
    },
    { count: 0, wins: 0, losses: 0, grossProfit: 0, grossLoss: 0, net: 0 }
  );
  summary.winRate = summary.count > 0 ? (summary.wins / summary.count) * 100 : 0;
  return summary;
}

function resolvePositionDirection(flag) {
  if (flag === undefined || flag === null) {
    return null;
  }
  const normalized = String(flag).trim().toLowerCase();
  if (normalized === 'long' || normalized === 'buy' || normalized === '1' || normalized === 'true') {
    return true;
  }
  if (normalized === 'short' || normalized === 'sell' || normalized === '-1' || normalized === 'false') {
    return false;
  }
  return null;
}
