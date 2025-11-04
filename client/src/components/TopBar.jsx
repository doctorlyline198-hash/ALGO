import { useEffect, useMemo, useRef, useState } from 'react';
import { CONTRACTS } from '../data/contracts.js';
import { DEFAULT_TIMEFRAME, TIMEFRAME_GROUPS, flattenTimeframes } from '../data/timeframes.js';

const ALL_TIMEFRAMES = flattenTimeframes();

export default function TopBar({
  symbol,
  contract,
  onSymbolChange,
  selectedTimeframes,
  onTimeframesChange,
  activeTimeframe,
  onActiveTimeframeChange,
  connectionStatus
}) {
  const [query, setQuery] = useState(symbol);
  useEffect(() => {
    setQuery(symbol);
  }, [symbol]);

  const filtered = useMemo(
    () => {
      const needle = (query || '').toLowerCase();
      return CONTRACTS.filter(
        (c) => c.code.toLowerCase().includes(needle) || c.name.toLowerCase().includes(needle)
      );
    },
    [query]
  );
  const isConnected = connectionStatus === true;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!query) return;
    onSymbolChange(query.toUpperCase());
  };

  return (
    <header className="top-bar">
      <form className="search-box" onSubmit={handleSubmit}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          placeholder="Search contract"
          autoComplete="off"
        />
        <div className="search-dropdown">
          <ul>
            {filtered.map((c) => (
              <li
                key={c.code}
                onMouseDown={() => {
                  setQuery(c.code);
                  onSymbolChange(c.code);
                }}
              >
                <span className="symbol">{c.code}</span>
                <span className="name">{c.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </form>

      <TimeframeDropdown
        activeTimeframe={activeTimeframe}
        selectedTimeframes={selectedTimeframes}
        onSelectionChange={onTimeframesChange}
        onActiveChange={onActiveTimeframeChange}
      />

      <div className="session-status">
        <span className={`badge live ${isConnected ? 'online' : 'offline'}`}>{isConnected ? 'live' : 'offline'}</span>
        <span className="badge tf">{activeTimeframe}</span>
        <span className="badge days">13d</span>
        <span className="badge depth">4</span>
        <button className="backfill" type="button">Backfill (h)</button>
      </div>

      <div className="account-status">
        <span className="account">50KTC-V2-285j</span>
        <span className="contract">{contract?.id || symbol}</span>
        <span className="tag">SIM</span>
      </div>
    </header>
  );
}

function TimeframeDropdown({ activeTimeframe, selectedTimeframes, onSelectionChange, onActiveChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event) => {
      if (!containerRef.current || containerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleToggle = (timeframe) => {
    const isActive = selectedTimeframes.includes(timeframe);
    if (isActive && selectedTimeframes.length === 1) {
      return;
    }
    const next = isActive
      ? selectedTimeframes.filter((item) => item !== timeframe)
      : [...selectedTimeframes, timeframe];
    if (!isActive) {
      onActiveChange(timeframe);
    } else if (timeframe === activeTimeframe) {
      const fallback = next[0] || DEFAULT_TIMEFRAME;
      onActiveChange(fallback);
    }
    onSelectionChange(sanitizeTimeframes(next));
  };

  const handleSetActive = (timeframe) => {
    if (!selectedTimeframes.includes(timeframe)) {
      handleToggle(timeframe);
    }
    onActiveChange(timeframe);
    setOpen(false);
  };

  return (
    <div className="timeframe-select" ref={containerRef}>
      <button type="button" className="dropdown-trigger" onClick={() => setOpen((prev) => !prev)}>
        <span className="label">Timeframes</span>
        <span className="value">{activeTimeframe}</span>
        <span className="caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="dropdown-panel timeframe-panel">
          {TIMEFRAME_GROUPS.map((group) => (
            <div className="dropdown-section" key={group.label}>
              <div className="dropdown-title">{group.label}</div>
              <ul>
                {group.options.map((tf) => {
                  const checked = selectedTimeframes.includes(tf);
                  const isPrimary = activeTimeframe === tf;
                  return (
                    <li key={tf} className="dropdown-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggle(tf)}
                        />
                        <span className="option-label">{tf}</span>
                      </label>
                      <div className="option-actions">
                        {isPrimary ? <span className="pill micro-pill">Active</span> : null}
                        <button
                          type="button"
                          className="option-button"
                          onClick={() => handleSetActive(tf)}
                          disabled={!checked && selectedTimeframes.length === 1}
                        >
                          Set default
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function sanitizeTimeframes(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return [DEFAULT_TIMEFRAME];
  }
  const deduped = Array.from(new Set(list.filter((item) => ALL_TIMEFRAMES.includes(item))));
  if (deduped.length === 0) {
    return [DEFAULT_TIMEFRAME];
  }
  const order = new Map(ALL_TIMEFRAMES.map((item, index) => [item, index]));
  return deduped.sort((a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999));
}
