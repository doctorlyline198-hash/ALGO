import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import Chart from './components/Chart.jsx';
import StatusPanel from './components/StatusPanel.jsx';
import OrderTicket from './components/OrderTicket.jsx';
import StrategyList from './components/StrategyList.jsx';
import AnalyticsSection from './components/AnalyticsSection.jsx';
import QuickCreateStrategy from './components/QuickCreateStrategy.jsx';
import RiskPanel from './components/RiskPanel.jsx';
import PositionsPanel from './components/PositionsPanel.jsx';
import TradeHistoryPanel from './components/TradeHistoryPanel.jsx';
import { CandleStream } from './lib/candleStream.js';
import { buildIndicatorPayload } from './lib/indicators.js';
import {
  strategies as strategiesSeed,
  analytics as analyticsSeed
} from './data/mockData.js';
import { resolveContract, resolveContractName } from './data/contracts.js';
import { DEFAULT_TIMEFRAME, flattenTimeframes } from './data/timeframes.js';
import { PATTERN_LIBRARY, groupByCategory } from './data/patternLibrary.js';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const DEFAULT_CONTRACT = import.meta.env.VITE_DEFAULT_CONTRACT || 'MGCZ5';
const INDICATOR_CATEGORIES = new Set(['Indicator', 'Volume', 'OrderFlow', 'Momentum', 'Volatility', 'Level', 'Target', 'Trend']);
const ALL_TIMEFRAMES = flattenTimeframes();
const DEFAULT_TIMEFRAME_SELECTION = ['1m', '5m', '15m'];
const DEFAULT_INDICATORS = ['Moving Average Cross'];
const LAYOUT_OPTIONS = [
  { value: 'single', label: 'Single', description: 'Primary chart only.' },
  { value: 'split', label: 'Split', description: 'Dual-pane workspace.' },
  { value: 'grid', label: 'Grid', description: 'Four-up matrix layout.' }
];

export default function App() {
  const [symbol, setSymbol] = useState(DEFAULT_CONTRACT);
  const [selectedTimeframes, setSelectedTimeframes] = useState(() => sortTimeframes(DEFAULT_TIMEFRAME_SELECTION));
  const [activeTimeframe, setActiveTimeframe] = useState(DEFAULT_TIMEFRAME);
  const [candles, setCandles] = useState([]);
  const [partialCandle, setPartialCandle] = useState(null);
  const [connected, setConnected] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [activeAccountId, setActiveAccountId] = useState('');
  const [analytics, setAnalytics] = useState(analyticsSeed);
  const [strategies] = useState(strategiesSeed);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [indicatorPanelOpen, setIndicatorPanelOpen] = useState(false);
  const [strategyPanelOpen, setStrategyPanelOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [selectedIndicators, setSelectedIndicators] = useState(DEFAULT_INDICATORS);
  const [selectedStrategies, setSelectedStrategies] = useState([]);
  const [layoutMode, setLayoutMode] = useState('single');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenHandlerRef = useRef(null);
  const [openOrders, setOpenOrders] = useState([]);
  const [openPositions, setOpenPositions] = useState([]);
  const [positionSummary, setPositionSummary] = useState(null);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [tradeSummary, setTradeSummary] = useState(null);
  const [liveDataLoading, setLiveDataLoading] = useState(false);
  const [bracketPreview, setBracketPreview] = useState({
    takeProfit: null,
    stopLoss: null,
    lastPrice: null,
    entryPrice: null,
    size: null
  });
  const [bracketOverride, setBracketOverride] = useState(null);

  const closePanels = useCallback(() => {
    setIndicatorPanelOpen(false);
    setStrategyPanelOpen(false);
    setLayoutMenuOpen(false);
  }, []);

  useEffect(() => {
    const stream = new CandleStream({ symbol, url: WS_URL });
    const offStatus = stream.on('status', ({ connected }) => setConnected(Boolean(connected)));
    const offSnapshot = stream.on('snapshot', ({ candles: snapshot }) => {
      const formatted = (snapshot || []).map(transformCandle);
      setCandles(formatted);
    });
    const offCandle = stream.on('candle', ({ candle }) => {
      setCandles((prev) => upsertCandle(prev, candle));
      setPartialCandle(null);
    });
    const offPartial = stream.on('partial', ({ candle }) => {
      setPartialCandle(transformCandle(candle));
    });

    return () => {
      offStatus();
      offSnapshot();
      offCandle();
      offPartial();
      stream.close();
    };
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    const contract = resolveContract(symbol);
    const body = contract
      ? { symbol: contract.code, contractId: contract.id }
      : { symbol };

    fetch(`${API_URL}/api/symbol`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).catch((error) => console.error('[client] contract switch failed', error));
  }, [symbol]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    fullscreenHandlerRef.current = handleFullscreenChange;
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      if (fullscreenHandlerRef.current) {
        document.removeEventListener('fullscreenchange', fullscreenHandlerRef.current);
      }
    };
  }, []);

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/accounts`);
      if (!res.ok) throw new Error('Failed to load accounts');
      const json = await res.json();
      setAccounts(json.accounts || []);
      if (json.accounts?.length) {
        const firstAccountId = extractAccountId(json.accounts[0]);
        if (firstAccountId) {
          setActiveAccountId((prev) => (prev ? prev : firstAccountId));
        }
        const realizedPnL = json.accounts.reduce((acc, acct) => acc + Number(acct.realizedPnL || 0), 0);
        setAnalytics((prev) => ({ ...prev, realizedPnL }));
      }
    } catch (error) {
      console.error('[client] accounts fetch failed', error);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (!accounts.length) {
      setActiveAccountId('');
      return;
    }
    setActiveAccountId((prev) => {
      if (prev && accounts.some((acct) => extractAccountId(acct) === prev)) {
        return prev;
      }
      const next = extractAccountId(accounts[0]);
      return next || prev;
    });
  }, [accounts]);

  useEffect(() => {
    if (!indicatorPanelOpen && !strategyPanelOpen && !layoutMenuOpen) {
      return;
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closePanels();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [indicatorPanelOpen, strategyPanelOpen, layoutMenuOpen, closePanels]);

  const fetchLiveData = useCallback(async () => {
    if (!activeAccountId) {
      return;
    }
    try {
      const contractMeta = resolveContract(symbol);
      const accountParam = encodeURIComponent(activeAccountId);
      const contractParam = contractMeta?.id ? `&contractId=${encodeURIComponent(contractMeta.id)}` : '';
      const [ordersRes, positionsRes, tradesRes] = await Promise.all([
        fetch(`${API_URL}/api/orders/open?accountId=${accountParam}${contractParam}`),
        fetch(`${API_URL}/api/positions/open?accountId=${accountParam}`),
        fetch(`${API_URL}/api/trades/history?accountId=${accountParam}&hours=48`)
      ]);

      if (ordersRes.ok) {
        const body = await ordersRes.json();
        setOpenOrders(Array.isArray(body.orders) ? body.orders : []);
      } else {
        setOpenOrders([]);
      }

      if (positionsRes.ok) {
        const body = await positionsRes.json();
        setOpenPositions(Array.isArray(body.positions) ? body.positions : []);
        setPositionSummary(body.summary || null);
      } else {
        setOpenPositions([]);
        setPositionSummary(null);
      }

      if (tradesRes.ok) {
        const body = await tradesRes.json();
        setTradeHistory(Array.isArray(body.trades) ? body.trades : []);
        setTradeSummary(body.summary || null);
      } else {
        setTradeHistory([]);
        setTradeSummary(null);
      }
    } catch (error) {
      console.error('[client] live data fetch failed', error);
    }
  }, [activeAccountId, symbol]);

  useEffect(() => {
    if (!activeAccountId) {
      setOpenOrders([]);
      setOpenPositions([]);
      setPositionSummary(null);
      setTradeHistory([]);
      setTradeSummary(null);
      return;
    }

    let cancelled = false;
    let timer = null;

    const run = async () => {
      setLiveDataLoading(true);
      try {
        await fetchLiveData();
      } finally {
        setLiveDataLoading(false);
        if (!cancelled) {
          timer = setTimeout(run, 5000);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [activeAccountId, fetchLiveData]);

  const chartData = useMemo(() => {
    const base = candles.slice(-400);
    if (partialCandle) {
      return [...base, partialCandle];
    }
    return base;
  }, [candles, partialCandle]);

  const resampledCandles = useMemo(
    () => resampleCandles(chartData, activeTimeframe),
    [chartData, activeTimeframe]
  );

  const lastPrice = useMemo(() => computeLastPrice(resampledCandles), [resampledCandles]);
  const accountSummary = useMemo(() => {
    const base = summarizeAccounts(accounts);
    if (!positionSummary) {
      return base;
    }
    const next = base ? { ...base } : { count: accounts.length };
    if (Number.isFinite(positionSummary.pnlValue)) {
      next.unrealized = positionSummary.pnlValue;
      next.totalPnl = (next.realized ?? 0) + positionSummary.pnlValue;
    }
    if (Number.isFinite(positionSummary.rtpl)) {
      next.rtpl = positionSummary.rtpl;
    }
    next.openPositions = positionSummary.totalSize;
    return next;
  }, [accounts, positionSummary]);
  const indicatorPayload = useMemo(
    () => buildIndicatorPayload({ selections: selectedIndicators, candles: resampledCandles }),
    [selectedIndicators, resampledCandles]
  );
  const indicatorSeries = indicatorPayload.series;
  const indicatorDiagnostics = indicatorPayload.diagnostics;

  const contract = resolveContract(symbol);
  const contractName = resolveContractName(symbol);

  const activePosition = useMemo(() => {
    if (!contract) {
      return null;
    }
    const keys = new Set([contract.id, contract.code, contract.symbolId]);
    for (const position of openPositions) {
      if (!position) continue;
      const candidates = [position.contractId, position.contractCode, position.symbol];
      if (candidates.some((value) => value && keys.has(value))) {
        return position;
      }
    }
    return null;
  }, [openPositions, contract]);

  const chartOrders = useMemo(() => {
    if (!contract) {
      return [];
    }
    const keys = new Set([contract.id, contract.code, contract.symbolId]);
    return openOrders.filter((order) => {
      if (!order) return false;
      const candidates = [order.contractId, order.contractCode, order.symbol];
      return candidates.some((value) => value && keys.has(value));
    });
  }, [openOrders, contract]);
  const indicatorOptions = useMemo(
    () => sortByName(filterIndicators(PATTERN_LIBRARY)),
    []
  );
  const strategyOptions = useMemo(
    () => sortByName(filterStrategies(PATTERN_LIBRARY)),
    []
  );

  const analyticsData = useMemo(() => {
    const next = { ...analytics };
    if (positionSummary && Number.isFinite(positionSummary.pnlValue)) {
      next.unrealizedPnL = positionSummary.pnlValue;
    }
    if (tradeSummary) {
      const roundedWinRate = Number.isFinite(tradeSummary.winRate)
        ? Math.round(tradeSummary.winRate * 100) / 100
        : undefined;
      if (Number.isFinite(roundedWinRate)) {
        next.winRate = roundedWinRate;
      }
      next.trades = tradeSummary.count;
      if (tradeSummary.wins > 0) {
        next.avgWin = tradeSummary.grossProfit / tradeSummary.wins;
      }
      if (tradeSummary.losses > 0) {
        next.avgLoss = Math.abs(tradeSummary.grossLoss) / tradeSummary.losses;
      }
      if (Number.isFinite(tradeSummary.net)) {
        next.realizedPnL = tradeSummary.net;
      }
      if (Number.isFinite(tradeSummary.grossLoss)) {
        const drawdown = Math.abs(tradeSummary.grossLoss);
        next.maxDrawdown = drawdown * -1;
      }
    }
    return next;
  }, [analytics, positionSummary, tradeSummary]);

  const handleTimeframesChange = useCallback((next) => {
  const normalized = Array.isArray(next) && next.length ? [...next] : [DEFAULT_TIMEFRAME];
  setSelectedTimeframes(sortTimeframes(normalized));
    if (!normalized.includes(activeTimeframe)) {
      setActiveTimeframe(normalized[0]);
    }
  }, [activeTimeframe]);

  const handleActiveTimeframeChange = useCallback((next) => {
    if (!next) return;
    setActiveTimeframe(next);
    if (!selectedTimeframes.includes(next)) {
      setSelectedTimeframes((prev) => sortTimeframes([...prev, next]));
    }
  }, [selectedTimeframes]);

  const toggleIndicator = useCallback((name) => {
    setSelectedIndicators((prev) => toggleItem(prev, name));
  }, []);

  const toggleStrategy = useCallback((name) => {
    setSelectedStrategies((prev) => toggleItem(prev, name));
  }, []);

  const handleAccountChange = useCallback((nextId) => {
    setActiveAccountId(nextId);
  }, []);

  const handleBracketPreview = useCallback((draft) => {
    if (!draft) {
      return;
    }
    setBracketPreview((prev) => {
      const next = {
        takeProfit: Number.isFinite(draft.takeProfit) ? draft.takeProfit : null,
        stopLoss: Number.isFinite(draft.stopLoss) ? draft.stopLoss : null,
        lastPrice: Number.isFinite(draft.lastPrice) ? draft.lastPrice : prev.lastPrice ?? null,
        entryPrice: Number.isFinite(draft.entryPrice)
          ? draft.entryPrice
          : Number.isFinite(draft.lastPrice)
            ? draft.lastPrice
            : prev.entryPrice ?? null,
        size: Number.isFinite(draft.size) ? draft.size : prev.size ?? null
      };
      if (
        prev.takeProfit === next.takeProfit &&
        prev.stopLoss === next.stopLoss &&
        prev.lastPrice === next.lastPrice &&
        prev.entryPrice === next.entryPrice &&
        prev.size === next.size
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const handleBracketDrag = useCallback((type, price) => {
    if (!Number.isFinite(price)) {
      return;
    }
    setBracketOverride({
      revision: Date.now(),
      takeProfit: type === 'takeProfit' ? price : undefined,
      stopLoss: type === 'stopLoss' ? price : undefined
    });
    setBracketPreview((prev) => ({
      ...prev,
      takeProfit: type === 'takeProfit' ? price : prev.takeProfit,
      stopLoss: type === 'stopLoss' ? price : prev.stopLoss
    }));
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.warn('[client] fullscreen toggle failed', error);
    }
  }, []);

  const handleOrderPlaced = useCallback(() => {
    fetchAccounts();
    fetchLiveData();
  }, [fetchAccounts, fetchLiveData]);

  const handleClosePosition = useCallback(
    async (position, sizeOverride) => {
      if (!activeAccountId || !position) {
        return;
      }
      const contractId = position.contractId || position.contractCode || resolveContract(symbol)?.id;
      if (!contractId) {
        return;
      }
      const effectiveSize = Number.isFinite(sizeOverride)
        ? Math.abs(Number(sizeOverride))
        : Number.isFinite(position.size)
          ? Math.abs(Number(position.size))
          : undefined;

      const payload = {
        accountId: activeAccountId,
        contractId
      };
      if (Number.isFinite(effectiveSize) && effectiveSize > 0) {
        payload.size = effectiveSize;
      }

      try {
        await fetch(`${API_URL}/api/positions/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        await fetchLiveData();
        fetchAccounts();
      } catch (error) {
        console.error('[client] position close failed', error);
      }
    },
    [activeAccountId, symbol, fetchLiveData, fetchAccounts]
  );

  const handleBracketAdjustment = useCallback(
    async ({ targetType, price, existingOrderId, size: overrideSize }) => {
      if (!activeAccountId || !Number.isFinite(price)) {
        return;
      }

      const active = activePosition;
      const contractId = active?.contractId || active?.contractCode || resolveContract(symbol)?.id;
      if (!contractId) {
        return;
      }

      const baseSize = Number.isFinite(overrideSize)
        ? Math.abs(Number(overrideSize))
        : Number.isFinite(active?.size)
          ? Math.abs(Number(active.size))
          : Number.isFinite(bracketPreview.size)
            ? Math.abs(Number(bracketPreview.size))
            : undefined;
      if (!Number.isFinite(baseSize) || baseSize <= 0) {
        return;
      }

  const direction = active?.direction || (Number.isFinite(bracketPreview.size) ? (bracketPreview.size >= 0 ? 'long' : 'short') : 'long');

      try {
        await fetch(`${API_URL}/api/brackets/adjust`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: activeAccountId,
            contractId,
            direction,
            size: baseSize,
            price,
            targetType,
            cancelOrderId: existingOrderId
          })
        });
        await fetchLiveData();
      } catch (error) {
        console.error('[client] bracket adjust failed', error);
      }
    },
    [activeAccountId, activePosition, bracketPreview.size, symbol, fetchLiveData]
  );

  const layoutSlots = useMemo(() => layoutModeToSlots(layoutMode), [layoutMode]);

  return (
    <div className={`app-shell${isFullscreen ? ' fullscreen-active' : ''}`}>
      <TopBar
        symbol={symbol}
        contract={contract}
        selectedTimeframes={selectedTimeframes}
        activeTimeframe={activeTimeframe}
        onSymbolChange={setSymbol}
        onTimeframesChange={handleTimeframesChange}
        onActiveTimeframeChange={handleActiveTimeframeChange}
        connectionStatus={connected}
      />

      <main className={`main-layout layout-${layoutMode}`}>
        <section className={`chart-wrapper layout-${layoutMode}`}>
          <div className="chart-header">
            <div>
              <h1>
                {symbol} — {contractName}
              </h1>
              <span className="sub">Streaming real-time candles · {activeTimeframe}</span>
              <ActiveChips indicators={selectedIndicators} strategies={selectedStrategies} />
              <IndicatorDiagnostics diagnostics={indicatorDiagnostics} />
            </div>
            <div className="chart-toolbar">
              <button
                type="button"
                className="toolbar-button"
                onClick={() => {
                  setIndicatorPanelOpen((prev) => !prev);
                  setStrategyPanelOpen(false);
                  setLayoutMenuOpen(false);
                }}
              >
                Indicators{selectedIndicators.length ? ` (${selectedIndicators.length})` : ''}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={() => {
                  setStrategyPanelOpen((prev) => !prev);
                  setIndicatorPanelOpen(false);
                  setLayoutMenuOpen(false);
                }}
              >
                Strategies{selectedStrategies.length ? ` (${selectedStrategies.length})` : ''}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={handleToggleFullscreen}
              >
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={() => {
                  setLayoutMenuOpen((prev) => !prev);
                  setIndicatorPanelOpen(false);
                  setStrategyPanelOpen(false);
                }}
              >
                Layout · {formatLayout(layoutMode)}
              </button>
            </div>
          </div>
          <div className="chart-grid">
            {layoutSlots.map((slot, index) => (
              <div key={slot} className={`chart-cell ${index === 0 ? 'primary' : 'placeholder'}`}>
                {index === 0 ? (
                  <Chart
                    candles={resampledCandles}
                    timeframe={activeTimeframe}
                    indicators={indicatorSeries}
                    bracket={bracketPreview}
                    contract={contract}
                    onBracketDrag={handleBracketDrag}
                    position={activePosition}
                    orders={chartOrders}
                    onBracketAdjust={handleBracketAdjustment}
                    onClosePosition={handleClosePosition}
                  />
                ) : (
                  <LayoutPlaceholder index={index} />
                )}
              </div>
            ))}
          </div>
          <div className="volume-bar" />
          {indicatorPanelOpen ? (
            <SelectionPanel
              title="Indicators"
              description="Toggle overlays and volume/order-flow studies."
              options={indicatorOptions}
              selected={selectedIndicators}
              onToggle={toggleIndicator}
              onClose={closePanels}
            />
          ) : null}
          {strategyPanelOpen ? (
            <SelectionPanel
              title="Strategies"
              description="Monitor playbooks and pattern calls."
              options={strategyOptions}
              selected={selectedStrategies}
              onToggle={toggleStrategy}
              onClose={closePanels}
            />
          ) : null}
          {layoutMenuOpen ? (
            <LayoutMenu
              active={layoutMode}
              onSelect={(value) => {
                setLayoutMode(value);
                setLayoutMenuOpen(false);
              }}
              onClose={closePanels}
            />
          ) : null}
        </section>

        <aside className="side-panels">
          <StatusPanel
            accounts={accounts}
            summary={accountSummary}
            onRefresh={fetchAccounts}
            isLoading={accountsLoading}
          />
          <OrderTicket
            accounts={accounts}
            symbol={symbol}
            contract={contract}
            onOrderPlaced={handleOrderPlaced}
            lastPrice={lastPrice}
            onBracketPreview={handleBracketPreview}
            bracketOverride={bracketOverride}
            selectedAccountId={activeAccountId}
            onAccountChange={handleAccountChange}
          />
          <QuickCreateStrategy />
          <StrategyList strategies={strategies} />
          <RiskPanel />
        </aside>
      </main>

      <AnalyticsSection analytics={analyticsData} />
      <PositionsPanel
        positions={openPositions}
        summary={positionSummary}
        isLoading={liveDataLoading}
        onClosePosition={handleClosePosition}
      />
      <TradeHistoryPanel
        trades={tradeHistory}
        summary={tradeSummary}
        isLoading={liveDataLoading}
      />
    </div>
  );
}

function ActiveChips({ indicators, strategies }) {
  if (!indicators.length && !strategies.length) {
    return null;
  }
  const indicatorList = [...indicators].sort();
  const strategyList = [...strategies].sort();
  return (
    <div className="active-chips">
      {indicatorList.map((name) => (
        <span key={`indicator-${name}`} className="chip indicator-chip">{name}</span>
      ))}
      {strategyList.map((name) => (
        <span key={`strategy-${name}`} className="chip strategy-chip">{name}</span>
      ))}
    </div>
  );
}

function IndicatorDiagnostics({ diagnostics }) {
  if (!diagnostics || diagnostics.length === 0) {
    return null;
  }

  return (
    <div className="indicator-diagnostics">
      {diagnostics.map(({ name, status, message }) => (
        <span key={name} className={`indicator-diagnostic ${status}`}>
          <span className="indicator-name">{name}</span>
          <span className="indicator-message">{message}</span>
        </span>
      ))}
    </div>
  );
}

function LayoutPlaceholder({ index }) {
  return (
    <div className="chart-placeholder">
      <span className="placeholder-title">Layout slot {index + 1}</span>
      <span className="placeholder-sub">Add a secondary symbol, order flow, or depth map here.</span>
      <button type="button" className="ghost small">Configure</button>
    </div>
  );
}

function upsertCandle(prev, raw) {
  const candle = transformCandle(raw);
  if (!candle) return prev;
  const idx = prev.findIndex((item) => item.time === candle.time);
  if (idx >= 0) {
    const clone = prev.slice();
    clone[idx] = candle;
    return clone;
  }
  return [...prev, candle];
}

function transformCandle(candle) {
  if (!candle) return null;
  const time = candle.time || candle.timestamp;
  if (!time) return null;
  const epochSeconds = typeof time === 'number' ? time : Math.floor(new Date(time).getTime() / 1000);
  return {
    time: epochSeconds,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume || 0)
  };
}

function parseTimeframeToSeconds(timeframe) {
  if (typeof timeframe !== 'string') {
    return 60;
  }
  const match = timeframe.match(/(\d+)([smhd])/i);
  if (!match) {
    return 60;
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 60;
  }
}

function resampleCandles(source, timeframe) {
  if (!Array.isArray(source) || source.length === 0) {
    return [];
  }
  const interval = parseTimeframeToSeconds(timeframe);
  if (interval <= 60) {
    return source;
  }
  const buckets = new Map();
  for (const candle of source) {
    if (!candle?.time) continue;
    const bucket = Math.floor(candle.time / interval) * interval;
    if (!buckets.has(bucket)) {
      buckets.set(bucket, {
        time: bucket,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0
      });
      continue;
    }
    const target = buckets.get(bucket);
    target.high = Math.max(target.high, candle.high);
    target.low = Math.min(target.low, candle.low);
    target.close = candle.close;
    target.volume += candle.volume || 0;
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

function toggleItem(list, value) {
  if (!value) return list;
  const exists = list.includes(value);
  if (exists) {
    return list.filter((item) => item !== value);
  }
  return [...list, value];
}

function layoutModeToSlots(mode) {
  switch (mode) {
    case 'split':
      return ['primary', 'secondary'];
    case 'grid':
      return ['primary', 'secondary', 'tertiary', 'quaternary'];
    default:
      return ['primary'];
  }
}

function formatLayout(mode) {
  switch (mode) {
    case 'split':
      return 'Split';
    case 'grid':
      return 'Grid';
    default:
      return 'Single';
  }
}

function filterIndicators(items) {
  return items.filter((item) => INDICATOR_CATEGORIES.has(item.category));
}

function filterStrategies(items) {
  return items.filter((item) => !INDICATOR_CATEGORIES.has(item.category));
}

function sortByName(list) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

function sortTimeframes(list) {
  if (!Array.isArray(list)) {
    return [DEFAULT_TIMEFRAME];
  }
  const order = new Map(ALL_TIMEFRAMES.map((item, index) => [item, index]));
  return Array.from(new Set(list)).sort((a, b) => {
    const aOrder = order.has(a) ? order.get(a) : Number.POSITIVE_INFINITY;
    const bOrder = order.has(b) ? order.get(b) : Number.POSITIVE_INFINITY;
    if (aOrder === bOrder) {
      return a.localeCompare(b);
    }
    return aOrder - bOrder;
  });
}

function computeLastPrice(candles) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return null;
  }
  const last = candles[candles.length - 1];
  return Number.isFinite(last?.close) ? last.close : null;
}

function summarizeAccounts(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }

  const totals = {
    count: list.length,
    balance: 0,
    buyingPower: 0,
    realized: 0,
    unrealized: 0,
    netLiquidity: 0,
    rtpl: 0
  };

  let hasRealtime = false;

  for (const account of list) {
    const balance = safeNumber(
      account.netLiquidity ??
        account.netLiq ??
        account.balance ??
        account.accountBalance
    );
    const buyingPower = safeNumber(
      account.buyingPower ??
        account.buyingPowerIntraday ??
        account.maxPositionSize ??
        account.maxPositionValue
    );
    const realized = safeNumber(
      account.realizedPnL ??
        account.realizedProfitLoss ??
        account.realizedPL ??
        account.realized
    );
    const unrealized = safeNumber(
      account.unrealizedPnL ??
        account.unrealizedProfitLoss ??
        account.unrealizedPL ??
        account.openPnL
    );
    const netLiquidity = safeNumber(
      account.netLiquidity ??
        account.netLiq ??
        account.totalEquity ??
        balance + unrealized
    );
    const realtime = safeNumber(
      account.realTimeProfitLoss ??
        account.rtpl ??
        account.dayPnl ??
        account.dayPnL ??
        account.intradayPnL ??
        0
    );

    totals.balance += balance;
    totals.buyingPower += buyingPower;
    totals.realized += realized;
    totals.unrealized += unrealized;
    totals.netLiquidity += netLiquidity;
    totals.rtpl += realtime;
    if (realtime !== 0) {
      hasRealtime = true;
    }
  }

  if (!hasRealtime) {
    totals.rtpl = totals.realized + totals.unrealized;
  }

  totals.totalPnl = totals.realized + totals.unrealized;

  return totals;
}

function extractAccountId(account) {
  if (!account) {
    return '';
  }
  const id = account.accountId ?? account.id ?? account.accountID ?? account.account_id;
  if (id === undefined || id === null) {
    return '';
  }
  return String(id).trim();
}

function safeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function SelectionPanel({ title, description, options, selected, onToggle, onClose }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const handlePointer = (event) => {
      if (!containerRef.current || containerRef.current.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
    };
  }, [onClose]);

  const groupedEntries = useMemo(() => {
  const grouped = groupByCategory(options);
    return Object.entries(grouped).map(([category, list]) => [category, sortByName(list)]);
  }, [options]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  return (
    <div className="menu-panel" ref={containerRef}>
      <header className="menu-header">
        <div>
          <div className="menu-title">{title}</div>
          <div className="menu-sub">{description}</div>
        </div>
  <button type="button" className="ghost close" onClick={onClose} aria-label="Close panel">X</button>
      </header>
      <div className="menu-body">
        {groupedEntries.map(([category, items]) => (
          <section key={category}>
            <div className="dropdown-title">{category}</div>
            <ul className="menu-list">
              {items.map((item) => {
                const checked = selectedSet.has(item.name);
                return (
                  <li key={item.name}>
                    <label className="menu-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(item.name)}
                      />
                      <span className="option-label">{item.name}</span>
                    </label>
                    <p className="option-desc">{item.desc}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function LayoutMenu({ active, onSelect, onClose }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const handlePointer = (event) => {
      if (!containerRef.current || containerRef.current.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
    };
  }, [onClose]);

  return (
    <div className="menu-panel layout-panel" ref={containerRef}>
      <header className="menu-header">
        <div>
          <div className="menu-title">Workspace Layout</div>
          <div className="menu-sub">Choose how many panes to display.</div>
        </div>
  <button type="button" className="ghost close" onClick={onClose} aria-label="Close layout menu">X</button>
      </header>
      <ul className="menu-list layout-options">
        {LAYOUT_OPTIONS.map(({ value, label, description }) => (
          <li key={value}>
            <label className={`menu-option layout-option ${active === value ? 'active' : ''}`}>
              <input
                type="radio"
                name="layout"
                value={value}
                checked={active === value}
                onChange={() => onSelect(value)}
              />
              <div className="layout-meta">
                <span className="option-label">{label}</span>
                <span className="option-desc">{description}</span>
              </div>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
