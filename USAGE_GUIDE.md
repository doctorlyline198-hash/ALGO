# TopstepX Trading Platform - User Guide

## Overview

This guide will help you get started with the TopstepX Trading Algo Platform, a complete trading solution with live market data, algorithmic strategies, and a professional dashboard.

## Quick Start

Run the quickstart script to set up both backend and frontend:

```bash
./quickstart.sh
```

Or follow the manual steps below.

## Manual Setup

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create and activate a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Start the API server:
```bash
python app.py
```

The server will start on `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend directory (in a new terminal):
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The dashboard will open automatically at `http://localhost:3000`

## Using the Platform

### 1. Viewing Market Data

When you open the dashboard, you'll see:

- **Contract Selector**: Dropdown to choose between NQ, ES, GC, MGC
- **Timeframe Selector**: Choose between 1min, 5min, 15min, 1h
- **TradingView Chart**: Real-time candlestick chart with professional styling
- **Current Price Display**: Live price updates in the toolbar

The chart automatically refreshes every 5 seconds with the latest market data.

### 2. Placing Orders

Use the **Order Panel** on the right side:

1. **Select Side**: Click BUY (green) or SELL (red)
2. **Choose Order Type**: 
   - Market: Executes immediately at current price
   - Limit: Specify your desired price
3. **Enter Quantity**: Number of contracts to trade
4. **Submit**: Click "Place [BUY/SELL] Order"

Orders are executed immediately in the demo environment.

### 3. Monitoring Positions

The **Position Display** panel shows:

- Current symbol and side (LONG/SHORT)
- Quantity held
- Average entry price
- Current market price
- Unrealized P&L (profit/loss on open position)
- Realized P&L (profit/loss on closed trades)

Position updates automatically every 3 seconds.

### 4. Using Trading Strategies

The **Strategy Panel** allows you to activate algorithmic strategies:

#### Available Strategies:

**ATR Breakout**
- Momentum-based strategy using Average True Range
- Enters when price breaks volatility bands
- Good for trending markets
- Automatic stop loss and take profit levels

**Mean Reversion**
- Uses Bollinger Bands to identify extremes
- Enters when price is oversold/overbought
- Exits at mean reversion to moving average
- Good for range-bound markets

**ICT Killzones**
- Time-based strategy for London/NY sessions
- Uses order block detection
- Only trades during high-probability hours
- Based on institutional trading concepts

#### To Use a Strategy:

1. Select a strategy from the dropdown
2. Click "Activate Strategy"
3. View real-time signals:
   - **BUY**: Algorithm suggests going long
   - **SELL**: Algorithm suggests going short
   - **HOLD**: Waiting for setup
4. See detailed reasoning and indicators
5. Click "Deactivate" to stop the strategy

Signals update every 5 seconds.

## API Reference

All API endpoints are documented in the main README.md.

### Example API Calls

**Get Current Price:**
```bash
curl http://localhost:5000/api/market-data/NQ/live
```

**Place a Buy Order:**
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

**Check Position:**
```bash
curl http://localhost:5000/api/positions/NQ
```

**Get Strategy Signal:**
```bash
curl http://localhost:5000/api/strategies/NQ/signal
```

## Understanding the Contracts

- **NQ (Nasdaq-100 E-mini)**: Tech-heavy index futures
- **ES (S&P 500 E-mini)**: Broad market index futures
- **GC (Gold Futures)**: Full gold contract
- **MGC (Micro Gold Futures)**: Smaller gold contract

## Tips for Success

1. **Start Small**: Begin with 1 contract to understand the platform
2. **Test Strategies**: Try different strategies in various market conditions
3. **Monitor Signals**: Pay attention to the reasoning behind strategy signals
4. **Use Timeframes**: Different timeframes suit different trading styles
5. **Check Positions**: Always know your current exposure
6. **Risk Management**: Use stop losses and position sizing

## Customization

### Backend Configuration

Edit `config/.env.example` and save as `.env`:

```bash
# API Configuration
API_PORT=5000
FLASK_DEBUG=True

# Trading Settings
DEFAULT_TIMEFRAME=1min
MAX_POSITION_SIZE=10
ENABLE_PAPER_TRADING=True
```

### Frontend Configuration

Edit `frontend/.env`:

```bash
REACT_APP_API_URL=http://localhost:5000
```

## Troubleshooting

### Backend Issues

**Port already in use:**
```bash
# Find and kill process on port 5000
lsof -ti:5000 | xargs kill -9
```

**Module import errors:**
```bash
# Ensure virtual environment is activated
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend Issues

**npm install fails:**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Chart not displaying:**
- Check browser console for errors
- Ensure backend API is running
- Verify REACT_APP_API_URL in .env

### API Connection Issues

**CORS errors:**
- Backend uses flask-cors for all origins
- Check that backend is running on port 5000

**No data showing:**
- Backend generates mock data automatically
- Check backend console for errors
- Try refreshing the browser

## Development Mode

### Hot Reload

Both backend and frontend support hot reload:

- **Backend**: Flask debug mode auto-reloads on file changes
- **Frontend**: React dev server auto-reloads on file changes

### Adding Custom Strategies

1. Create a new file in `backend/strategies/`
2. Inherit from `Strategy` base class
3. Implement `calculate_signals()` method
4. Import in `backend/app.py`
5. Add to strategies list in API

Example:
```python
from .base_strategy import Strategy

class MyStrategy(Strategy):
    def calculate_signals(self, data):
        # Your logic here
        return {
            'action': 'BUY',
            'price': current_price,
            'reason': 'My reason'
        }
```

## Production Deployment

### Backend

1. Use production WSGI server (Gunicorn):
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

2. Set environment variables:
```bash
export FLASK_ENV=production
export FLASK_DEBUG=False
```

### Frontend

1. Build for production:
```bash
npm run build
```

2. Serve static files with nginx or similar

3. Update API URL in production `.env`

## Support

For issues or questions:
1. Check the main README.md
2. Review this user guide
3. Check the code comments
4. Open an issue on GitHub

## Next Steps

1. Explore the codebase
2. Customize strategies
3. Add new contracts
4. Implement backtesting
5. Add persistent storage
6. Connect to real TopstepX API

---

Happy Trading! 📈
