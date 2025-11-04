export default function StatusPanel({ accounts = [], summary, onRefresh, isLoading }) {
  const summaryCards = Array.isArray(accounts) && accounts.length > 0 && summary
    ? [
        { key: 'count', label: 'Accounts', value: String(summary.count ?? accounts.length) },
        { key: 'netLiquidity', label: 'Net Liquidity', value: formatCurrency(summary.netLiquidity) },
        { key: 'rtpl', label: 'RTPL', value: formatCurrency(summary.rtpl) },
        { key: 'totalPnl', label: 'Total P&L', value: formatCurrency(summary.totalPnl) }
      ]
    : [];

  return (
    <section className="status-panel">
      <div className="status-header">
        <div>
          <h2>Status</h2>
          <span className="status-subtitle">SIM</span>
        </div>
        <button className="refresh" onClick={onRefresh} title="Refresh accounts" disabled={isLoading}>
          {isLoading ? '...' : '⟳'}
        </button>
      </div>

      {summaryCards.length ? (
        <div className="account-summary">
          {summaryCards.map((card) => (
            <div key={card.key} className="summary-card">
              <span className="summary-label">{card.label}</span>
              <span className="summary-value">{card.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="status-section">
        <h3>Accounts</h3>
        {accounts.length === 0 && (
          <div className="placeholder">No accounts returned. Click refresh after the server authenticates.</div>
        )}
        {accounts.map((acct) => (
          <div key={acct.accountId || acct.id} className="account-card">
            <div className="account-id">{acct.displayName || acct.id || acct.accountId}</div>
            <div className="account-row">
              <span>Balance</span>
              <span>{formatCurrency(acct.balance ?? acct.accountBalance)}</span>
            </div>
            <div className="account-row">
              <span>Buying Power</span>
              <span>{formatCurrency(acct.buyingPower ?? acct.maxPositionSize)}</span>
            </div>
            <div className="account-row">
              <span>Trailing Max DD</span>
              <span>{formatCurrency(acct.trailingMaxDrawdown ?? 0)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatCurrency(value) {
  const num = Number(value ?? 0);
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
