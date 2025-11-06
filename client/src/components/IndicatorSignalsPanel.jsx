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

function formatTimestamp(seconds) {
  if (!Number.isFinite(seconds)) {
    return '—';
  }
  try {
    const date = new Date(seconds * 1000);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    return '—';
  }
}

function pickTrigger(signal) {
  if (!signal || typeof signal.keyLevels !== 'object' || signal.keyLevels === null) {
    return undefined;
  }
  if (Number.isFinite(signal.keyLevels.trigger)) {
    return signal.keyLevels.trigger;
  }
  const firstKey = Object.keys(signal.keyLevels)[0];
  return Number.isFinite(signal.keyLevels[firstKey]) ? signal.keyLevels[firstKey] : undefined;
}

export default function IndicatorSignalsPanel({ signals = [] }) {
  if (!signals.length) {
    return null;
  }

  const latest = [...signals].slice(-8).reverse();

  return (
    <section className="panel pattern-panel indicator-panel">
      <header className="panel-header">
        <div>
          <h2>Indicator Signals</h2>
          <span className="panel-subtitle">BOS / CHOCH market structure calls</span>
        </div>
      </header>
      <ul className="pattern-list">
        {latest.map((signal) => {
          const trigger = pickTrigger(signal);
          const when = formatTimestamp(signal.breakTime ?? signal.confirmedAt);
          return (
            <li key={signal.id} className="pattern-row">
              <div className="pattern-main">
                <span className="pattern-name">{signal.type || 'Signal'}</span>
                <span className={`pattern-direction ${valueIntent(signal.direction)}`}>
                  {signal.direction || 'neutral'}
                </span>
              </div>
              <dl className="pattern-meta">
                <div>
                  <dt>Timeframe</dt>
                  <dd>{signal.timeframe || '—'}</dd>
                </div>
                <div>
                  <dt>Trigger</dt>
                  <dd>{formatPrice(trigger)}</dd>
                </div>
                <div>
                  <dt>Break Time</dt>
                  <dd>{when}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
