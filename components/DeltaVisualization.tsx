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
  const [viewMode, setViewMode] = useState<'delta' | 'gamma'>('delta');
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
      .map(([strike, values]) => {
        const contractsAtStrike = deltaData.filter(d => d.strike === strike);
        const callData = contractsAtStrike.find(d => d.type === 'call');
        const putData = contractsAtStrike.find(d => d.type === 'put');
        
        return {
          strike,
          hedgingShares: Math.round(values.delta),
          gammaExposure: Math.round(values.gamma),
          buyPressure: values.buyPressure,
          sellPressure: values.sellPressure,
          posGamma: values.gamma > 0 ? values.gamma : 0,
          negGamma: values.gamma < 0 ? Math.abs(values.gamma) : 0,
          // Extra data for tooltips
          callOI: callData?.openInterest || 0,
          putOI: putData?.openInterest || 0,
          callDelta: callData?.delta || 0,
          putDelta: putData?.delta || 0,
        };
      })
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
      
      if (viewMode === 'delta') {
        return (
          <div className="bg-white dark:bg-gray-800 p-3 md:p-4 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
            <p className="font-semibold text-sm md:text-base dark:text-white border-b border-gray-100 dark:border-gray-700 pb-1 mb-2">Strike: ${data.strike}</p>
            
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold mb-1">Market Pressure</p>
                <p className="text-green-600 dark:text-green-400 text-xs md:text-sm">
                  Buy Pressure: {data.buyPressure.toLocaleString()} {symbol}
                </p>
                <p className="text-red-600 dark:text-red-400 text-xs md:text-sm">
                  Sell Pressure: {data.sellPressure.toLocaleString()} {symbol}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase font-bold">Calls</p>
                  <p className="text-xs dark:text-gray-300">OI: {data.callOI.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500">Δ: {data.callDelta.toFixed(3)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase font-bold">Puts</p>
                  <p className="text-xs dark:text-gray-300">OI: {data.putOI.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500">Δ: {data.putDelta.toFixed(3)}</p>
                </div>
              </div>

              <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
                <p className="text-gray-600 dark:text-gray-300 font-bold text-xs">
                  Net: {data.hedgingShares.toLocaleString()} {symbol}
                </p>
              </div>
            </div>
          </div>
        );
      } else {
        return (
          <div className="bg-white dark:bg-gray-800 p-3 md:p-4 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
            <p className="font-semibold text-sm md:text-base dark:text-white border-b border-gray-100 dark:border-gray-700 pb-1 mb-2">Strike: ${data.strike}</p>
            
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold mb-1">Gamma Exposure</p>
                <p className="text-blue-600 dark:text-blue-400 text-xs md:text-sm">
                  Positive GEX: {data.posGamma.toLocaleString()}
                </p>
                <p className="text-orange-600 dark:text-orange-400 text-xs md:text-sm">
                  Negative GEX: {Math.abs(data.negGamma).toLocaleString()}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase font-bold">Calls</p>
                  <p className="text-xs dark:text-gray-300">OI: {data.callOI.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase font-bold">Puts</p>
                  <p className="text-xs dark:text-gray-300">OI: {data.putOI.toLocaleString()}</p>
                </div>
              </div>

              <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
                <p className="text-gray-600 dark:text-gray-300 font-bold text-xs">
                  Total GEX: {data.gammaExposure.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        );
      }
    }
    return null;
  };

  return (
    <div className="w-full space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Current Price</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">${optionsChain.spotPrice.toFixed(2)}</p>
            {optionsChain.change24hPercent !== undefined && (
              <span className={`text-sm font-semibold ${optionsChain.change24hPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {optionsChain.change24hPercent >= 0 ? '+' : ''}{optionsChain.change24hPercent.toFixed(2)}%
              </span>
            )}
          </div>
          <div className="mt-2 space-y-1">
            {optionsChain.change24h !== undefined && (
              <p className={`text-xs ${optionsChain.change24h >= 0 ? 'text-green-600/70' : 'text-red-600/70'}`}>
                {optionsChain.change24h >= 0 ? '+' : '-'}${Math.abs(optionsChain.change24h).toFixed(2)} (24h)
              </p>
            )}
            {(() => {
              const totalCalls = deltaData.filter(d => d.type === 'call').reduce((sum, d) => sum + d.openInterest, 0);
              const totalPuts = deltaData.filter(d => d.type === 'put').reduce((sum, d) => sum + d.openInterest, 0);
              const pcr = totalCalls > 0 ? totalPuts / totalCalls : 0;
              return (
                <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/50">
                  <span>Put/Call Ratio:</span>
                  <span className={`font-bold ${pcr > 1.1 ? 'text-red-500' : pcr < 0.8 ? 'text-green-500' : 'text-gray-600'}`}>
                    {pcr.toFixed(2)}
                  </span>
                </div>
              );
            })()}
            {optionsChain.impliedVolatility !== undefined && (
              <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
                <span>Avg. IV:</span>
                <span className="font-bold text-blue-500">{(optionsChain.impliedVolatility * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>
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
            <div className={`bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow-md border-l-4 ${maxPain.isReliable === false ? 'border-yellow-500' : 'border-purple-500'} border-t border-r border-b border-gray-200 dark:border-gray-700`}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Max Pain Strike</h3>
                {maxPain.isReliable === false && (
                  <span className="group relative">
                    <span className="text-yellow-500 cursor-help">⚠️</span>
                    <span className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      Unreliable data: Max Pain strike is too far from current price or based on too few strikes.
                    </span>
                  </span>
                )}
              </div>
              <p className={`text-xl md:text-2xl font-bold ${maxPain.isReliable === false ? 'text-yellow-600 dark:text-yellow-400' : 'text-purple-600 dark:text-purple-400'} mb-2`}>
                ${maxPain.maxPainStrike.toFixed(2)}
              </p>
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

      {/* Max Pain Sentiment Gauge */}
      {maxPain && (
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 space-y-2 text-center md:text-left">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Max Pain Sentiment</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Measures how far the price is from the Max Pain strike. The market often "pulls" the price toward this level as expiration approaches.
              </p>
              <div className="flex items-center gap-4 justify-center md:justify-start mt-2">
                <div className="text-center">
                  <p className="text-[10px] uppercase text-gray-400 font-bold">Current Price</p>
                  <p className="font-mono text-sm">${optionsChain.spotPrice.toFixed(2)}</p>
                </div>
                <div className="h-8 w-px bg-gray-200 dark:bg-gray-700" />
                <div className="text-center">
                  <p className="text-[10px] uppercase text-gray-400 font-bold">Max Pain</p>
                  <p className="font-mono text-sm text-purple-500">${maxPain.maxPainStrike.toFixed(2)}</p>
                </div>
                <div className="h-8 w-px bg-gray-200 dark:bg-gray-700" />
                <div className="text-center">
                  <p className="text-[10px] uppercase text-gray-400 font-bold">Distance</p>
                  <p className={`font-mono text-sm ${Math.abs(optionsChain.spotPrice - maxPain.maxPainStrike) / optionsChain.spotPrice < 0.02 ? 'text-green-500' : 'text-orange-500'}`}>
                    {((maxPain.maxPainStrike - optionsChain.spotPrice) / optionsChain.spotPrice * 100).toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>

            <div className="relative w-64 h-32 overflow-hidden">
              {/* Gauge Background (Half-circle) */}
              <div className="absolute top-0 left-0 w-64 h-64 border-[20px] border-gray-100 dark:border-gray-700 rounded-full" />
              
              {/* Gauge Colors */}
              <div className="absolute top-0 left-0 w-64 h-64 border-[20px] border-transparent rounded-full" 
                   style={{
                     borderLeftColor: '#ef4444', // Red (Extreme Bearish)
                     borderTopColor: '#eab308', // Yellow (Neutral)
                     transform: 'rotate(45deg)',
                     zIndex: 1
                   }} />
              <div className="absolute top-0 left-0 w-64 h-64 border-[20px] border-transparent rounded-full" 
                   style={{
                     borderRightColor: '#10b981', // Green (Extreme Bullish)
                     transform: 'rotate(-45deg)',
                     zIndex: 1
                   }} />

              {/* Needle */}
              {(() => {
                const diffPercent = ((maxPain.maxPainStrike - optionsChain.spotPrice) / optionsChain.spotPrice) * 100;
                // Clamp diff between -10% and +10% for the gauge
                const clampedDiff = Math.max(-10, Math.min(10, diffPercent));
                // Map -10% -> 10% to 0 -> 180 degrees
                const rotation = (clampedDiff + 10) * 9; 
                
                return (
                  <div className="absolute bottom-0 left-1/2 w-1 h-24 bg-gray-800 dark:bg-white origin-bottom -translate-x-1/2 transition-transform duration-1000 ease-out"
                       style={{ transform: `translateX(-50%) rotate(${rotation - 90}deg)`, zIndex: 10 }}>
                    <div className="w-3 h-3 bg-gray-800 dark:bg-white rounded-full -translate-x-1 translate-y-20" />
                  </div>
                );
              })()}

              {/* Gauge Labels */}
              <div className="absolute bottom-2 left-4 text-[10px] font-bold text-red-500">BEARISH</div>
              <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-gray-400">NEUTRAL</div>
              <div className="absolute bottom-2 right-4 text-[10px] font-bold text-green-500">BULLISH</div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 p-3 md:p-6 rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
          <h2 className="text-lg md:text-xl font-bold dark:text-white">
            {viewMode === 'delta' ? 'Delta Hedging Requirements' : 'Gamma Exposure (GEX)'}
          </h2>
          
          <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg self-start">
            <button
              onClick={() => setViewMode('delta')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'delta'
                  ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Delta View
            </button>
            <button
              onClick={() => setViewMode('gamma')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'gamma'
                  ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Gamma View (GEX)
            </button>
          </div>
        </div>
        
        <div className="mb-6 p-3 md:p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 items-center">
            <div className="order-1">
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
            
            <div className="col-span-2 md:col-span-1 order-3 md:order-2 flex flex-col gap-2 mt-2 md:mt-0">
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
            
            <div className="order-2 md:order-3">
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
              {(optionsChain as any).gammaFlip && (
                <ReferenceLine
                  x={(optionsChain as any).gammaFlip}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{ 
                    value: isMobile ? '' : 'Gamma Flip', 
                    position: 'bottom', 
                    fill: '#f59e0b', 
                    fontSize: 10 
                  }}
                />
              )}
              {viewMode === 'delta' ? (
                <>
                  <Bar dataKey="buyPressure" fill="#10b981" name="Buy Pressure" radius={[2, 2, 0, 0]} barSize={isMobile ? 8 : 16} />
                  <Bar dataKey="sellPressure" fill="#ef4444" name="Sell Pressure" radius={[2, 2, 0, 0]} barSize={isMobile ? 8 : 16} />
                </>
              ) : (
                <>
                  <Bar dataKey="posGamma" fill="#3b82f6" name="Positive GEX" radius={[2, 2, 0, 0]} barSize={isMobile ? 8 : 16} />
                  <Bar dataKey="negGamma" fill="#f97316" name="Negative GEX" radius={[2, 2, 0, 0]} barSize={isMobile ? 8 : 16} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 md:p-6 rounded-lg border border-blue-100 dark:border-blue-800">
        <h3 className="text-base md:text-lg font-semibold text-blue-900 dark:text-blue-300 mb-2">How to Read</h3>
        <ul className="space-y-1.5 text-xs md:text-sm text-blue-800 dark:text-blue-400">
          {viewMode === 'delta' ? (
            <>
              <li><strong>Green Bars:</strong> Buy pressure if price rallies (Market Makers buying stock).</li>
              <li><strong>Red Bars:</strong> Sell pressure if price drops (Market Makers selling stock).</li>
            </>
          ) : (
            <>
              <li><strong>Blue Bars:</strong> Positive Gamma Exposure (GEX). Stabilizes market; acts like a "cushion" as price moves.</li>
              <li><strong>Orange Bars:</strong> Negative Gamma Exposure (GEX). Increases volatility; acts like "fuel" as price moves.</li>
            </>
          )}
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
