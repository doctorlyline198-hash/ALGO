#!/usr/bin/env python3
"""
Simple test script for the backend API
Tests the core functionality without external dependencies
"""
import sys
import json

# Test imports
try:
    print("Testing imports...")
    from api.order_manager import OrderManager, Order
    from strategies.atr_breakout import ATRBreakoutStrategy
    from strategies.mean_reversion import MeanReversionStrategy
    from strategies.ict_killzones import ICTKillzonesStrategy
    import pandas as pd
    import numpy as np
    print("✓ All imports successful")
except ImportError as e:
    print(f"✗ Import error: {e}")
    sys.exit(1)

# Test OrderManager
print("\nTesting OrderManager...")
om = OrderManager()

# Create test order
order = om.create_order('NQ', 'BUY', 1, 'MARKET', 16000.0)
print(f"✓ Created order: {order.id}")

# Get order
retrieved = om.get_order(order.id)
print(f"✓ Retrieved order: {retrieved.status}")

# Get position
position = om.get_position('NQ')
print(f"✓ Position quantity: {position['quantity']}")

# Test ATR Breakout Strategy
print("\nTesting ATR Breakout Strategy...")
strategy = ATRBreakoutStrategy('NQ', '1min')

# Create sample data
data = []
base_price = 16000.0
for i in range(30):
    price_change = np.random.randn() * 5
    data.append({
        'timestamp': f'2024-01-01T00:{i:02d}:00',
        'open': base_price,
        'high': base_price + abs(price_change) + 2,
        'low': base_price - abs(price_change) - 2,
        'close': base_price + price_change,
        'volume': 100
    })
    base_price += price_change

for bar in data:
    strategy.update(bar)

df = strategy.get_dataframe()
signal = strategy.calculate_signals(df)
print(f"✓ ATR signal: {signal['action'] if signal else 'None'}")

# Test Mean Reversion Strategy
print("\nTesting Mean Reversion Strategy...")
mr_strategy = MeanReversionStrategy('ES', '1min')
for bar in data:
    mr_strategy.update(bar)

df = mr_strategy.get_dataframe()
signal = mr_strategy.calculate_signals(df)
print(f"✓ Mean Reversion signal: {signal['action'] if signal else 'None'}")

# Test ICT Killzones Strategy
print("\nTesting ICT Killzones Strategy...")
ict_strategy = ICTKillzonesStrategy('GC', '1min')
for bar in data:
    ict_strategy.update(bar)

df = ict_strategy.get_dataframe()
signal = ict_strategy.calculate_signals(df)
print(f"✓ ICT signal: {signal['action'] if signal else 'None'}")

print("\n" + "="*50)
print("All tests passed! ✓")
print("="*50)
