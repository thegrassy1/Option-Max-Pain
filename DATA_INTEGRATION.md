# Real Options Data Integration - Complete Guide

## Overview

Your options delta monitor now supports real-time data from multiple exchanges with automatic scheduled updates (3x daily) and on-demand live data fetching.

## Architecture

### Components

1. **Data Providers** (`lib/data-providers.ts`)
   - Supports multiple providers (Polygon.io, MarketData.app)
   - Automatic fallback if one provider fails
   - Load balancing across providers

2. **Data Cache** (`lib/data-cache.ts`)
   - In-memory caching (upgrade to Redis for production)
   - Automatic refresh detection
   - Scheduled update times: 9:30 AM, 12:00 PM, 4:00 PM

3. **API Routes**
   - `/api/options/[ticker]` - Fetch options data (cached or live)
   - `/api/refresh` - Scheduled refresh endpoint

4. **Scheduled Refresh Script** (`scripts/scheduled-refresh.js`)
   - Can be run via cron, Task Scheduler, or cloud functions
   - Refreshes popular tickers automatically

## Data Flow

```
User Request → API Route → Cache Check → Provider Manager → Data Provider → API
                ↓ (if cached)              ↓ (if not cached)
            Return Cached              Fetch & Cache → Return
```

## Setup Steps

### 1. Get API Keys

**Polygon.io** (Recommended):
- Sign up: https://polygon.io/dashboard/signup
- Free tier: 5 API calls/minute
- Get your API key from the dashboard

**MarketData.app**:
- Sign up: https://www.marketdata.app/
- Free tier available
- Get your API key from account settings

### 2. Configure Environment

Create `.env.local`:
```env
POLYGON_API_KEY=your_polygon_key_here
MARKETDATA_API_KEY=your_marketdata_key_here
CRON_SECRET=generate-random-secret-here
```

### 3. Test Integration

```bash
npm run dev
# Visit http://localhost:3000
# Enter "TSLA" and click "Analyze"
```

### 4. Set Up Scheduled Updates

Choose one method:

**A. Cron (Linux/Mac)**
```bash
crontab -e
# Add:
30 9 * * 1-5 cd /path/to/options && node scripts/scheduled-refresh.js
0 12 * * 1-5 cd /path/to/options && node scripts/scheduled-refresh.js
0 16 * * 1-5 cd /path/to/options && node scripts/scheduled-refresh.js
```

**B. Windows Task Scheduler**
- Create 3 tasks for the times above
- Run: `node scripts/scheduled-refresh.js`

**C. Vercel Cron** (if deployed)
- Add `vercel.json` with cron configuration
- See SETUP.md for details

## Usage

### For Users

1. **Cached Data**: Enter ticker → Get cached data (fast, may be a few hours old)
2. **Live Data**: Click "🔄 Refresh Live Data" → Get real-time data (slower, current)

### For Developers

**Fetch Options Data:**
```typescript
// Cached data
const response = await fetch('/api/options/TSLA');
const { data, cache } = await response.json();

// Live data
const response = await fetch('/api/options/TSLA?live=true');
const { data, cache, live } = await response.json();
```

**Manual Refresh:**
```bash
curl -X POST http://localhost:3000/api/refresh \
  -H "Authorization: Bearer your-cron-secret"
```

## Data Providers Comparison

| Provider | Free Tier | Rate Limits | Coverage | Best For |
|----------|-----------|-------------|----------|----------|
| Polygon.io | ✅ Yes | 5 calls/min | US Markets | Production use |
| MarketData.app | ✅ Yes | Varies | US Markets | Backup/secondary |
| ORATS | ❌ Paid | High | Comprehensive | Professional |

## Caching Strategy

- **Cache Duration**: Until next scheduled update (or 8 hours max)
- **Refresh Triggers**:
  - Scheduled times (9:30 AM, 12:00 PM, 4:00 PM)
  - User requests live data
  - Cache older than 8 hours
- **Popular Tickers**: Pre-cached (TSLA, AAPL, NVDA, SPY, QQQ, MSFT, GOOGL, AMZN)

## Production Recommendations

1. **Use Redis** for caching instead of in-memory
2. **Add monitoring** (e.g., Sentry, DataDog)
3. **Set up alerts** for API failures
4. **Use environment-specific keys** (dev/staging/prod)
5. **Implement rate limiting** on API routes
6. **Add request logging** for analytics
7. **Use a database** to store historical data

## Troubleshooting

**No data showing?**
- Check API keys in `.env.local`
- Verify API key permissions
- Check browser console for errors
- Try "Refresh Live Data" button

**Scheduled refresh not working?**
- Verify cron job is running
- Check CRON_SECRET matches
- Test script manually
- Check API provider rate limits

**API errors?**
- Check provider status pages
- Verify API key is valid
- Check rate limits
- Review error logs

## API Rate Limits

**Polygon.io Free Tier:**
- 5 API calls per minute
- 1,000 calls per day
- Upgrade for higher limits

**MarketData.app:**
- Varies by plan
- Check your dashboard for limits

**Best Practices:**
- Use caching to minimize API calls
- Schedule updates during off-peak hours
- Use multiple providers for redundancy
- Monitor usage in provider dashboards

## Next Steps

1. ✅ Get API keys from providers
2. ✅ Configure `.env.local`
3. ✅ Test with a ticker
4. ✅ Set up scheduled refresh
5. ⬜ Monitor API usage
6. ⬜ Set up production deployment
7. ⬜ Add Redis for caching (optional)
8. ⬜ Set up monitoring/alerts (optional)

## Support

- See [SETUP.md](./SETUP.md) for detailed setup instructions
- Check provider documentation:
  - [Polygon.io Docs](https://polygon.io/docs/options/getting-started)
  - [MarketData.app Docs](https://www.marketdata.app/docs/api/options/chain)



