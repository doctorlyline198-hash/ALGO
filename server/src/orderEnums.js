const ORDER_TYPES = {
  Market: { id: 1, label: 'Market' },
  Limit: { id: 2, label: 'Limit' },
  Stop: { id: 3, label: 'Stop' },
  StopLimit: { id: 4, label: 'StopLimit' }
};

const ORDER_SIDES = {
  Buy: { id: 0, label: 'Buy' },
  Sell: { id: 1, label: 'Sell' }
};

const TIME_IN_FORCE = {
  Day: { id: 0, label: 'Day' },
  GTC: { id: 1, label: 'GTC' },
  IOC: { id: 2, label: 'IOC' },
  FOK: { id: 3, label: 'FOK' },
  GTX: { id: 4, label: 'GTX' }
};

function normalizeKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function matchById(collection, value) {
  const numeric = toNumber(value);
  return numeric === undefined
    ? undefined
    : Object.values(collection).find((item) => item.id === numeric);
}

function matchByLabel(collection, value) {
  const normalized = normalizeKey(value);
  if (!normalized) {
    return undefined;
  }
  return Object.values(collection).find((item) => normalizeKey(item.label) === normalized);
}

function resolveOrderType(value, fallback = undefined) {
  if (value && typeof value === 'object' && 'id' in value && 'label' in value) {
    return value;
  }
  return (
    matchById(ORDER_TYPES, value) ||
    matchByLabel(ORDER_TYPES, value) ||
    fallback
  );
}

function resolveOrderSide(value, fallback = undefined) {
  if (value && typeof value === 'object' && 'id' in value && 'label' in value) {
    return value;
  }
  const normalized = normalizeKey(value);
  return (
    matchById(ORDER_SIDES, value) ||
    matchByLabel(ORDER_SIDES, value) ||
    (normalized === 'long' ? ORDER_SIDES.Buy : undefined) ||
    (normalized === 'short' ? ORDER_SIDES.Sell : undefined) ||
    fallback
  );
}

function resolveTimeInForce(value, fallback = undefined) {
  if (value && typeof value === 'object' && 'id' in value && 'label' in value) {
    return value;
  }
  return (
    matchById(TIME_IN_FORCE, value) ||
    matchByLabel(TIME_IN_FORCE, value) ||
    fallback
  );
}

function inferQuantity(order = {}) {
  const candidates = [
    order.quantity,
    order.size,
    order.qty,
    order.orderSize,
    order.amount,
    order.quantityFilled
  ];
  for (const candidate of candidates) {
    const numeric = toNumber(candidate);
    if (numeric !== undefined) {
      return numeric;
    }
  }
  return undefined;
}

function toNumber(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function toStringSafe(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const stringified = String(value).trim();
  return stringified.length ? stringified : undefined;
}

function toOptionalNumber(value) {
  const numeric = toNumber(value);
  return numeric === undefined ? undefined : numeric;
}

function pruneUndefined(source) {
  return Object.entries(source).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) {
      return acc;
    }
    if (typeof value === 'number' && Number.isNaN(value)) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
}

function normalizeOrderPayload(order = {}, options = {}) {
  const defaultOrderType = options.defaultOrderType ?? ORDER_TYPES.Market;
  const defaultTimeInForce = options.defaultTimeInForce ?? TIME_IN_FORCE.Day;

  const accountId = toNumber(order.accountId ?? order.accountID ?? order.account_id);
  const contractId = toStringSafe(
    order.contractId ??
      order.contractID ??
      order.contract_id ??
      order.contract ??
      order.symbol ??
      order.code
  );
  const symbol = toStringSafe(order.symbol ?? order.code ?? order.contractCode ?? order.contractSymbol);

  const orderType = resolveOrderType(
    order.orderType ??
      order.order_type ??
      order.type ??
      order.orderTypeId ??
      order.order_type_id,
    defaultOrderType
  );
  const side = resolveOrderSide(
    order.side ??
      order.orderSide ??
      order.order_side ??
      order.direction ??
      order.sideId ??
      order.side_id
  );
  const timeInForce = resolveTimeInForce(
    order.timeInForce ??
      order.time_in_force ??
      order.tif ??
      order.timeInForceId ??
      order.time_in_force_id,
    defaultTimeInForce
  );

  const quantity = inferQuantity(order);

  const payload = {
    accountId,
    contractId,
    symbol: symbol ?? contractId,
    contractCode: symbol ?? contractId,
    size: quantity,
    quantity,
    orderType: orderType?.label,
    type: orderType?.id,
    orderTypeId: orderType?.id,
    orderSide: side?.label,
    side: side?.id,
    direction: side?.id,
    timeInForce: timeInForce?.label,
    tif: timeInForce?.id,
    tifId: timeInForce?.id,
    price: toOptionalNumber(order.price),
    limitPrice: toOptionalNumber(order.limitPrice ?? order.price),
    stopPrice: toOptionalNumber(order.stopPrice ?? order.triggerPrice),
    takeProfitPrice: toOptionalNumber(
      order.takeProfitPrice ??
        order.tpPrice ??
        order.takeProfit ??
        order.profitTarget ??
        order.takeProfitLevel
    ),
    takeProfitLimitPrice: toOptionalNumber(
      order.takeProfitLimitPrice ??
        order.takeProfitPrice ??
        order.tpPrice ??
        order.takeProfit ??
        order.profitTarget ??
        order.takeProfitLevel
    ),
    stopLossPrice: toOptionalNumber(
      order.stopLossPrice ??
        order.slPrice ??
        order.stopLoss ??
        order.stopLossLevel ??
        order.trailingStopPrice
    ),
    stopLossLimitPrice: toOptionalNumber(
      order.stopLossLimitPrice ??
        order.stopLossPrice ??
        order.slPrice ??
        order.stopLoss ??
        order.stopLossLevel ??
        order.trailingStopPrice
    ),
    takeProfitTicks: toOptionalNumber(
      order.takeProfitTicks ??
        order.tpTicks ??
        order.takeProfitOffset ??
        order.profitTargetTicks
    ),
    stopLossTicks: toOptionalNumber(
      order.stopLossTicks ??
        order.slTicks ??
        order.stopLossOffset ??
        order.trailingStopTicks
    ),
    tag: toStringSafe(order.tag),
    strategyId: toStringSafe(order.strategyId),
    parentOrderId: toStringSafe(order.parentOrderId ?? order.parentId),
    clientOrderId: toStringSafe(order.clientOrderId ?? order.clientId)
  };

  if (payload.type === ORDER_TYPES.Market.id) {
    if (payload.price === undefined) {
      payload.price = 0;
    }
    if (payload.limitPrice === undefined) {
      payload.limitPrice = 0;
    }
  }

  return pruneUndefined(payload);
}

export {
  ORDER_TYPES,
  ORDER_SIDES,
  TIME_IN_FORCE,
  normalizeOrderPayload,
  resolveOrderSide,
  resolveOrderType,
  resolveTimeInForce,
  toNumber
};
