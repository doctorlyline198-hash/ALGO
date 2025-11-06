const statusMap = {
  on: { label: 'running', color: '#0ddc7c' },
  off: { label: 'idle', color: '#f2484e' }
};

export default function StrategyList({ strategies = [] }) {
  return (
    <section className="strategy-list">
      <header>
        <h2>Strategies</h2>
        <span className="tag">7 runtime / 7 yaml</span>
      </header>

      <ul>
        {strategies.length === 0 && <li className="placeholder">No strategies registered</li>}
        {strategies.map((s) => {
          const status = statusMap[s.status] || statusMap.off;
          return (
            <li key={s.name}>
              <div className="strategy-meta">
                <span className="strategy-name">{s.name}</span>
                <span className="strategy-info">{s.timeframe}</span>
                <span className="strategy-info">{s.venue}</span>
                {s.risk ? <span className="strategy-info">{s.risk}</span> : null}
              </div>
              <div className="strategy-actions">
                <span className="status-dot" style={{ backgroundColor: status.color }} />
                <button title="Toggle">⏻</button>
                <button title="View">👁</button>
                <button title="Logs">🗎</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
