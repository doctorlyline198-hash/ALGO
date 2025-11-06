import { useEffect, useMemo, useState } from 'react';

const MAX_BOTS = 4;
const MAX_TRADES = 6;
const MAX_OPEN_TRADES = 6;
const MAX_SIGNALS = 12;

export default function MutatingConfirmationPanel({
  status,
  bots,
  trades,
  settings,
  signals,
  openTrades,
  halted,
  stats,
  isLoading,
  updatingSettings,
  error,
  onRefresh,
  onUpdateSettings
}) {
  const engineOnline = Boolean(status);
  const statsSnapshot = stats || {};
  const botList = useMemo(() => {
    if (!Array.isArray(bots)) {
      return [];
    }
    return bots
      .filter(Boolean)
      .slice(0, MAX_BOTS);
  }, [bots]);
  const remainingBots = Array.isArray(bots) && bots.length > MAX_BOTS ? bots.length - MAX_BOTS : 0;

  const tradeList = useMemo(() => {
    if (!Array.isArray(trades)) {
      return [];
    }
    return [...trades]
      .filter(Boolean)
      .sort((a, b) => (Number(b?.ts ?? 0) || 0) - (Number(a?.ts ?? 0) || 0))
      .slice(0, MAX_TRADES);
  }, [trades]);

  const openList = useMemo(() => {
    if (!Array.isArray(openTrades)) {
      return [];
    }
    return openTrades.filter(Boolean).slice(0, MAX_OPEN_TRADES);
  }, [openTrades]);
  const remainingOpen = Array.isArray(openTrades) && openTrades.length > MAX_OPEN_TRADES ? openTrades.length - MAX_OPEN_TRADES : 0;

  const signalList = useMemo(() => {
    if (!Array.isArray(signals)) {
      return [];
    }
    return signals.filter(Boolean).slice(0, MAX_SIGNALS);
  }, [signals]);
  const remainingSignals = Array.isArray(signals) && signals.length > MAX_SIGNALS ? signals.length - MAX_SIGNALS : 0;

  const formDefaults = useMemo(() => buildSettingsForm(settings), [settings]);
  const [formState, setFormState] = useState(formDefaults);

  useEffect(() => {
    setFormState(formDefaults);
  }, [formDefaults]);

  const pendingDiff = useMemo(() => diffSettings(formDefaults, formState), [formDefaults, formState]);
  const isDirty = Object.keys(pendingDiff).length > 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!onUpdateSettings || !isDirty) {
      return;
    }
    try {
      await onUpdateSettings(pendingDiff);
    } catch (err) {
      /* surface via parent */
    }
  };

  const handleReset = () => {
    setFormState(formDefaults);
  };

  return (
    <section className="mutating-panel">
      <header className="mutating-header">
        <div>
          <h2>Mutating Confirmation</h2>
          <span className={`status-pill ${engineOnline ? 'online' : 'offline'}`}>
            {engineOnline ? 'Online' : 'Offline'}{isLoading ? ' - Syncing' : ''}
          </span>
          {halted ? <span className="status-pill offline">Risk Halted</span> : null}
        </div>
        <button
          type="button"
          className="refresh"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh mutating engine"
        >
          {isLoading ? '...' : 'Refresh'}
        </button>
      </header>

      {error ? <div className="mutating-error">{error}</div> : null}

      <div className="mutating-summary">
        <Metric label="Generation" value={engineOnline ? formatInteger(status?.generation) : '--'} />
        <Metric label="Population" value={engineOnline ? formatInteger(status?.population_size) : '--'} />
        <Metric label="Best Score" value={engineOnline ? formatDecimal(status?.best_score) : '--'} />
        <Metric label="Paper Trades" value={engineOnline ? formatInteger(status?.paper_trades) : '--'} />
        <Metric label="Realized" value={engineOnline ? formatCurrency(statsSnapshot?.realized) : '--'} />
        <Metric label="Drawdown" value={engineOnline ? formatCurrency(statsSnapshot?.min_equity) : '--'} />
        <Metric label="Wins" value={engineOnline ? formatInteger(statsSnapshot?.wins) : '--'} />
        <Metric label="Losses" value={engineOnline ? formatInteger(statsSnapshot?.losses) : '--'} />
      </div>

      <section className="mutating-section">
        <div className="mutating-section-header">
          <h3>Engine Controls</h3>
          <span className="micro-chip">{formatModeLabel(formState.execution_mode)}</span>
        </div>
        <form className="mutating-settings" onSubmit={handleSubmit}>
          <div className="mutating-settings-grid">
            <label>
              <span className="mutating-settings-label">Execution Mode</span>
              <select
                value={formState.execution_mode}
                onChange={(event) => setFormState((prev) => ({ ...prev, execution_mode: event.target.value }))}
              >
                <option value="alerts">Alerts only</option>
                <option value="paper">Paper trading</option>
                <option value="live">Live trading</option>
              </select>
            </label>
            <label>
              <span className="mutating-settings-label">Risk Cap ($)</span>
              <input
                type="number"
                step="0.01"
                value={formState.risk_cap}
                onChange={(event) => setFormState((prev) => ({ ...prev, risk_cap: event.target.value }))}
              />
            </label>
            <label>
              <span className="mutating-settings-label">Min Contracts</span>
              <input
                type="number"
                step="1"
                min="0"
                value={formState.min_contracts}
                onChange={(event) => setFormState((prev) => ({ ...prev, min_contracts: event.target.value }))}
              />
            </label>
            <label>
              <span className="mutating-settings-label">Max Contracts</span>
              <input
                type="number"
                step="1"
                min="0"
                value={formState.max_contracts}
                onChange={(event) => setFormState((prev) => ({ ...prev, max_contracts: event.target.value }))}
              />
            </label>
            <label>
              <span className="mutating-settings-label">Live Account</span>
              <input
                type="text"
                placeholder="account id"
                value={formState.live_account_id}
                onChange={(event) => setFormState((prev) => ({ ...prev, live_account_id: event.target.value }))}
              />
            </label>
            <label>
              <span className="mutating-settings-label">Live Contract</span>
              <input
                type="text"
                placeholder="contract id"
                value={formState.live_contract_id}
                onChange={(event) => setFormState((prev) => ({ ...prev, live_contract_id: event.target.value }))}
              />
            </label>
            <label className="mutating-settings-span">
              <span className="mutating-settings-label">Live Endpoint</span>
              <input
                type="text"
                placeholder="http://..."
                value={formState.live_endpoint}
                onChange={(event) => setFormState((prev) => ({ ...prev, live_endpoint: event.target.value }))}
              />
            </label>
            <label>
              <span className="mutating-settings-label">Time in Force</span>
              <input
                type="text"
                placeholder="Day"
                value={formState.time_in_force}
                onChange={(event) => setFormState((prev) => ({ ...prev, time_in_force: event.target.value }))}
              />
            </label>
            <label className="mutating-settings-checkbox">
              <input
                type="checkbox"
                checked={Boolean(formState.show_signals)}
                onChange={(event) => setFormState((prev) => ({ ...prev, show_signals: event.target.checked }))}
              />
              <span>Log signals to feed</span>
            </label>
          </div>
          <div className="mutating-settings-actions">
            <button
              type="button"
              className="ghost"
              onClick={handleReset}
              disabled={!isDirty || updatingSettings}
            >
              Reset
            </button>
            <button
              type="submit"
              className="refresh"
              disabled={!isDirty || updatingSettings}
            >
              {updatingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </section>

      <section className="mutating-section">
        <div className="mutating-section-header">
          <h3>Bots</h3>
          <span className="micro-chip">{formatInteger(Array.isArray(bots) ? bots.length : 0)} total</span>
        </div>
        {botList.length === 0 ? (
          <div className="placeholder">No bots registered yet.</div>
        ) : (
          <ul className="mutating-bot-list">
            {botList.map((bot) => {
              const active = Boolean(bot?.active);
              const state = bot?.state ?? {};
              const wins = Number(state?.wins ?? 0);
              const losses = Number(state?.losses ?? 0);
              const totalTrades = wins + losses;
              const winRate = totalTrades > 0 ? formatDecimal((wins / totalTrades) * 100, 1) + '%' : '--';
              return (
                <li key={bot.name} className={`mutating-bot ${active ? 'active' : 'inactive'}`}>
                  <div className="mutating-bot-main">
                    <span className="mutating-bot-name">{bot.name}</span>
                    <span className={`mutating-bot-state ${active ? 'active' : 'inactive'}`}>
                      {active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="mutating-bot-meta">
                    <span>Risk {formatPercent(bot?.risk_fraction)}</span>
                    <span>Cap {formatCurrency(bot?.capital)}</span>
                    <span>Size &lt;= {formatDecimal(bot?.max_size)}</span>
                  </div>
                  <div className="mutating-bot-meta">
                    <span>Wins {wins}</span>
                    <span>Losses {losses}</span>
                    <span>Win% {winRate}</span>
                  </div>
                  <div className="mutating-bot-time">Last trade {formatTimestamp(state?.last_trade_ts)}</div>
                </li>
              );
            })}
          </ul>
        )}
        {remainingBots > 0 ? <div className="mutating-note">+{remainingBots} more bots registered.</div> : null}
      </section>

      <section className="mutating-section">
        <div className="mutating-section-header">
          <h3>Open Paper Trades</h3>
          <span className="micro-chip">Showing {formatInteger(openList.length)} of {formatInteger(Array.isArray(openTrades) ? openTrades.length : 0)}</span>
        </div>
        {openList.length === 0 ? (
          <div className="placeholder">No open paper trades.</div>
        ) : (
          <ul className="mutating-trade-list">
            {openList.map((trade) => {
              const sideClass = typeof trade?.side === 'string' ? trade.side.toLowerCase() : '';
              const owner = trade?.meta?.bot ? `Bot ${trade.meta.bot}` : 'Engine';
              return (
                <li key={trade.id ?? `${trade.symbol}-${trade.ts}`} className="mutating-trade">
                  <div className="mutating-trade-main">
                    <span className={`mutating-trade-side ${sideClass}`}>{formatSide(trade.side)}</span>
                    <span className="mutating-trade-price">{formatDecimal(trade.entry)}</span>
                    <span className="mutating-trade-size">x {formatDecimal(trade.size)}</span>
                  </div>
                  <div className="mutating-trade-meta">
                    <span>{trade.symbol ?? '--'}</span>
                    <span>SL {formatDecimal(trade.sl)}</span>
                    <span>TP {formatDecimal(trade.tp)}</span>
                    <span>{owner}</span>
                  </div>
                  <div className="mutating-trade-time">{formatTimestamp(trade.ts)}</div>
                </li>
              );
            })}
          </ul>
        )}
        {remainingOpen > 0 ? <div className="mutating-note">+{remainingOpen} more open trades.</div> : null}
      </section>

      <section className="mutating-section">
        <div className="mutating-section-header">
          <h3>Recent Signals</h3>
          <span className="micro-chip">Showing {formatInteger(signalList.length)} of {formatInteger(Array.isArray(signals) ? signals.length : 0)}</span>
        </div>
        {signalList.length === 0 ? (
          <div className="placeholder">No recent signals captured.</div>
        ) : (
          <ul className="mutating-signal-list">
            {signalList.map((signal, index) => {
              const key = signal?.ts ? `${signal.ts}-${index}` : `signal-${index}`;
              const sideClass = typeof signal?.side === 'string' ? signal.side.toLowerCase() : '';
              return (
                <li key={key} className="mutating-signal">
                  <div className="mutating-signal-main">
                    <span className={`mutating-trade-side ${sideClass}`}>{formatSide(signal?.side)}</span>
                    <span className="mutating-signal-price">{formatDecimal(signal?.price)}</span>
                    <span className="mutating-signal-consensus">{formatPercent(signal?.consensus)}</span>
                    <span className="mutating-signal-confidence">{formatPercent(signal?.confidence)}</span>
                  </div>
                  <div className="mutating-signal-meta">
                    <span>{signal?.symbol ?? '--'}</span>
                    <span>{formatStatusLabel(signal?.status)}</span>
                    <span>{formatStatusLabel(signal?.live_status || signal?.mode)}</span>
                  </div>
                  <div className="mutating-signal-time">{formatTimestamp(signal?.ts)}</div>
                </li>
              );
            })}
          </ul>
        )}
        {remainingSignals > 0 ? <div className="mutating-note">+{remainingSignals} more signals in history.</div> : null}
      </section>

      <section className="mutating-section">
        <div className="mutating-section-header">
          <h3>Recent Paper Trades</h3>
          <span className="micro-chip">Showing {tradeList.length} of {formatInteger(Array.isArray(trades) ? trades.length : 0)}</span>
        </div>
        {tradeList.length === 0 ? (
          <div className="placeholder">No paper executions yet.</div>
        ) : (
          <ul className="mutating-trade-list">
            {tradeList.map((trade) => {
              const sideClass = typeof trade?.side === 'string' ? trade.side.toLowerCase() : '';
              return (
                <li key={trade.id} className="mutating-trade">
                  <div className="mutating-trade-main">
                    <span className={`mutating-trade-side ${sideClass}`}>{formatSide(trade.side)}</span>
                    <span className="mutating-trade-price">{formatDecimal(trade.entry)}</span>
                    <span className="mutating-trade-size">x {formatDecimal(trade.size)}</span>
                  </div>
                  <div className="mutating-trade-meta">
                    <span>{trade.symbol ?? '--'}</span>
                    <span>SL {formatDecimal(trade.sl)}</span>
                    <span>TP {formatDecimal(trade.tp)}</span>
                  </div>
                  <div className="mutating-trade-time">{formatTimestamp(trade.ts)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="mutating-metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}

function formatInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '--';
  }
  return Math.round(numeric).toLocaleString();
}

function formatDecimal(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '--';
  }
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function buildSettingsForm(settings) {
  const base = settings || {};
  const riskCap = Number(base.risk_cap);
  const minContracts = Number(base.min_contracts);
  const maxContracts = Number(base.max_contracts);
  return {
    execution_mode: typeof base.execution_mode === 'string' ? base.execution_mode : 'alerts',
    risk_cap: Number.isFinite(riskCap) ? String(riskCap) : '',
    min_contracts: Number.isFinite(minContracts) ? String(minContracts) : '1',
    max_contracts: Number.isFinite(maxContracts) ? String(maxContracts) : '5',
    show_signals: base.show_signals !== undefined ? Boolean(base.show_signals) : true,
    live_account_id: base.live_account_id || '',
    live_contract_id: base.live_contract_id || '',
    live_endpoint: base.live_endpoint || '',
    time_in_force: base.time_in_force || 'Day'
  };
}

function diffSettings(base, current) {
  if (!base || !current) {
    return {};
  }
  const diff = {};
  if (base.execution_mode !== current.execution_mode) {
    diff.execution_mode = current.execution_mode;
  }
  if (normalizeNumber(base.risk_cap) !== normalizeNumber(current.risk_cap)) {
    diff.risk_cap = normalizeNumber(current.risk_cap);
  }
  if (normalizeNumber(base.min_contracts) !== normalizeNumber(current.min_contracts)) {
    diff.min_contracts = normalizeNumber(current.min_contracts);
  }
  if (normalizeNumber(base.max_contracts) !== normalizeNumber(current.max_contracts)) {
    diff.max_contracts = normalizeNumber(current.max_contracts);
  }
  if (Boolean(base.show_signals) !== Boolean(current.show_signals)) {
    diff.show_signals = Boolean(current.show_signals);
  }
  ['live_account_id', 'live_contract_id', 'live_endpoint', 'time_in_force'].forEach((field) => {
    if (normalizeText(base[field]) !== normalizeText(current[field])) {
      diff[field] = normalizeText(current[field]);
    }
  });
  return diff;
}

function normalizeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length ? text : null;
}

function formatModeLabel(mode) {
  switch (mode) {
    case 'live':
      return 'Live trading';
    case 'paper':
      return 'Paper trading';
    case 'alerts':
      return 'Alerts only';
    default:
      return 'Mode';
  }
}

function formatStatusLabel(value) {
  if (typeof value !== 'string') {
    return '--';
  }
  const text = value.replace(/_/g, ' ').trim();
  if (!text) {
    return '--';
  }
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '--';
  }
  return `${(numeric * 100).toFixed(2)}%`;
}

function formatCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '--';
  }
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '--';
  }
  try {
    return new Date(numeric * 1000).toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      day: 'numeric'
    });
  } catch (err) {
    return '--';
  }
}

function formatSide(side) {
  if (typeof side !== 'string') {
    return '--';
  }
  const lowered = side.toLowerCase();
  if (lowered === 'buy') {
    return 'Long';
  }
  if (lowered === 'sell') {
    return 'Short';
  }
  return side;
}
