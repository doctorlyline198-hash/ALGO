# TopstepX Trading Algo Platform

A full-featured algorithmic trading platform built for TopstepX with live SignalR market data integration, pre-built Python trading strategies, RESTful order orchestration, and a sleek React dashboard powered by TradingView Lightweight Charts.

## Features

### Backend (Python/Flask)
- **Live Market Data**: SignalR client for real-time market data streaming from TopstepX
- **Trading Strategies**:
  - **ATR Breakout**: Enters trades on volatility-based band breakouts
  - **Mean Reversion**: Bollinger Band-based mean reversion strategy
  - **ICT Killzones**: Trades during high-probability London/NY killzone hours with order block detection
- **Order Orchestration**: RESTful API for order creation, execution, and management
- **Position Management**: Real-time position tracking with P&L calculations
- **Supported Contracts**: NQ, ES, GC, MGC

### Frontend (React)
- **TradingView Lightweight Charts**: Professional candlestick charts with real-time updates
- **Contract Selector**: Dropdown for NQ, ES, GC, MGC contracts
- **Timeframe Selection**: 1min, 5min, 15min, 1hour timeframes
- **Order Panel**: Place market/limit orders with quantity control
- **Strategy Control**: Activate/deactivate strategies and view signals in real-time
- **Position Display**: Live position tracking with unrealized P&L
- **Responsive Design**: Modern, dark-themed UI optimized for trading

## Project Structure

```
ALGO/
├── backend/
│   ├── strategies/          # Trading strategy implementations
│   │   ├── base_strategy.py
│   │   ├── atr_breakout.py
│   │   ├── mean_reversion.py
│   │   └── ict_killzones.py
│   ├── data/                # Market data clients
│   │   └── signalr_client.py
│   ├── api/                 # Order management
│   │   └── order_manager.py
│   ├── app.py              # Flask REST API server
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── TradingChart.js
│   │   │   ├── OrderPanel.js
│   │   │   ├── StrategyPanel.js
│   │   │   └── PositionDisplay.js
│   │   ├── services/       # API service layer
│   │   │   └── api.js
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   ├── public/
│   │   └── index.html
│   ├── package.json
│   └── .env
├── config/
│   └── .env.example
└── README.md
```

## Installation

### Prerequisites
- Python 3.8+
- Node.js 16+
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure environment variables (optional):
```bash
cp ../config/.env.example .env
# Edit .env with your TopstepX API credentials
```

5. Start the Flask API server:
```bash
python app.py
```

The backend API will be available at `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the React development server:
```bash
npm start
```

The frontend will be available at `http://localhost:3000`

## Usage

### Viewing Market Data
1. Select a contract (NQ, ES, GC, MGC) from the dropdown
2. Choose your preferred timeframe (1min, 5min, 15min, 1h)
3. The chart will automatically update with live data

### Trading
1. Use the Order Panel to:
   - Select BUY or SELL
   - Choose order type (Market or Limit)
   - Enter quantity
   - Submit the order

2. View your positions in the Position Display panel
   - Current quantity and side (Long/Short)
   - Average entry price
   - Unrealized and realized P&L

### Using Strategies
1. In the Strategy Panel, select a strategy:
   - ATR Breakout
   - Mean Reversion
   - ICT Killzones

2. Click "Activate Strategy"

3. View real-time signals:
   - BUY/SELL/HOLD signals
   - Entry price and reasoning
   - Stop loss and take profit levels
   - Technical indicators

4. Deactivate when needed

## API Endpoints

### Market Data
- `GET /api/contracts` - Get supported contracts
- `GET /api/market-data/:symbol` - Get historical bars
- `GET /api/market-data/:symbol/live` - Get live price

### Orders
- `POST /api/orders` - Create new order
- `GET /api/orders` - Get all orders
- `GET /api/orders/:id` - Get specific order
- `DELETE /api/orders/:id` - Cancel order

### Positions
- `GET /api/positions` - Get all positions
- `GET /api/positions/:symbol` - Get position for symbol

### Strategies
- `GET /api/strategies` - List available strategies
- `POST /api/strategies/:symbol/activate` - Activate strategy
- `POST /api/strategies/:symbol/deactivate` - Deactivate strategy
- `GET /api/strategies/:symbol/signal` - Get current signal

## Trading Strategies

### ATR Breakout
- Uses Average True Range (ATR) to measure volatility
- Creates upper/lower bands around a moving average
- Long: Price breaks above upper band
- Short: Price breaks below lower band
- Risk/Reward: 2:3 ratio using ATR-based stops

### Mean Reversion
- Uses Bollinger Bands (20-period SMA ± 2 standard deviations)
- Long: Price touches/breaks below lower band (oversold)
- Short: Price touches/breaks above upper band (overbought)
- Exits when price returns to the middle band

### ICT Killzones
- Trades during specific high-probability time windows:
  - London Killzone: 07:00-10:00 UTC
  - New York Killzone: 12:00-15:00 UTC
- Identifies order blocks (institutional support/resistance)
- Only trades when trend aligns with order block direction
- Based on Inner Circle Trader concepts

## Development

### Running Tests
```bash
# Backend
cd backend
python -m pytest

# Frontend
cd frontend
npm test
```

### Building for Production
```bash
# Frontend
cd frontend
npm run build
```

## Configuration

### Backend
Edit `config/.env.example` and save as `.env`:
- `SIGNALR_HUB_URL`: TopstepX SignalR endpoint
- `SIGNALR_API_KEY`: Your API credentials
- `ENABLE_PAPER_TRADING`: Enable/disable paper trading mode

### Frontend
Edit `frontend/.env`:
- `REACT_APP_API_URL`: Backend API URL (default: http://localhost:5000)

## Features Roadmap

- [ ] Real SignalR integration with TopstepX API
- [ ] Persistent storage with database
- [ ] Backtesting engine
- [ ] Strategy optimization tools
- [ ] Multi-account support
- [ ] Email/SMS notifications
- [ ] Trade journal and analytics
- [ ] Custom indicator builder
- [ ] Mobile responsive improvements

## Technologies Used

### Backend
- Python 3.8+
- Flask (REST API)
- SignalR Core (Real-time data)
- Pandas & NumPy (Data analysis)

### Frontend
- React 18
- TradingView Lightweight Charts
- Axios (HTTP client)
- CSS3 (Styling)

## License

MIT License - feel free to use this code for your own trading projects.

## Disclaimer

This software is for educational purposes only. Trading futures and other financial instruments carries risk. Always test strategies thoroughly before using real capital. The authors are not responsible for any financial losses incurred using this platform.

## Support

For issues, questions, or contributions, please open an issue on the GitHub repository.

---

Built with ❤️ for algorithmic traders
