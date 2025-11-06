function formatPrice(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const magnitude = Math.abs(value);
  if (magnitude >= 1000) {
    return value.toFixed(1);
  }
  if (magnitude >= 100) {
    return value.toFixed(2);
  }
  return value.toFixed(3);
}

function formatConfidence(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value * 100)}%`;
}

function formatScore(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value * 1000) / 10}%`;
}

function directionClass(direction) {
  switch (direction) {
    case 'bullish':
      return 'positive';
    case 'bearish':
      return 'negative';
    default:
      return 'neutral';
  }
}

function formatActionLabel(action) {
  switch (action) {
    case 'enter-long':
      return 'Enter Long';
    case 'enter-short':
      return 'Enter Short';
    case 'monitor-long':
      return 'Monitor Long';
    case 'monitor-short':
      return 'Monitor Short';
    case 'observe-long':
      return 'Observe Long';
    case 'observe-short':
      return 'Observe Short';
    default:
      return action || 'Monitor';
  }
}

function formatUrgency(value) {
  switch (value) {
    case 'now':
      return 'Act Now';
    case 'watch':
      return 'Watch';
    default:
      return 'Monitor';
  }
}

export default function StrategySignalsPanel({ bundle }) {
  if (!bundle) {
    return null;
  }

  const actions = Array.isArray(bundle.actions) ? bundle.actions.slice(0, 5) : [];
  const categories = [
    { key: 'smc', label: 'Smart Money Concepts' },
    { key: 'wyckoff', label: 'Wyckoff Phases' },
    { key: 'volume', label: 'Volume Patterns' },
    { key: 'candlestick', label: 'Candlestick Patterns' },
    { key: 'indicator', label: 'Indicator Patterns' }
  ];

  const hasSignals = categories.some((entry) => Array.isArray(bundle[entry.key]) && bundle[entry.key].length);
  const diagnostics = Array.isArray(bundle.diagnostics) ? bundle.diagnostics : [];

  if (!hasSignals && diagnostics.length === 0 && actions.length === 0) {
    return null;
  }

  return (
    <section className="panel strategy-signals-panel">
      <header className="panel-header">
        <div>
          <h2>Strategy Signals</h2>
          <span className="panel-subtitle">Aggregated strategy playbook</span>
        </div>
      </header>
      {actions.length ? (
        <div className="strategy-actions">
          <h3>Action Queue</h3>
          <ul className="strategy-action-list">
            {actions.map((entry) => (
              <li key={entry.id} className="strategy-action-row">
                <div className="strategy-action-main">
                  <span className="strategy-action-label">
                    {formatActionLabel(entry.action)}
                    <span className={`strategy-signal-direction ${directionClass(entry.bias)}`}>{entry.bias}</span>
                  </span>
                  <span className="strategy-action-score">{formatScore(entry.score)}</span>
                </div>
                <dl className="strategy-action-meta">
                  <div>
                    <dt>Pattern</dt>
                    <dd>{entry.pattern}</dd>
                  </div>
                  <div>
                    <dt>Trigger</dt>
                    <dd>{formatPrice(entry.triggerPrice)}</dd>
                  </div>
                  <div>
                    <dt>Urgency</dt>
                    <dd className={`strategy-action-urgency-${entry.urgency}`}>{formatUrgency(entry.urgency)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {categories.map(({ key, label }) => {
        const signals = Array.isArray(bundle[key]) ? bundle[key].slice(-5).reverse() : [];
        if (!signals.length) {
          return null;
        }
        return (
          <div key={key} className="strategy-group">
            <div className="strategy-group-header">
              <h3>{label}</h3>
              <span className="group-count">{signals.length}</span>
            </div>
            <ul className="strategy-signal-list">
              {signals.map((signal) => (
                <li key={signal.id} className="strategy-signal-row">
                  <div className="strategy-signal-main">
                    <span className="strategy-signal-name">{signal.pattern}</span>
                    <span className={`strategy-signal-direction ${directionClass(signal.direction)}`}>{signal.direction}</span>
                  </div>
                  <dl className="strategy-signal-meta">
                    <div>
                      <dt>Status</dt>
                      <dd>{signal.status}</dd>
                    </div>
                    <div>
                      <dt>Trigger</dt>
                      <dd>{formatPrice(signal.triggerPrice)}</dd>
                    </div>
                    <div>
                      <dt>Confidence</dt>
                      <dd>{formatConfidence(signal.confidence)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {diagnostics.length ? (
        <div className="strategy-diagnostics">
          <h3>Diagnostics</h3>
          <ul>
            {diagnostics.slice(-6).map((diag, index) => (
              <li key={`${diag.scope ?? 'diag'}-${index}`}>
                <span className="diag-scope">{diag.scope || 'Strategy'}</span>
                <span className="diag-message">{diag.message || diag.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
