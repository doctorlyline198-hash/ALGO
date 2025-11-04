"""
Order Manager
Handles order creation, execution, and tracking
"""
import uuid
from typing import Dict, List, Optional
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Order:
    """Represents a trading order"""
    
    def __init__(self, symbol: str, side: str, quantity: int, 
                 order_type: str = "MARKET", price: Optional[float] = None):
        self.id = str(uuid.uuid4())
        self.symbol = symbol
        self.side = side  # BUY or SELL
        self.quantity = quantity
        self.order_type = order_type  # MARKET or LIMIT
        self.price = price
        self.status = "PENDING"  # PENDING, FILLED, CANCELLED, REJECTED
        self.filled_price = None
        self.filled_quantity = 0
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        self.stop_loss = None
        self.take_profit = None
        
    def to_dict(self) -> Dict:
        """Convert order to dictionary"""
        return {
            'id': self.id,
            'symbol': self.symbol,
            'side': self.side,
            'quantity': self.quantity,
            'order_type': self.order_type,
            'price': self.price,
            'status': self.status,
            'filled_price': self.filled_price,
            'filled_quantity': self.filled_quantity,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'stop_loss': self.stop_loss,
            'take_profit': self.take_profit
        }


class OrderManager:
    """Manages order lifecycle and execution"""
    
    def __init__(self):
        self.orders: Dict[str, Order] = {}
        self.positions: Dict[str, Dict] = {}
        
    def create_order(self, symbol: str, side: str, quantity: int,
                    order_type: str = "MARKET", price: Optional[float] = None,
                    stop_loss: Optional[float] = None, 
                    take_profit: Optional[float] = None) -> Order:
        """Create a new order"""
        order = Order(symbol, side, quantity, order_type, price)
        order.stop_loss = stop_loss
        order.take_profit = take_profit
        
        self.orders[order.id] = order
        logger.info(f"Order created: {order.id} - {side} {quantity} {symbol} @ {order_type}")
        
        # Auto-fill market orders for demo
        if order_type == "MARKET":
            self._execute_order(order, price if price else 0)
        
        return order
    
    def cancel_order(self, order_id: str) -> bool:
        """Cancel an order"""
        if order_id not in self.orders:
            return False
        
        order = self.orders[order_id]
        if order.status == "PENDING":
            order.status = "CANCELLED"
            order.updated_at = datetime.utcnow()
            logger.info(f"Order cancelled: {order_id}")
            return True
        
        return False
    
    def get_order(self, order_id: str) -> Optional[Order]:
        """Get order by ID"""
        return self.orders.get(order_id)
    
    def get_all_orders(self, symbol: Optional[str] = None) -> List[Order]:
        """Get all orders, optionally filtered by symbol"""
        if symbol:
            return [o for o in self.orders.values() if o.symbol == symbol]
        return list(self.orders.values())
    
    def get_position(self, symbol: str) -> Dict:
        """Get current position for a symbol"""
        return self.positions.get(symbol, {
            'symbol': symbol,
            'quantity': 0,
            'average_price': 0,
            'unrealized_pnl': 0,
            'realized_pnl': 0
        })
    
    def get_all_positions(self) -> List[Dict]:
        """Get all positions"""
        return list(self.positions.values())
    
    def update_position_pnl(self, symbol: str, current_price: float):
        """Update unrealized PnL for a position"""
        if symbol in self.positions:
            position = self.positions[symbol]
            if position['quantity'] != 0:
                position['unrealized_pnl'] = (
                    (current_price - position['average_price']) * position['quantity']
                )
                position['current_price'] = current_price
    
    def _execute_order(self, order: Order, execution_price: float):
        """Execute an order (internal simulation)"""
        order.status = "FILLED"
        order.filled_price = execution_price
        order.filled_quantity = order.quantity
        order.updated_at = datetime.utcnow()
        
        # Update position
        self._update_position(order)
        
        logger.info(f"Order executed: {order.id} - {order.side} {order.quantity} {order.symbol} @ {execution_price}")
    
    def _update_position(self, order: Order):
        """Update position after order execution"""
        symbol = order.symbol
        
        if symbol not in self.positions:
            self.positions[symbol] = {
                'symbol': symbol,
                'quantity': 0,
                'average_price': 0,
                'unrealized_pnl': 0,
                'realized_pnl': 0,
                'current_price': order.filled_price
            }
        
        position = self.positions[symbol]
        
        # Calculate new position
        if order.side == "BUY":
            new_quantity = position['quantity'] + order.filled_quantity
            if position['quantity'] >= 0:
                # Adding to long or opening long
                total_cost = (position['average_price'] * position['quantity'] + 
                             order.filled_price * order.filled_quantity)
                position['average_price'] = total_cost / new_quantity if new_quantity != 0 else 0
            else:
                # Closing short position
                if new_quantity <= 0:
                    # Still short or flat
                    position['realized_pnl'] += (position['average_price'] - order.filled_price) * order.filled_quantity
                else:
                    # Flipped to long
                    position['realized_pnl'] += (position['average_price'] - order.filled_price) * abs(position['quantity'])
                    position['average_price'] = order.filled_price
            position['quantity'] = new_quantity
            
        else:  # SELL
            new_quantity = position['quantity'] - order.filled_quantity
            if position['quantity'] <= 0:
                # Adding to short or opening short
                total_cost = (position['average_price'] * abs(position['quantity']) + 
                             order.filled_price * order.filled_quantity)
                position['average_price'] = total_cost / abs(new_quantity) if new_quantity != 0 else 0
            else:
                # Closing long position
                if new_quantity >= 0:
                    # Still long or flat
                    position['realized_pnl'] += (order.filled_price - position['average_price']) * order.filled_quantity
                else:
                    # Flipped to short
                    position['realized_pnl'] += (order.filled_price - position['average_price']) * position['quantity']
                    position['average_price'] = order.filled_price
            position['quantity'] = new_quantity
        
        # Clear position if flat
        if position['quantity'] == 0:
            position['average_price'] = 0
            position['unrealized_pnl'] = 0
