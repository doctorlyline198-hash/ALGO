/**
 * Position Display Component
 * Shows current positions with PnL
 */
import React from 'react';

const PositionDisplay = ({ position }) => {
  if (!position || position.quantity === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>No Position</div>
      </div>
    );
  }

  const positionSide = position.quantity > 0 ? 'LONG' : 'SHORT';
  const positionColor = position.quantity > 0 ? '#26a69a' : '#ef5350';
  const pnlColor = position.unrealized_pnl >= 0 ? '#26a69a' : '#ef5350';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.symbol}>{position.symbol}</span>
        <span style={{ ...styles.side, color: positionColor }}>
          {positionSide}
        </span>
      </div>

      <div style={styles.details}>
        <div style={styles.row}>
          <span style={styles.label}>Quantity:</span>
          <span style={styles.value}>{Math.abs(position.quantity)}</span>
        </div>

        <div style={styles.row}>
          <span style={styles.label}>Avg Price:</span>
          <span style={styles.value}>${position.average_price.toFixed(2)}</span>
        </div>

        {position.current_price && (
          <div style={styles.row}>
            <span style={styles.label}>Current:</span>
            <span style={styles.value}>${position.current_price.toFixed(2)}</span>
          </div>
        )}

        <div style={styles.row}>
          <span style={styles.label}>Unrealized P&L:</span>
          <span style={{ ...styles.value, color: pnlColor, fontWeight: 'bold' }}>
            ${position.unrealized_pnl.toFixed(2)}
          </span>
        </div>

        <div style={styles.row}>
          <span style={styles.label}>Realized P&L:</span>
          <span style={styles.value}>${position.realized_pnl.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    backgroundColor: '#2a2a2a',
    borderRadius: '8px',
    padding: '15px',
    color: '#fff',
  },
  empty: {
    textAlign: 'center',
    color: '#888',
    padding: '20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
    paddingBottom: '10px',
    borderBottom: '1px solid #444',
  },
  symbol: {
    fontSize: '18px',
    fontWeight: 'bold',
  },
  side: {
    fontSize: '14px',
    fontWeight: 'bold',
  },
  details: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
  },
  label: {
    color: '#888',
  },
  value: {
    fontWeight: '500',
  },
};

export default PositionDisplay;
