/**
 * Data Cache with Scheduled Updates
 * Caches options data and updates 3 times per day
 */

import { OptionsChain } from './options-api';
import { getProviderManager } from './data-providers';

interface CachedData {
  data: OptionsChain;
  timestamp: number;
  ticker: string;
}

// In-memory cache (in production, use Redis or database)
const cache = new Map<string, CachedData>();

// Track if we're using mock data to avoid repeated API calls
const usingMockData = new Map<string, boolean>();

// Update schedule: 3 times per day
// 9:30 AM (market open), 12:00 PM (midday), 4:00 PM (market close)
const UPDATE_TIMES = [9.5, 12, 16]; // Hours in 24-hour format

/**
 * Check if data needs to be refreshed
 */
function shouldRefresh(ticker: string): boolean {
  const cached = cache.get(ticker);
  if (!cached) return true;

  const now = new Date();
  const cacheTime = new Date(cached.timestamp);
  const hoursSinceUpdate = (now.getTime() - cacheTime.getTime()) / (1000 * 60 * 60);

  // Check if we're past the next scheduled update time
  const currentHour = now.getHours() + now.getMinutes() / 60;
  
  // Find next update time
  const nextUpdate = UPDATE_TIMES.find(time => time > currentHour) || UPDATE_TIMES[0];
  const hoursUntilNext = nextUpdate > currentHour 
    ? nextUpdate - currentHour 
    : (24 - currentHour) + nextUpdate;

  // Refresh if it's been more than 8 hours (safety check)
  // or if we're within 30 minutes of next scheduled update
  return hoursSinceUpdate > 8 || hoursUntilNext < 0.5;
}

/**
 * Get cached data or fetch fresh
 */
export async function getCachedOptionsChain(
  ticker: string,
  forceRefresh: boolean = false
): Promise<OptionsChain> {
  const normalizedTicker = ticker.toUpperCase().trim();

  // If we know this ticker uses mock data and we're not forcing refresh, return cached
  if (!forceRefresh && usingMockData.get(normalizedTicker)) {
    const cached = cache.get(normalizedTicker);
    if (cached) {
      return cached.data;
    }
  }

  // Check cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = cache.get(normalizedTicker);
    if (cached && !shouldRefresh(normalizedTicker)) {
      return cached.data;
    }
  }

  // Fetch fresh data
  const providerManager = getProviderManager();
  let data: OptionsChain;
  
  try {
    data = await providerManager.fetchOptionsChain(normalizedTicker, forceRefresh);
    // If we got here, we might have real data (or mock data from fallback)
    // We'll mark as mock data if it looks like mock data (has predictable patterns)
    // For now, we'll assume if provider manager returns data, it's either real or mock fallback
  } catch (error) {
    // If provider manager throws, use mock data directly
    const { fetchOptionsChain } = await import('./options-api');
    data = await fetchOptionsChain(normalizedTicker);
    usingMockData.set(normalizedTicker, true);
  }

  // If forcing refresh, clear the cache entry first to ensure fresh data
  if (forceRefresh) {
    cache.delete(normalizedTicker);
    usingMockData.delete(normalizedTicker); // Reset mock data flag on refresh
  }

  // Update cache with fresh data
  cache.set(normalizedTicker, {
    data,
    timestamp: Date.now(),
    ticker: normalizedTicker,
  });

  return data;
}

/**
 * Get cache metadata
 */
export function getCacheInfo(ticker: string): { timestamp: number; age: string } | null {
  const cached = cache.get(ticker.toUpperCase().trim());
  if (!cached) return null;

  const ageMs = Date.now() - cached.timestamp;
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  const ageMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));

  let age: string;
  if (ageHours > 0) {
    age = `${ageHours}h ${ageMinutes}m ago`;
  } else {
    age = `${ageMinutes}m ago`;
  }

  return {
    timestamp: cached.timestamp,
    age,
  };
}

/**
 * Clear cache for a ticker
 */
export function clearCache(ticker: string): void {
  cache.delete(ticker.toUpperCase().trim());
}

/**
 * Clear all cache
 */
export function clearAllCache(): void {
  cache.clear();
}


