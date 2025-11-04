# TopstepX Trading Platform - Visual Guide

## Dashboard Overview

The TopstepX Trading Platform provides a professional, modern interface for algorithmic trading with the following key areas:

### Main Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  TopstepX Trading Platform              🟢 Live Trading         │
├─────────────────────────────────────────────────────────────────┤
│  Contract: [NQ ▼]  Timeframe: [1min ▼]  Current Price: $16,000 │
├──────────────────────────────────┬──────────────────────────────┤
│                                  │  ┌──────────────────────┐    │
│                                  │  │   Position Display   │    │
│         TradingView              │  │   Symbol: NQ         │    │
│         Candlestick Chart        │  │   Side: LONG         │    │
│                                  │  │   Qty: 2             │    │
│         [Live Chart Area]        │  │   Avg: $15,980       │    │
│                                  │  │   P&L: +$40.00       │    │
│                                  │  └──────────────────────┘    │
│                                  │                              │
│                                  │  ┌──────────────────────┐    │
│                                  │  │    Order Panel       │    │
│                                  │  │  [BUY]  [SELL]       │    │
│                                  │  │  Type: Market        │    │
│                                  │  │  Qty: [1]            │    │
│                                  │  │  [Place Order]       │    │
│                                  │  └──────────────────────┘    │
│                                  │                              │
│                                  │  ┌──────────────────────┐    │
│                                  │  │  Strategy Control    │    │
│                                  │  │  Active: ATR Breakout│    │
│                                  │  │  Signal: HOLD        │    │
│                                  │  │  Price: $16,000      │    │
│                                  │  │  Indicators:         │    │
│                                  │  │    ATR: 12.5         │    │
│                                  │  │    Upper: 16,025     │    │
│                                  │  │  [Deactivate]        │    │
│                                  │  └──────────────────────┘    │
└──────────────────────────────────┴──────────────────────────────┘
```

## Color Scheme

- **Background**: Dark theme (#1a1a1a, #2a2a2a)
- **Accent**: Blue (#4a90e2)
- **Buy/Long**: Green (#26a69a)
- **Sell/Short**: Red (#ef5350)
- **Text**: White/Gray (#fff, #ccc, #888)
- **Charts**: TradingView dark theme

## Key Features Visualized

### 1. Contract Selector
```
┌─────────────────┐
│ Contract: NQ  ▼ │
├─────────────────┤
│ NQ  ← Nasdaq    │
│ ES  ← S&P 500   │
│ GC  ← Gold      │
│ MGC ← Micro Gold│
└─────────────────┘
```

### 2. Timeframe Selector
```
┌──────────────────┐
│ Timeframe: 1min ▼│
├──────────────────┤
│ 1 Minute         │
│ 5 Minutes        │
│ 15 Minutes       │
│ 1 Hour           │
└──────────────────┘
```

### 3. TradingView Chart Features
- **Candlesticks**: Green (up) and Red (down)
- **Time axis**: Shows timestamps
- **Price axis**: Right side with current levels
- **Symbol label**: Top-left corner
- **Crosshair**: Hover for details
- **Auto-scaling**: Fits data to view

### 4. Order Panel States

**BUY Mode (Active)**
```
┌──────────────────────┐
│ ┌────────┐  ┌──────┐ │
│ │  BUY   │  │ SELL │ │ ← BUY is highlighted green
│ └────────┘  └──────┘ │
│                      │
│ Order Type: Market   │
│ Quantity: [1]        │
│                      │
│ Current: $16,000.00  │
│                      │
│ [Place BUY Order]    │ ← Blue button
└──────────────────────┘
```

**SELL Mode (Active)**
```
┌──────────────────────┐
│ ┌──────┐  ┌────────┐ │
│ │ BUY  │  │  SELL  │ │ ← SELL is highlighted red
│ └──────┘  └────────┘ │
│                      │
│ Order Type: Limit    │
│ Quantity: [2]        │
│ Price: [15,995.00]   │
│                      │
│ [Place SELL Order]   │ ← Blue button
└──────────────────────┘
```

### 5. Strategy Panel - Inactive State
```
┌───────────────────────────┐
│ Strategy Control - NQ     │
├───────────────────────────┤
│ Select Strategy:          │
│ [ATR Breakout        ▼]   │
│                           │
│ Enters trades on ATR-     │
│ based band breakouts      │
│                           │
│ [Activate Strategy]       │ ← Green button
└───────────────────────────┘
```

### 6. Strategy Panel - Active with BUY Signal
```
┌───────────────────────────┐
│ Strategy Control - NQ     │
├───────────────────────────┤
│ Active: ATR Breakout      │
│                [Deactivate]│ ← Red button
├───────────────────────────┤
│ Current Signal            │
│                           │
│      ┌─────────┐          │
│      │   BUY   │          │ ← Green background
│      └─────────┘          │
│                           │
│ Price: $16,025.00         │
│ Reason: ATR Breakout      │
│   Long: Price > Upper     │
│   Band 16,025.00          │
│                           │
│ Stop Loss: $15,975.00     │
│ Take Profit: $16,075.00   │
│                           │
│ Indicators:               │
│   atr: 12.50              │
│   upper_band: 16,025.00   │
│   lower_band: 15,975.00   │
└───────────────────────────┘
```

### 7. Strategy Panel - Active with SELL Signal
```
┌───────────────────────────┐
│ Current Signal            │
│                           │
│      ┌─────────┐          │
│      │  SELL   │          │ ← Red background
│      └─────────┘          │
│                           │
│ Price: $15,970.00         │
│ Reason: ATR Breakout      │
│   Short: Price < Lower    │
│   Band 15,975.00          │
│                           │
│ Stop Loss: $16,020.00     │
│ Take Profit: $15,920.00   │
└───────────────────────────┘
```

### 8. Strategy Panel - HOLD Signal
```
┌───────────────────────────┐
│ Current Signal            │
│                           │
│      ┌─────────┐          │
│      │  HOLD   │          │ ← Gray background
│      └─────────┘          │
│                           │
│ Price: $16,000.00         │
│ Reason: Price within      │
│   bands: 15,975 <         │
│   16,000 < 16,025         │
└───────────────────────────┘
```

### 9. Position Display - Long Position (Profit)
```
┌───────────────────────────┐
│  NQ              LONG     │ ← Green text
├───────────────────────────┤
│ Quantity:              2  │
│ Avg Price:    $15,980.00  │
│ Current:      $16,000.00  │
│ Unrealized P&L: +$40.00   │ ← Green (profit)
│ Realized P&L:   $120.00   │
└───────────────────────────┘
```

### 10. Position Display - Short Position (Loss)
```
┌───────────────────────────┐
│  ES              SHORT    │ ← Red text
├───────────────────────────┤
│ Quantity:              1  │
│ Avg Price:     $4,805.00  │
│ Current:       $4,810.00  │
│ Unrealized P&L:  -$5.00   │ ← Red (loss)
│ Realized P&L:    $0.00    │
└───────────────────────────┘
```

### 11. Position Display - No Position
```
┌───────────────────────────┐
│                           │
│      No Position          │ ← Gray text, centered
│                           │
└───────────────────────────┘
```

## User Interaction Flow

### Opening a Long Position

1. **Select Contract**: Choose NQ from dropdown
2. **View Chart**: See current price action
3. **Check Strategy**: (Optional) Activate ATR Breakout
4. **Wait for Signal**: Strategy shows BUY signal
5. **Place Order**: 
   - Click BUY button (turns green)
   - Enter quantity: 1
   - Click "Place BUY Order"
6. **Confirm**: Order fills immediately
7. **Monitor Position**: 
   - Position Display shows: NQ LONG, Qty: 1
   - P&L updates in real-time

### Using a Strategy

1. **Select Strategy**: Choose from dropdown (ATR Breakout, Mean Reversion, ICT Killzones)
2. **Read Description**: Review strategy details
3. **Activate**: Click green "Activate Strategy" button
4. **Monitor Signals**:
   - BUY: Consider going long
   - SELL: Consider going short
   - HOLD: Wait for setup
5. **View Details**: Check reasoning and indicators
6. **Execute**: Manually place orders based on signals
7. **Deactivate**: Click red "Deactivate" when done

## Responsive Design

The platform adapts to different screen sizes:

### Desktop (> 1200px)
- Side-by-side layout: Chart + Panels
- Full-width chart with right sidebar

### Tablet (768px - 1200px)
- Stacked layout: Chart on top, Panels below
- Full-width components

### Mobile (< 768px)
- Vertical stack
- Simplified controls
- Condensed information

## Accessibility Features

- **High Contrast**: Dark theme with clear text
- **Color Coding**: Red/Green for direction, independent of position
- **Clear Labels**: All inputs and buttons labeled
- **Hover States**: Visual feedback on interactive elements
- **Keyboard Navigation**: Tab through controls
- **Screen Reader Friendly**: Semantic HTML

## Performance Indicators

### Live Updates
- **Market Data**: 5-second refresh
- **Positions**: 3-second refresh
- **Strategy Signals**: 5-second refresh
- **Charts**: Real-time on data update

### Loading States
- **Chart Loading**: Subtle spinner overlay
- **Order Submission**: Button state change
- **Data Fetch**: Loading indicator in panels

---

This visual guide provides a complete overview of the TopstepX Trading Platform's user interface and interaction patterns. The actual implementation uses modern web technologies to deliver a professional trading experience.
