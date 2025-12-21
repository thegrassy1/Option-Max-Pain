/**
 * Ticker Aliases
 * Maps common names to ticker symbols
 */

export const TICKER_ALIASES: Record<string, string> = {
  // Cryptocurrencies
  'bitcoin': 'BTC',
  'btc': 'BTC',
  'ethereum': 'ETH',
  'eth': 'ETH',
  'solana': 'SOL',
  'sol': 'SOL',
  
  // Common stock names
  'tesla': 'TSLA',
  'apple': 'AAPL',
  'appl': 'AAPL', // Common typo
  'microsoft': 'MSFT',
  'google': 'GOOGL',
  'amazon': 'AMZN',
  'meta': 'META',
  'facebook': 'META',
  'nvidia': 'NVDA',
  'amd': 'AMD',
  'netflix': 'NFLX',
  'disney': 'DIS',
};

/**
 * List of cryptocurrency tickers that should use Deribit
 */
export const CRYPTO_TICKERS = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'MATIC', 'AVAX', 'DOT', 'LINK']);

/**
 * Check if a ticker is a cryptocurrency
 */
export function isCryptoTicker(ticker: string): boolean {
  return CRYPTO_TICKERS.has(ticker.toUpperCase());
}

/**
 * Normalize ticker symbol
 * Converts aliases to actual ticker symbols
 */
export function normalizeTicker(input: string): string {
  const normalized = input.trim().toLowerCase();
  
  // Check if it's an alias
  if (TICKER_ALIASES[normalized]) {
    return TICKER_ALIASES[normalized];
  }
  
  // Otherwise, just uppercase it
  return input.trim().toUpperCase();
}

