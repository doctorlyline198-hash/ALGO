"""
ATR Breakout Strategy
Enters trades when price breaks above/below ATR-based bands
"""
import pandas as pd
import numpy as np
from typing import Dict, Optional
from .base_strategy import Strategy


class ATRBreakoutStrategy(Strategy):
    """
    ATR Breakout Strategy
    - Calculates Average True Range (ATR)
    - Enters long when price breaks above upper band (SMA + ATR_multiplier * ATR)
    - Enters short when price breaks below lower band (SMA - ATR_multiplier * ATR)
    - Exits on opposite signal
    """
    
    def __init__(self, symbol: str, timeframe: str = "1min", 
                 period: int = 14, atr_multiplier: float = 2.0):
        super().__init__(symbol, timeframe)
        self.period = period
        self.atr_multiplier = atr_multiplier
        self.name = "ATR Breakout"
        
    def calculate_atr(self, df: pd.DataFrame, period: int) -> pd.Series:
        """Calculate Average True Range"""
        high = df['high']
        low = df['low']
        close = df['close']
        
        tr1 = high - low
        tr2 = abs(high - close.shift())
        tr3 = abs(low - close.shift())
        
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = tr.rolling(window=period).mean()
        
        return atr
    
    def calculate_signals(self, data: pd.DataFrame) -> Optional[Dict]:
        """Calculate ATR breakout signals"""
        if len(data) < self.period + 1:
            return None
        
        # Calculate indicators
        df = data.copy()
        df['sma'] = df['close'].rolling(window=self.period).mean()
        df['atr'] = self.calculate_atr(df, self.period)
        
        # Calculate bands
        df['upper_band'] = df['sma'] + (self.atr_multiplier * df['atr'])
        df['lower_band'] = df['sma'] - (self.atr_multiplier * df['atr'])
        
        # Get current values
        current_price = df['close'].iloc[-1]
        upper_band = df['upper_band'].iloc[-1]
        lower_band = df['lower_band'].iloc[-1]
        atr_value = df['atr'].iloc[-1]
        
        # Generate signals
        if pd.isna(upper_band) or pd.isna(lower_band):
            return None
        
        signal = None
        
        # Long signal: price breaks above upper band
        if current_price > upper_band and self.position <= 0:
            signal = {
                'action': 'BUY',
                'price': current_price,
                'reason': f'ATR Breakout Long: Price {current_price:.2f} > Upper Band {upper_band:.2f}',
                'stop_loss': current_price - (2 * atr_value),
                'take_profit': current_price + (3 * atr_value),
                'indicators': {
                    'atr': atr_value,
                    'upper_band': upper_band,
                    'lower_band': lower_band
                }
            }
            
        # Short signal: price breaks below lower band
        elif current_price < lower_band and self.position >= 0:
            signal = {
                'action': 'SELL',
                'price': current_price,
                'reason': f'ATR Breakout Short: Price {current_price:.2f} < Lower Band {lower_band:.2f}',
                'stop_loss': current_price + (2 * atr_value),
                'take_profit': current_price - (3 * atr_value),
                'indicators': {
                    'atr': atr_value,
                    'upper_band': upper_band,
                    'lower_band': lower_band
                }
            }
        
        # Hold signal
        else:
            signal = {
                'action': 'HOLD',
                'price': current_price,
                'reason': f'Price within bands: {lower_band:.2f} < {current_price:.2f} < {upper_band:.2f}',
                'indicators': {
                    'atr': atr_value,
                    'upper_band': upper_band,
                    'lower_band': lower_band
                }
            }
        
        if signal:
            self.signals.append(signal)
            
        return signal
