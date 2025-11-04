const TEMPLATES = [
  { name: 'Scalper 1m Scope', timeframe: '1m', risk: 'Conservative' },
  { name: 'S2: Swing, Risk Tracking Window', timeframe: '5m', risk: 'Balanced' },
  { name: 'Entry', timeframe: '3m', risk: 'Custom' },
  { name: 'Plugin Kickstart', timeframe: '15m', risk: 'Any' },
  { name: 'Exit Policy', timeframe: '1m', risk: 'Tighter' },
  { name: 'Trailing Take Profit', timeframe: 'Var', risk: 'Adapt' },
  { name: 'Trailing Stop Loss', timeframe: 'Var', risk: 'Adapt' }
];

export default function QuickCreateStrategy() {
  return (
    <section className="quick-strategy">
      <header>
        <div>
          <h2>Quick Create Strategy</h2>
          <span className="micro">7 runtime / 7 yaml</span>
        </div>
        <button className="pill">New</button>
      </header>
      <ul>
        {TEMPLATES.map((tpl) => (
          <li key={tpl.name}>
            <div className="template-meta">
              <span className="template-name">{tpl.name}</span>
              <span className="template-sub">{tpl.timeframe} · {tpl.risk}</span>
            </div>
            <button className="ghost">➕</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
