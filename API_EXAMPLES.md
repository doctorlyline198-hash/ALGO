# TopstepX Trading Platform - API Examples

This document provides practical examples of using the TopstepX Trading Platform API.

## Base URL

```
http://localhost:5000
```

## Authentication

Currently, the demo version does not require authentication. In production, you would add an API key header:

```bash
-H "Authorization: Bearer YOUR_API_KEY"
```

## Market Data Endpoints

### Get Available Contracts

```bash
curl http://localhost:5000/api/contracts
```

**Response:**
```json
{
  "contracts": ["NQ", "ES", "GC", "MGC"],
  "count": 4
}
```

### Get Historical Market Data

```bash
curl "http://localhost:5000/api/market-data/NQ?timeframe=1min&limit=50"
```

**Response:**
```json
{
  "symbol": "NQ",
  "timeframe": "1min",
  "bars": [
    {
      "timestamp": "2024-01-01T00:00:00",
      "open": 16000.0,
      "high": 16005.0,
      "low": 15995.0,
      "close": 16002.5,
      "volume": 250
    }
  ],
  "current_price": 16002.5,
  "last_update": "2024-01-01T00:01:00"
}
```

### Get Live Price

```bash
curl http://localhost:5000/api/market-data/NQ/live
```

**Response:**
```json
{
  "symbol": "NQ",
  "price": 16002.5,
  "bid": 16002.25,
  "ask": 16002.75,
  "timestamp": "2024-01-01T00:01:00"
}
```

## Order Management Endpoints

### Create Market Order (Buy)

```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "NQ",
    "side": "BUY",
    "quantity": 1,
    "order_type": "MARKET"
  }'
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "symbol": "NQ",
  "side": "BUY",
  "quantity": 1,
  "order_type": "MARKET",
  "price": null,
  "status": "FILLED",
  "filled_price": 16002.5,
  "filled_quantity": 1,
  "created_at": "2024-01-01T00:01:00",
  "updated_at": "2024-01-01T00:01:00",
  "stop_loss": null,
  "take_profit": null
}
```

### Create Limit Order (Sell)

```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "ES",
    "side": "SELL",
    "quantity": 2,
    "order_type": "LIMIT",
    "price": 4805.0,
    "stop_loss": 4810.0,
    "take_profit": 4795.0
  }'
```

**Response:**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "symbol": "ES",
  "side": "SELL",
  "quantity": 2,
  "order_type": "LIMIT",
  "price": 4805.0,
  "status": "PENDING",
  "filled_price": null,
  "filled_quantity": 0,
  "created_at": "2024-01-01T00:01:00",
  "updated_at": "2024-01-01T00:01:00",
  "stop_loss": 4810.0,
  "take_profit": 4795.0
}
```

### Get All Orders

```bash
curl http://localhost:5000/api/orders
```

**Response:**
```json
{
  "orders": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "symbol": "NQ",
      "side": "BUY",
      "status": "FILLED"
    }
  ],
  "count": 1
}
```

### Get Orders for Specific Symbol

```bash
curl "http://localhost:5000/api/orders?symbol=NQ"
```

### Get Specific Order

```bash
curl http://localhost:5000/api/orders/550e8400-e29b-41d4-a716-446655440000
```

### Cancel Order

```bash
curl -X DELETE http://localhost:5000/api/orders/660e8400-e29b-41d4-a716-446655440001
```

**Response:**
```json
{
  "message": "Order cancelled",
  "order_id": "660e8400-e29b-41d4-a716-446655440001"
}
```

## Position Management Endpoints

### Get All Positions

```bash
curl http://localhost:5000/api/positions
```

**Response:**
```json
{
  "positions": [
    {
      "symbol": "NQ",
      "quantity": 1,
      "average_price": 16002.5,
      "unrealized_pnl": 5.0,
      "realized_pnl": 0.0,
      "current_price": 16007.5
    }
  ],
  "count": 1
}
```

### Get Position for Specific Symbol

```bash
curl http://localhost:5000/api/positions/NQ
```

**Response:**
```json
{
  "symbol": "NQ",
  "quantity": 1,
  "average_price": 16002.5,
  "unrealized_pnl": 5.0,
  "realized_pnl": 0.0,
  "current_price": 16007.5
}
```

## Strategy Endpoints

### Get Available Strategies

```bash
curl http://localhost:5000/api/strategies
```

**Response:**
```json
{
  "strategies": [
    {
      "name": "ATR Breakout",
      "description": "Enters trades on ATR-based band breakouts",
      "parameters": ["period", "atr_multiplier"]
    },
    {
      "name": "Mean Reversion",
      "description": "Trades based on Bollinger Band reversals",
      "parameters": ["period", "std_dev"]
    },
    {
      "name": "ICT Killzones",
      "description": "Trades during London/NY killzone hours with order blocks",
      "parameters": ["sma_period"]
    }
  ]
}
```

### Activate Strategy

```bash
curl -X POST http://localhost:5000/api/strategies/NQ/activate \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "ATR Breakout"
  }'
```

**Response:**
```json
{
  "message": "Strategy ATR Breakout activated for NQ",
  "symbol": "NQ",
  "strategy": "ATR Breakout"
}
```

### Get Strategy Signal

```bash
curl http://localhost:5000/api/strategies/NQ/signal
```

**Response (BUY Signal):**
```json
{
  "symbol": "NQ",
  "strategy": "ATR Breakout",
  "signal": {
    "action": "BUY",
    "price": 16025.0,
    "reason": "ATR Breakout Long: Price 16025.00 > Upper Band 16020.00",
    "stop_loss": 15995.0,
    "take_profit": 16055.0,
    "indicators": {
      "atr": 10.0,
      "upper_band": 16020.0,
      "lower_band": 15980.0
    }
  }
}
```

**Response (HOLD Signal):**
```json
{
  "symbol": "NQ",
  "strategy": "Mean Reversion",
  "signal": {
    "action": "HOLD",
    "price": 16000.0,
    "reason": "Waiting for mean reversion opportunity",
    "indicators": {
      "sma": 16000.0,
      "upper_band": 16040.0,
      "lower_band": 15960.0,
      "bb_position": 0.5
    }
  }
}
```

### Deactivate Strategy

```bash
curl -X POST http://localhost:5000/api/strategies/NQ/deactivate
```

**Response:**
```json
{
  "message": "Strategy deactivated for NQ"
}
```

## Python Examples

### Using requests library

```python
import requests
import json

BASE_URL = "http://localhost:5000"

# Get market data
response = requests.get(f"{BASE_URL}/api/market-data/NQ/live")
data = response.json()
print(f"Current NQ price: ${data['price']}")

# Place a buy order
order_data = {
    "symbol": "NQ",
    "side": "BUY",
    "quantity": 1,
    "order_type": "MARKET"
}
response = requests.post(
    f"{BASE_URL}/api/orders",
    headers={"Content-Type": "application/json"},
    data=json.dumps(order_data)
)
order = response.json()
print(f"Order placed: {order['id']}, Status: {order['status']}")

# Check position
response = requests.get(f"{BASE_URL}/api/positions/NQ")
position = response.json()
print(f"Position: {position['quantity']} contracts @ ${position['average_price']}")
print(f"P&L: ${position['unrealized_pnl']}")

# Activate strategy
strategy_data = {"strategy": "ATR Breakout"}
response = requests.post(
    f"{BASE_URL}/api/strategies/NQ/activate",
    headers={"Content-Type": "application/json"},
    data=json.dumps(strategy_data)
)
print(response.json()['message'])

# Get strategy signal
response = requests.get(f"{BASE_URL}/api/strategies/NQ/signal")
signal = response.json()['signal']
print(f"Signal: {signal['action']} at ${signal['price']}")
print(f"Reason: {signal['reason']}")
```

## JavaScript Examples

### Using fetch API

```javascript
const BASE_URL = 'http://localhost:5000';

// Get market data
async function getMarketData(symbol) {
  const response = await fetch(`${BASE_URL}/api/market-data/${symbol}/live`);
  const data = await response.json();
  console.log(`Current ${symbol} price: $${data.price}`);
  return data;
}

// Place order
async function placeOrder(symbol, side, quantity) {
  const response = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      symbol,
      side,
      quantity,
      order_type: 'MARKET'
    })
  });
  const order = await response.json();
  console.log(`Order placed: ${order.id}, Status: ${order.status}`);
  return order;
}

// Check position
async function getPosition(symbol) {
  const response = await fetch(`${BASE_URL}/api/positions/${symbol}`);
  const position = await response.json();
  console.log(`Position: ${position.quantity} @ $${position.average_price}`);
  console.log(`P&L: $${position.unrealized_pnl}`);
  return position;
}

// Activate strategy
async function activateStrategy(symbol, strategyName) {
  const response = await fetch(`${BASE_URL}/api/strategies/${symbol}/activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ strategy: strategyName })
  });
  const result = await response.json();
  console.log(result.message);
  return result;
}

// Get strategy signal
async function getSignal(symbol) {
  const response = await fetch(`${BASE_URL}/api/strategies/${symbol}/signal`);
  const data = await response.json();
  const signal = data.signal;
  console.log(`Signal: ${signal.action} at $${signal.price}`);
  console.log(`Reason: ${signal.reason}`);
  return signal;
}

// Example usage
async function tradingExample() {
  // Get current price
  await getMarketData('NQ');
  
  // Place buy order
  await placeOrder('NQ', 'BUY', 1);
  
  // Check position
  await getPosition('NQ');
  
  // Activate strategy
  await activateStrategy('NQ', 'ATR Breakout');
  
  // Monitor signals
  setInterval(async () => {
    const signal = await getSignal('NQ');
    if (signal.action === 'BUY') {
      console.log('BUY signal detected!');
    } else if (signal.action === 'SELL') {
      console.log('SELL signal detected!');
    }
  }, 5000);
}

tradingExample();
```

## Error Responses

### Order Validation Error
```json
{
  "error": "Missing required fields"
}
```

### Symbol Not Found
```json
{
  "error": "Unsupported contract: INVALID"
}
```

### Order Not Found
```json
{
  "error": "Order not found"
}
```

### Strategy Not Active
```json
{
  "error": "No active strategy for this symbol"
}
```

## Rate Limiting

Currently no rate limiting in demo version. Production should implement:
- 100 requests per minute for market data
- 50 requests per minute for orders
- 20 requests per minute for strategies

## WebSocket (Future)

For real-time updates, SignalR WebSocket will be available:

```javascript
const connection = new signalR.HubConnectionBuilder()
  .withUrl("http://localhost:5000/marketdata")
  .build();

connection.on("ReceiveMarketData", (data) => {
  console.log(`${data.symbol}: $${data.price}`);
});

connection.start();
connection.invoke("Subscribe", "NQ", "1min");
```

---

These examples demonstrate the complete API functionality of the TopstepX Trading Platform. Use them as a reference for building custom trading applications and integrations.
