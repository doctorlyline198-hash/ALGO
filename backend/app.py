"""
Flask REST API for TopstepX Trading Platform
Provides endpoints for order management, market data, and strategy control
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
import sys
import os
import pandas as pd
from datetime import datetime, timedelta
import random

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.order_manager import OrderManager
from data.signalr_client import MockMarketDataClient
from strategies.atr_breakout import ATRBreakoutStrategy
from strategies.mean_reversion import MeanReversionStrategy
from strategies.ict_killzones import ICTKillzonesStrategy

app = Flask(__name__)
CORS(app)

# Initialize managers and clients
order_manager = OrderManager()
market_data_client = MockMarketDataClient()

# Supported contracts
CONTRACTS = ['NQ', 'ES', 'GC', 'MGC']

# Active strategies
active_strategies = {}

# Market data cache
market_data_cache = {}


def initialize_market_data():
    """Initialize mock market data for supported contracts"""
    base_prices = {
        'NQ': 16000.0,
        'ES': 4800.0,
        'GC': 2050.0,
        'MGC': 2050.0
    }
    
    for contract in CONTRACTS:
        # Generate initial candles (last 100 bars)
        bars = []
        current_time = datetime.utcnow() - timedelta(minutes=100)
        current_price = base_prices[contract]
        
        for i in range(100):
            # Random walk for demo
            change = random.uniform(-0.5, 0.5)
            open_price = current_price
            close_price = current_price + change
            high_price = max(open_price, close_price) + random.uniform(0, 0.3)
            low_price = min(open_price, close_price) - random.uniform(0, 0.3)
            
            bars.append({
                'timestamp': current_time.isoformat(),
                'open': open_price,
                'high': high_price,
                'low': low_price,
                'close': close_price,
                'volume': random.randint(100, 1000)
            })
            
            current_time += timedelta(minutes=1)
            current_price = close_price
        
        market_data_cache[contract] = {
            'bars': bars,
            'current_price': current_price,
            'last_update': datetime.utcnow()
        }


# Initialize data on startup
initialize_market_data()


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})


@app.route('/api/contracts', methods=['GET'])
def get_contracts():
    """Get list of supported contracts"""
    return jsonify({
        'contracts': CONTRACTS,
        'count': len(CONTRACTS)
    })


@app.route('/api/market-data/<symbol>', methods=['GET'])
def get_market_data(symbol):
    """Get market data for a symbol"""
    if symbol not in CONTRACTS:
        return jsonify({'error': f'Unsupported contract: {symbol}'}), 400
    
    timeframe = request.args.get('timeframe', '1min')
    limit = int(request.args.get('limit', 100))
    
    if symbol not in market_data_cache:
        return jsonify({'error': 'No data available'}), 404
    
    data = market_data_cache[symbol]
    bars = data['bars'][-limit:]
    
    return jsonify({
        'symbol': symbol,
        'timeframe': timeframe,
        'bars': bars,
        'current_price': data['current_price'],
        'last_update': data['last_update'].isoformat()
    })


@app.route('/api/market-data/<symbol>/live', methods=['GET'])
def get_live_data(symbol):
    """Get current live price for a symbol"""
    if symbol not in CONTRACTS:
        return jsonify({'error': f'Unsupported contract: {symbol}'}), 400
    
    if symbol not in market_data_cache:
        return jsonify({'error': 'No data available'}), 404
    
    data = market_data_cache[symbol]
    current_price = data['current_price']
    
    return jsonify({
        'symbol': symbol,
        'price': current_price,
        'bid': current_price - 0.25,
        'ask': current_price + 0.25,
        'timestamp': datetime.utcnow().isoformat()
    })


@app.route('/api/orders', methods=['POST'])
def create_order():
    """Create a new order"""
    data = request.json
    
    symbol = data.get('symbol')
    side = data.get('side')
    quantity = data.get('quantity')
    order_type = data.get('order_type', 'MARKET')
    price = data.get('price')
    stop_loss = data.get('stop_loss')
    take_profit = data.get('take_profit')
    
    if not all([symbol, side, quantity]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    if symbol not in CONTRACTS:
        return jsonify({'error': f'Unsupported contract: {symbol}'}), 400
    
    if side not in ['BUY', 'SELL']:
        return jsonify({'error': 'Invalid side. Must be BUY or SELL'}), 400
    
    # Use current market price if not specified
    if not price and symbol in market_data_cache:
        price = market_data_cache[symbol]['current_price']
    
    order = order_manager.create_order(
        symbol, side, quantity, order_type, price, stop_loss, take_profit
    )
    
    return jsonify(order.to_dict()), 201


@app.route('/api/orders', methods=['GET'])
def get_orders():
    """Get all orders"""
    symbol = request.args.get('symbol')
    orders = order_manager.get_all_orders(symbol)
    return jsonify({
        'orders': [o.to_dict() for o in orders],
        'count': len(orders)
    })


@app.route('/api/orders/<order_id>', methods=['GET'])
def get_order(order_id):
    """Get specific order"""
    order = order_manager.get_order(order_id)
    if not order:
        return jsonify({'error': 'Order not found'}), 404
    return jsonify(order.to_dict())


@app.route('/api/orders/<order_id>', methods=['DELETE'])
def cancel_order(order_id):
    """Cancel an order"""
    success = order_manager.cancel_order(order_id)
    if not success:
        return jsonify({'error': 'Cannot cancel order'}), 400
    return jsonify({'message': 'Order cancelled', 'order_id': order_id})


@app.route('/api/positions', methods=['GET'])
def get_positions():
    """Get all positions"""
    positions = order_manager.get_all_positions()
    return jsonify({
        'positions': positions,
        'count': len(positions)
    })


@app.route('/api/positions/<symbol>', methods=['GET'])
def get_position(symbol):
    """Get position for a symbol"""
    if symbol not in CONTRACTS:
        return jsonify({'error': f'Unsupported contract: {symbol}'}), 400
    
    position = order_manager.get_position(symbol)
    
    # Update PnL with current price
    if symbol in market_data_cache:
        order_manager.update_position_pnl(symbol, market_data_cache[symbol]['current_price'])
        position = order_manager.get_position(symbol)
    
    return jsonify(position)


@app.route('/api/strategies', methods=['GET'])
def get_strategies():
    """Get available strategies"""
    strategies = [
        {
            'name': 'ATR Breakout',
            'description': 'Enters trades on ATR-based band breakouts',
            'parameters': ['period', 'atr_multiplier']
        },
        {
            'name': 'Mean Reversion',
            'description': 'Trades based on Bollinger Band reversals',
            'parameters': ['period', 'std_dev']
        },
        {
            'name': 'ICT Killzones',
            'description': 'Trades during London/NY killzone hours with order blocks',
            'parameters': ['sma_period']
        }
    ]
    return jsonify({'strategies': strategies})


@app.route('/api/strategies/<symbol>/activate', methods=['POST'])
def activate_strategy(symbol):
    """Activate a strategy for a symbol"""
    data = request.json
    strategy_name = data.get('strategy')
    
    if symbol not in CONTRACTS:
        return jsonify({'error': f'Unsupported contract: {symbol}'}), 400
    
    # Create strategy instance
    if strategy_name == 'ATR Breakout':
        strategy = ATRBreakoutStrategy(symbol, timeframe='1min')
    elif strategy_name == 'Mean Reversion':
        strategy = MeanReversionStrategy(symbol, timeframe='1min')
    elif strategy_name == 'ICT Killzones':
        strategy = ICTKillzonesStrategy(symbol, timeframe='1min')
    else:
        return jsonify({'error': f'Unknown strategy: {strategy_name}'}), 400
    
    active_strategies[symbol] = strategy
    
    return jsonify({
        'message': f'Strategy {strategy_name} activated for {symbol}',
        'symbol': symbol,
        'strategy': strategy_name
    })


@app.route('/api/strategies/<symbol>/deactivate', methods=['POST'])
def deactivate_strategy(symbol):
    """Deactivate strategy for a symbol"""
    if symbol in active_strategies:
        del active_strategies[symbol]
        return jsonify({'message': f'Strategy deactivated for {symbol}'})
    return jsonify({'error': 'No active strategy for this symbol'}), 404


@app.route('/api/strategies/<symbol>/signal', methods=['GET'])
def get_strategy_signal(symbol):
    """Get current strategy signal for a symbol"""
    if symbol not in active_strategies:
        return jsonify({'error': 'No active strategy for this symbol'}), 404
    
    if symbol not in market_data_cache:
        return jsonify({'error': 'No market data available'}), 404
    
    strategy = active_strategies[symbol]
    bars = market_data_cache[symbol]['bars']
    
    # Update strategy with latest bars
    for bar in bars[-10:]:
        strategy.update(bar)
    
    # Get signal
    df = strategy.get_dataframe()
    signal = strategy.calculate_signals(df)
    
    return jsonify({
        'symbol': symbol,
        'strategy': strategy.name,
        'signal': signal
    })


if __name__ == '__main__':
    print("Starting TopstepX Trading API Server...")
    print(f"Available contracts: {', '.join(CONTRACTS)}")
    app.run(host='0.0.0.0', port=5000, debug=True)
