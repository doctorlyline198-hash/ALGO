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
import MutatingConfirmationPanel from './components/MutatingConfirmationPanel.jsx';
import { CandleStream } from './lib/candleStream.js';
import { buildIndicatorPayload } from './lib/indicators.js';
import PatternSignalsPanel from './components/PatternSignalsPanel.jsx';
import IndicatorSignalsPanel from './components/IndicatorSignalsPanel.jsx';
import StrategySignalsPanel from './components/StrategySignalsPanel.jsx';
import { evaluateChartPatterns } from '@shared/patterns/index.js';
import { resampleCandles } from '@shared/utils/timeframes.js';
import {
  strategies as strategiesSeed,
  analytics as analyticsSeed
} from './data/mockData.js';
import { resolveContract, resolveContractName } from './data/contracts.js';
import { DEFAULT_TIMEFRAME, flattenTimeframes } from './data/timeframes.js';
import { PATTERN_LIBRARY, groupByCategory } from './data/patternLibrary.js';
import { evaluateStrategies } from './lib/strategyEngine.js';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const DEFAULT_CONTRACT = import.meta.env.VITE_DEFAULT_CONTRACT || 'MGCZ5';
const INDICATOR_CATEGORIES = new Set(['Indicator', 'Volume', 'OrderFlow', 'Momentum', 'Volatility', 'Level', 'Target', 'Trend']);
const INDICATOR_NAME_OVERRIDES = new Set(['Fair Value Gap', 'Order Block', 'Break of Structure', 'Change of Character']);
const MAX_DISPLAY_CANDLES = normalizeDisplayDepth(import.meta.env.VITE_CHART_MAX_CANDLES, 4320);
const ALL_TIMEFRAMES = flattenTimeframes();
const DEFAULT_TIMEFRAME_SELECTION = ['1m', '5m', '15m'];
const DEFAULT_INDICATORS = ['Moving Average Cross'];
const LAYOUT_OPTIONS = [
  { value: 'single', label: 'Single', description: 'Primary chart only.' },
  { value: 'split', label: 'Split', description: 'Dual-pane workspace.' },
  { value: 'grid', label: 'Grid', description: 'Four-up matrix layout.' }
];
const DEFAULT_BRACKET_TICK = 0.25;
const MUTATION_API_URL = import.meta.env.VITE_MUTATION_API_URL || 'http://localhost:8000';

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
  const [patternPanelOpen, setPatternPanelOpen] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);
  const [selectedPatternNames, setSelectedPatternNames] = useState(() => PATTERN_LIBRARY.map((p) => p.name));
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
  const [mutatingStatus, setMutatingStatus] = useState(null);
  const [mutatingBots, setMutatingBots] = useState([]);
  const [mutatingTrades, setMutatingTrades] = useState([]);
  const [mutatingLoading, setMutatingLoading] = useState(false);
  const [mutatingError, setMutatingError] = useState(null);
  const [mutatingSettings, setMutatingSettings] = useState(null);
  const [mutatingSignals, setMutatingSignals] = useState([]);
  const [mutatingOpenTrades, setMutatingOpenTrades] = useState([]);
  const [mutatingHalted, setMutatingHalted] = useState(false);
  const [mutatingUpdatingSettings, setMutatingUpdatingSettings] = useState(false);

  const closePanels = useCallback(() => {
    setIndicatorPanelOpen(false);
    setStrategyPanelOpen(false);
    setLayoutMenuOpen(false);
  }, []);

  useEffect(() => {
    console.log('[App] Switching to symbol:', symbol);
    let stream = new CandleStream({ symbol, url: WS_URL });
    let isActive = true;
    const offStatus = stream.on('status', ({ connected }) => {
      if (isActive) setConnected(Boolean(connected));
      console.log('[App] CandleStream status:', connected ? 'connected' : 'disconnected');
    });
    const offSnapshot = stream.on('snapshot', ({ candles: snapshot }) => {
      if (!isActive) return;
      const formatted = coalesceCandles((snapshot || []).map(transformCandle));
      console.log('[App] Received snapshot for symbol', symbol, 'candles:', formatted.length);
      setCandles(formatted);
    });
    const offCandle = stream.on('candle', ({ candle }) => {
      if (!isActive) return;
  setCandles((prev) => upsertCandle(prev, candle));
      setPartialCandle(null);
      console.log('[App] Received live candle for symbol', symbol, candle);
    });
    const offPartial = stream.on('partial', ({ candle }) => {
      if (!isActive) return;
      setPartialCandle(transformCandle(candle));
      console.log('[App] Received partial candle for symbol', symbol, candle);
    });

    return () => {
      isActive = false;
      offStatus();
      offSnapshot();
      offCandle();
      offPartial();
      stream.close();
      stream = null;
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

  const fetchMutatingData = useCallback(async () => {
    if (!MUTATION_API_URL) {
      return;
    }
    setMutatingLoading(true);
    try {
      const [statusResult, botsResult, tradesResult, signalsResult] = await Promise.allSettled([
        fetch(`${MUTATION_API_URL}/status`, { cache: 'no-store' }),
        fetch(`${MUTATION_API_URL}/bots`, { cache: 'no-store' }),
        fetch(`${MUTATION_API_URL}/paper_trades?limit=25`, { cache: 'no-store' }),
        fetch(`${MUTATION_API_URL}/signals?limit=50`, { cache: 'no-store' })
      ]);

      const errors = [];

      let nextStatus = null;
      if (statusResult.status === 'fulfilled') {
        if (statusResult.value.ok) {
          nextStatus = await statusResult.value.json();
        } else {
          errors.push(`Status ${statusResult.value.status}`);
        }
      } else if (statusResult.status === 'rejected') {
        const message = statusResult.reason?.message || 'Status request failed';
        errors.push(message);
      }
      setMutatingStatus(nextStatus);
      if (nextStatus) {
        setMutatingSettings(nextStatus.settings || null);
        setMutatingHalted(Boolean(nextStatus.halted));
        setMutatingOpenTrades(Array.isArray(nextStatus.open_trades) ? nextStatus.open_trades : []);
      } else {
        setMutatingSettings(null);
        setMutatingHalted(false);
        setMutatingOpenTrades([]);
      }

      let nextBots = [];
      if (botsResult.status === 'fulfilled') {
        if (botsResult.value.ok) {
          const payload = await botsResult.value.json();
          nextBots = Array.isArray(payload?.bots) ? payload.bots : [];
        } else {
          errors.push(`Bots ${botsResult.value.status}`);
        }
      } else if (botsResult.status === 'rejected') {
        const message = botsResult.reason?.message || 'Bots request failed';
        errors.push(message);
      }
      setMutatingBots(nextBots);

      let nextTrades = [];
      if (tradesResult.status === 'fulfilled') {
        if (tradesResult.value.ok) {
          const payload = await tradesResult.value.json();
          nextTrades = Array.isArray(payload?.trades) ? payload.trades : [];
        } else {
          errors.push(`Trades ${tradesResult.value.status}`);
        }
      } else if (tradesResult.status === 'rejected') {
        const message = tradesResult.reason?.message || 'Trades request failed';
        errors.push(message);
      }
      setMutatingTrades(nextTrades);

      if (signalsResult.status === 'fulfilled') {
        if (signalsResult.value.ok) {
          const payload = await signalsResult.value.json();
          setMutatingSignals(Array.isArray(payload?.signals) ? payload.signals : []);
        } else {
          errors.push(`Signals ${signalsResult.value.status}`);
          setMutatingSignals([]);
        }
      } else if (signalsResult.status === 'rejected') {
        const message = signalsResult.reason?.message || 'Signals request failed';
        errors.push(message);
        setMutatingSignals([]);
      }

      setMutatingError(errors.length ? errors.join(' | ') : null);
    } catch (error) {
      setMutatingStatus(null);
      setMutatingBots([]);
      setMutatingTrades([]);
      setMutatingError(error.message || 'Mutating engine request failed');
    } finally {
      setMutatingLoading(false);
    }
  }, []);

  const handleMutatingSettingsUpdate = useCallback(
    async (updates) => {
      if (!MUTATION_API_URL || !updates || typeof updates !== 'object') {
        return;
      }
      setMutatingUpdatingSettings(true);
      try {
        const response = await fetch(`${MUTATION_API_URL}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        if (!response.ok) {
          throw new Error(`Settings ${response.status}`);
        }
        const payload = await response.json();
        setMutatingSettings(payload?.settings || null);
        setMutatingHalted(Boolean(payload?.halted));
        setMutatingOpenTrades(Array.isArray(payload?.open_trades) ? payload.open_trades : []);
        setMutatingStatus((prev) => (prev ? { ...prev, settings: payload?.settings || prev.settings, stats: payload?.stats || prev.stats, halted: payload?.halted, open_trades: payload?.open_trades ?? prev.open_trades } : payload));
      } catch (error) {
        setMutatingError((prev) => (prev ? `${prev} | ${error.message}` : error.message));
      } finally {
        setMutatingUpdatingSettings(false);
        fetchMutatingData();
      }
    },
    [MUTATION_API_URL, fetchMutatingData]
  );

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

  useEffect(() => {
    if (!MUTATION_API_URL) {
      return;
    }
    let cancelled = false;
    let timer = null;

    const run = async () => {
      await fetchMutatingData();
      if (!cancelled) {
        timer = setTimeout(run, 15000);
      }
    };

    run();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [fetchMutatingData, MUTATION_API_URL]);

  const chartData = useMemo(() => {
    const base = candles.slice(-MAX_DISPLAY_CANDLES);
    if (partialCandle && Number.isFinite(partialCandle.time)) {
      if (base.length && base[base.length - 1]?.time === partialCandle.time) {
        const next = base.slice();
        next[next.length - 1] = partialCandle;
        return next;
      }
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
  const contract = useMemo(() => resolveContract(symbol), [symbol]);
  const indicatorPayload = useMemo(
    () =>
      buildIndicatorPayload({
        selections: selectedIndicators,
        candles: resampledCandles,
        timeframe: activeTimeframe,
        contract
      }),
    [selectedIndicators, resampledCandles, activeTimeframe, contract]
  );
  const indicatorSeries = indicatorPayload.series;
  const indicatorZones = indicatorPayload.zones || [];
  const indicatorSignals = indicatorPayload.signals || [];
  // debug: log indicator zone counts
  try {
    console.debug('[App] indicator zones:', Array.isArray(indicatorZones) ? indicatorZones.length : 0);
    console.debug('[App] indicator signals:', Array.isArray(indicatorSignals) ? indicatorSignals.length : 0);
  } catch (e) {}
  const indicatorDiagnostics = indicatorPayload.diagnostics;

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
  const patternSignals = useMemo(
    () => evaluateChartPatterns({ candles: resampledCandles, timeframe: activeTimeframe, contract }),
    [resampledCandles, activeTimeframe, contract]
  );

  const selectedPatternSet = useMemo(() => new Set(Array.isArray(selectedPatternNames) ? selectedPatternNames : []), [selectedPatternNames]);
  const indicatorOptions = useMemo(
    () => sortByName(filterIndicators(PATTERN_LIBRARY)),
    []
  );
  const strategyOptions = useMemo(
    () => sortByName(filterStrategies(PATTERN_LIBRARY)),
    []
  );
  const strategyBundle = useMemo(
    () =>
      evaluateStrategies({
        candles: resampledCandles,
        timeframe: activeTimeframe,
        contract,
        indicatorPayload,
        patternSignals
      }),
    [resampledCandles, activeTimeframe, contract, indicatorPayload, patternSignals]
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

  const handleSymbolChange = useCallback((next) => {
    if (!next) {
      return;
    }
    setSymbol((prev) => {
      const trimmed = String(next).trim();
      return trimmed.length ? trimmed : prev;
    });
  }, []);

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

    if (type === 'entry') {
      setBracketPreview((prev) => {
        const reference = Number.isFinite(prev.lastPrice) ? prev.lastPrice : price;
        const defaults = computeBracketDefaults({ entry: price, reference, contract });
        return {
          ...prev,
          entryPrice: price,
          lastPrice: reference,
          takeProfit: Number.isFinite(prev.takeProfit) ? prev.takeProfit : defaults.takeProfit,
          stopLoss: Number.isFinite(prev.stopLoss) ? prev.stopLoss : defaults.stopLoss
        };
      });
      setBracketOverride((prev) => ({
        ...prev,
        revision: Date.now(),
        entryPrice: price
      }));
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
  }, [contract]);

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

      const fallbackDirection = Number.isFinite(bracketPreview.size) && bracketPreview.size < 0 ? 'short' : 'long';
      const direction = active?.direction || fallbackDirection;

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
        onSymbolChange={handleSymbolChange}
        selectedTimeframes={selectedTimeframes}
        onTimeframesChange={handleTimeframesChange}
        activeTimeframe={activeTimeframe}
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
                onClick={() => {
                  setPatternPanelOpen((prev) => !prev);
                  setIndicatorPanelOpen(false);
                  setStrategyPanelOpen(false);
                  setLayoutMenuOpen(false);
                }}
              >
                Patterns{patternSignals.length ? ` (${patternSignals.length})` : ''}{showPatterns ? '' : ' (hidden)'}
              </button>
              <button
                type="button"
                className="toolbar-button"
                aria-pressed={showPatterns}
                onClick={() => setShowPatterns((prev) => !prev)}
              >
                {showPatterns ? 'Hide Patterns' : 'Show Patterns'}
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
                    zones={indicatorZones}
                    bracket={bracketPreview}
                    contract={contract}
                    patterns={showPatterns ? patternSignals.filter((s) => selectedPatternSet.has(s.pattern)) : []}
                    signals={indicatorSignals}
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
                {/* Patterns panel: pick which pattern names should generate live overlays */}
                {patternPanelOpen ? (
                  <SelectionPanel
                    title="Patterns"
                    description="Toggle which detected patterns produce overlays."
                    options={sortByName(PATTERN_LIBRARY)}
                    selected={selectedPatternNames}
                    onToggle={(name) => {
                      setSelectedPatternNames((prev) => toggleItem(prev, name));
                    }}
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
          <MutatingConfirmationPanel
            status={mutatingStatus}
            bots={mutatingBots}
            trades={mutatingTrades}
            settings={mutatingSettings}
            signals={mutatingSignals}
            openTrades={mutatingOpenTrades}
            halted={mutatingHalted}
            stats={mutatingStatus?.stats}
            isLoading={mutatingLoading}
            updatingSettings={mutatingUpdatingSettings}
            error={mutatingError}
            onRefresh={fetchMutatingData}
            onUpdateSettings={handleMutatingSettingsUpdate}
          />
          <PatternSignalsPanel patterns={patternSignals} />
          <StrategySignalsPanel bundle={strategyBundle} />
          <IndicatorSignalsPanel signals={indicatorSignals} />
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

function normalizeDisplayDepth(raw, fallback) {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, 10_000);
  }
  return fallback;
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
  const next = prev.slice();
  const idx = next.findIndex((item) => item.time === candle.time);
  if (idx >= 0) {
    next[idx] = mergeCandleFields(next[idx], candle);
  } else {
    next.push(candle);
  }
  next.sort((a, b) => a.time - b.time);
  return next;
}

function transformCandle(candle) {
  if (!candle) return null;
  const rawTime =
    candle.time ??
    candle.timestamp ??
    candle.t ??
    candle.startTime ??
    candle.end ??
    null;
  const epochSeconds = normalizeEpochSeconds(rawTime);
  if (!Number.isFinite(epochSeconds)) {
    return null;
  }

  const open = toNumeric(candle.open ?? candle.o ?? candle.priceOpen);
  const high = toNumeric(candle.high ?? candle.h ?? candle.priceHigh);
  const low = toNumeric(candle.low ?? candle.l ?? candle.priceLow);
  const close = toNumeric(candle.close ?? candle.c ?? candle.priceClose);
  const volume = toNumeric(candle.volume ?? candle.v ?? candle.size, 0);

  if (!areFinite(open, high, low, close)) {
    return null;
  }

  return {
    time: epochSeconds,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0
  };
}

function coalesceCandles(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  const merged = new Map();

  list.forEach((entry) => {
    if (!entry) {
      return;
    }
    const time = normalizeEpochSeconds(entry.time);
    if (!Number.isFinite(time)) {
      return;
    }
    const normalized = {
      time,
      open: toNumeric(entry.open),
      high: toNumeric(entry.high),
      low: toNumeric(entry.low),
      close: toNumeric(entry.close),
      volume: toNumeric(entry.volume, 0)
    };

    if (!areFinite(normalized.open, normalized.high, normalized.low, normalized.close)) {
      return;
    }

    if (!merged.has(time)) {
      merged.set(time, normalized);
      return;
    }

    const existing = merged.get(time);
    merged.set(time, mergeCandleFields(existing, normalized));
  });

  return Array.from(merged.values()).sort((a, b) => a.time - b.time);
}

function mergeCandleFields(base, update) {
  const next = {
    time: normalizeEpochSeconds(update.time ?? base.time)
  };

  next.open = Number.isFinite(base?.open) ? base.open : update.open;
  next.open = Number.isFinite(next.open) ? next.open : update.open;

  next.high = resolveExtrema(base?.high, update.high, Math.max);
  next.low = resolveExtrema(base?.low, update.low, Math.min);
  next.close = Number.isFinite(update.close)
    ? update.close
    : Number.isFinite(base?.close)
      ? base.close
      : update.close;

  next.volume = Number.isFinite(update.volume)
    ? update.volume
    : Number.isFinite(base?.volume)
      ? base.volume
      : update.volume;

  return next;
}

function resolveExtrema(current, candidate, reducer) {
  if (Number.isFinite(current) && Number.isFinite(candidate)) {
    return reducer(current, candidate);
  }
  if (Number.isFinite(candidate)) {
    return candidate;
  }
  if (Number.isFinite(current)) {
    return current;
  }
  return candidate;
}

function normalizeEpochSeconds(value) {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return NaN;
    }
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      return normalizeEpochSeconds(asNumber);
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : NaN;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return NaN;
    }
    const seconds = value > 1e11 ? value / 1000 : value;
    return Math.floor(seconds);
  }
  if (value && typeof value === 'object') {
    if (Number.isFinite(value.seconds)) {
      return normalizeEpochSeconds(Number(value.seconds));
    }
    if (Number.isFinite(value.millis)) {
      return normalizeEpochSeconds(Number(value.millis) / 1000);
    }
    if (Number.isFinite(value.ms)) {
      return normalizeEpochSeconds(Number(value.ms) / 1000);
    }
    if (Number.isFinite(value.timestamp)) {
      return normalizeEpochSeconds(Number(value.timestamp));
    }
  }
  return NaN;
}

function toNumeric(value, fallback = NaN) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function areFinite(...values) {
  return values.every((value) => Number.isFinite(value));
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
  return items.filter((item) => INDICATOR_CATEGORIES.has(item.category) || INDICATOR_NAME_OVERRIDES.has(item.name));
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

function computeBracketDefaults({ entry, reference, contract }) {
  if (!Number.isFinite(entry)) {
    return { takeProfit: undefined, stopLoss: undefined };
  }
  const anchor = Number.isFinite(reference) ? reference : entry;
  const tick = Number.isFinite(contract?.tickSize) && contract.tickSize > 0 ? contract.tickSize : DEFAULT_BRACKET_TICK;
  const minOffset = tick * 10;
  const percentOffset = Math.abs(anchor) * 0.005;
  const offset = Math.max(minOffset, percentOffset || tick);
  const isShort = entry >= anchor;
  if (isShort) {
    return {
      takeProfit: entry - offset,
      stopLoss: entry + offset
    };
  }
  return {
    takeProfit: entry + offset,
    stopLoss: entry - offset
  };
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
