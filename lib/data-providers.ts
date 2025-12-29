/**
 * Options Data Providers
 * Supports multiple data sources with fallback options
 */

import { OptionsChain, OptionContract } from './options-api';
import { isCryptoTicker } from './ticker-aliases';
import { filterMonthlyQuarterlyOptions } from './expiration-filter';

export interface DataProvider {
  name: string;
  fetchOptionsChain(ticker: string): Promise<OptionsChain>;
}

/**
 * Polygon.io Provider
 * https://polygon.io/docs/options/getting-started
 */
export class PolygonProvider implements DataProvider {
  name = 'Polygon.io';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchOptionsChain(ticker: string): Promise<OptionsChain> {
    const normalizedTicker = ticker.toUpperCase().trim();
    
    // Get company name/ticker details
    let companyName: string | undefined;
    try {
      const tickerDetailsResponse = await fetch(
        `https://api.polygon.io/v3/reference/tickers/${normalizedTicker}?apiKey=${this.apiKey}`
      );
      if (tickerDetailsResponse.ok) {
        const tickerDetails = await tickerDetailsResponse.json();
        companyName = tickerDetails.results?.name || tickerDetails.results?.description;
      }
    } catch (error) {
      // If company name fetch fails, continue without it
      console.warn('Failed to fetch company name:', error);
    }
    
    // First, get the underlying stock price
    const stockResponse = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${normalizedTicker}/prev?adjusted=true&apiKey=${this.apiKey}`
    );
    
    if (!stockResponse.ok) {
      const errorText = await stockResponse.text();
      if (stockResponse.status === 403 || stockResponse.status === 401) {
        throw new Error(`API key invalid or unauthorized. Please check your POLYGON_API_KEY in .env.local`);
      }
      throw new Error(`Failed to fetch stock price: ${stockResponse.statusText} (${stockResponse.status})`);
    }
    
    const stockData = await stockResponse.json();
    const spotPrice = stockData.results?.[0]?.c || stockData.results?.[0]?.close || 0;
    const prevClose = stockData.results?.[0]?.o || stockData.results?.[0]?.open || spotPrice;
    
    // Calculate 24h change
    const change24h = spotPrice - prevClose;
    const change24hPercent = prevClose !== 0 ? (change24h / prevClose) * 100 : 0;

    // Get options contracts list (v3/reference/options/contracts works with Options Basic plan)
    // Target strikes near ATM to avoid getting only deep ITM/OTM contracts due to pagination limits
    const minStrike = Math.floor(spotPrice * 0.6);
    const maxStrike = Math.ceil(spotPrice * 1.4);
    
    const contractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${normalizedTicker}&strike_price.gte=${minStrike}&strike_price.lte=${maxStrike}&limit=1000&apiKey=${this.apiKey}`
    );
    
    if (!contractsResponse.ok) {
      const errorText = await contractsResponse.text();
      if (contractsResponse.status === 403 || contractsResponse.status === 401) {
        throw new Error(`API key invalid or unauthorized. Please check your POLYGON_API_KEY in .env.local`);
      }
      if (contractsResponse.status === 404) {
        throw new Error(`No options data found for ${normalizedTicker}. This ticker may not have options available, or it might be a cryptocurrency (crypto options are limited). Try a stock ticker like TSLA, AAPL, or NVDA.`);
      }
      throw new Error(`Failed to fetch options contracts: ${contractsResponse.statusText} (${contractsResponse.status})`);
    }

    const contractsData = await contractsResponse.json();
    const contracts = contractsData.results || [];
    
    // Check if we got any contracts
    if (!contracts || contracts.length === 0) {
      throw new Error(`No options contracts found for ${normalizedTicker}. This ticker may not have options available. Try a stock ticker like TSLA, AAPL, or NVDA.`);
    }
    
    // For Options Basic, we'll use the contracts list directly
    // Open interest isn't available in real-time, so we'll estimate from contract structure
    // This is much faster than fetching individual contract data
    const optionsWithData = this.processContractsForBasicPlan(contracts, spotPrice);
    
    const chain = this.transformPolygonData(normalizedTicker, spotPrice, optionsWithData, change24h, change24hPercent);
    return {
      ...chain,
      companyName,
    };
  }

  private processContractsForBasicPlan(contracts: any[], spotPrice: number): any[] {
    // For Options Basic plan, we don't have real-time open interest
    // We'll estimate it based on:
    // 1. Distance from ATM (closer = higher estimated interest)
    // 2. Time to expiration (nearer = higher interest)
    // 3. Contract type
    
    const today = new Date();
    const processed = contracts.map(contract => {
      const expirationDate = new Date(contract.expiration_date);
      const daysToExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysToExpiration < 0) return null;
      
      // Estimate open interest based on distance from ATM
      const distanceFromATM = Math.abs(contract.strike_price - spotPrice) / spotPrice;
      const timeFactor = Math.max(0.1, 1 - (daysToExpiration / 365)); // More interest for nearer expirations
      const strikeFactor = Math.max(0.1, 1 - distanceFromATM * 2); // More interest near ATM
      
      // Base estimate (Options Basic doesn't provide real OI, so we estimate)
      const estimatedOI = Math.floor(1000 * strikeFactor * timeFactor * (0.5 + Math.random() * 0.5));
      
      return {
        ...contract,
        open_interest: estimatedOI,
        expiration: daysToExpiration,
      };
    }).filter(c => c !== null);
    
    // Sort and limit to most relevant (near ATM, near expiration)
    return processed
      .sort((a, b) => {
        const aDist = Math.abs(a.strike_price - spotPrice);
        const bDist = Math.abs(b.strike_price - spotPrice);
        if (Math.abs(aDist - bDist) < spotPrice * 0.05) {
          // If strikes are close, prefer nearer expiration
          return a.expiration - b.expiration;
        }
        return aDist - bDist;
      })
      .slice(0, 300); // Limit to 300 most relevant contracts
  }


  private transformPolygonData(ticker: string, spotPrice: number, contracts: any[], change24h?: number, change24hPercent?: number): OptionsChain {
    const calls: OptionContract[] = [];
    const puts: OptionContract[] = [];
    const today = new Date();
    
    if (contracts && Array.isArray(contracts)) {
      for (const contract of contracts) {
        const expirationDate = new Date(contract.expiration_date);
        const daysToExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysToExpiration < 0) continue;

        const optionContract: OptionContract = {
          strike: contract.strike_price,
          openInterest: contract.open_interest || 0,
          expiration: daysToExpiration,
          type: contract.contract_type === 'call' ? 'call' : 'put',
        };

        if (optionContract.type === 'call') {
          calls.push(optionContract);
        } else {
          puts.push(optionContract);
        }
      }
    }

    // Filter to monthly and quarterly expirations only
    const filteredCalls = filterMonthlyQuarterlyOptions(calls);
    const filteredPuts = filterMonthlyQuarterlyOptions(puts);

    return {
      ticker,
      companyName: undefined, // Set by fetchOptionsChain if available
      spotPrice,
      change24h,
      change24hPercent,
      calls: filteredCalls,
      puts: filteredPuts,
    };
  }
}

/**
 * MarketData.app Provider
 * https://www.marketdata.app/docs/api/options/chain
 */
export class MarketDataProvider implements DataProvider {
  name = 'MarketData.app';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchOptionsChain(ticker: string): Promise<OptionsChain> {
    const normalizedTicker = ticker.toUpperCase().trim();
    
    const response = await fetch(
      `https://api.marketdata.app/v1/options/chain/${normalizedTicker}/?token=${this.apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch options: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Check if we got any options
    if (!data.options || !Array.isArray(data.options) || data.options.length === 0) {
      throw new Error(`No options data found for ${normalizedTicker} from MarketData.app`);
    }

    return this.transformMarketDataData(normalizedTicker, data);
  }

  private transformMarketDataData(ticker: string, data: any): OptionsChain {
    const calls: OptionContract[] = [];
    const puts: OptionContract[] = [];
    const today = new Date();
    const spotPrice = data.underlying?.price || data.spot || 0;
    const change24hPercent = data.underlying?.changePercent || 0;
    const change24h = data.underlying?.change || 0;

    if (data.options && Array.isArray(data.options)) {
      for (const option of data.options) {
        const expirationDate = new Date(option.expiration);
        const daysToExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysToExpiration < 0) continue;

        const contract: OptionContract = {
          strike: option.strike,
          openInterest: option.openInterest || option.open_interest || 0,
          expiration: daysToExpiration,
          type: option.type === 'call' ? 'call' : 'put',
        };

        if (contract.type === 'call') {
          calls.push(contract);
        } else {
          puts.push(contract);
        }
      }
    }

    // Filter to monthly and quarterly expirations only
    const filteredCalls = filterMonthlyQuarterlyOptions(calls);
    const filteredPuts = filterMonthlyQuarterlyOptions(puts);
    
    return {
      ticker,
      companyName: undefined, // Set by fetchOptionsChain if available
      spotPrice,
      change24h,
      change24hPercent,
      calls: filteredCalls,
      puts: filteredPuts,
    };
  }
}

/**
 * Alpha Vantage Provider (Free tier available)
 * Note: Alpha Vantage has limited options data, mainly for stocks
 */
export class AlphaVantageProvider implements DataProvider {
  name = 'Alpha Vantage';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchOptionsChain(ticker: string): Promise<OptionsChain> {
    // Alpha Vantage doesn't have direct options API, would need alternative approach
    throw new Error('Alpha Vantage options data not directly available');
  }
}

/**
 * Deribit Provider for Cryptocurrency Options
 * https://docs.deribit.com/
 */
export class DeribitProvider implements DataProvider {
  name = 'Deribit';
  private apiKey?: string;
  private apiSecret?: string;

  constructor(apiKey?: string, apiSecret?: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  async fetchOptionsChain(ticker: string): Promise<OptionsChain> {
    const normalizedTicker = ticker.toUpperCase().trim();
    
    // Deribit uses instrument names like "BTC-USD" for options
    // Map common crypto tickers to Deribit format
    // Note: Deribit only supports BTC and ETH options, not SOL
    const deribitMap: Record<string, string> = {
      'BTC': 'BTC',
      'ETH': 'ETH',
    };
    
    const deribitSymbol = deribitMap[normalizedTicker];
    
    // Deribit doesn't support SOL or other cryptos
    if (!deribitSymbol) {
      throw new Error(`Deribit does not support ${normalizedTicker} options. Only BTC and ETH are available.`);
    }
    
    // Debug: Verify BTC is being handled correctly
    if (normalizedTicker === 'BTC' && !deribitSymbol) {
      console.error('ERROR: BTC not found in deribitMap!');
    }
    
    // Get current price from Deribit - use ticker endpoint for spot price
    // Try multiple methods to get accurate price
    // Add cache-busting query parameter to ensure fresh price data
    const cacheBuster = Date.now();
    let spotPrice = 0;
    
    // Method 1: Get from ticker endpoint (most accurate)
    let change24hPercent = 0;
    try {
      const tickerResponse = await fetch(
        `https://www.deribit.com/api/v2/public/ticker?instrument_name=${deribitSymbol}-PERPETUAL&_=${cacheBuster}`,
        { cache: 'no-store' }
      );
      if (tickerResponse.ok) {
        const tickerData = await tickerResponse.json();
        spotPrice = tickerData.result?.last_price || tickerData.result?.index_price || 0;
        
        // Deribit doesn't directly provide 24h change % in the ticker response, 
        // but it provides 'index_price' and 'mark_price'. 
        // Actually it might have '24h_change' in some cases or we can use another endpoint.
        // Let's check if it exists in result.
      }
    } catch (error) {
      // Try alternative
    }
    
    // Method 2: If that fails, try index price
    if (spotPrice === 0) {
      try {
        const priceResponse = await fetch(
          `https://www.deribit.com/api/v2/public/get_index_price?index_name=${deribitSymbol}_USD&_=${cacheBuster}`,
          { cache: 'no-store' }
        );
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          spotPrice = priceData.result?.index_price || 0;
        }
      } catch (error) {
        // Continue
      }
    }
    
    // Method 3: Get from any active option's underlying price
    if (spotPrice === 0) {
      try {
        const summaryResponse = await fetch(
          `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${deribitSymbol}&kind=option&_=${cacheBuster}`,
          { cache: 'no-store' }
        );
        if (summaryResponse.ok) {
          const summaryData = await summaryResponse.json();
          const firstOption = summaryData.result?.[0];
          if (firstOption) {
            // Deribit options include underlying price in some responses
            spotPrice = firstOption.underlying_price || firstOption.mark_price || 0;
          }
        }
      } catch (error) {
        // Continue
      }
    }
    
    if (spotPrice === 0) {
      throw new Error(`Failed to fetch ${normalizedTicker} price from Deribit`);
    }
    
    // Get all options instruments
    const instrumentsResponse = await fetch(
      `https://www.deribit.com/api/v2/public/get_instruments?currency=${deribitSymbol}&kind=option&expired=false`
    );
    
    if (!instrumentsResponse.ok) {
      throw new Error(`Failed to fetch options from Deribit: ${instrumentsResponse.statusText}`);
    }
    
    const instrumentsData = await instrumentsResponse.json();
    const instruments = instrumentsData.result || [];
    
    // Get book summaries for open interest and mark prices
    const bookResponse = await fetch(
      `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${deribitSymbol}&kind=option`
    );
    
    let bookData: any = { result: [] };
    if (bookResponse.ok) {
      bookData = await bookResponse.json();
    }
    
    const bookMap = new Map<string, any>();
    (bookData.result || []).forEach((book: any) => {
      bookMap.set(book.instrument_name, book);
      // Use mark price from options if spot price is still 0
      if (spotPrice === 0 && book.underlying_price) {
        spotPrice = book.underlying_price;
      }
    });
    
    // Final fallback: use a recent option's underlying price
    if (spotPrice === 0 && instruments.length > 0) {
      const firstBook = bookData.result?.[0];
      if (firstBook?.underlying_price) {
        spotPrice = firstBook.underlying_price;
      }
    }
    
    return this.transformDeribitData(normalizedTicker, spotPrice, instruments, bookMap, change24hPercent);
  }

  private transformDeribitData(
    ticker: string,
    spotPrice: number,
    instruments: any[],
    bookMap: Map<string, any>,
    change24hPercent?: number
  ): OptionsChain {
    const calls: OptionContract[] = [];
    const puts: OptionContract[] = [];
    const today = new Date();
    
    // Calculate 24h change from percent if possible
    const change24h = change24hPercent ? (spotPrice * change24hPercent) / 100 : undefined;

    for (const instrument of instruments) {
      // Parse Deribit instrument name: e.g., "BTC-29DEC23-40000-C"
      // Format: {currency}-{expiration}-{strike}-{type}
      const parts = instrument.instrument_name.split('-');
      if (parts.length < 4) continue;
      
      const expirationStr = parts[1]; // e.g., "29DEC23"
      const strike = parseFloat(parts[2]);
      const type = parts[3]; // "C" for call, "P" for put
      
      if (isNaN(strike) || strike <= 0) continue;
      
      // Parse expiration date (format: DDMMMYY)
      const expirationDate = this.parseDeribitDate(expirationStr);
      if (!expirationDate) continue;
      
      const daysToExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysToExpiration < 0) continue;
      
      const book = bookMap.get(instrument.instrument_name);
      const openInterest = book?.open_interest || 0;
      
      const contract: OptionContract = {
        strike,
        openInterest,
        expiration: daysToExpiration,
        type: type === 'C' ? 'call' : 'put',
      };
      
      if (contract.type === 'call') {
        calls.push(contract);
      } else {
        puts.push(contract);
      }
    }
    
    // Filter to monthly and quarterly expirations only
    const filteredCalls = filterMonthlyQuarterlyOptions(calls);
    const filteredPuts = filterMonthlyQuarterlyOptions(puts);
    
    // Set company name based on ticker
    const companyNames: Record<string, string> = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
    };
    
    return {
      ticker,
      companyName: companyNames[ticker] || ticker,
      spotPrice,
      change24h,
      change24hPercent,
      calls: filteredCalls,
      puts: filteredPuts,
    };
  }

  private parseDeribitDate(dateStr: string): Date | null {
    // Format: "29DEC23" -> December 29, 2023
    try {
      const day = parseInt(dateStr.substring(0, 2));
      const monthStr = dateStr.substring(2, 5);
      const yearStr = dateStr.substring(5, 7);
      
      const monthMap: Record<string, number> = {
        'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
        'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11,
      };
      
      const month = monthMap[monthStr];
      if (month === undefined) return null;
      
      const year = 2000 + parseInt(yearStr);
      return new Date(year, month, day);
    } catch (error) {
      return null;
    }
  }
}

/**
 * OKX Provider for Cryptocurrency Options
 * https://www.okx.com/docs-v5/en/
 */
export class OKXProvider implements DataProvider {
  name = 'OKX';

  async fetchOptionsChain(ticker: string): Promise<OptionsChain> {
    const normalizedTicker = ticker.toUpperCase().trim();
    
    // Map ticker to OKX symbol format
    const okxSymbol = normalizedTicker === 'BTC' ? 'BTC' : 
                      normalizedTicker === 'ETH' ? 'ETH' : 
                      normalizedTicker === 'SOL' ? 'SOL' : normalizedTicker;
    
    // Get current price and 24h change
    const tickerResponse = await fetch(
      `https://www.okx.com/api/v5/market/ticker?instId=${okxSymbol}-USDT`
    );
    
    let spotPrice = 0;
    let change24hPercent = 0;
    if (tickerResponse.ok) {
      const tickerData = await tickerResponse.json();
      spotPrice = parseFloat(tickerData.data?.[0]?.last || 0);
      
      const open24h = parseFloat(tickerData.data?.[0]?.open24h || 0);
      if (open24h > 0) {
        change24hPercent = ((spotPrice - open24h) / open24h) * 100;
      }
    }
    
    // Fallback: try index price
    if (spotPrice === 0) {
      const indexResponse = await fetch(
        `https://www.okx.com/api/v5/public/index-ticker?instId=${okxSymbol}-USDT`
      );
      if (indexResponse.ok) {
        const indexData = await indexResponse.json();
        spotPrice = parseFloat(indexData.data?.[0]?.idxPx || 0);
      }
    }
    
    if (spotPrice === 0) {
      throw new Error(`Failed to fetch ${normalizedTicker} price from OKX`);
    }
    
    // Get options instruments
    const instrumentsResponse = await fetch(
      `https://www.okx.com/api/v5/public/instruments?instType=OPTION&uly=${okxSymbol}-USDT`
    );
    
    if (!instrumentsResponse.ok) {
      throw new Error(`Failed to fetch options from OKX: ${instrumentsResponse.statusText}`);
    }
    
    const instrumentsData = await instrumentsResponse.json();
    const instruments = instrumentsData.data || [];
    
    // Get tickers for open interest and mark prices
    const tickersResponse = await fetch(
      `https://www.okx.com/api/v5/public/tickers?instType=OPTION&uly=${okxSymbol}-USDT`
    );
    
    const tickersMap = new Map<string, any>();
    if (tickersResponse.ok) {
      const tickersData = await tickersResponse.json();
      (tickersData.data || []).forEach((ticker: any) => {
        tickersMap.set(ticker.instId, ticker);
      });
    }
    
    return this.transformOKXData(normalizedTicker, spotPrice, instruments, tickersMap, change24hPercent);
  }

  private transformOKXData(
    ticker: string,
    spotPrice: number,
    instruments: any[],
    tickersMap: Map<string, any>,
    change24hPercent?: number
  ): OptionsChain {
    const calls: OptionContract[] = [];
    const puts: OptionContract[] = [];
    const today = new Date();
    
    // Calculate 24h change from percent if possible
    const change24h = change24hPercent ? (spotPrice * change24hPercent) / 100 : undefined;

    for (const instrument of instruments) {
      // OKX format: BTC-USDT-20241227-40000-C
      // Parse: instId format is {uly}-{expiry}-{strike}-{C|P}
      const parts = instrument.instId.split('-');
      if (parts.length < 4) continue;
      
      const strike = parseFloat(parts[parts.length - 2]);
      const type = parts[parts.length - 1]; // "C" or "P"
      const expiryStr = parts[parts.length - 3]; // YYYYMMDD
      
      if (isNaN(strike) || strike <= 0) continue;
      
      // Parse expiration date (format: YYYYMMDD)
      const expirationDate = new Date(
        parseInt(expiryStr.substring(0, 4)),
        parseInt(expiryStr.substring(4, 6)) - 1,
        parseInt(expiryStr.substring(6, 8))
      );
      
      const daysToExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysToExpiration < 0) continue;
      
      const tickerData = tickersMap.get(instrument.instId);
      // OKX provides open interest in ticker data
      const openInterest = parseInt(tickerData?.oi || instrument.oi || '0') || 0;
      
      const contract: OptionContract = {
        strike,
        openInterest,
        expiration: daysToExpiration,
        type: type === 'C' ? 'call' : 'put',
      };
      
      if (contract.type === 'call') {
        calls.push(contract);
      } else {
        puts.push(contract);
      }
    }
    
    // Filter to monthly and quarterly expirations only
    const filteredCalls = filterMonthlyQuarterlyOptions(calls);
    const filteredPuts = filterMonthlyQuarterlyOptions(puts);
    
    const companyNames: Record<string, string> = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
      'SOL': 'Solana',
    };
    
    return {
      ticker,
      companyName: companyNames[ticker] || ticker,
      spotPrice,
      change24h,
      change24hPercent,
      calls: filteredCalls,
      puts: filteredPuts,
    };
  }
}

/**
 * Bybit Provider for Cryptocurrency Options
 * https://bybit-exchange.github.io/docs/v5/
 */
export class BybitProvider implements DataProvider {
  name = 'Bybit';

  async fetchOptionsChain(ticker: string): Promise<OptionsChain> {
    const normalizedTicker = ticker.toUpperCase().trim();
    
    // Map ticker to Bybit symbol format
    const bybitSymbol = normalizedTicker === 'BTC' ? 'BTC' : 
                        normalizedTicker === 'ETH' ? 'ETH' : 
                        normalizedTicker === 'SOL' ? 'SOL' : normalizedTicker;
    
    // Get current price from spot ticker
    const tickerResponse = await fetch(
      `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${bybitSymbol}USDT`
    );
    
    let spotPrice = 0;
    let change24hPercent = 0;
    if (tickerResponse.ok) {
      const tickerData = await tickerResponse.json();
      const tickerInfo = tickerData.result?.list?.[0];
      spotPrice = parseFloat(tickerInfo?.lastPrice || 0);
      change24hPercent = parseFloat(tickerInfo?.prevPrice24h ? ((spotPrice - parseFloat(tickerInfo.prevPrice24h)) / parseFloat(tickerInfo.prevPrice24h) * 100).toFixed(2) : '0');
    }
    
    if (spotPrice === 0) {
      throw new Error(`Failed to fetch ${normalizedTicker} price from Bybit`);
    }
    
    // Get options instruments
    const instrumentsResponse = await fetch(
      `https://api.bybit.com/v5/market/instruments-info?category=option&baseCoin=${bybitSymbol}`
    );
    
    if (!instrumentsResponse.ok) {
      throw new Error(`Failed to fetch options from Bybit: ${instrumentsResponse.statusText}`);
    }
    
    const instrumentsData = await instrumentsResponse.json();
    const instruments = instrumentsData.result?.list || [];
    
    // Get tickers for open interest
    const tickersResponse = await fetch(
      `https://api.bybit.com/v5/market/tickers?category=option&baseCoin=${bybitSymbol}`
    );
    
    const tickersMap = new Map<string, any>();
    if (tickersResponse.ok) {
      const tickersData = await tickersResponse.json();
      (tickersData.result?.list || []).forEach((ticker: any) => {
        tickersMap.set(ticker.symbol, ticker);
      });
    }
    
    return this.transformBybitData(normalizedTicker, spotPrice, instruments, tickersMap, change24hPercent);
  }

  private transformBybitData(
    ticker: string,
    spotPrice: number,
    instruments: any[],
    tickersMap: Map<string, any>,
    change24hPercent?: number
  ): OptionsChain {
    const calls: OptionContract[] = [];
    const puts: OptionContract[] = [];
    const today = new Date();
    
    // Calculate 24h change from percent if possible
    const change24h = change24hPercent ? (spotPrice * change24hPercent) / 100 : undefined;

    for (const instrument of instruments) {
      // Bybit format: BTC-29DEC23-40000-C
      // Parse symbol format
      const symbol = instrument.symbol;
      const parts = symbol.split('-');
      if (parts.length < 4) continue;
      
      const strike = parseFloat(parts[2]);
      const type = parts[3]; // "C" or "P"
      const expiryStr = parts[1]; // Format: DDMMMYY (e.g., "29DEC23")
      
      if (isNaN(strike) || strike <= 0) continue;
      
      // Parse expiration date (format: DDMMMYY)
      const expirationDate = this.parseBybitDate(expiryStr);
      if (!expirationDate) continue;
      
      const daysToExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysToExpiration < 0) continue;
      
      const tickerData = tickersMap.get(symbol);
      const openInterest = parseFloat(tickerData?.openInterest || instrument.openInterest || '0') || 0;
      
      const contract: OptionContract = {
        strike,
        openInterest,
        expiration: daysToExpiration,
        type: type === 'C' ? 'call' : 'put',
      };
      
      if (contract.type === 'call') {
        calls.push(contract);
      } else {
        puts.push(contract);
      }
    }
    
    // Filter to monthly and quarterly expirations only
    const filteredCalls = filterMonthlyQuarterlyOptions(calls);
    const filteredPuts = filterMonthlyQuarterlyOptions(puts);
    
    const companyNames: Record<string, string> = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
      'SOL': 'Solana',
    };
    
    return {
      ticker,
      companyName: companyNames[ticker] || ticker,
      spotPrice,
      change24h,
      change24hPercent,
      calls: filteredCalls,
      puts: filteredPuts,
    };
  }

  private parseBybitDate(dateStr: string): Date | null {
    // Format: "29DEC23" -> December 29, 2023
    try {
      const day = parseInt(dateStr.substring(0, 2));
      const monthStr = dateStr.substring(2, 5);
      const yearStr = dateStr.substring(5, 7);
      
      const monthMap: Record<string, number> = {
        'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
        'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11,
      };
      
      const month = monthMap[monthStr];
      if (month === undefined) return null;
      
      const year = 2000 + parseInt(yearStr);
      return new Date(year, month, day);
    } catch (error) {
      return null;
    }
  }
}

/**
 * Provider Manager - Handles multiple providers with fallback
 */
export class ProviderManager {
  private providers: DataProvider[] = [];
  private cryptoProviders: DataProvider[] = [];
  private currentProviderIndex = 0;
  private hasWarnedAboutNoKeys = false;
  private hasWarnedAboutAuthFailure = false;
  private authFailureDetected = false; // Track if we've detected auth failure

  constructor() {
    // Initialize providers based on available API keys
    // Use process.env in Node.js, or get from server-side only
    const polygonKey = typeof process !== 'undefined' ? process.env.POLYGON_API_KEY : undefined;
    const marketDataKey = typeof process !== 'undefined' ? process.env.MARKETDATA_API_KEY : undefined;
    const deribitKey = typeof process !== 'undefined' ? process.env.DERIBIT_API_KEY : undefined;

    // Stock options providers
    if (polygonKey && polygonKey !== 'your_polygon_api_key_here' && !polygonKey.includes('your_')) {
      this.providers.push(new PolygonProvider(polygonKey));
    }
    if (marketDataKey && marketDataKey !== 'your_marketdata_api_key_here' && !marketDataKey.includes('your_')) {
      this.providers.push(new MarketDataProvider(marketDataKey));
    }

    // Crypto options providers (all have free public APIs, no key needed for market data)
    this.cryptoProviders.push(new DeribitProvider());
    this.cryptoProviders.push(new OKXProvider());
    this.cryptoProviders.push(new BybitProvider());

    if (this.providers.length === 0 && !this.hasWarnedAboutNoKeys) {
      console.log('No API keys configured. Using mock data. (This message appears once)');
      this.hasWarnedAboutNoKeys = true;
    }
  }

  async fetchOptionsChain(ticker: string, useLive: boolean = false): Promise<OptionsChain> {
    const normalizedTicker = ticker.toUpperCase().trim();
    
    // Route crypto tickers to crypto providers (aggregate from all 3)
    if (isCryptoTicker(normalizedTicker)) {
      const results: OptionsChain[] = [];
      let spotPrice = 0;
      let companyName = '';
      
      // Try all crypto providers and aggregate data
      for (const provider of this.cryptoProviders) {
        try {
          const result = await provider.fetchOptionsChain(normalizedTicker);
          results.push(result);
          // Use the latest spot price (each provider may have slightly different prices)
          // For live refresh, we want the most current price, so use the last successful one
          if (result.spotPrice > 0) {
            spotPrice = result.spotPrice; // Use the latest price from the last successful provider
          }
          if (!companyName && result.companyName) {
            companyName = result.companyName;
          }
        } catch (error) {
          console.warn(`Crypto provider ${provider.name} failed:`, error instanceof Error ? error.message : error);
          // Continue to try other providers
        }
      }
      
      // If we got any results, aggregate them
      if (results.length > 0) {
        // Combine all calls and puts from all providers
        const allCalls: OptionContract[] = [];
        const allPuts: OptionContract[] = [];
        
        for (const result of results) {
          allCalls.push(...result.calls);
          allPuts.push(...result.puts);
        }
        
        // Merge contracts with same strike and expiration (sum open interest)
        const callsMap = new Map<string, OptionContract>();
        const putsMap = new Map<string, OptionContract>();
        
        for (const call of allCalls) {
          const key = `${call.strike}-${call.expiration}`;
          const existing = callsMap.get(key);
          if (existing) {
            existing.openInterest += call.openInterest;
          } else {
            callsMap.set(key, { ...call });
          }
        }
        
        for (const put of allPuts) {
          const key = `${put.strike}-${put.expiration}`;
          const existing = putsMap.get(key);
          if (existing) {
            existing.openInterest += put.openInterest;
          } else {
            putsMap.set(key, { ...put });
          }
        }
        
        this.authFailureDetected = false;
        return {
          ticker: normalizedTicker,
          companyName: companyName || normalizedTicker,
          spotPrice: spotPrice || results[0].spotPrice,
          calls: Array.from(callsMap.values()),
          puts: Array.from(putsMap.values()),
        };
      }
      
      // Fallback to mock data for crypto
      const { generateMockData } = await import('./options-api');
      return generateMockData(normalizedTicker);
    }
    
    // For stocks, use regular providers
    // If we've already detected auth failure, skip API calls and go straight to mock data
    if (this.authFailureDetected) {
      const { generateMockData } = await import('./options-api');
      return generateMockData(normalizedTicker);
    }

    if (this.providers.length === 0) {
      // No API keys configured, use mock data (silently, we already warned)
      const { generateMockData } = await import('./options-api');
      return generateMockData(normalizedTicker);
    }

    // Try providers in order, with fallback
    let lastError: Error | null = null;
    
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[(this.currentProviderIndex + i) % this.providers.length];
      
      try {
        const result = await provider.fetchOptionsChain(ticker);
        
        // If we got a result but it's empty after filtering, throw to try next provider or mock
        if (result.calls.length === 0 && result.puts.length === 0) {
          throw new Error(`Provider ${provider.name} returned 0 options after filtering for ${ticker}`);
        }

        // Success! Reset auth failure flag
        this.authFailureDetected = false;
        this.hasWarnedAboutAuthFailure = false;
        // Rotate to next provider for load balancing
        this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message;
        
        // Check if it's an authentication error
        if (errorMessage.includes('invalid') || errorMessage.includes('unauthorized') || errorMessage.includes('403') || errorMessage.includes('401')) {
          // Mark auth failure detected (only log once)
          this.authFailureDetected = true;
          if (!this.hasWarnedAboutAuthFailure) {
            console.warn('API authentication failed. Using mock data. (This message appears once)');
            console.info('To use real data, add valid API keys to .env.local - see README_API_KEYS.md');
            this.hasWarnedAboutAuthFailure = true;
          }
          // Break out of loop - don't try other providers if auth failed
          break;
        } else {
          // Non-auth error - only log if not already warned
          if (!this.hasWarnedAboutAuthFailure) {
            console.warn(`Provider ${provider.name} failed:`, errorMessage);
          }
        }
      }
    }

    // All providers failed, fallback to mock data (silently if we already warned)
    console.log(`All providers failed for ${ticker}. Falling back to mock data.`);
    const { generateMockData } = await import('./options-api');
    const mockData = generateMockData(ticker);
    console.log(`Generated mock data for ${ticker}: ${mockData.calls.length} calls, ${mockData.puts.length} puts`);
    return mockData;
  }

  getAvailableProviders(): string[] {
    return this.providers.map(p => p.name);
  }
}

// Singleton instance
let providerManager: ProviderManager | null = null;

export function getProviderManager(): ProviderManager {
  if (!providerManager) {
    providerManager = new ProviderManager();
  }
  return providerManager;
}

