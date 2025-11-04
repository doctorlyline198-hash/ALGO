# Synthetic Trade Dataset Generator

A flexible Python tool for generating realistic synthetic trade datasets for futures trading backtesting, analysis, and machine learning applications.

## Overview

This generator creates realistic synthetic trades with:
- Multiple trading symbols (NQ, GCZ, ES, GC)
- Various trading strategies (momentum, SMA crossover, RSI breakout, random realistic)
- Different timeframe resolutions (1min, 5min, 15min, 1d)
- Realistic market characteristics (slippage, commissions, volatility)
- Configurable parameters for flexible dataset generation

## Features

### Supported Symbols
- **NQ** - Nasdaq-100 E-mini futures
- **GCZ** - Gold December futures
- **ES** - S&P 500 E-mini futures
- **GC** - Gold futures

### Trading Strategies
1. **Momentum** - Trend-following strategy with 52% win rate
2. **SMA Crossover** - Moving average crossover with 48% win rate
3. **RSI Breakout** - RSI-based breakout strategy with 55% win rate
4. **Random Realistic** - Randomized strategy with 45% win rate

### Timeframe Resolutions
- **1min** - 1-minute bars (high-frequency intraday trading)
- **5min** - 5-minute bars (intraday trading)
- **15min** - 15-minute bars (intraday/swing trading)
- **1d** - Daily bars (swing trading)

### Realistic Market Characteristics
- **Slippage**: 1-2 ticks per trade (configurable)
- **Commission**: $0.25 per contract (configurable)
- **Volatility**: Symbol-specific realistic volatility
- **Holding Periods**: Strategy and resolution-dependent
- **Price Movement**: Random walk with realistic volatility

## Usage

### Basic Usage

Generate 2,000 trades each for NQ and GCZ (default):

```bash
python generate_synthetic_trades.py
```

### Custom Parameters

```bash
# Generate 5,000 trades for NQ only
python generate_synthetic_trades.py --symbols NQ --trades 5000

# Generate trades for multiple symbols with custom slippage
python generate_synthetic_trades.py --symbols NQ ES GC --trades 3000 --slippage-min 2 --slippage-max 3

# Use custom commission and specific output file
python generate_synthetic_trades.py --commission 0.50 --output my_trades.csv

# Generate reproducible dataset with seed
python generate_synthetic_trades.py --seed 42 --trades 1000
```

### Command-Line Arguments

```
--symbols SYMBOLS [SYMBOLS ...]
    Symbols to generate trades for (default: NQ GCZ)
    
--trades TRADES
    Number of trades per symbol (default: 2000)
    
--slippage-min SLIPPAGE_MIN
    Minimum slippage in ticks (default: 1)
    
--slippage-max SLIPPAGE_MAX
    Maximum slippage in ticks (default: 2)
    
--commission COMMISSION
    Commission per contract in dollars (default: 0.25)
    
--output OUTPUT
    Output filename (default: auto-generated timestamp)
    
--seed SEED
    Random seed for reproducibility (default: None)
```

## Output Format

The generator creates a CSV file with the following columns:

| Column | Description |
|--------|-------------|
| `entry_time` | Trade entry timestamp (YYYY-MM-DD HH:MM:SS) |
| `entry_price` | Entry price (with slippage applied) |
| `exit_time` | Trade exit timestamp (YYYY-MM-DD HH:MM:SS) |
| `exit_price` | Exit price (with slippage applied) |
| `direction` | Trade direction ('long' or 'short') |
| `profit_loss` | Net profit/loss in dollars (after commission) |
| `strategy` | Strategy used for this trade |
| `symbol` | Trading symbol (NQ, GCZ, ES, GC) |
| `resolution` | Timeframe resolution (1min, 5min, 15min, 1d) |
| `holding_bars` | Number of bars held |
| `points` | Price movement in points |

### Sample Output

```csv
entry_time,entry_price,exit_time,exit_price,direction,profit_loss,strategy,symbol,resolution,holding_bars,points
2025-08-06 05:22:24,16000.25,2025-08-06 05:36:24,16002.27,long,39.9,SMA_crossover,NQ,1min,14,2.02
2025-08-06 05:22:24,2050.2,2025-08-06 06:06:24,2049.75,long,-45.04,SMA_crossover,GCZ,1min,44,-0.45
2025-08-06 07:36:24,16004.65,2025-08-06 07:48:24,16003.67,short,19.14,RSI_breakout,NQ,1min,12,0.98
```

## Examples

### Example 1: Generate Training Dataset

```bash
# Generate large dataset for machine learning
python generate_synthetic_trades.py \
    --symbols NQ ES GC \
    --trades 10000 \
    --seed 42 \
    --output training_data.csv
```

### Example 2: Backtest Different Symbols

```bash
# Generate separate datasets for each symbol
python generate_synthetic_trades.py --symbols NQ --trades 5000 --output nq_trades.csv
python generate_synthetic_trades.py --symbols GCZ --trades 5000 --output gcz_trades.csv
python generate_synthetic_trades.py --symbols ES --trades 5000 --output es_trades.csv
```

### Example 3: Test Different Commission Structures

```bash
# Low commission scenario
python generate_synthetic_trades.py --commission 0.10 --output low_comm.csv

# High commission scenario
python generate_synthetic_trades.py --commission 1.00 --output high_comm.csv
```

## Programmatic Usage

You can also use the generator programmatically in your Python code:

```python
from generate_synthetic_trades import SyntheticTradeGenerator

# Create generator
generator = SyntheticTradeGenerator(
    symbol='NQ',
    num_trades=1000,
    slippage_ticks=(1, 2),
    commission=0.25,
    seed=42  # For reproducibility
)

# Generate trades
trades = generator.generate_trades()

# Get as DataFrame
df = generator.get_dataframe()

# Save to CSV
generator.save_to_csv('my_trades.csv')

# Access individual trades
for trade in trades[:5]:
    print(f"{trade['entry_time']}: {trade['direction']} @ {trade['entry_price']}")
```

## Dataset Statistics

After generation, the tool provides comprehensive statistics:

```
============================================================
COMBINED DATASET SUMMARY
============================================================
Total trades: 4000
Symbols: NQ, GCZ
Date range: 2025-08-06 05:22:24 to 2034-10-26 19:02:24
Total P&L: $-24865.70

Trade Summary:
- Winning trades: 1,920 (48.0%)
- Losing trades: 2,080 (52.0%)
- Average P&L per trade: $-6.22
- Best trade: $97.42
- Worst trade: $-68.32

By Strategy:
                  count   mean     sum
strategy                              
momentum           1025  -7.50  -7687.50
RSI_breakout       1003  -5.20  -5215.60
SMA_crossover      1001  -6.80  -6806.80
random_realistic    971  -5.30  -5145.97

By Resolution:
            count   mean      sum
resolution                       
15min        1007  -5.90  -5941.30
5min         1005  -6.50  -6532.50
1d           1003  -6.10  -6118.30
1min          985  -6.30  -6273.55
============================================================
```

## Testing

Run the test suite to validate the generator:

```bash
python test_synthetic_trades.py
```

The test suite validates:
- Generator initialization
- Trade generation with correct structure
- Slippage and commission application
- Different symbols and strategies
- Time progression
- CSV export functionality
- Reproducibility with seeds

## Technical Details

### Contract Specifications

Each symbol has realistic specifications:

```python
CONTRACT_SPECS = {
    'NQ': {
        'base_price': 16000.0,
        'tick_size': 0.25,
        'tick_value': 5.0,
        'volatility': 50.0
    },
    'GCZ': {
        'base_price': 2050.0,
        'tick_size': 0.10,
        'tick_value': 10.0,
        'volatility': 20.0
    }
}
```

### P&L Calculation

1. **Points Calculation**:
   - Long: `points = exit_price - entry_price`
   - Short: `points = entry_price - exit_price`

2. **Dollar Conversion**:
   - `dollar_per_point = tick_value / tick_size`
   - `gross_pnl = points × dollar_per_point`

3. **Net P&L**:
   - `net_pnl = gross_pnl - (2 × commission)`

### Slippage Application

Slippage is applied against the trader:
- Long entries: Pay more (price + slippage)
- Short entries: Receive less (price - slippage)
- Exits: Opposite of entry direction

## Use Cases

1. **Backtesting**: Test trading algorithms with realistic historical data
2. **Strategy Development**: Analyze different strategies across symbols and timeframes
3. **Risk Analysis**: Study P&L distributions and drawdowns
4. **Machine Learning**: Train models for trade classification or prediction
5. **Education**: Learn about trading mechanics and costs
6. **Portfolio Analysis**: Simulate multi-symbol trading scenarios

## Requirements

- Python 3.8+
- pandas
- numpy

Install dependencies:
```bash
pip install pandas numpy
```

## License

MIT License - See the main project LICENSE file

## Contributing

Contributions are welcome! Please ensure:
- All tests pass (`python test_synthetic_trades.py`)
- Code follows existing style
- New features include tests
- Documentation is updated

## Support

For issues or questions, please open an issue on the GitHub repository.
