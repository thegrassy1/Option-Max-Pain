/**
 * Options Data API Service
 * Fetches options chain data for a given ticker
 * Now uses the new data provider system with caching
 */

import { normalizeTicker } from './ticker-aliases';

export interface OptionsChain {
  ticker: string;
  companyName?: string;
  spotPrice: number;
  calls: OptionContract[];
  puts: OptionContract[];
}

export interface OptionContract {
  strike: number;
  openInterest: number;
  expiration: number; // days to expiration
  type: 'call' | 'put';
}

/**
 * Legacy function - now uses API route with caching
 * Kept for backward compatibility
 */
export async function fetchOptionsChain(ticker: string): Promise<OptionsChain> {
  // Normalize ticker (convert aliases)
  const normalizedTicker = normalizeTicker(ticker);
  
  // Use the API route which handles caching and providers
  const response = await fetch(`${typeof window !== 'undefined' ? '' : 'http://localhost:3000'}/api/options/${normalizedTicker}`);
  
  if (!response.ok) {
    // Fallback to mock data if API fails
    return generateMockData(normalizedTicker);
  }

  const result = await response.json();
  if (!result.success) {
    return generateMockData(normalizedTicker);
  }

  return result.data;
}

/**
 * Mock options data generator for demonstration/fallback
 */
export function generateMockData(ticker: string): OptionsChain {
  const normalizedTicker = ticker.toUpperCase().trim();

  // Mock spot prices for common tickers
  const mockSpotPrices: Record<string, number> = {
    'TSLA': 250,
    'BTC': 45000,
    'AAPL': 180,
    'NVDA': 500,
    'SPY': 450,
  };

  const spotPrice = mockSpotPrices[normalizedTicker] || 100;

  // Generate mock options chain
  const calls: OptionContract[] = [];
  const puts: OptionContract[] = [];

  // Generate strikes around current price
  const strikeRange = spotPrice * 0.3; // 30% range
  const strikeStep = spotPrice * 0.02; // 2% steps
  const numStrikes = Math.floor((strikeRange * 2) / strikeStep);

  // Generate multiple expiration dates
  const expirations = [7, 14, 21, 30, 45, 60, 90]; // days

  for (const expiration of expirations) {
    for (let i = 0; i < numStrikes; i++) {
      const strike = Math.round((spotPrice - strikeRange + i * strikeStep) / 5) * 5;
      
      if (strike <= 0) continue;

      // Generate realistic open interest (higher near ATM, lower OTM)
      const distanceFromATM = Math.abs(strike - spotPrice) / spotPrice;
      const baseOI = 1000;
      const oiMultiplier = Math.max(0.1, 1 - distanceFromATM * 2);
      const openInterest = Math.floor(baseOI * oiMultiplier * (0.5 + Math.random()));

      if (openInterest > 0) {
        calls.push({
          strike,
          openInterest,
          expiration,
          type: 'call',
        });

        puts.push({
          strike,
          openInterest,
          expiration,
          type: 'put',
        });
      }
    }
  }

  return {
    ticker: normalizedTicker,
    spotPrice,
    calls,
    puts,
  };
}
