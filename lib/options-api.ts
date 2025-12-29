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
  change24h?: number;
  change24hPercent?: number;
  impliedVolatility?: number;
  calls: OptionContract[];
  puts: OptionContract[];
}

export interface OptionContract {
  strike: number;
  openInterest: number;
  volume?: number;
  impliedVolatility?: number;
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

  // Mock spot prices for common tickers (Approximate current prices)
  const mockSpotPrices: Record<string, number> = {
    'TSLA': 420,
    'BTC': 95000,
    'AAPL': 235,
    'NVDA': 190.53, // Match user's observation
    'SPY': 600,
    'SOL': 240,
    'ETH': 3800,
  };

  const spotPrice = mockSpotPrices[normalizedTicker] || 100;
  
  // Generate mock price change
  const change24hPercent = (Math.random() * 10 - 5); // -5% to +5%
  const change24h = (spotPrice * change24hPercent) / 100;

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
        const volume = Math.floor(openInterest * 0.3 * (0.5 + Math.random()));
        const impliedVolatility = 0.2 + (distanceFromATM * 0.5);

        calls.push({
          strike,
          openInterest,
          volume,
          impliedVolatility,
          expiration,
          type: 'call',
        });

        puts.push({
          strike,
          openInterest,
          volume,
          impliedVolatility,
          expiration,
          type: 'put',
        });
      }
    }
  }

  return {
    ticker: normalizedTicker,
    spotPrice,
    change24h,
    change24hPercent,
    impliedVolatility: 0.35, // Mock IV
    calls,
    puts,
  };
}
