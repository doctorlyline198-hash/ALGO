export default function PositionsPanel({ positions = [], summary, isLoading = false, onClosePosition }) {
  const items = Array.isArray(positions) ? positions : [];
  const hasPositions = items.length > 0;

  const summaryCards = buildSummaryCards(summary, isLoading);

  return (
    <section className="positions-panel">
      <header className="panel-header">
        <div>
          <h2>Open Positions</h2>
          <span className="panel-subtitle">Live exposure &amp; real-time P&amp;L</span>
        </div>
        <div className="panel-metrics">
          {summaryCards.map((card) => (
            <span key={card.label} className="metric-chip">
              <span className="metric-label">{card.label}</span>
              <span className={`metric-value ${card.intent}`}>{card.value}</span>
            </span>
          ))}
        </div>
      </header>

      {isLoading && <div className="panel-loading">Updating…</div>}

      {hasPositions ? (
        <table className="positions-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Size</th>
              <th>Avg</th>
              <th>Last</th>
              <th>P&amp;L ($)</th>
              <th>P&amp;L (t)</th>
              <th>RTPL</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((position) => (
              <tr key={position.id ?? position.contractId}>
                <td>{position.symbol || position.contractCode || position.contractId}</td>
                <td className={position.direction === 'short' ? 'short' : 'long'}>
                  {position.direction ? capitalize(position.direction) : 'Long'}
                </td>
                <td>{formatSize(position.size)}</td>
                <td>{formatPrice(position.averagePrice)}</td>
                <td>{formatPrice(position.lastPrice)}</td>
                <td className={valueIntent(position.pnlValue)}>{formatCurrency(position.pnlValue)}</td>
                <td className={valueIntent(position.pnlTicks)}>{formatTicks(position.pnlTicks)}</td>
                <td className={valueIntent(position.rtplContribution)}>{formatCurrency(position.rtplContribution)}</td>
                <td>{formatTimestamp(position.lastPriceTimestamp)}</td>
                <td>
                  <button
                    type="button"
                    className="ghost ghost-action"
                    onClick={() => onClosePosition?.(position)}
                  >
                    Close
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="panel-placeholder">No open positions.</div>
      )}
    </section>
  );
}

function buildSummaryCards(summary, isLoading) {
  if (!summary) {
    return isLoading ? [{ label: 'Loading', value: '…', intent: 'neutral' }] : [];
  }
  const cards = [];
  if (Number.isFinite(summary.totalSize)) {
    cards.push({ label: 'Contracts', value: formatSize(summary.totalSize), intent: 'neutral' });
  }
  if (Number.isFinite(summary.pnlValue)) {
    cards.push({ label: 'PnL $', value: formatCurrency(summary.pnlValue), intent: valueIntent(summary.pnlValue) });
  }
  if (Number.isFinite(summary.pnlTicks)) {
    cards.push({ label: 'PnL t', value: formatTicks(summary.pnlTicks), intent: valueIntent(summary.pnlTicks) });
  }
  if (Number.isFinite(summary.rtpl)) {
    cards.push({ label: 'RTPL', value: formatCurrency(summary.rtpl), intent: valueIntent(summary.rtpl) });
  }
  return cards;
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTicks(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}t`;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(Math.abs(value) >= 100 ? 2 : 3);
}

function formatSize(value) {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return Math.abs(Number(value)).toString();
}

function formatTimestamp(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function valueIntent(value) {
  if (!Number.isFinite(value)) {
    return 'neutral';
  }
  if (value > 0) {
    return 'positive';
  }
  if (value < 0) {
    return 'negative';
  }
  return 'neutral';
}

function capitalize(value) {
  if (!value) return '';
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
