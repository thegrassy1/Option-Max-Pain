'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { DeltaData, aggregateDeltaByStrike } from '@/lib/delta-calculator';
import { OptionsChain } from '@/lib/options-api';
import { MaxPainResult } from '@/lib/delta-calculator';

interface DeltaVisualizationProps {
  optionsChain: OptionsChain;
  deltaData: DeltaData[];
}

export default function DeltaVisualization({ optionsChain, deltaData }: DeltaVisualizationProps) {
  const allMaxPain = (optionsChain as any).allMaxPain as MaxPainResult[] | undefined;
  const [selectedExpiration, setSelectedExpiration] = useState<number | null>(null);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  
  // Get max pain for selected expiration, or default to first (nearest)
  const maxPain = useMemo(() => {
    if (!allMaxPain || allMaxPain.length === 0) return undefined;
    
    if (selectedExpiration !== null) {
      return allMaxPain.find(mp => mp.expirationDays === selectedExpiration) || allMaxPain[0];
    }
    
    return allMaxPain[0]; // Default to nearest expiration
  }, [allMaxPain, selectedExpiration]);
  
  // Set default selection on mount
  useEffect(() => {
    if (allMaxPain && allMaxPain.length > 0 && selectedExpiration === null) {
      setSelectedExpiration(allMaxPain[0].expirationDays);
    }
  }, [allMaxPain, selectedExpiration]);
  
  const allChartData = useMemo(() => {
    const aggregated = aggregateDeltaByStrike(deltaData);
    
    // Convert to array and sort by strike
    const data = Array.from(aggregated.entries())
      .map(([strike, hedgingShares]) => ({
        strike,
        hedgingShares: Math.round(hedgingShares),
        buyPressure: hedgingShares > 0 ? hedgingShares : 0,
        sellPressure: hedgingShares < 0 ? Math.abs(hedgingShares) : 0,
      }))
      .sort((a, b) => a.strike - b.strike);

    return data;
  }, [deltaData]);

  // Calculate min/max strikes for slider (full range)
  const minStrike = useMemo(() => Math.min(...allChartData.map(d => d.strike)), [allChartData]);
  const maxStrike = useMemo(() => Math.max(...allChartData.map(d => d.strike)), [allChartData]);
  
  // Calculate initial zoom range
  const initialZoomRange = useMemo(() => {
    if (allChartData.length === 0) {
      return [minStrike, maxStrike] as [number, number];
    }
    
    const allStrikes = Array.from(new Set(allChartData.map(d => d.strike))).sort((a, b) => a - b);
    
    if (allStrikes.length === 0) {
      return [minStrike, maxStrike] as [number, number];
    }
    
    let centerStrike = optionsChain.spotPrice > 0 ? optionsChain.spotPrice : allStrikes[Math.floor(allStrikes.length / 2)];
    if (maxPain && maxPain.maxPainStrike > 0) {
      centerStrike = maxPain.maxPainStrike;
    }
    
    let centerIndex = allStrikes.findIndex(s => s >= centerStrike);
    if (centerIndex === -1) {
      centerIndex = allStrikes.length - 1;
    } else if (centerIndex > 0) {
      const prevDiff = Math.abs(allStrikes[centerIndex - 1] - centerStrike);
      const currDiff = Math.abs(allStrikes[centerIndex] - centerStrike);
      if (prevDiff < currDiff) {
        centerIndex = centerIndex - 1;
      }
    }
    
    const strikesCount = isMobile ? 10 : 20;
    const lowerIndex = Math.max(0, centerIndex - strikesCount);
    const upperIndex = Math.min(allStrikes.length - 1, centerIndex + strikesCount);
    
    return [allStrikes[lowerIndex], allStrikes[upperIndex]] as [number, number];
  }, [allChartData, minStrike, maxStrike, maxPain, optionsChain.spotPrice, isMobile]);
  
  const [zoomRange, setZoomRange] = useState<[number, number]>(initialZoomRange);
  const [minInput, setMinInput] = useState<string>(initialZoomRange[0].toFixed(2));
  const [maxInput, setMaxInput] = useState<string>(initialZoomRange[1].toFixed(2));
  
  useEffect(() => {
    setZoomRange(initialZoomRange);
    setMinInput(initialZoomRange[0].toFixed(2));
    setMaxInput(initialZoomRange[1].toFixed(2));
  }, [initialZoomRange]);
  
  useEffect(() => {
    setMinInput(zoomRange[0].toFixed(2));
    setMaxInput(zoomRange[1].toFixed(2));
  }, [zoomRange]);

  const chartData = useMemo(() => {
    return allChartData.filter(d => d.strike >= zoomRange[0] && d.strike <= zoomRange[1]);
  }, [allChartData, zoomRange]);

  const CustomXAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const strikeValue = payload.value;
    
    if (optionsChain.spotPrice > 0) {
      const priceDiff = Math.abs(strikeValue - optionsChain.spotPrice);
      const range = zoomRange[1] - zoomRange[0];
      if (priceDiff < range * 0.01) {
        return <g />;
      }
    }
    
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={16} textAnchor="middle" fill="#666" fontSize={isMobile ? 9 : 10}>
          ${strikeValue.toFixed(0)}
        </text>
      </g>
    );
  };

  const totalBuyPressure = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.buyPressure, 0);
  }, [chartData]);

  const totalSellPressure = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.sellPressure, 0);
  }, [chartData]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const symbol = optionsChain.ticker;
      return (
        <div className="bg-white dark:bg-gray-800 p-3 md:p-4 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
          <p className="font-semibold text-sm md:text-base dark:text-white">Strike: ${data.strike}</p>
          <p className="text-green-600 dark:text-green-400 text-xs md:text-sm">
            Buy Pressure: {data.buyPressure.toLocaleString()} {symbol}
          </p>
          <p className="text-red-600 dark:text-red-400 text-xs md:text-sm">
            Sell Pressure: {data.sellPressure.toLocaleString()} {symbol}
          </p>
          <p className="text-gray-600 dark:text-gray-400 text-[10px] md:text-xs mt-1">
            Net: {data.hedgingShares.toLocaleString()} {symbol}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Current Price</h3>
          <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">${optionsChain.spotPrice.toFixed(2)}</p>
        </div>
        {maxPain && (() => {
          const expirationDate = new Date();
          expirationDate.setDate(expirationDate.getDate() + maxPain.expirationDays);
          const formattedDate = expirationDate.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          });
          const hasMultipleExpirations = allMaxPain && allMaxPain.length > 1;
          
          return (
            <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow-md border-l-4 border-purple-500 border-t border-r border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Max Pain Strike</h3>
              <p className="text-xl md:text-2xl font-bold text-purple-600 dark:text-purple-400 mb-2">${maxPain.maxPainStrike.toFixed(2)}</p>
              {hasMultipleExpirations && allMaxPain ? (
                <div className="mb-2">
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Select Expiration:</label>
                  <select
                    value={selectedExpiration !== null ? selectedExpiration : (allMaxPain[0]?.expirationDays || maxPain.expirationDays)}
                    onChange={(e) => setSelectedExpiration(Number(e.target.value))}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium"
                  >
                    {allMaxPain.map((mp) => {
                      const expDate = new Date();
                      expDate.setDate(expDate.getDate() + mp.expirationDays);
                      const dateStr = expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      return (
                        <option key={mp.expirationDays} value={mp.expirationDays}>
                          {mp.expirationDays}d - {dateStr} - ${mp.maxPainStrike.toFixed(2)}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : null}
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  <span className="font-medium">Expires:</span> {formattedDate}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                  <span className="font-medium">Days:</span> {maxPain.expirationDays}
                </p>
              </div>
            </div>
          );
        })()}
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow-md border-l-4 border-green-500 border-t border-r border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Total Buy Pressure</h3>
          <p className="text-xl md:text-2xl font-bold text-green-600 dark:text-green-400">
            {totalBuyPressure.toLocaleString()} {optionsChain.ticker}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow-md border-l-4 border-red-500 border-t border-r border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Total Sell Pressure</h3>
          <p className="text-xl md:text-2xl font-bold text-red-600 dark:text-red-400">
            {totalSellPressure.toLocaleString()} {optionsChain.ticker}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-3 md:p-6 rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg md:text-xl font-bold mb-2 dark:text-white">Delta Hedging Requirements</h2>
        
        <div className="mb-6 p-3 md:p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-center">
            <div>
              <label className="block text-[10px] text-gray-600 dark:text-gray-400 mb-1">Min Strike</label>
              <input
                type="text"
                value={minInput}
                onChange={(e) => setMinInput(e.target.value)}
                onBlur={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val)) setZoomRange([val, zoomRange[1]]);
                }}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            
            <div className="hidden md:block">
              <input
                type="range"
                min={minStrike}
                max={maxStrike}
                value={zoomRange[0]}
                onChange={(e) => setZoomRange([Number(e.target.value), zoomRange[1]])}
                className="w-full accent-primary-600"
              />
              <input
                type="range"
                min={minStrike}
                max={maxStrike}
                value={zoomRange[1]}
                onChange={(e) => setZoomRange([zoomRange[0], Number(e.target.value)])}
                className="w-full accent-primary-600"
              />
            </div>
            
            <div>
              <label className="block text-[10px] text-gray-600 dark:text-gray-400 mb-1">Max Strike</label>
              <input
                type="text"
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                onBlur={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val)) setZoomRange([zoomRange[0], val]);
                }}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        </div>

        <div className="h-[300px] md:h-[500px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#374151' : '#e5e7eb'} />
              <XAxis
                dataKey="strike"
                type="number"
                domain={[zoomRange[0], zoomRange[1]]}
                tick={CustomXAxisTick}
                tickCount={isMobile ? 4 : 8}
                stroke={isDark ? '#9ca3af' : '#6b7280'}
              />
              <YAxis
                tick={{ fontSize: isMobile ? 8 : 10, fill: isDark ? '#9ca3af' : '#6b7280' }}
                width={isMobile ? 40 : 60}
                stroke={isDark ? '#9ca3af' : '#6b7280'}
                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '12px', paddingTop: '20px', color: isDark ? '#d1d5db' : '#374151' }} />
              {optionsChain.spotPrice > 0 && (
                <ReferenceLine
                  x={optionsChain.spotPrice}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  label={{ 
                    value: isMobile ? '' : `$${optionsChain.spotPrice.toFixed(2)}`, 
                    position: 'top', 
                    fill: '#3b82f6', 
                    fontSize: 10 
                  }}
                />
              )}
              {maxPain && (
                <ReferenceLine
                  x={maxPain.maxPainStrike}
                  stroke="#a855f7"
                  strokeDasharray="3 3"
                  strokeWidth={2}
                  label={{ 
                    value: isMobile ? '' : 'Max Pain', 
                    position: 'top', 
                    fill: '#a855f7', 
                    fontSize: 10 
                  }}
                />
              )}
              <Bar dataKey="buyPressure" fill="#10b981" name="Buy Pressure" radius={[2, 2, 0, 0]} barSize={isMobile ? 4 : 8} />
              <Bar dataKey="sellPressure" fill="#ef4444" name="Sell Pressure" radius={[2, 2, 0, 0]} barSize={isMobile ? 4 : 8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 md:p-6 rounded-lg border border-blue-100 dark:border-blue-800">
        <h3 className="text-base md:text-lg font-semibold text-blue-900 dark:text-blue-300 mb-2">How to Read</h3>
        <ul className="space-y-1.5 text-xs md:text-sm text-blue-800 dark:text-blue-400">
          <li><strong>Green:</strong> Buy pressure if price rallies.</li>
          <li><strong>Red:</strong> Sell pressure if price drops.</li>
          <li><strong>Blue Line:</strong> Current Price.</li>
          <li><strong>Purple Line:</strong> Max Pain Strike.</li>
        </ul>
      </div>

      {/* Assumptions Disclaimer */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-300 mb-2">⚠️ Important Assumptions</h3>
        <ul className="space-y-1 text-xs text-yellow-800 dark:text-yellow-400">
          <li>
            <strong>Open Interest Assumption:</strong> Applies a 60% multiplier to account for covered call sellers (who own stock and don't need hedging) and long positions. Automatically adjusts for stocks with high call/put ratios (more covered calls = lower hedging requirement).
          </li>
          <li>
            <strong>Market Maker Focus:</strong> Assumes market makers hold all short positions and hedge delta-neutral. Other participants (retail, institutions) also hold positions.
          </li>
          <li>
            <strong>Use for Relative Analysis:</strong> The absolute numbers are estimates. Focus on relative pressure (which strikes have more/less) rather than exact share counts.
          </li>
        </ul>
      </div>
    </div>
  );
}
