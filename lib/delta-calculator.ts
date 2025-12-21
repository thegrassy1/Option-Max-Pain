/**
 * Black-Scholes Delta Calculator
 * Calculates the delta (price sensitivity) of options
 */

export interface OptionData {
  strike: number;
  openInterest: number;
  type: 'call' | 'put';
  expiration: number; // days to expiration
}

export interface DeltaData {
  strike: number;
  delta: number;
  totalDelta: number; // delta * open interest
  openInterest: number;
  type: 'call' | 'put';
  hedgingShares: number; // shares needed to hedge (positive = buy, negative = sell)
}

/**
 * Calculate cumulative normal distribution
 */
function normCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2.0);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Calculate Black-Scholes delta for an option
 */
export function calculateDelta(
  spotPrice: number,
  strike: number,
  timeToExpiry: number, // in years
  volatility: number, // annualized volatility (e.g., 0.30 for 30%)
  riskFreeRate: number = 0.05, // annual risk-free rate
  optionType: 'call' | 'put'
): number {
  if (timeToExpiry <= 0) {
    return optionType === 'call' ? (spotPrice > strike ? 1 : 0) : (spotPrice < strike ? -1 : 0);
  }

  const d1 = (Math.log(spotPrice / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) /
    (volatility * Math.sqrt(timeToExpiry));

  if (optionType === 'call') {
    return normCDF(d1);
  } else {
    return -normCDF(-d1);
  }
}

/**
 * Calculate delta management data for all options
 * Accounts for covered call sellers who don't need hedging
 */
export function calculateDeltaManagement(
  spotPrice: number,
  options: OptionData[],
  volatility: number = 0.30,
  riskFreeRate: number = 0.05,
  coveredCallMultiplier: number = 0.6 // Adjust based on market structure (0.6 = assume 40% are covered calls)
): DeltaData[] {
  // Calculate put/call ratio to estimate covered calls
  const totalCallOI = options
    .filter(opt => opt.type === 'call')
    .reduce((sum, opt) => sum + opt.openInterest, 0);
  
  const totalPutOI = options
    .filter(opt => opt.type === 'put')
    .reduce((sum, opt) => sum + opt.openInterest, 0);
  
  const putCallRatio = totalPutOI > 0 ? totalCallOI / totalPutOI : 1;
  
  // Estimate covered calls: Higher call OI relative to puts suggests more covered calls
  // Typical covered call stocks have PC ratio > 1.5 (more calls than puts)
  // Adjust multiplier: if PC ratio is high, more calls might be covered
  let callHedgeMultiplier = coveredCallMultiplier;
  if (putCallRatio > 1.5) {
    // High call/put ratio suggests more covered calls
    // Reduce hedging requirement for calls
    callHedgeMultiplier = Math.max(0.4, coveredCallMultiplier - (putCallRatio - 1.5) * 0.1);
  }
  
  return options.map(option => {
    const timeToExpiry = option.expiration / 365; // convert days to years
    const delta = calculateDelta(
      spotPrice,
      option.strike,
      timeToExpiry,
      volatility,
      riskFreeRate,
      option.type
    );

    // Apply multiplier to account for:
    // 1. Long positions (don't need hedging)
    // 2. Covered calls (already hedged with stock ownership)
    // 3. Other non-market-maker positions
    const hedgeMultiplier = option.type === 'call' ? callHedgeMultiplier : coveredCallMultiplier;
    
    // Total delta exposure = delta * open interest * 100 * multiplier
    // Multiplier accounts for covered calls and long positions
    const totalDelta = delta * option.openInterest * 100 * hedgeMultiplier;
    
    // Hedging shares needed (negative means market makers need to sell)
    const hedgingShares = -totalDelta;

    return {
      strike: option.strike,
      delta,
      totalDelta,
      openInterest: option.openInterest,
      type: option.type,
      hedgingShares,
    };
  });
}

/**
 * Aggregate delta by strike (combining calls and puts)
 */
export function aggregateDeltaByStrike(deltaData: DeltaData[]): Map<number, number> {
  const aggregated = new Map<number, number>();
  
  deltaData.forEach(data => {
    const current = aggregated.get(data.strike) || 0;
    aggregated.set(data.strike, current + data.hedgingShares);
  });
  
  return aggregated;
}

/**
 * Calculate Max Pain for options
 * Max Pain is the strike price where option holders would experience maximum financial loss at expiration
 */
export interface MaxPainResult {
  maxPainStrike: number;
  maxPainValue: number;
  expirationDays: number;
  totalOpenInterest?: number;
  strikeCount?: number;
  isReliable?: boolean;
}

export function calculateMaxPain(
  options: OptionData[],
  expirationDays: number
): MaxPainResult | null {
  // Filter options for the specific expiration
  const expirationOptions = options.filter(opt => opt.expiration === expirationDays);
  
  if (expirationOptions.length === 0) {
    return null;
  }

  // Get all unique strikes
  const strikes = Array.from(new Set(expirationOptions.map(opt => opt.strike))).sort((a, b) => a - b);
  
  if (strikes.length === 0) {
    return null;
  }

  // Group options by strike
  const optionsByStrike = new Map<number, { calls: number; puts: number }>();
  expirationOptions.forEach(opt => {
    const existing = optionsByStrike.get(opt.strike) || { calls: 0, puts: 0 };
    if (opt.type === 'call') {
      existing.calls += opt.openInterest;
    } else {
      existing.puts += opt.openInterest;
    }
    optionsByStrike.set(opt.strike, existing);
  });

  let minPain = Infinity;
  let maxPainStrike = strikes[0];

  // Calculate pain for each possible expiration price (strike)
  for (const expirationPrice of strikes) {
    let totalPain = 0;

    // Calculate pain from calls (in-the-money if expiration price > strike)
    optionsByStrike.forEach((oi, strike) => {
      if (expirationPrice > strike && oi.calls > 0) {
        // Call holders lose: (expirationPrice - strike) * openInterest * 100
        totalPain += (expirationPrice - strike) * oi.calls * 100;
      }
    });

    // Calculate pain from puts (in-the-money if expiration price < strike)
    optionsByStrike.forEach((oi, strike) => {
      if (expirationPrice < strike && oi.puts > 0) {
        // Put holders lose: (strike - expirationPrice) * openInterest * 100
        totalPain += (strike - expirationPrice) * oi.puts * 100;
      }
    });

    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = expirationPrice;
    }
  }

  // Validate: If we only have a few strikes or very low open interest, the result might be unreliable
  const totalOI = Array.from(optionsByStrike.values()).reduce((sum, oi) => sum + oi.calls + oi.puts, 0);
  const hasEnoughData = totalOI > 0 && strikes.length >= 3;

  return {
    maxPainStrike,
    maxPainValue: minPain,
    expirationDays,
    totalOpenInterest: totalOI,
    strikeCount: strikes.length,
    isReliable: hasEnoughData,
  };
}

/**
 * Find the next expiration date and calculate max pain for it
 */
export function calculateNextExpirationMaxPain(options: OptionData[]): MaxPainResult | null {
  if (options.length === 0) return null;

  // Find the nearest expiration date
  const minExpiration = Math.min(...options.map(opt => opt.expiration));
  
  // Calculate max pain for the nearest expiration
  return calculateMaxPain(options, minExpiration);
}

/**
 * Calculate max pain for the next 2 expiration dates (most relevant)
 * Shows all monthly/quarterly expirations within the next 2 months
 */
export function calculateMaxPainForAllExpirations(options: OptionData[]): MaxPainResult[] {
  if (options.length === 0) return [];

  // Get all unique expiration dates, sorted
  const expirations = Array.from(new Set(options.map(opt => opt.expiration)))
    .filter(exp => exp > 0)
    .sort((a, b) => a - b);

  // Get expirations within next 60 days (to catch all monthly expirations)
  const today = new Date();
  const twoMonthsFromNow = new Date();
  twoMonthsFromNow.setDate(twoMonthsFromNow.getDate() + 60);
  
  const relevantExpirations = expirations.filter(exp => {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + exp);
    return expirationDate <= twoMonthsFromNow;
  }).slice(0, 4); // Show up to 4 expirations (should cover next 2 months)

  const results: MaxPainResult[] = [];
  
  for (const expiration of relevantExpirations) {
    const maxPain = calculateMaxPain(options, expiration);
    if (maxPain) {
      results.push(maxPain);
    }
  }

  return results;
}

