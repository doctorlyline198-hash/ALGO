/**
 * Main App Component
 * TopstepX Trading Platform Dashboard
 */
import React, { useState, useEffect } from 'react';
import TradingChart from './components/TradingChart';
import OrderPanel from './components/OrderPanel';
import StrategyPanel from './components/StrategyPanel';
import PositionDisplay from './components/PositionDisplay';
import api from './services/api';
import './App.css';

function App() {
  const [selectedSymbol, setSelectedSymbol] = useState('NQ');
  const [contracts, setContracts] = useState(['NQ', 'ES', 'GC', 'MGC']);
  const [timeframe, setTimeframe] = useState('1min');
  const [marketData, setMarketData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load contracts on mount
  useEffect(() => {
    loadContracts();
  }, []);

  // Load market data when symbol or timeframe changes
  useEffect(() => {
    loadMarketData();
    const interval = setInterval(loadMarketData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [selectedSymbol, timeframe]);

  // Load position data
  useEffect(() => {
    loadPosition();
    const interval = setInterval(loadPosition, 3000); // Refresh every 3 seconds
    return () => clearInterval(interval);
  }, [selectedSymbol]);

  const loadContracts = async () => {
    try {
      const data = await api.getContracts();
      if (data.contracts) {
        setContracts(data.contracts);
      }
    } catch (error) {
      console.error('Error loading contracts:', error);
    }
  };

  const loadMarketData = async () => {
    setLoading(true);
    try {
      const data = await api.getMarketData(selectedSymbol, timeframe, 100);
      if (data.bars) {
        setMarketData(data.bars);
        setCurrentPrice(data.current_price);
      }
    } catch (error) {
      console.error('Error loading market data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPosition = async () => {
    try {
      const data = await api.getPosition(selectedSymbol);
      setPosition(data);
    } catch (error) {
      console.error('Error loading position:', error);
    }
  };

  const handleOrderSubmit = async (orderData) => {
    try {
      const result = await api.createOrder(orderData);
      console.log('Order created:', result);
      alert(`Order placed: ${orderData.side} ${orderData.quantity} ${orderData.symbol}`);
      
      // Refresh position
      loadPosition();
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Error placing order. Please try again.');
    }
  };

  return (
    <div className="App">
      <header className="header">
        <h1>TopstepX Trading Platform</h1>
        <div className="header-info">
          <span className="status-indicator"></span>
          <span>Live Trading</span>
        </div>
      </header>

      <div className="toolbar">
        <div className="contract-selector">
          <label>Contract:</label>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="select-input"
          >
            {contracts.map((contract) => (
              <option key={contract} value={contract}>
                {contract}
              </option>
            ))}
          </select>
        </div>

        <div className="timeframe-selector">
          <label>Timeframe:</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="select-input"
          >
            <option value="1min">1 Minute</option>
            <option value="5min">5 Minutes</option>
            <option value="15min">15 Minutes</option>
            <option value="1h">1 Hour</option>
          </select>
        </div>

        {currentPrice && (
          <div className="price-display">
            <span className="price-label">Current Price:</span>
            <span className="price-value">${currentPrice.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="main-content">
        <div className="chart-section">
          <TradingChart symbol={selectedSymbol} data={marketData} height={500} />
        </div>

        <div className="side-panel">
          <div className="panel-section">
            <PositionDisplay position={position} />
          </div>

          <div className="panel-section">
            <OrderPanel
              symbol={selectedSymbol}
              currentPrice={currentPrice}
              onOrderSubmit={handleOrderSubmit}
            />
          </div>

          <div className="panel-section">
            <StrategyPanel symbol={selectedSymbol} />
          </div>
        </div>
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
        </div>
      )}
    </div>
  );
}

export default App;
