/**
 * API Route for scheduled data refresh
 * Called 3 times per day via cron job or scheduled task
 */

import { NextResponse } from 'next/server';
import { getProviderManager } from '@/lib/data-providers';
import { getCachedOptionsChain, clearAllCache } from '@/lib/data-cache';

// Popular tickers to keep updated
const POPULAR_TICKERS = ['TSLA', 'AAPL', 'NVDA', 'SPY', 'QQQ', 'MSFT', 'GOOGL', 'AMZN'];

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET || 'your-secret-token';

    // Simple auth check (use proper auth in production)
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const providerManager = getProviderManager();
    const results: Record<string, { success: boolean; error?: string }> = {};

    // Refresh data for popular tickers
    for (const ticker of POPULAR_TICKERS) {
      try {
        await getCachedOptionsChain(ticker, true);
        results[ticker] = { success: true };
      } catch (error) {
        results[ticker] = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    return NextResponse.json({
      success: true,
      refreshed: Object.keys(results).length,
      results,
    });
  } catch (error) {
    console.error('Error in scheduled refresh:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Refresh failed',
      },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing
export async function GET() {
  return NextResponse.json({
    message: 'Use POST with authorization header to refresh data',
    schedule: '3 times per day: 9:30 AM, 12:00 PM, 4:00 PM',
  });
}



