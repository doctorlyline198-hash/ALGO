"""
ICT Killzones Strategy
Trades during specific high-probability time windows (ICT Killzones)
Based on Inner Circle Trader concepts
"""
import pandas as pd
import numpy as np
from typing import Dict, Optional
from datetime import datetime, time
from .base_strategy import Strategy


class ICTKillzonesStrategy(Strategy):
    """
    ICT Killzones Strategy
    - London Killzone: 02:00 - 05:00 EST (07:00 - 10:00 UTC)
    - New York Killzone: 07:00 - 10:00 EST (12:00 - 15:00 UTC)
    - Looks for order blocks and liquidity grabs during these times
    - Trades with trend direction during killzones
    """
    
    def __init__(self, symbol: str, timeframe: str = "1min",
                 sma_period: int = 50):
        super().__init__(symbol, timeframe)
        self.sma_period = sma_period
        self.name = "ICT Killzones"
        
        # Killzone times (UTC)
        self.london_killzone = (time(7, 0), time(10, 0))
        self.ny_killzone = (time(12, 0), time(15, 0))
        
    def is_in_killzone(self, timestamp: datetime) -> tuple[bool, str]:
        """Check if current time is in a killzone"""
        current_time = timestamp.time()
        
        london_start, london_end = self.london_killzone
        ny_start, ny_end = self.ny_killzone
        
        if london_start <= current_time <= london_end:
            return True, "London"
        elif ny_start <= current_time <= ny_end:
            return True, "New York"
        else:
            return False, "None"
    
    def detect_order_block(self, df: pd.DataFrame) -> Optional[Dict]:
        """Detect order blocks (strong support/resistance areas)"""
        if len(df) < 5:
            return None
        
        # Bullish order block: last down candle before strong move up
        # Bearish order block: last up candle before strong move down
        
        last_5 = df.tail(5)
        
        # Check for bullish order block
        if (last_5['close'].iloc[-3] < last_5['open'].iloc[-3] and  # Down candle
            last_5['close'].iloc[-1] > last_5['close'].iloc[-2] and  # Recent up move
            last_5['close'].iloc[-1] > last_5['close'].iloc[-3]):
            return {
                'type': 'bullish',
                'level': last_5['low'].iloc[-3],
                'strength': abs(last_5['close'].iloc[-1] - last_5['close'].iloc[-3])
            }
        
        # Check for bearish order block
        if (last_5['close'].iloc[-3] > last_5['open'].iloc[-3] and  # Up candle
            last_5['close'].iloc[-1] < last_5['close'].iloc[-2] and  # Recent down move
            last_5['close'].iloc[-1] < last_5['close'].iloc[-3]):
            return {
                'type': 'bearish',
                'level': last_5['high'].iloc[-3],
                'strength': abs(last_5['close'].iloc[-3] - last_5['close'].iloc[-1])
            }
        
        return None
    
    def calculate_signals(self, data: pd.DataFrame) -> Optional[Dict]:
        """Calculate ICT killzone signals"""
        if len(data) < self.sma_period + 1:
            return None
        
        df = data.copy()
        
        # Get current timestamp
        if 'timestamp' in df.columns:
            current_time = pd.to_datetime(df['timestamp'].iloc[-1])
        else:
            current_time = datetime.utcnow()
        
        # Check if in killzone
        in_killzone, killzone_name = self.is_in_killzone(current_time)
        
        # Calculate trend (using SMA)
        df['sma'] = df['close'].rolling(window=self.sma_period).mean()
        current_price = df['close'].iloc[-1]
        sma = df['sma'].iloc[-1]
        
        if pd.isna(sma):
            return None
        
        trend = 'bullish' if current_price > sma else 'bearish'
        
        # Detect order blocks
        order_block = self.detect_order_block(df)
        
        signal = None
        
        # Only trade during killzones
        if in_killzone:
            # Long signal: bullish trend + bullish order block in killzone
            if trend == 'bullish' and order_block and order_block['type'] == 'bullish' and self.position <= 0:
                signal = {
                    'action': 'BUY',
                    'price': current_price,
                    'reason': f'ICT Long: {killzone_name} Killzone, Bullish Order Block at {order_block["level"]:.2f}',
                    'stop_loss': order_block['level'] - 5.0,
                    'take_profit': current_price + (current_price - order_block['level']) * 2,
                    'indicators': {
                        'killzone': killzone_name,
                        'trend': trend,
                        'order_block': order_block,
                        'sma': sma
                    }
                }
                
            # Short signal: bearish trend + bearish order block in killzone
            elif trend == 'bearish' and order_block and order_block['type'] == 'bearish' and self.position >= 0:
                signal = {
                    'action': 'SELL',
                    'price': current_price,
                    'reason': f'ICT Short: {killzone_name} Killzone, Bearish Order Block at {order_block["level"]:.2f}',
                    'stop_loss': order_block['level'] + 5.0,
                    'take_profit': current_price - (order_block['level'] - current_price) * 2,
                    'indicators': {
                        'killzone': killzone_name,
                        'trend': trend,
                        'order_block': order_block,
                        'sma': sma
                    }
                }
            else:
                signal = {
                    'action': 'HOLD',
                    'price': current_price,
                    'reason': f'In {killzone_name} Killzone, waiting for setup',
                    'indicators': {
                        'killzone': killzone_name,
                        'trend': trend,
                        'order_block': order_block,
                        'sma': sma
                    }
                }
        else:
            signal = {
                'action': 'HOLD',
                'price': current_price,
                'reason': 'Outside killzone hours',
                'indicators': {
                    'killzone': 'None',
                    'trend': trend,
                    'sma': sma
                }
            }
        
        if signal:
            self.signals.append(signal)
            
        return signal
