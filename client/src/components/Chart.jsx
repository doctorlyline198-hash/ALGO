import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

const GREEN = '#0ddc7c';
const RED = '#f2484e';
const TP_COLOR = '#16a34a';
const SL_COLOR = '#dc2626';
const ENTRY_COLOR = '#38bdf8';
const HANDLE_HEIGHT = 20;
const DEFAULT_TICK = 0.1;
const DEFAULT_TICK_VALUE = 1;
const PATTERN_COLOR_BULL = '#16a34a';
const PATTERN_COLOR_BEAR = '#f87171';
const PATTERN_COLOR_NEUTRAL = '#a855f7';
const SIGNAL_COLOR_BULL = '#0ea5e9';
const SIGNAL_COLOR_BEAR = '#fb7185';
const SIGNAL_COLOR_NEUTRAL = '#facc15';
const INDICATOR_DEFAULT_OPTIONS = {
  lineWidth: 2,
  priceLineVisible: false,
  crosshairMarkerVisible: false,
  lastValueVisible: false
};

export default function Chart({ candles = [], timeframe = '1m', indicators = [], zones = [], bracket = {}, contract = {}, patterns = [], signals = [], onBracketDrag, position = null, orders = [] }) {
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
  const patternLinesRef = useRef(new Map());
  const indicatorSignalLinesRef = useRef(new Map());
  const orderLinesRef = useRef(new Map());
  const zoneContainerRef = useRef(null);
  const zoneElementsRef = useRef(new Map());
  const zoneHighlightSeriesRef = useRef(new Map());
  const zonesRef = useRef([]);

  const sanitizedCandles = useMemo(() => sanitizeCandles(candles), [candles]);

  const orderBuckets = useMemo(() => categorizeOrders(orders, position), [orders, position]);
  const {
    takeProfit: takeProfitOrder,
    stopLoss: stopLossOrder,
    entries: entryOrders,
    others: auxiliaryOrders
  } = orderBuckets;
  const displayOrders = useMemo(() => [...entryOrders, ...auxiliaryOrders], [entryOrders, auxiliaryOrders]);

  const tickSize = resolveTickSize(contract, position, takeProfitOrder, stopLossOrder);
  const tickValue = resolveTickValue(contract, position, takeProfitOrder, stopLossOrder);
  const lastPrice = Number.isFinite(bracket?.lastPrice)
    ? bracket.lastPrice
    : Number.isFinite(position?.lastPrice)
      ? position.lastPrice
      : null;
  const entryPrice = resolveEntryPrice(bracket, position, entryOrders);
  const anchorPrice = Number.isFinite(entryPrice) ? entryPrice : lastPrice;
  const entryHandlePrice = Number.isFinite(entryPrice)
    ? entryPrice
    : Number.isFinite(anchorPrice)
      ? anchorPrice
      : null;
  const takeProfitPrice = Number.isFinite(bracket?.takeProfit)
    ? bracket.takeProfit
    : extractOrderPrice(takeProfitOrder);
  const stopLossPrice = Number.isFinite(bracket?.stopLoss)
    ? bracket.stopLoss
    : extractOrderPrice(stopLossOrder);
  const positionSize = resolvePositionSize(bracket, position);
  const tradeDirection = resolveTradeDirection({ bracket, position, entryOrders, takeProfitOrder, stopLossOrder });
  const hasLivePosition = Number.isFinite(position?.size) && position.size !== 0;
  const entryPending = !hasLivePosition;
  const tpPending = !takeProfitOrder;
  const slPending = !stopLossOrder;

  const updateHandles = useCallback(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const overlayEl = wrapperRef.current;
    const entryLabel = resolveEntryLabel(tradeDirection);
    const takeProfitLabel = resolveTargetLabel('tp', tradeDirection, takeProfitOrder);
    const stopLossLabel = resolveTargetLabel('sl', tradeDirection, stopLossOrder);

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

    if (!series || !chart || sanitizedCandles.length === 0) {
      applyHandle(entryHandleRef, false);
      applyHandle(takeProfitHandleRef, false);
      applyHandle(stopLossHandleRef, false);
      return;
    }

    applyHandle(entryHandleRef, Number.isFinite(entryHandlePrice), entryLabel, entryPending, {
      price: entryHandlePrice,
      includeDistance: false,
      size: positionSize,
      interactive: false
    });
    applyHandle(takeProfitHandleRef, Number.isFinite(takeProfitPrice), takeProfitLabel, tpPending, {
      price: takeProfitPrice,
      distanceBase: anchorPrice
    });
    applyHandle(stopLossHandleRef, Number.isFinite(stopLossPrice), stopLossLabel, slPending, {
      price: stopLossPrice,
      distanceBase: anchorPrice
    });
  }, [
    anchorPrice,
    sanitizedCandles,
    entryHandlePrice,
    positionSize,
    takeProfitPrice,
    stopLossPrice,
    tickSize,
    tickValue,
    tradeDirection,
    takeProfitOrder,
    stopLossOrder,
    entryPending,
    tpPending,
    slPending
  ]);

  const updateZones = useCallback(() => {
    const container = zoneContainerRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;

    if (!container || !chart || !series) {
      zoneElementsRef.current.forEach((element) => element.remove());
      zoneElementsRef.current.clear();
      return;
    }

    const active = new Set();
    const data = Array.isArray(zonesRef.current) ? zonesRef.current : [];

    if (!data.length) {
      zoneElementsRef.current.forEach((element) => element.remove());
      zoneElementsRef.current.clear();
      return;
    }

    const timeScale = chart.timeScale();
    const containerWidth = container.clientWidth || container.offsetWidth || 0;
    const containerHeight = container.clientHeight || container.offsetHeight || 0;

    // Use environment variable or prop for debug flag instead of window global
    const debugZones = process.env.REACT_APP_DEBUG_ZONES === 'true';

    data.forEach((zone) => {
      if (!zone || !zone.id) {
        return;
      }

      if (zone.indicatorKey === 'fairValueGap') {
        return;
      }

      const topPrice = Number(zone.top ?? zone.high ?? zone.max);
      const bottomPrice = Number(zone.bottom ?? zone.low ?? zone.min);
      const startTimestamp = Number(zone.startTime ?? zone.time ?? zone.from);
      const endTimestamp = Number(zone.endTime ?? zone.to ?? zone.until ?? startTimestamp);

      if (!Number.isFinite(topPrice) || !Number.isFinite(bottomPrice) || !Number.isFinite(startTimestamp)) {
        return;
      }

      const startCoordCandidate = timeScale.timeToCoordinate(startTimestamp);
      const endCoordCandidate = zone.extend ? containerWidth : timeScale.timeToCoordinate(endTimestamp);
      const hasStartCoord = typeof startCoordCandidate === 'number';
      const hasEndCoord = typeof endCoordCandidate === 'number';

      if (!hasStartCoord && !hasEndCoord) {
        return;
      }

      let startCoord;
      let endCoord;

      if (!hasStartCoord) {
        if (zone.extend) {
          startCoord = 0;
        } else if (hasEndCoord) {
          startCoord = endCoordCandidate;
        } else {
          const existing = zoneElementsRef.current.get(zone.id);
          if (existing) {
            existing.style.display = 'none';
          }
          return;
        }
      } else {
        startCoord = startCoordCandidate;
      }

      if (zone.extend) {
        endCoord = containerWidth;
      } else if (hasEndCoord) {
        endCoord = endCoordCandidate;
      } else {
        endCoord = startCoord;
      }

      const buffer = 6;
      if (startCoord < -buffer && endCoord < -buffer) {
        const existing = zoneElementsRef.current.get(zone.id);
        if (existing) {
          existing.style.display = 'none';
        }
        return;
      }
      if (startCoord > containerWidth + buffer && endCoord > containerWidth + buffer) {
        const existing = zoneElementsRef.current.get(zone.id);
        if (existing) {
          existing.style.display = 'none';
        }
        return;
      }

  const priceTopCoord = series.priceToCoordinate(Math.max(topPrice, bottomPrice));
  const priceBottomCoord = series.priceToCoordinate(Math.min(topPrice, bottomPrice));

  if (typeof priceTopCoord !== 'number' || typeof priceBottomCoord !== 'number') {
    return;
  }

  startCoord = Math.min(Math.max(startCoord, 0), containerWidth);
  endCoord = zone.extend
    ? containerWidth
    : Math.min(Math.max(endCoord, 0), containerWidth);

  const left = Math.min(startCoord, endCoord);
  const right = Math.max(startCoord, endCoord);
  const width = Math.max(right - left, 2);
  const upperCoord = Math.min(priceTopCoord, priceBottomCoord);
  const lowerCoord = Math.max(priceTopCoord, priceBottomCoord);
  const rawHeight = Math.max(lowerCoord - upperCoord, 4);
  const maxTop = Math.max(containerHeight - rawHeight, 0);
  const topPosition = containerHeight > 0 ? Math.min(Math.max(upperCoord, 0), maxTop) : upperCoord;
  const height = containerHeight > 0 ? Math.max(Math.min(rawHeight, containerHeight - topPosition), 2) : rawHeight;

  let element = zoneElementsRef.current.get(zone.id);
  if (!element) {
    element = document.createElement('div');
    element.className = 'indicator-zone';
    const label = document.createElement('span');
    label.className = 'zone-label';
    element.appendChild(label);
    container.appendChild(element);
    zoneElementsRef.current.set(zone.id, element);
  }

  active.add(zone.id);
  element.style.display = 'block';
  element.style.left = `${left}px`;
  element.style.width = `${width}px`;
  element.style.top = `${topPosition}px`;
  element.style.height = `${height}px`;

  element.classList.toggle('bullish', zone.direction === 'bullish');
  element.classList.toggle('bearish', zone.direction === 'bearish');
  element.classList.toggle('filled', zone.filled === true);

  const labelEl = element.querySelector('.zone-label');
  if (labelEl) {
    labelEl.textContent = zone.label || 'Zone';
  }

  if (debugZones) {
    const startCoordBeforeClamp = startCoord;
    console.debug('[Chart] zone geometry', {
      id: zone.id,
      left: Math.round(left * 100) / 100,
      top: Math.round(topPosition * 100) / 100,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      containerWidth,
      containerHeight,
      startCoord: Math.round(startCoordBeforeClamp * 100) / 100,
      endCoord: Math.round(endCoord * 100) / 100,
      topPrice,
      bottomPrice,
      extend: Boolean(zone.extend),
      filled: Boolean(zone.filled)
    });
  }

      if (zone.indicatorKey) {
        element.setAttribute('data-indicator-key', zone.indicatorKey);
      } else {
        element.removeAttribute('data-indicator-key');
      }
    });

    zoneElementsRef.current.forEach((element, id) => {
      if (!active.has(id)) {
        element.remove();
        zoneElementsRef.current.delete(id);
      }
    });
  }, []);

  const updateOverlayPositions = useCallback(() => {
    updateHandles();
    updateZones();
  }, [updateHandles, updateZones]);

  updateOverlayPositionsRef.current = updateOverlayPositions;

  const syncPriceLines = useCallback(() => {
    if (!seriesRef.current) {
      return;
    }

    const series = seriesRef.current;
    const entryLabel = resolveEntryLabel(tradeDirection);
    const takeProfitLabel = resolveTargetLabel('tp', tradeDirection, takeProfitOrder);
    const stopLossLabel = resolveTargetLabel('sl', tradeDirection, stopLossOrder);
    const entryTitle = buildEntryLineTitle({
      label: entryLabel,
      size: positionSize,
      pending: entryPending
    });
    const takeProfitTitle = buildTargetLineTitle({
      label: takeProfitLabel,
      order: takeProfitOrder,
      pending: tpPending
    });
    const stopLossTitle = buildTargetLineTitle({
      label: stopLossLabel,
      order: stopLossOrder,
      pending: slPending
    });

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
        title: entryTitle
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
        title: takeProfitTitle
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
        title: stopLossTitle
      });
    }

    updateOverlayPositions();
  }, [
    entryHandlePrice,
    takeProfitPrice,
    stopLossPrice,
    updateOverlayPositions,
    tradeDirection,
    positionSize,
    entryPending,
    tpPending,
    slPending,
    takeProfitOrder,
    stopLossOrder
  ]);

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

    const handleVisibleRange = () => {
      updateOverlayPositionsRef.current();
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRange);

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
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleRange);
      indicatorSeriesMapRef.current.forEach((lineSeries) => {
        try {
          chart.removeSeries(lineSeries);
        } catch (error) {
          /* ignore disposal issues */
        }
      });
      indicatorSeriesMapRef.current.clear();
      zoneHighlightSeriesRef.current.forEach((entry) => {
        try {
          chart.removeSeries(entry.series);
        } catch (error) {
          /* ignore cleanup issues */
        }
      });
      zoneHighlightSeriesRef.current.clear();
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
        patternLinesRef.current.forEach((entry) => {
          try {
            seriesRef.current.removePriceLine(entry.line);
          } catch (error) {}
        });
        patternLinesRef.current.clear();
        indicatorSignalLinesRef.current.forEach((entry) => {
          try {
            seriesRef.current.removePriceLine(entry.line);
          } catch (error) {}
        });
        indicatorSignalLinesRef.current.clear();
        orderLinesRef.current.forEach((entry) => {
          try {
            seriesRef.current.removePriceLine(entry.line);
          } catch (error) {}
        });
        orderLinesRef.current.clear();
        try {
          seriesRef.current.setMarkers([]);
        } catch (error) {}
      }
      zoneElementsRef.current.forEach((element) => element.remove());
      zoneElementsRef.current.clear();
      zonesRef.current = [];
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const seconds = timeframeToSeconds(timeframe);
    const scale = chartRef.current.timeScale();
    scale.applyOptions({
      secondsVisible: seconds < 60,
      timeVisible: true
    });
    requestAnimationFrame(() => {
      scale.fitContent();
      updateOverlayPositionsRef.current();
      syncPriceLinesRef.current();
    });
  }, [timeframe]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (!sanitizedCandles.length) {
      series.setData([]);
      isPrimedRef.current = false;
      return;
    }

  const preparedCandles = enforceAscendingTimes(sanitizedCandles);
  const cleanedCandles = removeTimeRegressions(preparedCandles);
  series.setData(cleanedCandles);

    if (!isPrimedRef.current) {
      chartRef.current?.timeScale().fitContent();
      isPrimedRef.current = true;
    }

    updateOverlayPositionsRef.current();
  }, [sanitizedCandles]);

  useEffect(() => {
    syncPriceLines();
  }, [syncPriceLines]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) {
      return;
    }
    const registry = patternLinesRef.current;
    const activeKeys = new Set();

    patterns.forEach((signal) => {
      if (!signal || !signal.keyLevels) {
        return;
      }
      const color = resolvePatternColor(signal);
      Object.entries(signal.keyLevels).forEach(([key, price]) => {
        if (!Number.isFinite(price)) {
          return;
        }
        const lineId = `${signal.id}:${key}`;
        activeKeys.add(lineId);
        const label = `${signal.pattern} · ${formatPatternKey(key)}`;
        if (!registry.has(lineId)) {
          const line = series.createPriceLine({
            price,
            color,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: label
          });
          registry.set(lineId, { line });
        } else {
          const entry = registry.get(lineId);
          if (entry?.line) {
            entry.line.applyOptions({
              price,
              color,
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: label
            });
          }
        }
      });
    });

    registry.forEach((entry, key) => {
      if (!activeKeys.has(key)) {
        try {
          series.removePriceLine(entry.line);
        } catch (error) {}
        registry.delete(key);
      }
    });
  }, [patterns]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) {
      return;
    }

    const registry = indicatorSignalLinesRef.current;
    const activeKeys = new Set();
    const markerCollector = [];

    if (Array.isArray(signals)) {
      signals.forEach((signal) => {
        if (!signal) {
          return;
        }

        if (signal.keyLevels && typeof signal.keyLevels === 'object') {
          const color = resolveIndicatorSignalColor(signal);
          Object.entries(signal.keyLevels).forEach(([key, price]) => {
            if (!Number.isFinite(price)) {
              return;
            }
            const lineId = `indicator:${signal.id}:${key}`;
            activeKeys.add(lineId);
            const title = formatSignalTitle(signal, key);
            if (!registry.has(lineId)) {
              const line = series.createPriceLine({
                price,
                color,
                lineWidth: 1,
                lineStyle: 0,
                axisLabelVisible: true,
                title
              });
              registry.set(lineId, { line });
            } else {
              const entry = registry.get(lineId);
              if (entry?.line) {
                entry.line.applyOptions({
                  price,
                  color,
                  lineWidth: 1,
                  lineStyle: 0,
                  axisLabelVisible: true,
                  title
                });
              }
            }
          });
        }

        const markerTime = Number(signal.breakTime ?? signal.confirmedAt ?? signal.pivotTime);
        if (!Number.isFinite(markerTime)) {
          return;
        }
        const markerColor = resolveIndicatorSignalColor(signal);
        const markerText = resolveSignalMarkerText(signal);
        markerCollector.push({
          time: markerTime,
          position: signal.direction === 'bearish' ? 'aboveBar' : 'belowBar',
          color: markerColor,
          shape: resolveSignalMarkerShape(signal),
          text: markerText
        });
      });
    }

    registry.forEach((entry, key) => {
      if (!activeKeys.has(key)) {
        try {
          series.removePriceLine(entry.line);
        } catch (error) {}
        registry.delete(key);
      }
    });

    markerCollector.sort((a, b) => (a.time || 0) - (b.time || 0));
    try {
      series.setMarkers(markerCollector);
    } catch (error) {
      /* ignore marker errors */
    }
  }, [signals]);

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

  useEffect(() => {
    zonesRef.current = Array.isArray(zones) ? zones : [];
    updateOverlayPositionsRef.current();
  }, [zones]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) {
      return;
    }

    const registry = orderLinesRef.current;
    const activeKeys = new Set();
    const workingOrders = Array.isArray(displayOrders) ? displayOrders : [];

    workingOrders.forEach((order) => {
      const price = extractOrderPrice(order);
      if (!Number.isFinite(price)) {
        return;
      }
      const identifier = resolveOrderIdentifier(order);
      if (!identifier) {
        return;
      }
      const key = `order-${identifier}`;
      activeKeys.add(key);
      const options = resolveAuxOrderLineOptions(order, tradeDirection);
      if (!options) {
        return;
      }

      if (!registry.has(key)) {
        const line = series.createPriceLine({
          price,
          ...options
        });
        registry.set(key, { line });
      } else {
        const entry = registry.get(key);
        if (entry?.line) {
          entry.line.applyOptions({
            price,
            ...options
          });
        }
      }
    });

    registry.forEach((entry, key) => {
      if (!activeKeys.has(key)) {
        try {
          series.removePriceLine(entry.line);
        } catch (error) {
          /* ignore cleanup issues */
        }
        registry.delete(key);
      }
    });
  }, [displayOrders, tradeDirection]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    const highlightMap = zoneHighlightSeriesRef.current;
    const activeKeys = new Set();
    const zoneList = Array.isArray(zones) ? zones : [];
    const lastCandleTime = sanitizedCandles.length
      ? Number(sanitizedCandles[sanitizedCandles.length - 1]?.time)
      : null;
    const fallbackSpan = timeframeToSeconds(timeframe) || 60;

    zoneList.forEach((zone) => {
      if (!zone || zone.indicatorKey !== 'fairValueGap') {
        return;
      }

      const start = Number(zone.startTime ?? zone.time ?? zone.from);
      const rawEnd = Number(zone.endTime ?? zone.to ?? zone.until ?? start);
      const top = Number(zone.top ?? zone.high ?? zone.max);
      const bottom = Number(zone.bottom ?? zone.low ?? zone.min);

      if (!Number.isFinite(start) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
        return;
      }

      let end = Number.isFinite(rawEnd) ? rawEnd : start;

      if (zone.extend) {
        if (Number.isFinite(lastCandleTime) && lastCandleTime > end) {
          end = lastCandleTime;
        } else if (!Number.isFinite(lastCandleTime)) {
          end = start + fallbackSpan;
        }
      }

      if (!Number.isFinite(end) || end <= start) {
        end = start + Math.max(fallbackSpan, 60);
      }

      const startTime = Math.round(start);
      const endTime = Math.round(end);
      const visuals = resolveFvgHighlightVisuals(zone.direction);
      const key = zone.id || `fvg-${startTime}-${top}-${bottom}`;

      let seriesEntry = highlightMap.get(key);
      const baselineOptions = {
        baseValue: { type: 'price', price: bottom },
        topFillColor1: visuals.fillStart,
        topFillColor2: visuals.fillEnd,
        topLineColor: 'rgba(0,0,0,0)',
        bottomFillColor1: 'rgba(0,0,0,0)',
        bottomFillColor2: 'rgba(0,0,0,0)',
        bottomLineColor: 'rgba(0,0,0,0)',
        lineVisible: false,
        lineWidth: 1,
        priceScaleId: 'right',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      };

      if (!seriesEntry) {
        const series = chart.addBaselineSeries(baselineOptions);
        seriesEntry = { series };
        highlightMap.set(key, seriesEntry);
      } else {
        seriesEntry.series.applyOptions(baselineOptions);
      }

      const span = Math.max(endTime - startTime, 1);
      const midCandidate = startTime + Math.floor(span / 2);
      const dataPoints = [{ time: startTime, value: top }];
      let markerTime = startTime;

      if (midCandidate > startTime && midCandidate < endTime) {
        dataPoints.push({ time: midCandidate, value: top });
        markerTime = midCandidate;
      }

      if (endTime !== startTime) {
        dataPoints.push({ time: endTime, value: top });
      }

      seriesEntry.series.setData(dataPoints);

      const markerText = formatZoneMarkerText(zone.label, zone.direction);
      seriesEntry.series.setMarkers([
        {
          time: markerTime,
          position: 'inBar',
          color: visuals.marker,
          shape: 'square',
          text: markerText
        }
      ]);

      activeKeys.add(key);
    });

    highlightMap.forEach((entry, key) => {
      if (!activeKeys.has(key)) {
        try {
          chart.removeSeries(entry.series);
        } catch (error) {
          /* ignore cleanup errors */
        }
        highlightMap.delete(key);
      }
    });
  }, [zones, sanitizedCandles, timeframe]);


  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!sanitizedCandles.length) {
      setWaiting(true);
      const timer = setTimeout(() => setWaiting(false), 3000);
      return () => clearTimeout(timer);
    }
    setWaiting(false);
    return undefined;
  }, [sanitizedCandles]);

  const hasData = sanitizedCandles.length > 0;

  return (
    <div className="chart-container" ref={wrapperRef}>
      <div className="chart-canvas" ref={containerRef} />
      <div className="chart-overlay">
        <div
          className="indicator-zones"
          ref={zoneContainerRef}
          style={{ display: hasData ? 'block' : 'none' }}
        />
        {!hasData ? (
          <div className="no-data-message">
            {waiting ? 'Waiting for data...' : 'No data available for this symbol/timeframe.'}
          </div>
        ) : (
          <>
            <div
              ref={entryHandleRef}
              className="price-handle entry"
              style={{ display: 'none' }}
              onPointerDown={startDrag('entry')}
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
          </>
        )}
      </div>
    </div>
  );
}

function sanitizeCandles(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  const normalized = list
    .map((raw) => normalizeCandle(raw))
    .filter((candle) => candle && Number.isFinite(candle.time));

  if (!normalized.length) {
    return [];
  }

  normalized.sort((a, b) => a.time - b.time);

  const sanitized = [];
  let lastTime = null;

  normalized.forEach((candle) => {
    let nextTime = Math.floor(Number(candle.time));
    if (!Number.isFinite(nextTime)) {
      return;
    }

    if (Number.isFinite(lastTime) && nextTime <= lastTime) {
      nextTime = lastTime + 1;
    }

    const cleanCandle = {
      time: nextTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    };

    sanitized.push(cleanCandle);
    lastTime = nextTime;
  });

  return sanitized;
}

function enforceAscendingTimes(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  const result = new Array(list.length);
  let lastTime = Number.NEGATIVE_INFINITY;

  for (let idx = 0; idx < list.length; idx += 1) {
    const candle = list[idx];
    if (!candle || !Number.isFinite(candle.time)) {
      continue;
    }

    let enforcedTime = Math.floor(Number(candle.time));
    if (!Number.isFinite(enforcedTime)) {
      continue;
    }

    if (enforcedTime <= lastTime) {
      enforcedTime = lastTime + 1;
    }

    result[idx] = {
      time: enforcedTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    };

    lastTime = enforcedTime;
  }

  return result.filter(Boolean);
}

function removeTimeRegressions(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  const cleaned = [];
  let lastTime = Number.NEGATIVE_INFINITY;

  list.forEach((candle, index) => {
    if (!candle || !Number.isFinite(candle.time)) {
      return;
    }

    if (candle.time <= lastTime) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Chart] Dropping non-ascending candle', {
          index,
          time: candle.time,
          previous: lastTime
        });
      }
      return;
    }

    cleaned.push(candle);
    lastTime = candle.time;
  });

  return cleaned;
}

function normalizeCandle(raw) {
  if (!raw) {
    return null;
  }
  const time = normalizeCandleTime(raw.time ?? raw.t ?? raw.timestamp ?? raw.startTime ?? raw.end);
  const open = normalizePriceField(raw.open ?? raw.o ?? raw.priceOpen);
  const high = normalizePriceField(raw.high ?? raw.h ?? raw.priceHigh);
  const low = normalizePriceField(raw.low ?? raw.l ?? raw.priceLow);
  const close = normalizePriceField(raw.close ?? raw.c ?? raw.priceClose);
  if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
    return null;
  }
  return { time, open, high, low, close };
}

function normalizePriceField(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeCandleTime(value) {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numericCandidate = Number(trimmed);
    if (Number.isFinite(numericCandidate)) {
      return normalizeNumericTimestamp(numericCandidate);
    }
    const parsedDate = Date.parse(trimmed);
    return Number.isFinite(parsedDate) ? Math.floor(parsedDate / 1000) : null;
  }
  if (typeof value === 'number') {
    return normalizeNumericTimestamp(value);
  }
  if (value && typeof value === 'object') {
    if (Number.isFinite(value.seconds)) {
      return normalizeNumericTimestamp(Number(value.seconds));
    }
    if (Number.isFinite(value.millis)) {
      return normalizeNumericTimestamp(Number(value.millis) / 1000);
    }
    if (Number.isFinite(value.ms)) {
      return normalizeNumericTimestamp(Number(value.ms) / 1000);
    }
    if (Number.isFinite(value.timestamp)) {
      return normalizeNumericTimestamp(Number(value.timestamp));
    }
    if (Number.isFinite(value.time)) {
      return normalizeCandleTime(value.time);
    }
  }
  return null;
}

function normalizeNumericTimestamp(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const seconds = value > 1e11 ? value / 1000 : value;
  return Math.floor(seconds);
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

function resolveFvgHighlightVisuals(direction) {
  if (direction === 'bearish') {
    return {
      fillStart: 'rgba(248, 113, 113, 0.22)',
      fillEnd: 'rgba(248, 113, 113, 0.06)',
      marker: '#f87171'
    };
  }

  return {
    fillStart: 'rgba(52, 211, 153, 0.22)',
    fillEnd: 'rgba(52, 211, 153, 0.06)',
    marker: '#34d399'
  };
}

function formatZoneMarkerText(label, direction) {
  const fallback = direction === 'bearish' ? 'FVG-' : 'FVG+';
  if (typeof label !== 'string') {
    return fallback;
  }

  const trimmed = label.trim();
  if (!trimmed) {
    return fallback;
  }

  if (trimmed.length <= 4) {
    return trimmed.toUpperCase();
  }

  const firstToken = trimmed.split(/\s+/)[0];
  if (firstToken.length <= 4) {
    return firstToken.toUpperCase();
  }

  return firstToken.slice(0, 4).toUpperCase();
}

function resolvePatternColor(signal) {
  if (signal?.direction === 'bullish') {
    return PATTERN_COLOR_BULL;
  }
  if (signal?.direction === 'bearish') {
    return PATTERN_COLOR_BEAR;
  }
  return PATTERN_COLOR_NEUTRAL;
}

function formatPatternKey(key) {
  if (!key) {
    return 'Level';
  }
  const text = String(key).replace(/([A-Z])/g, ' $1').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function resolveIndicatorSignalColor(signal) {
  if (signal?.direction === 'bullish') {
    return SIGNAL_COLOR_BULL;
  }
  if (signal?.direction === 'bearish') {
    return SIGNAL_COLOR_BEAR;
  }
  return SIGNAL_COLOR_NEUTRAL;
}

function formatSignalTitle(signal, levelKey) {
  const type = signal?.type ? String(signal.type).toUpperCase() : 'SIGNAL';
  const keyLabel = levelKey ? formatPatternKey(levelKey) : 'Level';
  const timeframe = signal?.timeframe ? ` · ${signal.timeframe}` : '';
  return `${type} · ${keyLabel}${timeframe}`;
}

function resolveSignalMarkerShape(signal) {
  if (signal?.type && String(signal.type).toUpperCase() === 'CHOCH') {
    return 'diamond';
  }
  if (signal?.direction === 'bearish') {
    return 'arrowDown';
  }
  if (signal?.direction === 'bullish') {
    return 'arrowUp';
  }
  return 'circle';
}

function resolveSignalMarkerText(signal) {
  if (!signal) {
    return 'SIG';
  }
  if (signal.markerText) {
    return String(signal.markerText).slice(0, 4).toUpperCase();
  }
  if (signal.direction === 'bullish') {
    return 'BUY';
  }
  if (signal.direction === 'bearish') {
    return 'SELL';
  }
  if (signal.type) {
    const token = String(signal.type).trim();
    if (token) {
      return token.slice(0, 4).toUpperCase();
    }
  }
  return 'SIG';
}

function resolveTickSize(contract, position, tpOrder, slOrder) {
  const candidates = [
    contract?.tickSize,
    contract?.meta?.tickSize,
    position?.tickSize,
    position?.meta?.tickSize,
    tpOrder?.tickSize,
    slOrder?.tickSize
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return DEFAULT_TICK;
}

function resolveTickValue(contract, position, tpOrder, slOrder) {
  const candidates = [
    contract?.tickValue,
    contract?.meta?.tickValue,
    position?.tickValue,
    position?.meta?.tickValue,
    tpOrder?.tickValue,
    slOrder?.tickValue
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric !== 0) {
      return Math.abs(numeric);
    }
  }
  return DEFAULT_TICK_VALUE;
}

function resolveEntryPrice(bracket, position, entryOrders) {
  if (Number.isFinite(bracket?.entryPrice)) {
    return Number(bracket.entryPrice);
  }
  const positionEntry = Number.isFinite(position?.averagePrice)
    ? Number(position.averagePrice)
    : Number.isFinite(position?.entryPrice)
      ? Number(position.entryPrice)
      : null;
  if (Number.isFinite(positionEntry)) {
    return positionEntry;
  }
  if (Array.isArray(entryOrders)) {
    for (const order of entryOrders) {
      const price = extractOrderPrice(order);
      if (Number.isFinite(price)) {
        return price;
      }
    }
  }
  if (Number.isFinite(bracket?.lastPrice)) {
    return Number(bracket.lastPrice);
  }
  return null;
}

function extractOrderPrice(order) {
  if (!order) {
    return null;
  }
  const candidates = [
    order.limitPrice,
    order.stopPrice,
    order.price,
    order.takeProfitPrice,
    order.stopLossPrice,
    order.triggerPrice,
    order.avgFillPrice,
    order.averagePrice
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function resolvePositionSize(bracket, position) {
  if (Number.isFinite(position?.size) && position.size !== 0) {
    return Math.abs(Number(position.size));
  }
  if (Number.isFinite(bracket?.size) && bracket.size !== 0) {
    return Math.abs(Number(bracket.size));
  }
  return null;
}

function resolveTradeDirection({ bracket, position, entryOrders, takeProfitOrder, stopLossOrder }) {
  const positionDirection = resolvePositionDirectionFromPosition(position);
  if (positionDirection) {
    return positionDirection;
  }

  if (Number.isFinite(bracket?.size) && bracket.size !== 0) {
    return bracket.size > 0 ? 'long' : 'short';
  }

  if (Array.isArray(entryOrders)) {
    for (const order of entryOrders) {
      const side = normalizeOrderSide(order?.orderSide ?? order?.side ?? order?.direction);
      if (side === 'buy') {
        return 'long';
      }
      if (side === 'sell') {
        return 'short';
      }
    }
  }

  const stopSide = normalizeOrderSide(stopLossOrder?.orderSide ?? stopLossOrder?.side ?? stopLossOrder?.direction);
  if (stopSide === 'sell') {
    return 'long';
  }
  if (stopSide === 'buy') {
    return 'short';
  }
  const tpSide = normalizeOrderSide(takeProfitOrder?.orderSide ?? takeProfitOrder?.side ?? takeProfitOrder?.direction);
  if (tpSide === 'sell') {
    return 'long';
  }
  if (tpSide === 'buy') {
    return 'short';
  }
  return null;
}

function resolvePositionDirectionFromPosition(position) {
  if (!position) {
    return null;
  }
  if (typeof position.direction === 'string') {
    const normalized = position.direction.toLowerCase();
    if (normalized === 'long' || normalized === 'short') {
      return normalized;
    }
  }
  if (Number.isFinite(position.size) && position.size !== 0) {
    return position.size > 0 ? 'long' : 'short';
  }
  return null;
}

function normalizeOrderSide(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'number') {
    if (value === 0) {
      return 'buy';
    }
    if (value === 1) {
      return 'sell';
    }
  }
  const text = String(value).trim().toLowerCase();
  if (!text) {
    return undefined;
  }
  if (text === 'buy' || text === 'long' || text === 'b') {
    return 'buy';
  }
  if (text === 'sell' || text === 'short' || text === 's') {
    return 'sell';
  }
  return undefined;
}

function categorizeOrders(orders, position) {
  const result = {
    takeProfit: null,
    stopLoss: null,
    entries: [],
    others: []
  };
  if (!Array.isArray(orders)) {
    return result;
  }
  orders.forEach((order) => {
    if (!order) {
      return;
    }
    const classification = classifyOrder(order, position);
    switch (classification) {
      case 'takeProfit':
        if (!result.takeProfit) {
          result.takeProfit = order;
        }
        break;
      case 'stopLoss':
        if (!result.stopLoss) {
          result.stopLoss = order;
        }
        break;
      case 'entry':
        result.entries.push(order);
        break;
      default:
        result.others.push(order);
        break;
    }
  });
  return result;
}

function classifyOrder(order, position) {
  const tag = typeof order?.tag === 'string' ? order.tag.toLowerCase() : '';
  if (tag.includes('chart-tp') || tag.includes('takeprofit') || tag.includes('target')) {
    return 'takeProfit';
  }
  if (tag.includes('chart-sl') || tag.includes('stoploss') || tag.includes('stop')) {
    return 'stopLoss';
  }
  if (tag.includes('entry')) {
    return 'entry';
  }

  const positionDirection = resolvePositionDirectionFromPosition(position);
  const side = normalizeOrderSide(order?.orderSide ?? order?.side ?? order?.direction);
  const price = extractOrderPrice(order);
  const referencePrice = Number.isFinite(position?.averagePrice)
    ? Number(position.averagePrice)
    : Number.isFinite(position?.entryPrice)
      ? Number(position.entryPrice)
      : null;
  const typeLabel = typeof order?.orderType === 'string'
    ? order.orderType.toLowerCase()
    : typeof order?.typeLabel === 'string'
      ? order.typeLabel.toLowerCase()
      : '';

  if (positionDirection === 'long') {
    if (side === 'sell') {
      if (Number.isFinite(price) && Number.isFinite(referencePrice)) {
        if (price > referencePrice) {
          return 'takeProfit';
        }
        if (price < referencePrice) {
          return 'stopLoss';
        }
      }
      if (typeLabel.includes('limit')) {
        return 'takeProfit';
      }
      if (typeLabel.includes('stop')) {
        return 'stopLoss';
      }
    }
  } else if (positionDirection === 'short') {
    if (side === 'buy') {
      if (Number.isFinite(price) && Number.isFinite(referencePrice)) {
        if (price < referencePrice) {
          return 'takeProfit';
        }
        if (price > referencePrice) {
          return 'stopLoss';
        }
      }
      if (typeLabel.includes('limit')) {
        return 'takeProfit';
      }
      if (typeLabel.includes('stop')) {
        return 'stopLoss';
      }
    }
  }

  if (!positionDirection && typeLabel.includes('limit') && side) {
    return 'entry';
  }

  return 'other';
}

function resolveOrderIdentifier(order) {
  if (!order) {
    return null;
  }
  return (
    order.orderId ??
    order.id ??
    order.clientOrderId ??
    order.clientId ??
    order.brokerOrderId ??
    order.tsOrderId ??
    null
  );
}

function resolveAuxOrderLineOptions(order, tradeDirection) {
  if (!order) {
    return null;
  }
  const color = (() => {
    const side = normalizeOrderSide(order.orderSide ?? order.side ?? order.direction);
    if (side === 'buy') {
      return GREEN;
    }
    if (side === 'sell') {
      return RED;
    }
    return ENTRY_COLOR;
  })();

  const typeLabel = (() => {
    if (typeof order?.orderType === 'string') {
      return order.orderType;
    }
    if (order?.orderType?.label) {
      return order.orderType.label;
    }
    if (order?.typeLabel) {
      return order.typeLabel;
    }
    if (Number.isFinite(order?.type)) {
      switch (Number(order.type)) {
        case 1:
          return 'Market';
        case 2:
          return 'Limit';
        case 3:
          return 'Stop';
        case 4:
          return 'Stop-Limit';
        default:
          return 'Order';
      }
    }
    return 'Order';
  })();

  const sideLabel = (() => {
    const side = normalizeOrderSide(order.orderSide ?? order.side ?? order.direction);
    if (side === 'buy') {
      return 'Buy';
    }
    if (side === 'sell') {
      return 'Sell';
    }
    return null;
  })();

  const sizeValue = Number.isFinite(order?.size)
    ? Math.abs(Number(order.size))
    : Number.isFinite(order?.quantity)
      ? Math.abs(Number(order.quantity))
      : undefined;
  const tifLabel = typeof order?.timeInForce === 'string'
    ? order.timeInForce.toUpperCase()
    : typeof order?.tifLabel === 'string'
      ? order.tifLabel.toUpperCase()
      : undefined;

  const parts = [];
  if (sideLabel) {
    parts.push(sideLabel);
  }
  if (typeLabel) {
    parts.push(typeLabel);
  }
  if (Number.isFinite(sizeValue) && sizeValue > 0) {
    parts.push(`x${sizeValue}`);
  }
  if (tifLabel) {
    parts.push(tifLabel);
  }

  const title = parts.length ? parts.join(' · ') : 'Working Order';
  const side = normalizeOrderSide(order.orderSide ?? order.side ?? order.direction);
  const aligned = tradeDirection
    ? (tradeDirection === 'long' && side === 'buy') || (tradeDirection === 'short' && side === 'sell')
    : false;

  return {
    color,
    lineWidth: 1,
    lineStyle: aligned ? 0 : 3,
    axisLabelVisible: true,
    title
  };
}

function resolveEntryLabel(direction) {
  if (direction === 'long') {
    return 'Long Entry';
  }
  if (direction === 'short') {
    return 'Short Entry';
  }
  return 'Entry';
}

function resolveTargetLabel(kind, direction, order) {
  const base = kind === 'tp' ? 'TP' : 'SL';
  const side = normalizeOrderSide(order?.orderSide ?? order?.side ?? order?.direction);
  if (side === 'buy') {
    return `${base} Buy`;
  }
  if (side === 'sell') {
    return `${base} Sell`;
  }
  if (direction === 'long') {
    return `${base} Sell`;
  }
  if (direction === 'short') {
    return `${base} Buy`;
  }
  return base;
}

function buildEntryLineTitle({ label, size, pending }) {
  const parts = [label || 'Entry'];
  if (Number.isFinite(size) && size > 0) {
    parts.push(`x${Math.abs(Number(size))}`);
  }
  if (pending) {
    parts.push('Pending');
  }
  return parts.join(' · ');
}

function buildTargetLineTitle({ label, order, pending }) {
  const parts = [label || 'Target'];
  const side = normalizeOrderSide(order?.orderSide ?? order?.side ?? order?.direction);
  if (side === 'buy') {
    parts.push('Buy');
  } else if (side === 'sell') {
    parts.push('Sell');
  }
  const typeLabel = typeof order?.orderType === 'string'
    ? order.orderType
    : order?.orderType?.label || order?.typeLabel;
  if (typeLabel) {
    parts.push(typeLabel);
  }
  const sizeValue = Number.isFinite(order?.size)
    ? Math.abs(Number(order.size))
    : Number.isFinite(order?.quantity)
      ? Math.abs(Number(order.quantity))
      : undefined;
  if (Number.isFinite(sizeValue) && sizeValue > 0) {
    parts.push(`x${sizeValue}`);
  }
  const tifLabel = typeof order?.timeInForce === 'string'
    ? order.timeInForce.toUpperCase()
    : typeof order?.tifLabel === 'string'
      ? order.tifLabel.toUpperCase()
      : undefined;
  if (tifLabel) {
    parts.push(tifLabel);
  }
  if (pending) {
    parts.push('Pending');
  }
  return parts.join(' · ');
}
