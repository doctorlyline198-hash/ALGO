import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

const GREEN = '#0ddc7c';
const RED = '#f2484e';
const TP_COLOR = '#16a34a';
const SL_COLOR = '#dc2626';
const ENTRY_COLOR = '#38bdf8';
const HANDLE_HEIGHT = 20;
const DEFAULT_TICK = 0.1;
const DEFAULT_TICK_VALUE = 1;
const DEFAULT_OFFSET_TICKS = 10;
const INDICATOR_DEFAULT_OPTIONS = {
  lineWidth: 2,
  priceLineVisible: false,
  crosshairMarkerVisible: false,
  lastValueVisible: false
};

export default function Chart({ candles = [], timeframe = '1m', indicators = [], bracket = {}, contract = {}, onBracketDrag }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const indicatorSeriesMapRef = useRef(new Map());
  const isPrimedRef = useRef(false);
  const entryLineRef = useRef(null);
  const takeProfitLineRef = useRef(null);
  const stopLossLineRef = useRef(null);
  const entryHandleRef = useRef(null);
  const takeProfitHandleRef = useRef(null);
  const stopLossHandleRef = useRef(null);
  const dragListenersRef = useRef(null);
  const updateOverlayPositionsRef = useRef(() => {});
  const syncPriceLinesRef = useRef(() => {});

  const tickSize = Number.isFinite(contract?.tickSize) && contract.tickSize > 0 ? contract.tickSize : DEFAULT_TICK;
  const tickValue = Number.isFinite(contract?.tickValue) && contract.tickValue !== 0 ? Math.abs(contract.tickValue) : DEFAULT_TICK_VALUE;

  const takeProfitPrice = Number.isFinite(bracket?.takeProfit) ? bracket.takeProfit : null;
  const stopLossPrice = Number.isFinite(bracket?.stopLoss) ? bracket.stopLoss : null;
  const lastPrice = Number.isFinite(bracket?.lastPrice) ? bracket.lastPrice : null;
  const entryPrice = Number.isFinite(bracket?.entryPrice) ? bracket.entryPrice : null;
  const anchorPrice = Number.isFinite(entryPrice) ? entryPrice : lastPrice;
  const entryHandlePrice = Number.isFinite(entryPrice) ? entryPrice : anchorPrice;
  const positionSize = Number.isFinite(bracket?.size) && bracket.size !== 0 ? Math.abs(bracket.size) : null;

  const fallbackOffset = useMemo(() => {
    if (!Number.isFinite(anchorPrice)) {
      return null;
    }
    const tick = Number.isFinite(tickSize) && tickSize > 0 ? tickSize : DEFAULT_TICK;
    const minOffset = tick * DEFAULT_OFFSET_TICKS;
    const percent = Math.abs(anchorPrice) * 0.005;
    return Math.max(minOffset, percent);
  }, [anchorPrice, tickSize]);

  const displayTakeProfitPrice = useMemo(() => {
    if (Number.isFinite(takeProfitPrice)) {
      return takeProfitPrice;
    }
    if (fallbackOffset !== null && Number.isFinite(anchorPrice)) {
      return anchorPrice + fallbackOffset;
    }
    return null;
  }, [takeProfitPrice, fallbackOffset, anchorPrice]);

  const displayStopLossPrice = useMemo(() => {
    if (Number.isFinite(stopLossPrice)) {
      return stopLossPrice;
    }
    if (fallbackOffset !== null && Number.isFinite(anchorPrice)) {
      return anchorPrice - fallbackOffset;
    }
    return null;
  }, [stopLossPrice, fallbackOffset, anchorPrice]);

  const takeProfitPending = !Number.isFinite(takeProfitPrice) && Number.isFinite(displayTakeProfitPrice);
  const stopLossPending = !Number.isFinite(stopLossPrice) && Number.isFinite(displayStopLossPrice);

  const updateOverlayPositions = useCallback(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const overlayEl = wrapperRef.current;

    const pending = Boolean(bracket?.pending);

    const applyHandle = (handleRef, shouldShow, prefix, isPending, options = {}) => {
      const element = handleRef.current;
      if (!element) {
        return;
      }

      if (!shouldShow || !Number.isFinite(options.price) || !series) {
        element.style.display = 'none';
        return;
      }

      const coordinate = series.priceToCoordinate(options.price);
      if (!Number.isFinite(coordinate) || !overlayEl) {
        element.style.display = 'none';
        return;
      }

      element.style.display = 'flex';
      element.style.top = `${coordinate - HANDLE_HEIGHT / 2}px`;

      if (isPending && options.interactive !== false) {
        element.classList.add('pending');
      } else {
        element.classList.remove('pending');
      }

      element.style.pointerEvents = options.interactive === false ? 'none' : 'auto';
      element.style.cursor = options.interactive === false ? 'default' : 'ns-resize';

      const labelNode = element.querySelector('.label');
      if (labelNode) {
        const parts = [`${prefix} ${formatPriceValue(options.price)}`];
        if (options.distanceBase !== undefined && options.includeDistance !== false) {
          const distanceLabel = formatDistance(options.price, options.distanceBase, tickSize, tickValue);
          if (distanceLabel) {
            parts.push(distanceLabel);
          }
        }
        if (Number.isFinite(options.size) && options.size > 0) {
          parts.push(`x${options.size}`);
        }
        labelNode.textContent = parts.join(' · ');
      }
    };

    if (!series || !chart || !Array.isArray(candles) || candles.length === 0 || !bracket) {
      applyHandle(entryHandleRef, false);
      applyHandle(takeProfitHandleRef, false);
      applyHandle(stopLossHandleRef, false);
      return;
    }

    applyHandle(entryHandleRef, Number.isFinite(entryHandlePrice), 'Entry', pending, {
      price: entryHandlePrice,
      interactive: false,
      includeDistance: false,
      size: positionSize
    });
    applyHandle(takeProfitHandleRef, Number.isFinite(displayTakeProfitPrice), 'TP', takeProfitPending, {
      price: displayTakeProfitPrice,
      distanceBase: anchorPrice
    });
    applyHandle(stopLossHandleRef, Number.isFinite(displayStopLossPrice), 'SL', stopLossPending, {
      price: displayStopLossPrice,
      distanceBase: anchorPrice
    });
  }, [
    anchorPrice,
    bracket,
    candles,
    displayStopLossPrice,
    displayTakeProfitPrice,
    entryHandlePrice,
    positionSize,
    stopLossPending,
    takeProfitPending,
    tickSize,
    tickValue
  ]);

  updateOverlayPositionsRef.current = updateOverlayPositions;

  const syncPriceLines = useCallback(() => {
    if (!seriesRef.current) {
      return;
    }

    const series = seriesRef.current;

    if (entryLineRef.current) {
      series.removePriceLine(entryLineRef.current);
      entryLineRef.current = null;
    }
    if (Number.isFinite(entryHandlePrice)) {
      entryLineRef.current = series.createPriceLine({
        price: entryHandlePrice,
        color: ENTRY_COLOR,
        lineWidth: 1,
        axisLabelVisible: true,
        title: 'Entry'
      });
    }

    if (takeProfitLineRef.current) {
      series.removePriceLine(takeProfitLineRef.current);
      takeProfitLineRef.current = null;
    }
    if (Number.isFinite(takeProfitPrice)) {
      takeProfitLineRef.current = series.createPriceLine({
        price: takeProfitPrice,
        color: TP_COLOR,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'TP'
      });
    }

    if (stopLossLineRef.current) {
      series.removePriceLine(stopLossLineRef.current);
      stopLossLineRef.current = null;
    }
    if (Number.isFinite(stopLossPrice)) {
      stopLossLineRef.current = series.createPriceLine({
        price: stopLossPrice,
        color: SL_COLOR,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'SL'
      });
    }

    updateOverlayPositions();
  }, [entryHandlePrice, takeProfitPrice, stopLossPrice, updateOverlayPositions]);

  syncPriceLinesRef.current = syncPriceLines;

  const startDrag = useCallback(
    (type) => (event) => {
      if (!onBracketDrag || !wrapperRef.current || !seriesRef.current) {
        return;
      }

      event.preventDefault();

      const computePrice = (pointEvent) => {
        if (!wrapperRef.current || !seriesRef.current) {
          return null;
        }
        const rect = wrapperRef.current.getBoundingClientRect();
        const y = pointEvent.clientY - rect.top;
        const price = seriesRef.current.coordinateToPrice(y);
        return Number.isFinite(price) ? price : null;
      };

      const handleMove = (pointEvent) => {
        const price = computePrice(pointEvent);
        if (price !== null) {
          const snapped = roundToTick(price, tickSize);
          if (Number.isFinite(snapped)) {
            onBracketDrag(type, snapped);
          }
        }
      };

      const finish = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        dragListenersRef.current = null;
      };

      dragListenersRef.current = { move: handleMove, finish };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);

      handleMove(event);
    },
    [onBracketDrag, tickSize]
  );

  useEffect(
    () => () => {
      if (dragListenersRef.current) {
        const { move, finish } = dragListenersRef.current;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        dragListenersRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: 'rgba(6, 8, 10, 0.92)' },
        textColor: '#d2d6dc'
      },
      grid: {
        horzLines: { color: 'rgba(255,255,255,0.04)' },
        vertLines: { color: 'rgba(255,255,255,0.04)' }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.25)', width: 1, style: 1 },
        horzLine: { color: 'rgba(255,255,255,0.25)', width: 1, style: 1 }
      },
      timeScale: {
        secondsVisible: false,
        timeVisible: true,
        borderColor: 'rgba(255,255,255,0.05)'
      },
      priceScale: {
        borderColor: 'rgba(255,255,255,0.05)'
      }
    });

    const series = chart.addCandlestickSeries({
      upColor: GREEN,
      downColor: RED,
      borderDownColor: RED,
      borderUpColor: GREEN,
      wickDownColor: RED,
      wickUpColor: GREEN
    });
    series.setData([]);

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight
      });
      updateOverlayPositionsRef.current();
    };

    window.addEventListener('resize', handleResize);
    requestAnimationFrame(() => updateOverlayPositionsRef.current());
    requestAnimationFrame(() => syncPriceLinesRef.current());

    return () => {
      window.removeEventListener('resize', handleResize);
      indicatorSeriesMapRef.current.forEach((lineSeries) => {
        try {
          chart.removeSeries(lineSeries);
        } catch (error) {
          /* ignore disposal issues */
        }
      });
      indicatorSeriesMapRef.current.clear();
      if (seriesRef.current) {
        if (entryLineRef.current) {
          seriesRef.current.removePriceLine(entryLineRef.current);
          entryLineRef.current = null;
        }
        if (takeProfitLineRef.current) {
          seriesRef.current.removePriceLine(takeProfitLineRef.current);
          takeProfitLineRef.current = null;
        }
        if (stopLossLineRef.current) {
          seriesRef.current.removePriceLine(stopLossLineRef.current);
          stopLossLineRef.current = null;
        }
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const seconds = timeframeToSeconds(timeframe);
    chartRef.current.timeScale().applyOptions({
      secondsVisible: seconds < 60,
      timeVisible: true
    });
    requestAnimationFrame(() => updateOverlayPositionsRef.current());
    requestAnimationFrame(() => syncPriceLinesRef.current());
  }, [timeframe]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (!candles || candles.length === 0) {
      seriesRef.current.setData([]);
      isPrimedRef.current = false;
      return;
    }
    const sanitized = candles.filter(isCandleValid);
    const candleData = sanitized.map((candle) => ({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    }));
    seriesRef.current.setData(candleData);

    if (!isPrimedRef.current) {
      chartRef.current?.timeScale().fitContent();
      isPrimedRef.current = true;
    }

    updateOverlayPositionsRef.current();
  }, [candles]);

  useEffect(() => {
    syncPriceLines();
  }, [syncPriceLines]);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }
    const chart = chartRef.current;
    const indicatorMap = indicatorSeriesMapRef.current;
    const active = new Set();

    indicators.forEach((indicator) => {
      if (!indicator || !Array.isArray(indicator.data) || indicator.data.length === 0) {
        return;
      }
      const id = indicator.id || indicator.title;
      if (!id) {
        return;
      }
      active.add(id);
      let lineSeries = indicatorMap.get(id);
      if (!lineSeries) {
        lineSeries = chart.addLineSeries({
          ...INDICATOR_DEFAULT_OPTIONS,
          ...(indicator.options || {})
        });
        indicatorMap.set(id, lineSeries);
      } else if (indicator.options) {
        lineSeries.applyOptions({
          ...INDICATOR_DEFAULT_OPTIONS,
          ...(indicator.options || {})
        });
      }
      lineSeries.setData(indicator.data);
    });

    indicatorMap.forEach((lineSeries, id) => {
      if (!active.has(id)) {
        try {
          chart.removeSeries(lineSeries);
        } catch (error) {
          /* ignore cleanup errors */
        }
        indicatorMap.delete(id);
      }
    });

    updateOverlayPositionsRef.current();
  }, [indicators]);

  return (
    <div className="chart-container" ref={wrapperRef}>
    <div className="chart-canvas" ref={containerRef} />
    <div className="chart-overlay">
        <div
          ref={entryHandleRef}
          className="price-handle entry"
          style={{ display: 'none' }}
        >
          <span className="line" />
          <span className="label">Entry</span>
        </div>
        <div
          ref={takeProfitHandleRef}
          className="price-handle take-profit"
          style={{ display: 'none' }}
          onPointerDown={startDrag('takeProfit')}
        >
          <span className="line" />
          <span className="label">TP</span>
        </div>
        <div
          ref={stopLossHandleRef}
          className="price-handle stop-loss"
          style={{ display: 'none' }}
          onPointerDown={startDrag('stopLoss')}
        >
          <span className="line" />
          <span className="label">SL</span>
        </div>
      </div>
    </div>
  );
}

function isCandleValid(candle) {
  return (
    candle &&
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close)
  );
}

function timeframeToSeconds(value) {
  if (typeof value !== 'string') return 60;
  const match = value.match(/(\d+)([smhd])/i);
  if (!match) return 60;
  const scalar = Number(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's':
      return scalar;
    case 'm':
      return scalar * 60;
    case 'h':
      return scalar * 3600;
    case 'd':
      return scalar * 86400;
    default:
      return 60;
  }
}

function formatPriceValue(price) {
  if (!Number.isFinite(price)) {
    return '';
  }
  const magnitude = Math.abs(price);
  if (magnitude >= 1000) {
    return price.toFixed(1);
  }
  if (magnitude >= 100) {
    return price.toFixed(2);
  }
  return price.toFixed(3);
}

function roundToTick(value, tickSize) {
  if (!Number.isFinite(value) || !Number.isFinite(tickSize) || tickSize <= 0) {
    return value;
  }
  const decimals = decimalPlacesFromStep(tickSize);
  const ticks = Math.round(value / tickSize);
  const snapped = ticks * tickSize;
  return Number(snapped.toFixed(decimals));
}

function decimalPlacesFromStep(step) {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot >= 0 ? text.length - dot - 1 : 0;
}

function formatDistance(price, basePrice, tickSize, tickValue) {
  if (!Number.isFinite(price) || !Number.isFinite(basePrice) || !Number.isFinite(tickSize) || tickSize <= 0) {
    return '';
  }
  const diff = price - basePrice;
  const rawTicks = diff / tickSize;
  if (!Number.isFinite(rawTicks)) {
    return '';
  }
  const roundedTicks = Math.round(rawTicks * 10) / 10;
  const absTicks = Math.abs(roundedTicks);
  const perTick = Number.isFinite(tickValue) ? Math.abs(tickValue) : DEFAULT_TICK_VALUE;

  if (absTicks < 0.05) {
    return '0t / $0.00';
  }

  const tickPrecision = absTicks < 10 ? 1 : 0;
  const sign = roundedTicks >= 0 ? '+' : '-';
  const tickLabel = `${sign}${absTicks.toFixed(tickPrecision)}t`;
  const dollarLabel = `${sign}$${(absTicks * perTick).toFixed(2)}`;
  return `${tickLabel} / ${dollarLabel}`;
}
