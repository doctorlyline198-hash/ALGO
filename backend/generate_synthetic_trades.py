#!/usr/bin/env python3
"""
Synthetic Trade Dataset Generator
Generates realistic synthetic trades for futures trading backtesting and analysis.
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random
import argparse


class SyntheticTradeGenerator:
    """Generate synthetic trades with realistic market characteristics"""
    
    # Contract specifications
    CONTRACT_SPECS = {
        'NQ': {
            'base_price': 16000.0,
            'tick_size': 0.25,
            'tick_value': 5.0,
            'volatility': 50.0,  # Points per day
            'description': 'Nasdaq-100 E-mini'
        },
        'GCZ': {
            'base_price': 2050.0,
            'tick_size': 0.10,
            'tick_value': 10.0,
            'volatility': 20.0,  # Points per day
            'description': 'Gold December futures'
        },
        'ES': {
            'base_price': 4800.0,
            'tick_size': 0.25,
            'tick_value': 12.50,
            'volatility': 30.0,
            'description': 'S&P 500 E-mini'
        },
        'GC': {
            'base_price': 2050.0,
            'tick_size': 0.10,
            'tick_value': 10.0,
            'volatility': 20.0,
            'description': 'Gold futures'
        }
    }
    
    STRATEGIES = ['momentum', 'SMA_crossover', 'RSI_breakout', 'random_realistic']
    RESOLUTIONS = ['1min', '5min', '15min', '1d']
    DIRECTIONS = ['long', 'short']
    
    def __init__(self, symbol='NQ', num_trades=2000, slippage_ticks=(1, 2), 
                 commission=0.25, start_date=None, seed=None):
        """
        Initialize the trade generator
        
        Args:
            symbol: Trading symbol (NQ, GCZ, ES, GC)
            num_trades: Number of trades to generate
            slippage_ticks: Tuple of (min, max) slippage in ticks
            commission: Commission per contract in dollars
            start_date: Starting date for trades (default: 90 days ago)
            seed: Random seed for reproducibility (None for random)
        """
        if symbol not in self.CONTRACT_SPECS:
            raise ValueError(f"Unsupported symbol: {symbol}. Choose from {list(self.CONTRACT_SPECS.keys())}")
        
        self.symbol = symbol
        self.num_trades = num_trades
        self.slippage_ticks = slippage_ticks
        self.commission = commission
        self.contract = self.CONTRACT_SPECS[symbol]
        
        # Set random seed if provided
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)
        
        # Set start date (default: 90 days ago)
        if start_date is None:
            self.start_date = datetime.now() - timedelta(days=90)
        else:
            self.start_date = start_date
        
        self.trades = []
    
    def _generate_price_movement(self, current_price, resolution, bars=1):
        """Generate realistic price movement based on resolution and volatility"""
        volatility = self.contract['volatility']
        
        # Adjust volatility based on resolution
        resolution_multipliers = {
            '1min': 1.0 / (24 * 60),  # 1 min is 1/1440th of a day
            '5min': 5.0 / (24 * 60),
            '15min': 15.0 / (24 * 60),
            '1d': 1.0
        }
        
        multiplier = resolution_multipliers.get(resolution, 1.0)
        adjusted_volatility = volatility * multiplier * np.sqrt(bars)
        
        # Generate random walk with slight upward bias
        drift = 0.0001 * current_price  # Slight upward drift
        change = np.random.normal(drift, adjusted_volatility)
        
        return current_price + change
    
    def _get_holding_period(self, resolution, strategy):
        """Determine holding period based on resolution and strategy"""
        # Base holding periods in bars
        base_periods = {
            '1min': {
                'momentum': (5, 30),
                'SMA_crossover': (10, 60),
                'RSI_breakout': (3, 20),
                'random_realistic': (2, 45)
            },
            '5min': {
                'momentum': (3, 20),
                'SMA_crossover': (5, 30),
                'RSI_breakout': (2, 15),
                'random_realistic': (2, 25)
            },
            '15min': {
                'momentum': (2, 12),
                'SMA_crossover': (3, 20),
                'RSI_breakout': (2, 10),
                'random_realistic': (1, 15)
            },
            '1d': {
                'momentum': (1, 5),
                'SMA_crossover': (2, 10),
                'RSI_breakout': (1, 7),
                'random_realistic': (1, 8)
            }
        }
        
        min_bars, max_bars = base_periods.get(resolution, {}).get(strategy, (1, 10))
        return random.randint(min_bars, max_bars)
    
    def _calculate_time_delta(self, resolution, bars):
        """Calculate time delta for given resolution and number of bars"""
        time_deltas = {
            '1min': timedelta(minutes=bars),
            '5min': timedelta(minutes=5 * bars),
            '15min': timedelta(minutes=15 * bars),
            '1d': timedelta(days=bars)
        }
        return time_deltas.get(resolution, timedelta(minutes=bars))
    
    def _apply_slippage(self, price, direction):
        """Apply realistic slippage to entry/exit prices"""
        tick_size = self.contract['tick_size']
        slippage_amount = random.randint(*self.slippage_ticks) * tick_size
        
        # Slippage works against the trader
        if direction == 'long':
            return price + slippage_amount  # Pay more on entry
        else:
            return price - slippage_amount  # Receive less on entry
    
    def _calculate_win_probability(self, strategy):
        """Return win probability for different strategies"""
        win_rates = {
            'momentum': 0.52,
            'SMA_crossover': 0.48,
            'RSI_breakout': 0.55,
            'random_realistic': 0.45
        }
        return win_rates.get(strategy, 0.50)
    
    def _generate_single_trade(self, current_time, current_price):
        """Generate a single synthetic trade"""
        # Random strategy and resolution
        strategy = random.choice(self.STRATEGIES)
        resolution = random.choice(self.RESOLUTIONS)
        direction = random.choice(self.DIRECTIONS)
        
        # Determine holding period
        holding_bars = self._get_holding_period(resolution, strategy)
        
        # Entry details
        entry_time = current_time
        entry_price_raw = current_price
        entry_price = self._apply_slippage(entry_price_raw, direction)
        
        # Exit details
        exit_time = entry_time + self._calculate_time_delta(resolution, holding_bars)
        
        # Generate exit price based on strategy win probability
        win_probability = self._calculate_win_probability(strategy)
        is_winner = random.random() < win_probability
        
        # Calculate target and stop based on strategy
        tick_size = self.contract['tick_size']
        volatility_points = self.contract['volatility'] * 0.01  # 1% of daily volatility
        
        if is_winner:
            # Winner: 1.5 to 3x risk
            reward_multiplier = random.uniform(1.5, 3.0)
            price_move = random.uniform(volatility_points * 0.5, volatility_points * 2.0) * reward_multiplier
        else:
            # Loser: 0.5 to 1x risk
            risk_multiplier = random.uniform(0.5, 1.0)
            price_move = -random.uniform(volatility_points * 0.3, volatility_points * 1.5) * risk_multiplier
        
        # Apply direction
        if direction == 'long':
            exit_price_raw = entry_price_raw + price_move
        else:
            exit_price_raw = entry_price_raw - price_move
        
        # Apply slippage on exit (opposite direction)
        exit_direction = 'short' if direction == 'long' else 'long'
        exit_price = self._apply_slippage(exit_price_raw, exit_direction)
        
        # Calculate P&L
        if direction == 'long':
            points = exit_price - entry_price
        else:
            points = entry_price - exit_price
        
        # Convert points to dollars using tick value
        tick_value = self.contract['tick_value']
        dollar_per_point = tick_value / tick_size
        gross_pnl = points * dollar_per_point
        
        # Subtract commissions (2 x commission for round trip)
        net_pnl = gross_pnl - (2 * self.commission)
        
        return {
            'entry_time': entry_time.strftime('%Y-%m-%d %H:%M:%S'),
            'entry_price': round(entry_price, 2),
            'exit_time': exit_time.strftime('%Y-%m-%d %H:%M:%S'),
            'exit_price': round(exit_price, 2),
            'direction': direction,
            'profit_loss': round(net_pnl, 2),
            'strategy': strategy,
            'symbol': self.symbol,
            'resolution': resolution,
            'holding_bars': holding_bars,
            'points': round(points, 2)
        }
    
    def generate_trades(self):
        """Generate all synthetic trades"""
        print(f"Generating {self.num_trades} synthetic trades for {self.symbol}...")
        
        current_time = self.start_date
        current_price = self.contract['base_price']
        
        for i in range(self.num_trades):
            # Generate trade
            trade = self._generate_single_trade(current_time, current_price)
            self.trades.append(trade)
            
            # Update time and price for next trade
            # Add random time gap between trades (1 hour to 1 day)
            time_gap = timedelta(hours=random.randint(1, 24))
            current_time = datetime.strptime(trade['exit_time'], '%Y-%m-%d %H:%M:%S') + time_gap
            
            # Update price with random walk
            current_price = self._generate_price_movement(
                current_price, 
                resolution='1d', 
                bars=time_gap.days + time_gap.seconds / 86400
            )
            
            if (i + 1) % 500 == 0:
                print(f"  Generated {i + 1}/{self.num_trades} trades...")
        
        print(f"✓ Generated {self.num_trades} trades successfully!")
        return self.trades
    
    def get_dataframe(self):
        """Convert trades to pandas DataFrame"""
        if not self.trades:
            self.generate_trades()
        return pd.DataFrame(self.trades)
    
    def save_to_csv(self, filename=None):
        """Save trades to CSV file"""
        if not self.trades:
            self.generate_trades()
        
        df = pd.DataFrame(self.trades)
        
        if filename is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f'synthetic_trades_{self.symbol}_{timestamp}.csv'
        
        df.to_csv(filename, index=False)
        print(f"✓ Saved {len(self.trades)} trades to {filename}")
        
        # Print summary statistics
        print("\n" + "="*60)
        print(f"Trade Summary for {self.symbol} ({self.contract['description']})")
        print("="*60)
        print(f"Total trades: {len(df)}")
        print(f"Winning trades: {len(df[df['profit_loss'] > 0])}")
        print(f"Losing trades: {len(df[df['profit_loss'] < 0])}")
        print(f"Win rate: {len(df[df['profit_loss'] > 0]) / len(df) * 100:.2f}%")
        print(f"Total P&L: ${df['profit_loss'].sum():.2f}")
        print(f"Average P&L per trade: ${df['profit_loss'].mean():.2f}")
        print(f"Best trade: ${df['profit_loss'].max():.2f}")
        print(f"Worst trade: ${df['profit_loss'].min():.2f}")
        print("\nBy Strategy:")
        print(df.groupby('strategy')['profit_loss'].agg(['count', 'mean', 'sum']).round(2))
        print("\nBy Resolution:")
        print(df.groupby('resolution')['profit_loss'].agg(['count', 'mean', 'sum']).round(2))
        print("="*60)
        
        return filename


def main():
    """Main function to generate synthetic trades"""
    parser = argparse.ArgumentParser(description='Generate synthetic trade dataset for futures trading')
    parser.add_argument('--symbols', nargs='+', default=['NQ', 'GCZ'], 
                        help='Symbols to generate trades for (default: NQ GCZ)')
    parser.add_argument('--trades', type=int, default=2000,
                        help='Number of trades per symbol (default: 2000)')
    parser.add_argument('--slippage-min', type=int, default=1,
                        help='Minimum slippage in ticks (default: 1)')
    parser.add_argument('--slippage-max', type=int, default=2,
                        help='Maximum slippage in ticks (default: 2)')
    parser.add_argument('--commission', type=float, default=0.25,
                        help='Commission per contract (default: 0.25)')
    parser.add_argument('--output', type=str, default=None,
                        help='Output filename (default: auto-generated)')
    parser.add_argument('--seed', type=int, default=None,
                        help='Random seed for reproducibility (default: None)')
    
    args = parser.parse_args()
    
    # Generate trades for each symbol
    all_trades = []
    for symbol in args.symbols:
        print(f"\n{'='*60}")
        print(f"Processing {symbol}")
        print('='*60)
        
        generator = SyntheticTradeGenerator(
            symbol=symbol,
            num_trades=args.trades,
            slippage_ticks=(args.slippage_min, args.slippage_max),
            commission=args.commission,
            seed=args.seed
        )
        
        trades = generator.generate_trades()
        all_trades.extend(trades)
    
    # Combine all trades into single DataFrame
    df_all = pd.DataFrame(all_trades)
    
    # Sort by entry time
    df_all = df_all.sort_values('entry_time').reset_index(drop=True)
    
    # Save combined dataset
    if args.output is None:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_file = f'synthetic_trades_combined_{timestamp}.csv'
    else:
        output_file = args.output
    
    df_all.to_csv(output_file, index=False)
    
    print("\n" + "="*60)
    print("COMBINED DATASET SUMMARY")
    print("="*60)
    print(f"Total trades: {len(df_all)}")
    print(f"Symbols: {', '.join(df_all['symbol'].unique())}")
    print(f"Date range: {df_all['entry_time'].min()} to {df_all['exit_time'].max()}")
    print(f"Total P&L: ${df_all['profit_loss'].sum():.2f}")
    print(f"\nSaved to: {output_file}")
    print("="*60)
    
    print("\nDataset preview:")
    print(df_all.head(10).to_string(index=False))


if __name__ == '__main__':
    main()
