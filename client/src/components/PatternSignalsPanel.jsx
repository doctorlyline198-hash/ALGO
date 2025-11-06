function valueIntent(direction) {
  if (direction === 'bullish') {
    return 'positive';
  }
  if (direction === 'bearish') {
    return 'negative';
  }
  return 'neutral';
}

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

export default function PatternSignalsPanel({ patterns = [] }) {
  if (!patterns.length) {
    return null;
  }
  const latest = [...patterns].slice(-8).reverse();
  return (
    <section className="panel pattern-panel">
      <header className="panel-header">
        <div>
          <h2>Detected Patterns</h2>
          <span className="panel-subtitle">Algorithmic pattern recognition</span>
        </div>
      </header>
      <ul className="pattern-list">
        {latest.map((signal) => (
          <li key={signal.id} className="pattern-row">
            <div className="pattern-main">
              <span className="pattern-name">{signal.pattern}</span>
              <span className={`pattern-direction ${valueIntent(signal.direction)}`}>{signal.direction}</span>
            </div>
            <dl className="pattern-meta">
              <div>
                <dt>Timeframe</dt>
                <dd>{signal.timeframe}</dd>
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
    </section>
  );
}
