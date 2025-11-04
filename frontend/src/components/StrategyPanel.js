/**
 * Strategy Panel Component
 * Controls for activating/deactivating trading strategies and viewing signals
 */
import React, { useState, useEffect } from 'react';
import api from '../services/api';

const StrategyPanel = ({ symbol }) => {
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [activeStrategy, setActiveStrategy] = useState(null);
  const [signal, setSignal] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStrategies();
  }, []);

  const loadStrategies = async () => {
    try {
      const data = await api.getStrategies();
      setStrategies(data.strategies || []);
      if (data.strategies && data.strategies.length > 0) {
        setSelectedStrategy(data.strategies[0].name);
      }
    } catch (error) {
      console.error('Error loading strategies:', error);
    }
  };

  const activateStrategy = async () => {
    if (!selectedStrategy) return;
    
    setLoading(true);
    try {
      await api.activateStrategy(symbol, selectedStrategy);
      setActiveStrategy(selectedStrategy);
      // Load initial signal
      loadSignal();
    } catch (error) {
      console.error('Error activating strategy:', error);
    } finally {
      setLoading(false);
    }
  };

  const deactivateStrategy = async () => {
    setLoading(true);
    try {
      await api.deactivateStrategy(symbol);
      setActiveStrategy(null);
      setSignal(null);
    } catch (error) {
      console.error('Error deactivating strategy:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSignal = async () => {
    try {
      const data = await api.getStrategySignal(symbol);
      setSignal(data.signal);
    } catch (error) {
      console.error('Error loading signal:', error);
    }
  };

  useEffect(() => {
    if (activeStrategy) {
      // Refresh signal every 5 seconds
      const interval = setInterval(loadSignal, 5000);
      return () => clearInterval(interval);
    }
  }, [activeStrategy, symbol]);

  const getSignalColor = (action) => {
    switch (action) {
      case 'BUY':
        return '#26a69a';
      case 'SELL':
        return '#ef5350';
      default:
        return '#888';
    }
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Strategy Control - {symbol}</h3>

      {!activeStrategy ? (
        <div style={styles.activationSection}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Select Strategy:</label>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              style={styles.select}
            >
              {strategies.map((strategy) => (
                <option key={strategy.name} value={strategy.name}>
                  {strategy.name}
                </option>
              ))}
            </select>
          </div>

          {selectedStrategy && (
            <div style={styles.description}>
              {strategies.find((s) => s.name === selectedStrategy)?.description}
            </div>
          )}

          <button
            onClick={activateStrategy}
            disabled={loading || !selectedStrategy}
            style={styles.activateButton}
          >
            {loading ? 'Activating...' : 'Activate Strategy'}
          </button>
        </div>
      ) : (
        <div style={styles.activeSection}>
          <div style={styles.activeHeader}>
            <div>
              <div style={styles.activeLabel}>Active Strategy:</div>
              <div style={styles.activeName}>{activeStrategy}</div>
            </div>
            <button onClick={deactivateStrategy} style={styles.deactivateButton}>
              Deactivate
            </button>
          </div>

          {signal && (
            <div style={styles.signalSection}>
              <div style={styles.signalHeader}>Current Signal</div>
              
              <div style={{
                ...styles.signalAction,
                backgroundColor: getSignalColor(signal.action),
              }}>
                {signal.action}
              </div>

              <div style={styles.signalDetails}>
                <div style={styles.signalRow}>
                  <span>Price:</span>
                  <strong>${signal.price?.toFixed(2)}</strong>
                </div>
                <div style={styles.signalRow}>
                  <span>Reason:</span>
                  <span style={styles.reason}>{signal.reason}</span>
                </div>

                {signal.stop_loss && (
                  <div style={styles.signalRow}>
                    <span>Stop Loss:</span>
                    <strong>${signal.stop_loss.toFixed(2)}</strong>
                  </div>
                )}

                {signal.take_profit && (
                  <div style={styles.signalRow}>
                    <span>Take Profit:</span>
                    <strong>${signal.take_profit.toFixed(2)}</strong>
                  </div>
                )}

                {signal.indicators && (
                  <div style={styles.indicators}>
                    <div style={styles.indicatorHeader}>Indicators:</div>
                    {Object.entries(signal.indicators).map(([key, value]) => (
                      <div key={key} style={styles.signalRow}>
                        <span>{key}:</span>
                        <strong>
                          {typeof value === 'number' ? value.toFixed(2) : 
                           typeof value === 'object' ? JSON.stringify(value) : 
                           value}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
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
  activationSection: {
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
  select: {
    padding: '10px',
    backgroundColor: '#1e1e1e',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: '6px',
    fontSize: '14px',
  },
  description: {
    padding: '10px',
    backgroundColor: '#1e1e1e',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#ccc',
  },
  activateButton: {
    padding: '12px',
    backgroundColor: '#26a69a',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  activeSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  activeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px',
    backgroundColor: '#1e1e1e',
    borderRadius: '6px',
  },
  activeLabel: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '5px',
  },
  activeName: {
    fontSize: '16px',
    fontWeight: 'bold',
  },
  deactivateButton: {
    padding: '8px 16px',
    backgroundColor: '#ef5350',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  signalSection: {
    backgroundColor: '#1e1e1e',
    borderRadius: '6px',
    padding: '15px',
  },
  signalHeader: {
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '10px',
  },
  signalAction: {
    padding: '15px',
    borderRadius: '6px',
    textAlign: 'center',
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '15px',
  },
  signalDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  signalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
  },
  reason: {
    fontSize: '12px',
    color: '#ccc',
    textAlign: 'right',
    maxWidth: '60%',
  },
  indicators: {
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px solid #333',
  },
  indicatorHeader: {
    fontSize: '12px',
    fontWeight: 'bold',
    marginBottom: '8px',
    color: '#888',
  },
};

export default StrategyPanel;
