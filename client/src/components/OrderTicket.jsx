import { useEffect, useMemo, useRef, useState } from 'react';
import { CONTRACTS } from '../data/contracts.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const ORDER_TYPE_OPTIONS = ['Market', 'Limit', 'Stop'];
const TIME_IN_FORCE_OPTIONS = ['Day', 'GTC', 'IOC'];
const SIDE_LABELS = { buy: 'Buy', sell: 'Sell' };
const PRICE_WINDOW_PCT = 0.08;
const MIN_PRICE_STEP = 0.01;

export default function OrderTicket({
  accounts = [],
  symbol,
  contract,
  onOrderPlaced,
  lastPrice,
  onBracketPreview,
  bracketOverride,
  selectedAccountId,
  onAccountChange
}) {
  const fallbackContracts = useMemo(() => mapContracts(CONTRACTS), []);
  const accountOptions = useMemo(() => buildAccountOptions(accounts), [accounts]);

  const [accountIdState, setAccountIdState] = useState(() => selectedAccountId ?? accountOptions[0]?.id ?? '');
  const [contracts, setContracts] = useState(fallbackContracts);
  const [selectedContractId, setSelectedContractId] = useState(() => pickInitialContractId(contract, symbol, fallbackContracts) ?? '');
  const [manualContractSelection, setManualContractSelection] = useState(false);
  const [orderType, setOrderType] = useState('Market');
  const [size, setSize] = useState(1);
  const [timeInForce, setTimeInForce] = useState('Day');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopTrigger, setStopTrigger] = useState('');
  const [takeProfitPrice, setTakeProfitPrice] = useState('');
  const [stopLossPrice, setStopLossPrice] = useState('');
  const [limitManual, setLimitManual] = useState(false);
  const [stopTriggerManual, setStopTriggerManual] = useState(false);
  const [takeProfitManual, setTakeProfitManual] = useState(false);
  const [stopLossManual, setStopLossManual] = useState(false);
  const [status, setStatus] = useState(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [contractsLoading, setContractsLoading] = useState(false);
  const overrideRevisionRef = useRef(null);

  useEffect(() => {
    if (!accountOptions.length) {
      setAccountIdState('');
      if (typeof onAccountChange === 'function') {
        onAccountChange('');
      }
      return;
    }

    setAccountIdState((prev) => {
      if (prev && accountOptions.some((option) => option.id === prev)) {
        return prev;
      }
      const next = accountOptions[0].id;
      if (typeof onAccountChange === 'function') {
        onAccountChange(next);
      }
      return next;
    });
  }, [accountOptions, onAccountChange]);

  useEffect(() => {
    if (!selectedAccountId) {
      return;
    }
    if (selectedAccountId !== accountIdState) {
      setAccountIdState(selectedAccountId);
    }
  }, [selectedAccountId, accountIdState]);

  useEffect(() => {
    let cancelled = false;
    const loadContracts = async () => {
      setContractsLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/contracts`);
        if (!response.ok) {
          throw new Error(`Contracts request failed with status ${response.status}`);
        }
        const body = await response.json();
        const next = mapContracts(body.contracts || body.items || []);
        if (!cancelled && next.length) {
          setContracts(next);
        }
      } catch (error) {
        console.warn('[client] contracts fetch failed', error);
      } finally {
        if (!cancelled) {
          setContractsLoading(false);
        }
      }
    };
    loadContracts();
    return () => {
      cancelled = true;
    };
  }, []);

  const contractKey = useMemo(
    () => toStringSafe(contract?.id ?? contract?.contractId ?? contract?.code),
    [contract?.id, contract?.contractId, contract?.code]
  );

  useEffect(() => {
    setManualContractSelection(false);
  }, [contractKey, symbol]);

  useEffect(() => {
    if (manualContractSelection) {
      return;
    }
    const derived = pickInitialContractId(contract, symbol, contracts);
    if (derived) {
      setSelectedContractId(derived);
    }
  }, [contractKey, symbol, contracts, manualContractSelection]);

  useEffect(() => {
    if (orderType === 'Market') {
      setLimitPrice('');
      setStopTrigger('');
      setLimitManual(false);
      setStopTriggerManual(false);
    } else if (orderType === 'Limit') {
      setStopTrigger('');
      setStopTriggerManual(false);
    }
  }, [orderType]);

  const selectedContract = useMemo(
    () => contracts.find((item) => item.id === selectedContractId) || null,
    [contracts, selectedContractId]
  );

  const sliderConfig = useMemo(
    () => createSliderConfig(lastPrice, selectedContract?.tickSize),
    [lastPrice, selectedContract?.tickSize]
  );

  const entryPrice = useMemo(() => {
    const limitValue = parseNumeric(limitPrice);
    const stopTriggerValue = parseNumeric(stopTrigger);
    if (orderType === 'Limit') {
      return limitValue;
    }
    if (orderType === 'Stop') {
      return stopTriggerValue ?? limitValue;
    }
    return Number.isFinite(lastPrice) ? lastPrice : undefined;
  }, [orderType, limitPrice, stopTrigger, lastPrice]);

  const priceStep = useMemo(() => {
    if (sliderConfig && Number.isFinite(sliderConfig.step)) {
      return sliderConfig.step;
    }
    return selectedContract?.tickSize || MIN_PRICE_STEP;
  }, [sliderConfig, selectedContract?.tickSize]);

  useEffect(() => {
    if (!bracketOverride) {
      return;
    }
    const revision = bracketOverride.revision ?? 0;
    if (overrideRevisionRef.current === revision) {
      return;
    }
    overrideRevisionRef.current = revision;

    if (bracketOverride.takeProfit !== undefined) {
      const numeric = Number(bracketOverride.takeProfit);
      if (Number.isFinite(numeric)) {
        setTakeProfitManual(true);
        const formatted = sliderConfig
          ? formatPrice(clampValue(numeric, sliderConfig.min, sliderConfig.max), sliderConfig.decimals)
          : String(numeric);
        setTakeProfitPrice(formatted);
      }
    }

    if (bracketOverride.stopLoss !== undefined) {
      const numeric = Number(bracketOverride.stopLoss);
      if (Number.isFinite(numeric)) {
        setStopLossManual(true);
        const formatted = sliderConfig
          ? formatPrice(clampValue(numeric, sliderConfig.min, sliderConfig.max), sliderConfig.decimals)
          : String(numeric);
        setStopLossPrice(formatted);
      }
    }
  }, [bracketOverride, sliderConfig]);

  const canSubmit = Boolean(accountIdState && selectedContractId && Number.isFinite(size) && size > 0);

  const handleLimitInputChange = (event) => {
    setLimitManual(true);
    setLimitPrice(event.target.value);
  };

  const handleStopTriggerInputChange = (event) => {
    setStopTriggerManual(true);
    setStopTrigger(event.target.value);
  };

  const handleTakeProfitInputChange = (event) => {
    const next = event.target.value;
    const numeric = parseNumeric(next);
    if (numeric === undefined) {
      setTakeProfitManual(false);
      setTakeProfitPrice('');
      return;
    }
    setTakeProfitManual(true);
    if (sliderConfig) {
      const bounded = clampValue(numeric, sliderConfig.min, sliderConfig.max);
      setTakeProfitPrice(formatPrice(bounded, sliderConfig.decimals));
    } else {
      setTakeProfitPrice(String(numeric));
    }
  };

  const handleStopLossInputChange = (event) => {
    const next = event.target.value;
    const numeric = parseNumeric(next);
    if (numeric === undefined) {
      setStopLossManual(false);
      setStopLossPrice('');
      return;
    }
    setStopLossManual(true);
    if (sliderConfig) {
      const bounded = clampValue(numeric, sliderConfig.min, sliderConfig.max);
      setStopLossPrice(formatPrice(bounded, sliderConfig.decimals));
    } else {
      setStopLossPrice(String(numeric));
    }
  };

  const formattedLastPrice = sliderConfig && Number.isFinite(lastPrice)
    ? formatPrice(lastPrice, sliderConfig.decimals)
    : null;

  useEffect(() => {
    if (typeof onBracketPreview !== 'function') {
      return;
    }
    const takeProfitValue = parseNumeric(takeProfitPrice);
    const stopLossValue = parseNumeric(stopLossPrice);
    onBracketPreview({
      takeProfit: Number.isFinite(takeProfitValue) ? takeProfitValue : null,
      stopLoss: Number.isFinite(stopLossValue) ? stopLossValue : null,
      lastPrice: Number.isFinite(lastPrice) ? lastPrice : null,
      entryPrice: Number.isFinite(entryPrice) ? entryPrice : null,
      size: Number.isFinite(size) ? size : null
    });
  }, [takeProfitPrice, stopLossPrice, lastPrice, entryPrice, size, onBracketPreview]);

  const handleSubmit = async (sideKey) => {
    if (isSubmitting) {
      return;
    }
    setStatus(null);

    if (!canSubmit) {
      setStatus({ type: 'error', message: 'Select account, contract, and size' });
      return;
    }

    const payload = {
      accountId: accountIdState,
      contractId: selectedContractId,
      size,
      quantity: size,
      orderType,
      side: SIDE_LABELS[sideKey],
      timeInForce
    };

    if (orderType === 'Limit') {
      const priceValue = parseNumeric(limitPrice);
      if (priceValue === undefined) {
        setStatus({ type: 'error', message: 'Limit price required' });
        return;
      }
      payload.limitPrice = priceValue;
      payload.price = priceValue;
    }

    if (orderType === 'Stop') {
      const stopValue = parseNumeric(stopTrigger);
      if (stopValue === undefined) {
        setStatus({ type: 'error', message: 'Stop trigger required' });
        return;
      }
      payload.stopPrice = stopValue;
      const limitValue = parseNumeric(limitPrice);
      if (limitValue !== undefined) {
        payload.limitPrice = limitValue;
      }
    }

    const takeProfitValue = takeProfitManual ? parseNumeric(takeProfitPrice) : undefined;
    if (takeProfitValue !== undefined) {
      payload.takeProfitPrice = takeProfitValue;
    }

    const stopLossValue = stopLossManual ? parseNumeric(stopLossPrice) : undefined;
    if (stopLossValue !== undefined) {
      payload.stopLossPrice = stopLossValue;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.success === false) {
        const message = body.error || body.errorMessage || `Order failed (${response.status})`;
        throw new Error(message);
      }
      setStatus({
        type: 'success',
        message: body.orderId ? `Order submitted (#${body.orderId})` : 'Order submitted'
      });
      if (typeof onOrderPlaced === 'function') {
        onOrderPlaced(body);
      }
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Order failed' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="order-ticket">
      <header>
        <h2>Order Entry</h2>
        {selectedContract ? (
          <span className="tag">{selectedContract.code}</span>
        ) : (
          <span className="tag">Bracket: Off</span>
        )}
      </header>

      <div className="field">
        <label>Account</label>
        <select
          value={accountIdState}
          onChange={(event) => {
            const nextId = event.target.value;
            setAccountIdState(nextId);
            if (typeof onAccountChange === 'function') {
              onAccountChange(nextId);
            }
          }}
          disabled={!accountOptions.length}
        >
          {accountOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {!accountOptions.length ? <span className="micro">No accounts yet</span> : null}
      </div>

      <div className="field">
        <label>Contract</label>
        <select
          value={selectedContractId}
          onChange={(event) => {
            setSelectedContractId(event.target.value);
            setManualContractSelection(true);
          }}
          disabled={!contracts.length}
        >
          {contracts.map((item) => (
            <option key={item.id} value={item.id}>
              {formatContractLabel(item)}
            </option>
          ))}
        </select>
    {contractsLoading ? <span className="micro">Refreshing...</span> : null}
      </div>

      <div className="field">
        <label>Order Type</label>
        <div className="segmented">
          {ORDER_TYPE_OPTIONS.map((type) => (
            <button
              key={type}
              className={type === orderType ? 'active' : ''}
              onClick={() => setOrderType(type)}
              type="button"
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Size</label>
        <input
          type="number"
          min="1"
          value={size}
          onChange={(event) => {
            const next = Number(event.target.value);
            setSize(Number.isFinite(next) && next > 0 ? next : 1);
          }}
        />
      </div>

      {orderType === 'Limit' || orderType === 'Stop' ? (
        <div className="field inline">
          <label>Limit Price</label>
          <input
            type="number"
            value={limitPrice}
            onChange={handleLimitInputChange}
            placeholder="Price"
            step={priceStep}
            min="0"
          />
        </div>
      ) : null}

      {orderType === 'Stop' ? (
        <div className="field inline">
          <label>Stop Trigger</label>
          <input
            type="number"
            value={stopTrigger}
            onChange={handleStopTriggerInputChange}
            placeholder="Price"
            step={priceStep}
            min="0"
          />
        </div>
      ) : null}

      <div className="field">
        <label>Time in Force</label>
        <select value={timeInForce} onChange={(event) => setTimeInForce(event.target.value)}>
          {TIME_IN_FORCE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="field inline">
        <label>
          Take Profit Price
          {formattedLastPrice ? ` (last ${formattedLastPrice})` : ''}
        </label>
        <input
          type="number"
          value={takeProfitPrice}
          onChange={handleTakeProfitInputChange}
          placeholder="Optional"
          step={priceStep}
          min="0"
        />
      </div>

      <div className="field inline">
        <label>
          Stop Loss Price
          {formattedLastPrice ? ` (last ${formattedLastPrice})` : ''}
        </label>
        <input
          type="number"
          value={stopLossPrice}
          onChange={handleStopLossInputChange}
          placeholder="Optional"
          step={priceStep}
          min="0"
        />
      </div>

      <div className="field">
        <label>Stop Loss Type</label>
        <select defaultValue="Trailing">
          <option>Trailing</option>
          <option>Fixed</option>
          <option>None</option>
        </select>
      </div>

      <div className="field">
        <label>Take Profit Type</label>
        <select defaultValue="Price">
          <option>Price</option>
          <option>Ticks</option>
          <option>None</option>
        </select>
      </div>

      <div className="field">
        <label>Bracket Calculation</label>
        <div className="bracket-grid">
          <div>
            <span className="micro">TP Basis</span>
            <select defaultValue="ATR-Based">
              <option>ATR-Based</option>
              <option>Fixed</option>
            </select>
          </div>
          <div>
            <span className="micro">Timeframe</span>
            <select defaultValue="5m">
              <option value="1m">1m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
            </select>
          </div>
          <div>
            <span className="micro">Period</span>
            <input type="number" defaultValue={14} min={1} />
          </div>
          <div>
            <span className="micro">TP Multiplier</span>
            <input type="number" defaultValue={2.0} step={0.1} />
          </div>
        </div>
        <button className="secondary" type="button">Calculate Brackets</button>
      </div>

      <div className="actions">
        <button
          className="buy"
          type="button"
          onClick={() => handleSubmit('buy')}
            disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? 'Sending...' : 'Buy'}
        </button>
        <button
          className="sell"
          type="button"
          onClick={() => handleSubmit('sell')}
            disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? 'Sending...' : 'Sell'}
        </button>
        <button className="update" type="button" disabled>
          Update Bracket
        </button>
      </div>

      {status ? <div className={`ticket-feedback ${status.type}`}>{status.message}</div> : null}
    </section>
  );
}

function buildAccountOptions(list) {
  return (list || [])
    .map((account) => {
      const id = toStringSafe(account.accountId ?? account.id);
      if (!id) {
        return null;
      }
      const label = account.displayName || account.name || account.nickname || id;
      return { id, label };
    })
    .filter(Boolean);
}

function mapContracts(list = []) {
  const result = new Map();
  list.forEach((item) => {
    const id = toStringSafe(item.contractId ?? item.id ?? item.symbolId ?? item.code);
    if (!id) {
      return;
    }
    const code = toStringSafe(item.code ?? item.symbol ?? item.contractCode ?? item.symbolId) ?? id;
    const name = item.name || item.displayName || item.description || code;
  const tickSize = parseNumeric(item.tickSize ?? item.tick_size ?? item.minimumTick);
  const tickValue = parseNumeric(item.tickValue ?? item.tick_value ?? item.tickDollarValue);
    result.set(id, {
      id,
      code,
      name,
      tickSize: tickSize || undefined,
      tickValue: tickValue || undefined
    });
  });
  return Array.from(result.values());
}

function pickInitialContractId(contract, symbol, pool = []) {
  const candidates = [
    contract?.id,
    contract?.contractId,
    contract?.code,
    symbol
  ]
    .map(toStringSafe)
    .filter(Boolean);

  for (const candidate of candidates) {
    const match = pool.find((item) => item.id === candidate || item.code === candidate);
    if (match) {
      return match.id;
    }
  }

  return pool[0]?.id;
}

function formatContractLabel(contract) {
  if (!contract) {
    return '';
  }
  return contract.name ? `${contract.code} - ${contract.name}` : contract.code;
}

function createSliderConfig(lastPrice, tickSize) {
  if (!Number.isFinite(lastPrice)) {
    return null;
  }

  const step = Number.isFinite(tickSize) && tickSize > 0 ? tickSize : MIN_PRICE_STEP;
  const decimals = deriveDecimalPlaces(step);
  const window = Math.max(Math.abs(lastPrice) * PRICE_WINDOW_PCT, step * 50);
  const min = Math.max(lastPrice - window, step);
  const max = Math.max(lastPrice + window, step);
  return {
    min,
    max,
    step,
    decimals
  };
}

function formatPrice(value, decimals) {
  if (!Number.isFinite(value)) {
    return '';
  }
  const places = Number.isInteger(decimals) ? Math.max(decimals, 0) : 2;
  return value.toFixed(places);
}

function deriveDecimalPlaces(step) {
  const text = String(step);
  if (!text.includes('.')) {
    return 0;
  }
  const decimals = text.split('.')[1];
  return decimals ? decimals.length : 0;
}

function clampValue(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (Number.isFinite(min) && value < min) {
    return min;
  }
  if (Number.isFinite(max) && value > max) {
    return max;
  }
  return value;
}

function parseNumeric(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return undefined;
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function toStringSafe(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length ? text : undefined;
}
