"""
Base Strategy Class
All trading strategies inherit from this base class
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Optional
import pandas as pd
import numpy as np
from datetime import datetime


class Strategy(ABC):
    """Abstract base class for trading strategies"""
    
    def __init__(self, symbol: str, timeframe: str = "1min"):
        self.symbol = symbol
        self.timeframe = timeframe
        self.position = 0  # 1 = long, -1 = short, 0 = flat
        self.entry_price = 0.0
        self.bars: List[Dict] = []
        self.signals: List[Dict] = []
        
    @abstractmethod
    def calculate_signals(self, data: pd.DataFrame) -> Optional[Dict]:
        """
        Calculate trading signals based on strategy logic
        Returns: Dict with 'action' ('BUY', 'SELL', 'HOLD'), 'price', 'reason'
        """
        pass
    
    def update(self, bar: Dict):
        """Update strategy with new bar data"""
        self.bars.append(bar)
        # Keep only last 500 bars for performance
        if len(self.bars) > 500:
            self.bars = self.bars[-500:]
    
    def get_dataframe(self) -> pd.DataFrame:
        """Convert bars to pandas DataFrame"""
        if not self.bars:
            return pd.DataFrame()
        return pd.DataFrame(self.bars)
    
    def reset(self):
        """Reset strategy state"""
        self.position = 0
        self.entry_price = 0.0
        self.bars = []
        self.signals = []
