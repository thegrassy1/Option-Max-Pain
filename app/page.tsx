'use client';

import { useState, useEffect } from 'react';
import { calculateDeltaManagement, OptionData, calculateNextExpirationMaxPain, calculateMaxPainForAllExpirations } from '@/lib/delta-calculator';
import DeltaVisualization from '@/components/DeltaVisualization';
import { OptionsChain } from '@/lib/options-api';
import { AnalysisSkeleton } from '@/components/Skeleton';

export default function Home() {
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionsChain, setOptionsChain] = useState<OptionsChain | null>(null);
  const [deltaData, setDeltaData] = useState<any[]>([]);
  const [dataAge, setDataAge] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [sentiment, setSentiment] = useState<'neutral' | 'bullish' | 'bearish'>('neutral');

  // Update sentiment when options data changes
  useEffect(() => {
    if (optionsChain && (optionsChain as any).maxPain) {
      const spot = optionsChain.spotPrice;
      const maxPain = (optionsChain as any).maxPain.maxPainStrike;
      
      // If max pain is higher than spot, it's bullish (pulls price up)
      // If max pain is lower than spot, it's bearish (pulls price down)
      if (maxPain > spot * 1.01) setSentiment('bullish');
      else if (maxPain < spot * 0.99) setSentiment('bearish');
      else setSentiment('neutral');
    } else {
      setSentiment('neutral');
    }
  }, [optionsChain]);

  // Load theme and favorites from local storage on startup
  useEffect(() => {
    // Theme
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      }
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }

    // Favorites
    const saved = localStorage.getItem('ticker-favorites');
    if (saved) {
      try {
        setFavorites(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load favorites', e);
      }
    }
  }, []);

  // Save favorites to local storage whenever the list changes
  useEffect(() => {
    localStorage.setItem('ticker-favorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggleFavorite = (symbol: string) => {
    setFavorites(prev => 
      prev.includes(symbol) 
        ? prev.filter(f => f !== symbol) 
        : [...prev, symbol]
    );
  };

  const fetchData = async (tickerSymbol: string, live: boolean = false) => {
    setLoading(true);
    setError(null);

    try {
      // Add timeout for API calls (60 seconds - Options Basic can be slow)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(`/api/options/${tickerSymbol}?live=${live}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const result = await response.json();

      if (!result.success) {
        const errorMsg = result.error || 'Failed to fetch options data';
        console.error('API Error:', errorMsg);
        throw new Error(errorMsg);
      }
      
      // Debug: Log if we got data
      if (result.data) {
        console.log('Data received:', {
          ticker: result.data.ticker,
          spotPrice: result.data.spotPrice,
          callsCount: result.data.calls?.length || 0,
          putsCount: result.data.puts?.length || 0,
          usingMockData: result.usingMockData
        });
      }

      // Show warning if using mock data
      if (result.usingMockData && result.warning) {
        setError(result.warning); // Show as info message, not error
      }

      const chain: OptionsChain = result.data;
      
      // Check if we have data
      if (!chain || (!chain.calls || chain.calls.length === 0) && (!chain.puts || chain.puts.length === 0)) {
        console.warn('No options data received:', chain);
        setError(`No options data found for ${tickerSymbol}. This ticker may not have options available.`);
        setOptionsChain(null);
        setDeltaData([]);
        setDataAge(null);
        return;
      }
      
      setOptionsChain(chain);
      setDataAge(result.cache?.age || null);
      setIsLive(result.live || false);

      // Combine calls and puts
      const allOptions: OptionData[] = [
        ...chain.calls.map(c => ({
          strike: c.strike,
          openInterest: c.openInterest,
          type: 'call' as const,
          expiration: c.expiration,
        })),
        ...chain.puts.map(p => ({
          strike: p.strike,
          openInterest: p.openInterest,
          type: 'put' as const,
          expiration: p.expiration,
        })),
      ];
      
      // Check if we have any options
      if (allOptions.length === 0) {
        console.warn('No options contracts found after processing');
        setError(`No options contracts found for ${tickerSymbol}. This ticker may not have options available.`);
        setOptionsChain(null);
        setDeltaData([]);
        setDataAge(null);
        return;
      }

      // Calculate delta management
      // Uses 0.6 multiplier by default to account for:
      // - Covered call sellers (don't need hedging - they own the stock)
      // - Long positions (don't need hedging)
      // - Non-market-maker positions
      // Automatically adjusts based on put/call ratio (high call OI = more covered calls)
      const deltas = calculateDeltaManagement(
        chain.spotPrice,
        allOptions,
        0.30, // 30% implied volatility (can be made configurable)
        0.05, // 5% risk-free rate
        0.6   // Base multiplier: 60% of OI needs hedging (accounts for covered calls, long positions, etc.)
      );

      setDeltaData(deltas);
      
      // Debug: Show OI and calculations for specific strikes (BTC)
      if (tickerSymbol.toUpperCase() === 'BTC') {
        const debugStrikes = [84000, 85000];
        
        console.log('=== BTC Buy/Sell Pressure Calculation Debug ===');
        console.log('Current Price:', chain.spotPrice);
        console.log('');
        
        for (const strike of debugStrikes) {
          const putsAtStrike = chain.puts.filter(p => Math.abs(p.strike - strike) < 1);
          const callsAtStrike = chain.calls.filter(c => Math.abs(c.strike - strike) < 1);
          const deltaAtStrike = deltas.filter(d => Math.abs(d.strike - strike) < 1);
          
          const putOI = putsAtStrike.reduce((sum, p) => sum + p.openInterest, 0);
          const callOI = callsAtStrike.reduce((sum, c) => sum + c.openInterest, 0);
          
          console.log(`--- Strike $${strike} ---`);
          console.log(`Put OI: ${putOI.toLocaleString()} contracts`);
          console.log(`Call OI: ${callOI.toLocaleString()} contracts`);
          console.log(`Total OI: ${(putOI + callOI).toLocaleString()} contracts`);
          
          if (deltaAtStrike.length > 0) {
            const putDelta = deltaAtStrike.find(d => d.type === 'put');
            const callDelta = deltaAtStrike.find(d => d.type === 'call');
            
            if (putDelta) {
              console.log(`Put Delta: ${putDelta.delta.toFixed(4)}`);
              console.log(`Put Hedging Shares: ${putDelta.hedgingShares.toLocaleString()} (${putDelta.hedgingShares < 0 ? 'SELL' : 'BUY'} pressure)`);
            }
            if (callDelta) {
              console.log(`Call Delta: ${callDelta.delta.toFixed(4)}`);
              console.log(`Call Hedging Shares: ${callDelta.hedgingShares.toLocaleString()} (${callDelta.hedgingShares < 0 ? 'SELL' : 'BUY'} pressure)`);
            }
            
            const netHedging = deltaAtStrike.reduce((sum, d) => sum + d.hedgingShares, 0);
            const buyPressure = netHedging > 0 ? netHedging : 0;
            const sellPressure = netHedging < 0 ? Math.abs(netHedging) : 0;
            
            console.log(`Net Hedging: ${netHedging.toLocaleString()}`);
            console.log(`Buy Pressure: ${buyPressure.toLocaleString()} BTC`);
            console.log(`Sell Pressure: ${sellPressure.toLocaleString()} BTC`);
          }
          console.log('');
        }
        
        console.log('NOTE: Each bar in the chart shows buy/sell pressure PER STRIKE');
        console.log('Total Buy/Sell Pressure cards show the SUM across all strikes');
        console.log('================================');
      }
      
      // Calculate max pain for all expirations
      const allMaxPain = calculateMaxPainForAllExpirations(allOptions);
      if (allMaxPain.length > 0) {
        // Store all max pain results and default to next expiration
        (chain as any).allMaxPain = allMaxPain;
        (chain as any).maxPain = allMaxPain[0]; // Default to nearest expiration
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out. The API may be slow or unavailable. Try again or check your internet connection.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch options data');
      }
      setOptionsChain(null);
      setDeltaData([]);
      setDataAge(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!ticker.trim()) {
      setError('Please enter a ticker symbol');
      return;
    }

    // Normalize ticker (convert aliases like "bitcoin" to "BTC")
    const { normalizeTicker } = await import('@/lib/ticker-aliases');
    const normalizedTicker = normalizeTicker(ticker.trim());
    
    // Update the input field with normalized ticker
    if (normalizedTicker !== ticker.trim().toUpperCase()) {
      setTicker(normalizedTicker);
    }

    await fetchData(normalizedTicker, false);
  };

  const handleRefresh = async () => {
    if (!ticker.trim() || !optionsChain) return;
    await fetchData(ticker.trim(), true);
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 ${
      sentiment === 'bullish' 
        ? 'bg-green-50/30 dark:bg-green-900/10' 
        : sentiment === 'bearish'
          ? 'bg-red-50/30 dark:bg-red-900/10'
          : 'bg-gray-50 dark:bg-gray-900'
    }`}>
      {/* Header */}
      <header className={`shadow-sm border-b fixed top-0 left-0 right-0 z-50 transition-colors duration-500 ${
        sentiment === 'bullish'
          ? 'bg-white/80 dark:bg-green-900/20 border-green-200/50 dark:border-green-800/50 backdrop-blur-md'
          : sentiment === 'bearish'
            ? 'bg-white/80 dark:bg-red-900/20 border-red-200/50 dark:border-red-800/50 backdrop-blur-md'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}>
        <div className="container mx-auto px-4 py-3 md:py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Option Max Pain</h1>
                {sentiment !== 'neutral' && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    sentiment === 'bullish' 
                      ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' 
                      : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                  }`}>
                    {sentiment}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 md:gap-4">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              >
                {theme === 'light' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m0 13.5V21m8.967-8.967h-2.25M3 12h2.25m13.509-8.509l-1.591 1.591M6.777 17.223l-1.591 1.591m12.188 0l-1.591-1.591M6.777 6.777l-1.591-1.591M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
                  </svg>
                )}
              </button>
              <a
                href="https://optionmaxpain.com"
                className="text-xs md:text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                optionmaxpain.com
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-8 md:mb-12">
            <h2 className="text-2xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4 px-2">
              Max Pain Calculator & Delta Management
            </h2>
            <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto px-4">
              Calculate max pain strike prices and visualize delta hedging pressure for stocks and crypto options
            </p>
          </div>

          {/* Search Form */}
          <div className={`rounded-lg shadow-md p-4 md:p-8 mb-8 border transition-all duration-500 ${
            sentiment === 'bullish'
              ? 'bg-white/90 dark:bg-gray-800/90 border-green-200 dark:border-green-800 ring-1 ring-green-100 dark:ring-green-900/30'
              : sentiment === 'bearish'
                ? 'bg-white/90 dark:bg-gray-800/90 border-red-200 dark:border-red-800 ring-1 ring-red-100 dark:ring-red-900/30'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
          }`}>
            <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label htmlFor="ticker" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Ticker Symbol
                </label>
                <input
                  id="ticker"
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="Enter ticker (e.g., TSLA, BTC, AAPL)"
                  className="input"
                  disabled={loading}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={loading}
                  className={`btn w-full md:w-auto md:px-8 py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 ${
                    sentiment === 'bullish'
                      ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200 dark:shadow-none'
                      : sentiment === 'bearish'
                        ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200 dark:shadow-none'
                        : 'btn--primary'
                  }`}
                >
                  {loading ? 'Loading...' : 'Analyze'}
                </button>
              </div>
            </form>

            <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4 border-t border-gray-100 dark:border-gray-700 pt-6">
              <div className="flex-1">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-[10px] md:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">🔥 Popular Right Now:</span>
                  {['BTC', 'NVDA', 'TSLA', 'AAPL', 'SOL'].map(fav => (
                  <button
                    key={fav}
                    onClick={() => {
                      setTicker(fav);
                      fetchData(fav, false);
                    }}
                    className={`px-2.5 py-1 rounded-full text-[10px] md:text-xs font-medium transition-colors border ${
                      sentiment === 'bullish'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40'
                        : sentiment === 'bearish'
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40'
                          : 'bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {fav}
                  </button>
                  ))}
                </div>
              </div>

              {favorites.length > 0 && (
                <div className="flex-1 border-t sm:border-t-0 sm:border-l border-gray-100 dark:border-gray-700 pt-4 sm:pt-0 sm:pl-4">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[10px] md:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">⭐ Your Favorites:</span>
                    {favorites.map(fav => (
                      <button
                        key={fav}
                        onClick={() => {
                          setTicker(fav);
                          fetchData(fav, false);
                        }}
                        className="px-2.5 py-1 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded-full text-[10px] md:text-xs font-medium hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors border border-primary-200 dark:border-primary-800"
                      >
                        {fav}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className={`mt-4 p-4 rounded-lg border ${
                error.includes('mock data') || error.includes('API keys')
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}>
                <p className={`text-sm ${
                  error.includes('mock data') || error.includes('API keys')
                    ? 'text-yellow-800 dark:text-yellow-400'
                    : 'text-red-800 dark:text-red-400'
                }`}>
                  {error}
                </p>
                {(error.includes('mock data') || error.includes('API keys')) && (
                  <a 
                    href="/README_API_KEYS.md" 
                    target="_blank"
                    className="text-yellow-700 dark:text-yellow-500 hover:text-yellow-900 dark:hover:text-yellow-400 text-sm underline mt-2 inline-block"
                  >
                    Learn how to set up API keys →
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Results */}
          {loading ? (
            <div className="mt-8">
              <AnalysisSkeleton />
            </div>
          ) : optionsChain && deltaData.length > 0 ? (
            <div className="mt-8">
              <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                      Delta Analysis for {optionsChain.ticker}
                      {optionsChain.companyName && (
                        <span className="font-normal text-gray-500 dark:text-gray-400 ml-2">
                          ({optionsChain.companyName})
                        </span>
                      )}
                    </h2>
                    <button
                      onClick={() => toggleFavorite(optionsChain.ticker)}
                      className={`p-1.5 rounded-full transition-colors ${
                        favorites.includes(optionsChain.ticker)
                          ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                          : 'text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                      title={favorites.includes(optionsChain.ticker) ? "Remove from Favorites" : "Add to Favorites"}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {optionsChain.calls.length + optionsChain.puts.length} option contracts
                    </p>
                    {dataAge && (
                      <span className={`text-[10px] md:text-sm px-2 md:px-3 py-0.5 md:py-1 rounded-full ${
                        isLive 
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' 
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        {isLive ? '🟢 Live Data' : `📊 ${dataAge}`}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="btn btn--primary w-full md:w-auto disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {loading ? 'Refreshing...' : '🔄 Refresh Live Data'}
                </button>
              </div>
              <DeltaVisualization optionsChain={optionsChain} deltaData={deltaData} />
            </div>
          ) : null}

          {/* Info Section */}
          {!optionsChain && !loading && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 border border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">How It Works</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">What is Delta?</h4>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Delta measures how much an option's price changes when the underlying asset moves $1. 
                    Market makers who sell options need to hedge their positions to stay delta-neutral.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Why It Matters</h4>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    When prices move, market makers must buy or sell shares to hedge. This creates 
                    predictable buying and selling pressure at key strike levels, especially where 
                    there's high open interest.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-12">
        <div className="container mx-auto px-4 py-6">
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Options Delta Monitor - Visualize market maker hedging requirements
          </p>
        </div>
      </footer>
    </div>
  );
}

