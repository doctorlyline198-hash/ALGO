"""
SignalR Market Data Client for TopstepX
Connects to live market data feed and processes real-time tick data
"""
import json
import logging
from typing import Callable, Dict, List
from signalrcore.hub_connection_builder import HubConnectionBuilder
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MarketDataClient:
    """SignalR client for receiving live market data from TopstepX"""
    
    def __init__(self, hub_url: str = "https://api.topstepx.com/marketdata"):
        self.hub_url = hub_url
        self.connection = None
        self.callbacks: Dict[str, List[Callable]] = {}
        self.current_data: Dict[str, Dict] = {}
        
    def connect(self):
        """Establish SignalR connection to market data hub"""
        try:
            self.connection = HubConnectionBuilder()\
                .with_url(self.hub_url)\
                .with_automatic_reconnect({
                    "type": "interval",
                    "keep_alive_interval": 10,
                    "intervals": [1, 2, 5, 10, 30]
                })\
                .build()
            
            # Register handlers
            self.connection.on_open(self._on_open)
            self.connection.on_close(self._on_close)
            self.connection.on_error(self._on_error)
            self.connection.on("ReceiveMarketData", self._on_market_data)
            self.connection.on("ReceiveBar", self._on_bar_data)
            
            self.connection.start()
            logger.info("SignalR connection established")
            
        except Exception as e:
            logger.error(f"Failed to connect to SignalR hub: {e}")
            raise
    
    def disconnect(self):
        """Close SignalR connection"""
        if self.connection:
            self.connection.stop()
            logger.info("SignalR connection closed")
    
    def subscribe(self, symbols: List[str], timeframe: str = "1min"):
        """Subscribe to market data for given symbols"""
        if not self.connection:
            raise RuntimeError("Not connected to SignalR hub")
        
        for symbol in symbols:
            self.connection.send("Subscribe", [symbol, timeframe])
            logger.info(f"Subscribed to {symbol} on {timeframe} timeframe")
    
    def unsubscribe(self, symbols: List[str]):
        """Unsubscribe from market data"""
        if not self.connection:
            return
        
        for symbol in symbols:
            self.connection.send("Unsubscribe", [symbol])
            logger.info(f"Unsubscribed from {symbol}")
    
    def register_callback(self, event_type: str, callback: Callable):
        """Register callback for market data events"""
        if event_type not in self.callbacks:
            self.callbacks[event_type] = []
        self.callbacks[event_type].append(callback)
    
    def get_current_data(self, symbol: str) -> Dict:
        """Get current market data for a symbol"""
        return self.current_data.get(symbol, {})
    
    def _on_open(self):
        """Handle connection open event"""
        logger.info("SignalR connection opened")
    
    def _on_close(self):
        """Handle connection close event"""
        logger.info("SignalR connection closed")
    
    def _on_error(self, data):
        """Handle connection error"""
        logger.error(f"SignalR error: {data}")
    
    def _on_market_data(self, data):
        """Handle incoming market data (ticks)"""
        try:
            symbol = data.get('symbol')
            if symbol:
                self.current_data[symbol] = data
                
            # Trigger callbacks
            for callback in self.callbacks.get('tick', []):
                callback(data)
                
        except Exception as e:
            logger.error(f"Error processing market data: {e}")
    
    def _on_bar_data(self, data):
        """Handle incoming bar/candle data"""
        try:
            symbol = data.get('symbol')
            
            # Trigger callbacks
            for callback in self.callbacks.get('bar', []):
                callback(data)
                
        except Exception as e:
            logger.error(f"Error processing bar data: {e}")


# Mock implementation for testing when SignalR is not available
class MockMarketDataClient(MarketDataClient):
    """Mock market data client for testing"""
    
    def __init__(self):
        super().__init__()
        self.is_connected = False
        self.subscribed_symbols = []
    
    def connect(self):
        """Mock connection"""
        self.is_connected = True
        logger.info("Mock SignalR connection established")
    
    def disconnect(self):
        """Mock disconnection"""
        self.is_connected = False
        logger.info("Mock SignalR connection closed")
    
    def subscribe(self, symbols: List[str], timeframe: str = "1min"):
        """Mock subscription"""
        self.subscribed_symbols.extend(symbols)
        logger.info(f"Mock subscribed to {symbols} on {timeframe}")
    
    def generate_mock_data(self, symbol: str, price: float):
        """Generate mock market data for testing"""
        data = {
            'symbol': symbol,
            'price': price,
            'bid': price - 0.25,
            'ask': price + 0.25,
            'volume': 100,
            'timestamp': time.time()
        }
        self._on_market_data(data)
        return data
