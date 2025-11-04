/**
 * API Service for TopstepX Trading Platform
 * Handles all REST API communication with the backend
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

class ApiService {
  /**
   * Get list of supported contracts
   */
  async getContracts() {
    const response = await fetch(`${API_BASE_URL}/api/contracts`);
    return response.json();
  }

  /**
   * Get market data for a symbol
   */
  async getMarketData(symbol, timeframe = '1min', limit = 100) {
    const response = await fetch(
      `${API_BASE_URL}/api/market-data/${symbol}?timeframe=${timeframe}&limit=${limit}`
    );
    return response.json();
  }

  /**
   * Get live price for a symbol
   */
  async getLiveData(symbol) {
    const response = await fetch(`${API_BASE_URL}/api/market-data/${symbol}/live`);
    return response.json();
  }

  /**
   * Create a new order
   */
  async createOrder(orderData) {
    const response = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });
    return response.json();
  }

  /**
   * Get all orders
   */
  async getOrders(symbol = null) {
    const url = symbol 
      ? `${API_BASE_URL}/api/orders?symbol=${symbol}`
      : `${API_BASE_URL}/api/orders`;
    const response = await fetch(url);
    return response.json();
  }

  /**
   * Get specific order
   */
  async getOrder(orderId) {
    const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`);
    return response.json();
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId) {
    const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
      method: 'DELETE',
    });
    return response.json();
  }

  /**
   * Get all positions
   */
  async getPositions() {
    const response = await fetch(`${API_BASE_URL}/api/positions`);
    return response.json();
  }

  /**
   * Get position for a specific symbol
   */
  async getPosition(symbol) {
    const response = await fetch(`${API_BASE_URL}/api/positions/${symbol}`);
    return response.json();
  }

  /**
   * Get available strategies
   */
  async getStrategies() {
    const response = await fetch(`${API_BASE_URL}/api/strategies`);
    return response.json();
  }

  /**
   * Activate a strategy for a symbol
   */
  async activateStrategy(symbol, strategy) {
    const response = await fetch(`${API_BASE_URL}/api/strategies/${symbol}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ strategy }),
    });
    return response.json();
  }

  /**
   * Deactivate strategy for a symbol
   */
  async deactivateStrategy(symbol) {
    const response = await fetch(`${API_BASE_URL}/api/strategies/${symbol}/deactivate`, {
      method: 'POST',
    });
    return response.json();
  }

  /**
   * Get current strategy signal
   */
  async getStrategySignal(symbol) {
    const response = await fetch(`${API_BASE_URL}/api/strategies/${symbol}/signal`);
    return response.json();
  }

  /**
   * Check API health
   */
  async healthCheck() {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.json();
  }
}

export default new ApiService();
