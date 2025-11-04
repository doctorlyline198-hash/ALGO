export default function AnalyticsSection({ analytics }) {
  const data = analytics || {};
  return (
    <section className="analytics">
      <div className="analytics-header">
        <h2>Analytics - Account</h2>
        <div className="tabs">
          <button className="active">Daily</button>
          <button>Weekly</button>
          <button>Monthly</button>
        </div>
      </div>

      <div className="analytics-grid">
        <Metric label="Realized PnL" value={data.realizedPnL} prefix="$" />
        <Metric label="Avg Daily PnL" value={data.avgDailyPnL} prefix="$" />
        <Metric label="Max Drawdown" value={data.maxDrawdown} prefix="$" />
        <Metric label="Best Daily" value={data.bestDaily} prefix="$" />
        <Metric label="Worst Daily" value={data.worstDaily} prefix="$" />
        <Metric label="Avg Win" value={data.avgWin} prefix="$" />
        <Metric label="Avg Loss" value={data.avgLoss} prefix="$" />
        <Metric label="Win Rate" value={data.winRate} suffix="%" />
        <Metric label="Trades" value={data.trades} />
      </div>
    </section>
  );
}

function Metric({ label, value, prefix = '', suffix = '' }) {
  const display = value === undefined || value === null ? '—' : `${prefix}${value}${suffix}`;
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{display}</span>
    </div>
  );
}
