"""
Mean Reversion Strategy
Trades based on price deviation from moving average
"""
import pandas as pd
import numpy as np
from typing import Dict, Optional
from .base_strategy import Strategy


class MeanReversionStrategy(Strategy):
    """
    Mean Reversion Strategy
    - Uses Bollinger Bands (SMA +/- standard deviations)
    - Enters long when price touches lower band (oversold)
    - Enters short when price touches upper band (overbought)
    - Exits when price returns to middle band (SMA)
    """
    
    def __init__(self, symbol: str, timeframe: str = "1min",
                 period: int = 20, std_dev: float = 2.0):
        super().__init__(symbol, timeframe)
        self.period = period
        self.std_dev = std_dev
        self.name = "Mean Reversion"
        
    def calculate_signals(self, data: pd.DataFrame) -> Optional[Dict]:
        """Calculate mean reversion signals using Bollinger Bands"""
        if len(data) < self.period + 1:
            return None
        
        # Calculate Bollinger Bands
        df = data.copy()
        df['sma'] = df['close'].rolling(window=self.period).mean()
        df['std'] = df['close'].rolling(window=self.period).std()
        df['upper_band'] = df['sma'] + (self.std_dev * df['std'])
        df['lower_band'] = df['sma'] - (self.std_dev * df['std'])
        
        # Calculate additional metrics
        df['bb_width'] = (df['upper_band'] - df['lower_band']) / df['sma']
        df['bb_position'] = (df['close'] - df['lower_band']) / (df['upper_band'] - df['lower_band'])
        
        # Get current values
        current_price = df['close'].iloc[-1]
        sma = df['sma'].iloc[-1]
        upper_band = df['upper_band'].iloc[-1]
        lower_band = df['lower_band'].iloc[-1]
        bb_position = df['bb_position'].iloc[-1]
        
        if pd.isna(sma) or pd.isna(upper_band) or pd.isna(lower_band):
            return None
        
        signal = None
        
        # Long signal: price at or below lower band (oversold)
        if current_price <= lower_band and self.position <= 0:
            signal = {
                'action': 'BUY',
                'price': current_price,
                'reason': f'Mean Reversion Long: Price {current_price:.2f} at lower band {lower_band:.2f}',
                'stop_loss': current_price - (upper_band - lower_band) * 0.5,
                'take_profit': sma,
                'indicators': {
                    'sma': sma,
                    'upper_band': upper_band,
                    'lower_band': lower_band,
                    'bb_position': bb_position
                }
            }
            
        # Short signal: price at or above upper band (overbought)
        elif current_price >= upper_band and self.position >= 0:
            signal = {
                'action': 'SELL',
                'price': current_price,
                'reason': f'Mean Reversion Short: Price {current_price:.2f} at upper band {upper_band:.2f}',
                'stop_loss': current_price + (upper_band - lower_band) * 0.5,
                'take_profit': sma,
                'indicators': {
                    'sma': sma,
                    'upper_band': upper_band,
                    'lower_band': lower_band,
                    'bb_position': bb_position
                }
            }
            
        # Exit long: price returns to SMA
        elif self.position > 0 and current_price >= sma:
            signal = {
                'action': 'SELL',
                'price': current_price,
                'reason': f'Mean Reversion Exit Long: Price {current_price:.2f} returned to SMA {sma:.2f}',
                'indicators': {
                    'sma': sma,
                    'upper_band': upper_band,
                    'lower_band': lower_band,
                    'bb_position': bb_position
                }
            }
            
        # Exit short: price returns to SMA
        elif self.position < 0 and current_price <= sma:
            signal = {
                'action': 'BUY',
                'price': current_price,
                'reason': f'Mean Reversion Exit Short: Price {current_price:.2f} returned to SMA {sma:.2f}',
                'indicators': {
                    'sma': sma,
                    'upper_band': upper_band,
                    'lower_band': lower_band,
                    'bb_position': bb_position
                }
            }
        
        # Hold signal
        else:
            signal = {
                'action': 'HOLD',
                'price': current_price,
                'reason': f'Waiting for mean reversion opportunity',
                'indicators': {
                    'sma': sma,
                    'upper_band': upper_band,
                    'lower_band': lower_band,
                    'bb_position': bb_position
                }
            }
        
        if signal:
            self.signals.append(signal)
            
        return signal
