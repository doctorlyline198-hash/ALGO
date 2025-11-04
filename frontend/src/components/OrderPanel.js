/**
 * Order Panel Component
 * Allows users to create buy/sell orders with quantity and price controls
 */
import React, { useState } from 'react';

const OrderPanel = ({ symbol, currentPrice, onOrderSubmit }) => {
  const [side, setSide] = useState('BUY');
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState('MARKET');
  const [price, setPrice] = useState(currentPrice || 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const orderData = {
      symbol,
      side,
      quantity: parseInt(quantity),
      order_type: orderType,
      price: orderType === 'LIMIT' ? parseFloat(price) : null,
    };

    onOrderSubmit(orderData);
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Place Order - {symbol}</h3>
      
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Side:</label>
          <div style={styles.buttonGroup}>
            <button
              type="button"
              onClick={() => setSide('BUY')}
              style={{
                ...styles.sideButton,
                ...(side === 'BUY' ? styles.buyButton : styles.inactiveButton),
              }}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => setSide('SELL')}
              style={{
                ...styles.sideButton,
                ...(side === 'SELL' ? styles.sellButton : styles.inactiveButton),
              }}
            >
              SELL
            </button>
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Order Type:</label>
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value)}
            style={styles.select}
          >
            <option value="MARKET">Market</option>
            <option value="LIMIT">Limit</option>
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Quantity:</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min="1"
            style={styles.input}
          />
        </div>

        {orderType === 'LIMIT' && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Price:</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              step="0.01"
              style={styles.input}
            />
          </div>
        )}

        {currentPrice && (
          <div style={styles.priceInfo}>
            Current Price: <strong>${currentPrice.toFixed(2)}</strong>
          </div>
        )}

        <button type="submit" style={styles.submitButton}>
          Place {side} Order
        </button>
      </form>
    </div>
  );
};

const styles = {
  container: {
    backgroundColor: '#2a2a2a',
    borderRadius: '8px',
    padding: '20px',
    color: '#fff',
  },
  title: {
    margin: '0 0 20px 0',
    fontSize: '18px',
    fontWeight: 'bold',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px',
  },
  sideButton: {
    flex: 1,
    padding: '12px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buyButton: {
    backgroundColor: '#26a69a',
    color: '#fff',
  },
  sellButton: {
    backgroundColor: '#ef5350',
    color: '#fff',
  },
  inactiveButton: {
    backgroundColor: '#3a3a3a',
    color: '#888',
  },
  select: {
    padding: '10px',
    backgroundColor: '#1e1e1e',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: '6px',
    fontSize: '14px',
  },
  input: {
    padding: '10px',
    backgroundColor: '#1e1e1e',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: '6px',
    fontSize: '14px',
  },
  priceInfo: {
    padding: '10px',
    backgroundColor: '#1e1e1e',
    borderRadius: '6px',
    fontSize: '14px',
  },
  submitButton: {
    padding: '12px',
    backgroundColor: '#4a90e2',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};

export default OrderPanel;
