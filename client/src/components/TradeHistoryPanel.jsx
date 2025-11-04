export default function TradeHistoryPanel({ trades = [], summary, isLoading = false }) {
  const items = Array.isArray(trades) ? trades.slice(0, 100) : [];
  const hasTrades = items.length > 0;
  const summaryChips = buildSummary(summary, isLoading);

  return (
    <section className="trade-history-panel">
      <header className="panel-header">
        <div>
          <h2>Recent Trades</h2>
          <span className="panel-subtitle">Execution log &amp; realized performance</span>
        </div>
        <div className="panel-metrics">
          {summaryChips.map((chip) => (
            <span key={chip.label} className="metric-chip">
              <span className="metric-label">{chip.label}</span>
              <span className={`metric-value ${chip.intent}`}>{chip.value}</span>
            </span>
          ))}
        </div>
      </header>

      {isLoading && <div className="panel-loading">Syncing…</div>}

      {hasTrades ? (
        <table className="trade-history-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Size</th>
              <th>Price</th>
              <th>P&amp;L ($)</th>
              <th>P&amp;L (t)</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {items.map((trade) => (
              <tr key={trade.id ?? trade.ticket ?? trade.orderId ?? trade.executionId ?? trade.timestamp}>
                <td>{trade.symbol || trade.contractCode || trade.contractId}</td>
                <td className={trade.direction === 'sell' ? 'short' : 'long'}>{formatDirection(trade.direction)}</td>
                <td>{formatSize(trade.size)}</td>
                <td>{formatPrice(trade.price ?? trade.executionPrice ?? trade.fillPrice)}</td>
                <td className={valueIntent(trade.pnlValue)}>{formatCurrency(trade.pnlValue)}</td>
                <td className={valueIntent(trade.pnlTicks)}>{formatTicks(trade.pnlTicks)}</td>
                <td>{formatTimestamp(trade.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="panel-placeholder">No recent trades.</div>
      )}
    </section>
  );
}

function buildSummary(summary, isLoading) {
  if (!summary) {
    return isLoading ? [{ label: 'Loading', value: '…', intent: 'neutral' }] : [];
  }
  const chips = [];
  if (Number.isFinite(summary.count)) {
    chips.push({ label: 'Trades', value: summary.count, intent: 'neutral' });
  }
  if (Number.isFinite(summary.winRate)) {
    chips.push({ label: 'Win %', value: `${Math.round(summary.winRate * 10) / 10}%`, intent: valueIntent(summary.winRate - 50) });
  }
  if (Number.isFinite(summary.net)) {
    chips.push({ label: 'Net', value: formatCurrency(summary.net), intent: valueIntent(summary.net) });
  }
  if (Number.isFinite(summary.grossProfit) && Math.abs(summary.grossProfit) > 0) {
    chips.push({ label: 'Gross +', value: formatCurrency(summary.grossProfit), intent: 'positive' });
  }
  if (Number.isFinite(summary.grossLoss) && Math.abs(summary.grossLoss) > 0) {
    chips.push({ label: 'Gross -', value: formatCurrency(summary.grossLoss), intent: 'negative' });
  }
  return chips;
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
  const decimals = Math.abs(value) >= 100 ? 2 : 3;
  return value.toFixed(decimals);
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

function formatDirection(direction) {
  if (!direction) {
    return 'Buy';
  }
  const normalized = String(direction).toLowerCase();
  if (normalized === 'sell' || normalized === 'short') {
    return 'Sell';
  }
  return 'Buy';
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
