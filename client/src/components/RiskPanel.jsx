const GLOBAL_LIMITS = [
  { label: 'Max Positions', value: 5 },
  { label: 'Max Loss', value: '$1,000' },
  { label: 'Max Order', value: '$5,000' },
  { label: 'Ord/Min', value: 60 }
];

export default function RiskPanel() {
  return (
    <section className="risk-panel">
      <header>
        <h2>Risk</h2>
        <button className="pill">Edit</button>
      </header>
      <div className="risk-section">
        <h3>Global Limits</h3>
        <div className="risk-grid">
          {GLOBAL_LIMITS.map((limit) => (
            <div key={limit.label} className="risk-card">
              <span className="risk-label">{limit.label}</span>
              <span className="risk-value">{limit.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="risk-section">
        <h3>Per-Strategy</h3>
        <div className="risk-note">Inherit limits from account. Configure overrides per strategy in settings.</div>
      </div>
    </section>
  );
}
