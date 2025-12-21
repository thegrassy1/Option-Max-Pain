# Option Max Pain

**optionmaxpain.com** - A free options max pain calculator and delta management visualization tool for stocks and crypto options.

Calculate max pain strike prices and visualize delta hedging pressure from market makers managing their delta-neutral positions.

## Features

- Enter any ticker symbol (e.g., TSLA, BTC) to view options data
- Visual representation of delta hedging requirements across all strikes
- Shows potential buyers/sellers from market maker delta management
- Real-time calculation based on open interest and delta values

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Real Data Setup

**👉 NEW TO API KEYS?** Start here: [README_API_KEYS.md](./README_API_KEYS.md) - Simple 3-step guide!

This application supports real options data from multiple providers with automatic scheduled updates (3x daily) and live data fetching.

### Quick Start with Real Data

1. **Get a FREE API Key**: 
   - Go to [Polygon.io](https://polygon.io/dashboard/signup) and sign up (free tier available)
   - Copy your API key from the dashboard

2. **Create `.env.local` file** in your project root:
   ```env
   POLYGON_API_KEY=your_key_here
   CRON_SECRET=any-random-string
   ```

3. **Restart your dev server** and test with a ticker like "TSLA"

**📖 Need more help?** See:
- [README_API_KEYS.md](./README_API_KEYS.md) - Simple visual guide
- [QUICK_START.md](./QUICK_START.md) - Detailed step-by-step
- [SETUP.md](./SETUP.md) - Advanced setup (scheduled updates, etc.)

### Features

- ✅ **Multiple Data Providers**: Supports Polygon.io, MarketData.app, and more
- ✅ **Automatic Caching**: Reduces API calls and improves performance
- ✅ **Scheduled Updates**: Data refreshed 3 times per day automatically
- ✅ **Live Data**: Users can request real-time data on demand
- ✅ **Fallback System**: Gracefully handles API failures

## How It Works

The application calculates delta for each strike based on:
- Current stock price
- Strike price
- Time to expiration
- Implied volatility
- Risk-free rate

It then multiplies delta by open interest to determine the total delta exposure at each strike. Market makers need to hedge this exposure, creating potential buying (positive delta) or selling (negative delta) pressure.

