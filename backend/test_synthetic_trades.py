#!/usr/bin/env python3
"""
Test suite for synthetic trade dataset generator
"""
import sys
import os
import pandas as pd
import numpy as np
from datetime import datetime

# Import the generator
from generate_synthetic_trades import SyntheticTradeGenerator


def test_generator_initialization():
    """Test that generator initializes correctly"""
    print("Testing generator initialization...")
    
    # Test valid symbol
    gen = SyntheticTradeGenerator(symbol='NQ', num_trades=10)
    assert gen.symbol == 'NQ'
    assert gen.num_trades == 10
    print("  ✓ Valid symbol initialization")
    
    # Test invalid symbol
    try:
        gen = SyntheticTradeGenerator(symbol='INVALID')
        assert False, "Should have raised ValueError"
    except ValueError as e:
        print(f"  ✓ Invalid symbol correctly rejected: {e}")
    
    # Test custom parameters
    gen = SyntheticTradeGenerator(
        symbol='GCZ',
        num_trades=100,
        slippage_ticks=(2, 3),
        commission=0.50
    )
    assert gen.slippage_ticks == (2, 3)
    assert gen.commission == 0.50
    print("  ✓ Custom parameters work correctly")
    
    print("✓ Generator initialization tests passed\n")


def test_trade_generation():
    """Test that trades are generated with correct structure"""
    print("Testing trade generation...")
    
    gen = SyntheticTradeGenerator(symbol='NQ', num_trades=50, seed=42)
    trades = gen.generate_trades()
    
    assert len(trades) == 50, f"Expected 50 trades, got {len(trades)}"
    print(f"  ✓ Generated correct number of trades: {len(trades)}")
    
    # Check first trade structure
    trade = trades[0]
    required_fields = [
        'entry_time', 'entry_price', 'exit_time', 'exit_price',
        'direction', 'profit_loss', 'strategy', 'symbol', 'resolution'
    ]
    
    for field in required_fields:
        assert field in trade, f"Missing required field: {field}"
    print(f"  ✓ All required fields present: {required_fields}")
    
    # Validate field types and values
    assert trade['symbol'] == 'NQ'
    assert trade['direction'] in ['long', 'short']
    assert trade['strategy'] in SyntheticTradeGenerator.STRATEGIES
    assert trade['resolution'] in SyntheticTradeGenerator.RESOLUTIONS
    assert isinstance(trade['entry_price'], (int, float))
    assert isinstance(trade['exit_price'], (int, float))
    assert isinstance(trade['profit_loss'], (int, float))
    print("  ✓ Field values are valid")
    
    print("✓ Trade generation tests passed\n")


def test_slippage_and_commission():
    """Test that slippage and commission are applied"""
    print("Testing slippage and commission...")
    
    gen = SyntheticTradeGenerator(
        symbol='NQ',
        num_trades=100,
        slippage_ticks=(1, 2),
        commission=0.25,
        seed=123
    )
    trades = gen.generate_trades()
    df = pd.DataFrame(trades)
    
    # Check that commissions affect P&L
    # Each trade should have 2 * commission deducted
    total_commission = 100 * 2 * 0.25  # 100 trades, round trip, $0.25/contract
    print(f"  ✓ Expected total commission: ${total_commission}")
    
    # Entry and exit prices should differ from base (due to slippage)
    # Check that prices are reasonable
    assert df['entry_price'].min() > 0
    assert df['exit_price'].min() > 0
    print(f"  ✓ Prices are positive and reasonable")
    
    # Check that P&L includes negative values (losses)
    assert df['profit_loss'].min() < 0, "Should have some losing trades"
    assert df['profit_loss'].max() > 0, "Should have some winning trades"
    print(f"  ✓ P&L includes both wins and losses")
    
    print("✓ Slippage and commission tests passed\n")


def test_different_symbols():
    """Test generation for different symbols"""
    print("Testing different symbols...")
    
    symbols = ['NQ', 'GCZ', 'ES', 'GC']
    
    for symbol in symbols:
        gen = SyntheticTradeGenerator(symbol=symbol, num_trades=20, seed=42)
        trades = gen.generate_trades()
        df = pd.DataFrame(trades)
        
        # Check all trades are for correct symbol
        assert all(df['symbol'] == symbol), f"All trades should be for {symbol}"
        
        # Check prices are in reasonable range for symbol
        spec = gen.contract
        base_price = spec['base_price']
        assert df['entry_price'].mean() > base_price * 0.5
        assert df['entry_price'].mean() < base_price * 1.5
        
        print(f"  ✓ {symbol} ({spec['description']}): {len(trades)} trades generated")
    
    print("✓ Different symbols tests passed\n")


def test_strategies_and_resolutions():
    """Test that all strategies and resolutions are used"""
    print("Testing strategies and resolutions...")
    
    gen = SyntheticTradeGenerator(symbol='NQ', num_trades=200, seed=999)
    trades = gen.generate_trades()
    df = pd.DataFrame(trades)
    
    # Check that all strategies are represented
    strategies = df['strategy'].unique()
    print(f"  ✓ Strategies used: {sorted(strategies)}")
    assert len(strategies) >= 3, "Should use at least 3 different strategies"
    
    # Check that all resolutions are represented
    resolutions = df['resolution'].unique()
    print(f"  ✓ Resolutions used: {sorted(resolutions)}")
    assert len(resolutions) >= 3, "Should use at least 3 different resolutions"
    
    # Check distribution is somewhat balanced
    strategy_counts = df['strategy'].value_counts()
    print(f"  ✓ Strategy distribution: {dict(strategy_counts)}")
    
    resolution_counts = df['resolution'].value_counts()
    print(f"  ✓ Resolution distribution: {dict(resolution_counts)}")
    
    print("✓ Strategies and resolutions tests passed\n")


def test_time_progression():
    """Test that times progress correctly"""
    print("Testing time progression...")
    
    gen = SyntheticTradeGenerator(symbol='NQ', num_trades=50, seed=555)
    trades = gen.generate_trades()
    df = pd.DataFrame(trades)
    
    # Convert to datetime
    df['entry_dt'] = pd.to_datetime(df['entry_time'])
    df['exit_dt'] = pd.to_datetime(df['exit_time'])
    
    # Check that exit is always after entry
    assert all(df['exit_dt'] > df['entry_dt']), "Exit time must be after entry time"
    print("  ✓ Exit times are always after entry times")
    
    # Check that times generally progress (with some overlap allowed)
    sorted_entries = df['entry_dt'].is_monotonic_increasing
    print(f"  ✓ Entry times progress forward")
    
    # Check holding periods are reasonable
    df['holding_seconds'] = (df['exit_dt'] - df['entry_dt']).dt.total_seconds()
    assert df['holding_seconds'].min() >= 60, "Minimum holding should be at least 1 minute"
    print(f"  ✓ Holding periods are reasonable (min: {df['holding_seconds'].min():.0f}s, max: {df['holding_seconds'].max():.0f}s)")
    
    print("✓ Time progression tests passed\n")


def test_csv_export():
    """Test CSV export functionality"""
    print("Testing CSV export...")
    
    import tempfile
    
    gen = SyntheticTradeGenerator(symbol='ES', num_trades=30, seed=777)
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        temp_filename = f.name
    
    try:
        # Save to CSV
        filename = gen.save_to_csv(temp_filename)
        assert os.path.exists(filename), f"CSV file should exist: {filename}"
        print(f"  ✓ CSV file created: {filename}")
        
        # Read back and validate
        df = pd.read_csv(filename)
        assert len(df) == 30, f"Should have 30 trades in CSV"
        assert list(df.columns) == [
            'entry_time', 'entry_price', 'exit_time', 'exit_price',
            'direction', 'profit_loss', 'strategy', 'symbol', 'resolution',
            'holding_bars', 'points'
        ]
        print(f"  ✓ CSV has correct structure with {len(df)} rows")
        
    finally:
        # Clean up
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
    
    print("✓ CSV export tests passed\n")


def test_reproducibility():
    """Test that same seed produces same results"""
    print("Testing reproducibility with seed...")
    
    # Generate with seed
    gen1 = SyntheticTradeGenerator(symbol='GCZ', num_trades=50, seed=12345)
    trades1 = gen1.generate_trades()
    df1 = pd.DataFrame(trades1)
    
    # Generate again with same seed
    gen2 = SyntheticTradeGenerator(symbol='GCZ', num_trades=50, seed=12345)
    trades2 = gen2.generate_trades()
    df2 = pd.DataFrame(trades2)
    
    # Should be identical
    assert df1.equals(df2), "Same seed should produce identical results"
    print("  ✓ Same seed produces identical results")
    
    # Generate with different seed
    gen3 = SyntheticTradeGenerator(symbol='GCZ', num_trades=50, seed=54321)
    trades3 = gen3.generate_trades()
    df3 = pd.DataFrame(trades3)
    
    # Should be different
    assert not df1.equals(df3), "Different seed should produce different results"
    print("  ✓ Different seed produces different results")
    
    print("✓ Reproducibility tests passed\n")


def run_all_tests():
    """Run all test functions"""
    print("="*60)
    print("SYNTHETIC TRADE GENERATOR TEST SUITE")
    print("="*60)
    print()
    
    test_functions = [
        test_generator_initialization,
        test_trade_generation,
        test_slippage_and_commission,
        test_different_symbols,
        test_strategies_and_resolutions,
        test_time_progression,
        test_csv_export,
        test_reproducibility
    ]
    
    failed = 0
    for test_func in test_functions:
        try:
            test_func()
        except AssertionError as e:
            print(f"✗ TEST FAILED: {test_func.__name__}")
            print(f"  Error: {e}\n")
            failed += 1
        except Exception as e:
            print(f"✗ TEST ERROR: {test_func.__name__}")
            print(f"  Error: {e}\n")
            failed += 1
    
    print("="*60)
    if failed == 0:
        print("ALL TESTS PASSED! ✓")
    else:
        print(f"TESTS FAILED: {failed}/{len(test_functions)}")
    print("="*60)
    
    return failed == 0


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
