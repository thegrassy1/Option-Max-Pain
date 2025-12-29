/**
 * Black-Scholes Delta Calculator
 * Calculates the delta (price sensitivity) of options
 */

export interface OptionData {
  strike: number;
  openInterest: number;
  volume?: number;
  impliedVolatility?: number;
  type: 'call' | 'put';
  expiration: number; // days to expiration
}

export interface DeltaData {
  strike: number;
  delta: number;
  gamma: number;
  totalDelta: number; // delta * (OI or Volume)
  totalGamma: number; // gamma * (OI or Volume)
  openInterest: number;
  volume: number;
  type: 'call' | 'put';
  hedgingShares: number; // shares needed to hedge
  gammaExposure: number; // GEX
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
 * Calculate standard normal probability density function
 */
function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
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
 * Calculate Black-Scholes gamma for an option
 */
export function calculateGamma(
  spotPrice: number,
  strike: number,
  timeToExpiry: number, // in years
  volatility: number, // annualized volatility (e.g., 0.30 for 30%)
  riskFreeRate: number = 0.05 // annual risk-free rate
): number {
  if (timeToExpiry <= 0 || spotPrice <= 0 || volatility <= 0) {
    return 0;
  }

  const d1 = (Math.log(spotPrice / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) /
    (volatility * Math.sqrt(timeToExpiry));

  return normPDF(d1) / (spotPrice * volatility * Math.sqrt(timeToExpiry));
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
  coveredCallMultiplier: number = 0.6,
  useVolume: boolean = false
): DeltaData[] {
  // Calculate put/call ratio to estimate covered calls
  const totalCallQty = options
    .filter(opt => opt.type === 'call')
    .reduce((sum, opt) => sum + (useVolume ? (opt.volume || 0) : opt.openInterest), 0);
  
  const totalPutQty = options
    .filter(opt => opt.type === 'put')
    .reduce((sum, opt) => sum + (useVolume ? (opt.volume || 0) : opt.openInterest), 0);
  
  const putCallRatio = totalPutQty > 0 ? totalCallQty / totalPutQty : 1;
  
  let callHedgeMultiplier = coveredCallMultiplier;
  if (putCallRatio > 1.5) {
    callHedgeMultiplier = Math.max(0.4, coveredCallMultiplier - (putCallRatio - 1.5) * 0.1);
  }
  
  return options.map(option => {
    const quantity = useVolume ? (option.volume || 0) : option.openInterest;
    const timeToExpiry = option.expiration / 365;
    
    // Use option's own IV if available, fallback to provided volatility
    const vol = option.impliedVolatility || volatility;

    const delta = calculateDelta(
      spotPrice,
      option.strike,
      timeToExpiry,
      vol,
      riskFreeRate,
      option.type
    );

    const gamma = calculateGamma(
      spotPrice,
      option.strike,
      timeToExpiry,
      vol,
      riskFreeRate
    );

    const hedgeMultiplier = option.type === 'call' ? callHedgeMultiplier : coveredCallMultiplier;
    
    const totalDelta = delta * quantity * 100 * hedgeMultiplier;
    const totalGamma = gamma * quantity * 100 * hedgeMultiplier;
    const hedgingShares = -totalDelta;
    const gammaExposure = option.type === 'call' ? -totalGamma : totalGamma;

    return {
      strike: option.strike,
      delta,
      gamma,
      totalDelta,
      totalGamma,
      openInterest: option.openInterest,
      volume: option.volume || 0,
      type: option.type,
      hedgingShares,
      gammaExposure,
    };
  });
}

/**
 * Aggregate delta and gamma by strike
 */
export function aggregateDeltaByStrike(deltaData: DeltaData[]): Map<number, { delta: number; gamma: number; buyPressure: number; sellPressure: number }> {
  const aggregated = new Map<number, { delta: number; gamma: number; buyPressure: number; sellPressure: number }>();
  
  deltaData.forEach(data => {
    const current = aggregated.get(data.strike) || { delta: 0, gamma: 0, buyPressure: 0, sellPressure: 0 };
    aggregated.set(data.strike, {
      delta: current.delta + data.hedgingShares,
      gamma: current.gamma + data.gammaExposure,
      buyPressure: current.buyPressure + (data.hedgingShares > 0 ? data.hedgingShares : 0),
      sellPressure: current.sellPressure + (data.hedgingShares < 0 ? Math.abs(data.hedgingShares) : 0)
    });
  });
  
  return aggregated;
}

/**
 * Calculate Gamma Flip level
 * The price point where net GEX shifts from positive to negative
 */
export function calculateGammaFlip(deltaData: DeltaData[]): number | null {
  if (deltaData.length === 0) return null;

  // Aggregate GEX by strike
  const aggregated = aggregateDeltaByStrike(deltaData);
  const strikes = Array.from(aggregated.entries())
    .map(([strike, data]) => ({ strike, gex: data.gamma }))
    .sort((a, b) => a.strike - b.strike);

  // Find where GEX crosses zero
  for (let i = 0; i < strikes.length - 1; i++) {
    const current = strikes[i];
    const next = strikes[i+1];
    
    if ((current.gex > 0 && next.gex < 0) || (current.gex < 0 && next.gex > 0)) {
      // Linear interpolation to find more precise flip price
      const ratio = Math.abs(current.gex) / (Math.abs(current.gex) + Math.abs(next.gex));
      return current.strike + ratio * (next.strike - current.strike);
    }
  }

  return null;
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
  expirationDays: number,
  spotPrice?: number
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
  
  // A result is reliable if:
  // 1. We have enough strikes (at least 5)
  // 2. We have some open interest
  // 3. The max pain strike isn't at the very edge of our data range
  // 4. If spot price is provided, the max pain strike isn't ridiculously far away (more than 40%)
  
  const minDataStrike = strikes[0];
  const maxDataStrike = strikes[strikes.length - 1];
  const isAtEdge = maxPainStrike === minDataStrike || maxPainStrike === maxDataStrike;
  
  let isReliable = totalOI > 0 && strikes.length >= 8 && !isAtEdge;
  
  if (isReliable && spotPrice && spotPrice > 0) {
    const distancePercent = Math.abs(maxPainStrike - spotPrice) / spotPrice;
    if (distancePercent > 0.4) {
      isReliable = false;
    }
  }

  return {
    maxPainStrike,
    maxPainValue: minPain,
    expirationDays,
    totalOpenInterest: totalOI,
    strikeCount: strikes.length,
    isReliable,
  };
}

/**
 * Find the next expiration date and calculate max pain for it
 */
export function calculateNextExpirationMaxPain(options: OptionData[], spotPrice?: number): MaxPainResult | null {
  if (options.length === 0) return null;

  // Find the nearest expiration date
  const minExpiration = Math.min(...options.map(opt => opt.expiration));
  
  // Calculate max pain for the nearest expiration
  return calculateMaxPain(options, minExpiration, spotPrice);
}

/**
 * Calculate max pain for the next 2 expiration dates (most relevant)
 * Shows all monthly/quarterly expirations within the next 2 months
 */
export function calculateMaxPainForAllExpirations(options: OptionData[], spotPrice?: number): MaxPainResult[] {
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
    const maxPain = calculateMaxPain(options, expiration, spotPrice);
    if (maxPain) {
      results.push(maxPain);
    }
  }

  return results;
}

