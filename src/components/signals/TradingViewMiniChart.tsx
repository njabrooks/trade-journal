'use client';

import { useEffect, useRef, memo } from 'react';

interface TradingViewMiniChartProps {
  symbol: string; // e.g. "NASDAQ:GLXY", "COINBASE:BTCUSD"
  height?: number;
  colorTheme?: 'light' | 'dark';
}

function TradingViewMiniChartInner({
  symbol,
  height = 350,
  colorTheme = 'dark',
}: TradingViewMiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Extract display name from symbol (e.g. "NASDAQ:GLXY" → "GLXY")
  const displayName = symbol.split(':').pop()?.replace(/(HUSD|USD|USDT)$/, '') || symbol;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget
    container.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js';
    script.type = 'text/javascript';
    script.async = true;
    script.textContent = JSON.stringify({
      symbols: [[displayName, `${symbol}|1D`]],
      chartOnly: false,
      width: '100%',
      height,
      locale: 'en',
      colorTheme,
      autosize: false,
      showVolume: false,
      showMA: false,
      hideDateRanges: false,
      hideMarketStatus: false,
      hideSymbolLogo: false,
      scalePosition: 'right',
      scaleMode: 'Normal',
      fontSize: '10',
      noTimeScale: false,
      valuesTracking: '1',
      changeMode: 'price-and-percent',
      chartType: 'area',
      headerFontSize: 'small',
      lineWidth: 2,
      lineType: 0,
      dateRanges: [
        '1d|1',
        '1m|30',
        '3m|60',
        '12m|1D',
        '60m|1W',
        'all|1M',
      ],
      isTransparent: true,
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [symbol, displayName, height, colorTheme]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container rounded-md"
      style={{ height }}
    />
  );
}

export const TradingViewMiniChart = memo(TradingViewMiniChartInner);
