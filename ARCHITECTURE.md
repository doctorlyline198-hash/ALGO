# TopstepX Trading Platform - Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                           │
│  ┌───────────┐  ┌────────────┐  ┌──────────────────────┐   │
│  │ TradingView│  │  Order     │  │  Strategy Control    │   │
│  │   Charts   │  │  Panel     │  │     Panel            │   │
│  └─────┬─────┘  └──────┬─────┘  └──────────┬───────────┘   │
│        │               │                    │                │
│        └───────────────┴────────────────────┘                │
│                        │                                     │
│                   API Service Layer                          │
│                        │                                     │
└────────────────────────┼─────────────────────────────────────┘
                         │ HTTP/REST
                         │
┌────────────────────────┼─────────────────────────────────────┐
│                        │        Flask Backend                 │
│                   REST API Server                             │
│  ┌─────────────────────┴──────────────────────────────┐      │
│  │                                                     │      │
│  │  ┌──────────────┐  ┌───────────────┐  ┌─────────┐ │      │
│  │  │   Market     │  │     Order     │  │Strategy │ │      │
│  │  │   Data       │  │   Manager     │  │ Engine  │ │      │
│  │  │   Client     │  │               │  │         │ │      │
│  │  └──────┬───────┘  └───────────────┘  └─────────┘ │      │
│  │         │                                          │      │
│  └─────────┼──────────────────────────────────────────┘      │
│            │                                                  │
│     ┌──────┴────────┐                                        │
│     │  SignalR      │  (Mock for demo)                       │
│     │  Client       │                                        │
│     └───────────────┘                                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                         │
                         │ SignalR (WebSocket)
                         ↓
              ┌──────────────────────┐
              │  TopstepX Market     │
              │  Data Feed           │
              │  (External Service)  │
              └──────────────────────┘
```

## Component Breakdown

### Frontend (React)

#### 1. TradingChart Component
- **Purpose**: Display real-time candlestick charts
- **Technology**: TradingView Lightweight Charts
- **Features**:
  - Professional candlestick visualization
  - Real-time data updates
  - Responsive design
  - Dark theme optimized for trading
- **Data Flow**: 
  - Fetches historical bars via API
  - Updates every 5 seconds
  - Converts timestamps and formats OHLCV data

#### 2. OrderPanel Component
- **Purpose**: Place and manage orders
- **Features**:
  - BUY/SELL toggle buttons
  - Market/Limit order types
  - Quantity input
  - Current price display
- **Actions**:
  - Submits orders to backend API
  - Validates inputs
  - Provides user feedback

#### 3. StrategyPanel Component
- **Purpose**: Control trading strategies
- **Features**:
  - Strategy selection dropdown
  - Activate/deactivate controls
  - Real-time signal display
  - Indicator visualization
- **Updates**: Polls for signals every 5 seconds

#### 4. PositionDisplay Component
- **Purpose**: Show current positions and P&L
- **Features**:
  - Position quantity and side
  - Average entry price
  - Unrealized/realized P&L
  - Color-coded profit/loss
- **Updates**: Refreshes every 3 seconds

#### 5. API Service Layer
- **Purpose**: Centralized API communication
- **Pattern**: Service singleton pattern
- **Features**:
  - All REST API calls
  - Error handling
  - Response parsing
  - Base URL configuration

### Backend (Python/Flask)

#### 1. Flask REST API (`app.py`)
- **Purpose**: Main application server
- **Endpoints**:
  - `/health` - Health check
  - `/api/contracts` - List contracts
  - `/api/market-data/:symbol` - Historical data
  - `/api/market-data/:symbol/live` - Live prices
  - `/api/orders` - Order management (CRUD)
  - `/api/positions` - Position tracking
  - `/api/strategies` - Strategy control
- **Features**:
  - CORS enabled
  - JSON responses
  - Mock data generation
  - Error handling

#### 2. Market Data Client (`data/signalr_client.py`)
- **Purpose**: Connect to SignalR for live data
- **Features**:
  - SignalR WebSocket connection
  - Automatic reconnection
  - Event callbacks
  - Mock implementation for testing
- **Events**:
  - `ReceiveMarketData` - Tick updates
  - `ReceiveBar` - Candle updates
  - Connection lifecycle events

#### 3. Order Manager (`api/order_manager.py`)
- **Purpose**: Handle order lifecycle
- **Features**:
  - Order creation and tracking
  - Position management
  - P&L calculation
  - Order execution simulation
- **Data Structures**:
  - `Order` class with status tracking
  - `OrderManager` for lifecycle management
  - Position dictionary per symbol

#### 4. Strategy Engine

##### Base Strategy (`strategies/base_strategy.py`)
- **Purpose**: Abstract base class for all strategies
- **Interface**:
  - `calculate_signals()` - Generate trading signals
  - `update()` - Process new bar data
  - `get_dataframe()` - Convert to pandas DataFrame
  - `reset()` - Clear strategy state

##### ATR Breakout Strategy (`strategies/atr_breakout.py`)
- **Algorithm**:
  1. Calculate ATR (Average True Range)
  2. Create bands: SMA ± (ATR * multiplier)
  3. Long when price > upper band
  4. Short when price < lower band
- **Parameters**:
  - `period`: SMA and ATR period (default: 14)
  - `atr_multiplier`: Band width (default: 2.0)
- **Risk Management**:
  - Stop loss: 2 * ATR from entry
  - Take profit: 3 * ATR from entry

##### Mean Reversion Strategy (`strategies/mean_reversion.py`)
- **Algorithm**:
  1. Calculate Bollinger Bands (SMA ± 2σ)
  2. Long when price ≤ lower band
  3. Short when price ≥ upper band
  4. Exit when price returns to SMA
- **Parameters**:
  - `period`: Moving average period (default: 20)
  - `std_dev`: Standard deviations (default: 2.0)
- **Indicators**:
  - BB width (volatility measure)
  - BB position (price location in bands)

##### ICT Killzones Strategy (`strategies/ict_killzones.py`)
- **Algorithm**:
  1. Check if in killzone hours
  2. Determine trend (price vs SMA)
  3. Detect order blocks
  4. Trade when trend + order block align
- **Killzones**:
  - London: 07:00-10:00 UTC
  - New York: 12:00-15:00 UTC
- **Order Blocks**:
  - Bullish: Last down candle before up move
  - Bearish: Last up candle before down move

## Data Flow

### Market Data Flow

```
TopstepX Feed → SignalR Client → Market Data Cache → API → Frontend → Chart
                                                   ↓
                                              Strategies
```

1. **Data Source**: SignalR stream (mock in demo)
2. **Caching**: In-memory cache of last 100 bars per symbol
3. **Generation**: Mock data with random walk
4. **Distribution**: REST API endpoints
5. **Visualization**: TradingView charts

### Order Flow

```
Frontend Order Panel → API → Order Manager → Position Update → Frontend Display
                                    ↓
                              Order Execution
                                    ↓
                            (Mock execution for demo)
```

1. **Order Creation**: User submits via UI
2. **Validation**: Check symbol, side, quantity
3. **Execution**: Immediate fill at market price (demo)
4. **Position Update**: Calculate new position and P&L
5. **Response**: Return order details to frontend

### Strategy Signal Flow

```
Market Data → Strategy Update → Signal Calculation → API Response → Frontend Display
                ↓                      ↓
           Bar Storage          Indicator Calculation
```

1. **Data Update**: New bars added to strategy
2. **Indicator Calc**: Technical indicators computed
3. **Signal Generation**: Strategy logic applied
4. **Decision**: BUY/SELL/HOLD with reasoning
5. **Display**: Signal shown in strategy panel

## Technology Stack

### Backend
- **Python 3.8+**: Core language
- **Flask**: Web framework
- **Flask-CORS**: Cross-origin support
- **Pandas**: Data manipulation
- **NumPy**: Numerical computation
- **SignalR**: Real-time communication (future)

### Frontend
- **React 18**: UI framework
- **TradingView Lightweight Charts**: Charting library
- **Axios**: HTTP client (via fetch API)
- **CSS3**: Styling

### Communication
- **REST API**: Stateless HTTP/JSON
- **Polling**: 3-5 second intervals for updates
- **SignalR**: WebSocket for real-time (future)

## Design Patterns

### Backend
1. **Strategy Pattern**: Trading strategies
2. **Singleton**: Order manager, market data client
3. **Factory**: Strategy creation
4. **Observer**: Market data callbacks

### Frontend
1. **Component Pattern**: Reusable UI components
2. **Service Pattern**: Centralized API calls
3. **Polling**: Regular data updates
4. **State Management**: React hooks (useState, useEffect)

## Scalability Considerations

### Current Implementation (Demo)
- In-memory data storage
- Synchronous processing
- Single-instance server
- Mock market data

### Production Enhancements
1. **Database**: PostgreSQL/MongoDB for persistence
2. **Caching**: Redis for market data
3. **Queue**: RabbitMQ/Kafka for order processing
4. **WebSocket**: SignalR for real-time updates
5. **Load Balancing**: Multiple API servers
6. **Containerization**: Docker deployment
7. **Monitoring**: Prometheus/Grafana

## Security Considerations

### Current Implementation
- CORS enabled for development
- No authentication (demo only)
- Mock trading environment

### Production Requirements
1. **Authentication**: JWT tokens
2. **Authorization**: Role-based access
3. **HTTPS**: SSL/TLS encryption
4. **API Keys**: TopstepX credentials
5. **Rate Limiting**: Prevent abuse
6. **Input Validation**: Prevent injection
7. **Audit Logging**: Track all trades

## Performance Optimization

### Current Optimizations
- In-memory caching
- Efficient data structures
- Limited historical data (100 bars)
- Pandas vectorization

### Future Optimizations
1. **Database Indexing**: Fast lookups
2. **Caching Layer**: Reduce API calls
3. **Async Processing**: Non-blocking I/O
4. **Data Compression**: Reduce bandwidth
5. **CDN**: Static asset delivery
6. **Code Splitting**: Lazy loading

## Testing Strategy

### Backend Testing
- Unit tests for strategies
- Integration tests for API
- Mock data for reproducibility

### Frontend Testing
- Component unit tests
- Integration tests
- E2E tests with Cypress

### Manual Testing
- Order placement flows
- Strategy activation
- Position tracking
- Chart functionality

## Deployment Architecture

### Development
```
localhost:5000 (Backend) ← → localhost:3000 (Frontend)
```

### Production
```
                    ┌──────────────┐
                    │   Nginx      │
                    │  (Reverse    │
                    │   Proxy)     │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │                         │
        ┌─────▼──────┐          ┌──────▼─────┐
        │   React    │          │   Flask    │
        │   (Static) │          │   (API)    │
        └────────────┘          └──────┬─────┘
                                       │
                              ┌────────┴────────┐
                              │                 │
                         ┌────▼─────┐    ┌─────▼────┐
                         │ Database │    │  Redis   │
                         │ (SQLite/ │    │ (Cache)  │
                         │  Postgres)│    └──────────┘
                         └──────────┘
```

## Future Enhancements

1. **Real SignalR Integration**: Connect to TopstepX
2. **Database Persistence**: Store orders, trades, positions
3. **Backtesting Engine**: Test strategies on historical data
4. **Strategy Optimizer**: Parameter optimization
5. **Multi-Account**: Support multiple trading accounts
6. **Alerts**: Email/SMS notifications
7. **Trade Journal**: Detailed trade analytics
8. **Custom Indicators**: User-defined technical indicators
9. **Mobile App**: React Native mobile version
10. **Machine Learning**: AI-powered strategy signals

---

This architecture provides a solid foundation for a professional trading platform with room for growth and enhancement.
