/**
 * TradingView Lightweight Charts Component
 * Displays candlestick chart with live market data
 */
import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';

const TradingChart = ({ symbol, data, height = 500 }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candlestickSeriesRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { color: '#1e1e1e' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2e2e2e' },
        horzLines: { color: '#2e2e2e' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#2e2e2e',
      },
      timeScale: {
        borderColor: '#2e2e2e',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height]);

  useEffect(() => {
    if (!candlestickSeriesRef.current || !data || data.length === 0) return;

    // Convert data to TradingView format
    const chartData = data.map((bar) => ({
      time: new Date(bar.timestamp).getTime() / 1000,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));

    candlestickSeriesRef.current.setData(chartData);
    chartRef.current.timeScale().fitContent();
  }, [data]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        ref={chartContainerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: `${height}px`,
        }}
      />
      {symbol && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#fff',
            zIndex: 10,
            textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
          }}
        >
          {symbol}
        </div>
      )}
    </div>
  );
};

export default TradingChart;
