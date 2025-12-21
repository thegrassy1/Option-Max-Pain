# ⚠️ Important: Polygon.io Free Tier Limitation

## The Problem

**Polygon.io's free tier does NOT include options data access.**

Your API key works fine for stock data, but when trying to fetch options data, you get a `403 Forbidden` error because options data requires a paid subscription.

## Solutions

### Option 1: Use MarketData.app (Free Options Data Available)

1. Sign up at: https://www.marketdata.app/
2. Get your API key from the dashboard
3. Add to `.env.local`:
   ```env
   MARKETDATA_API_KEY=your_marketdata_key_here
   ```
4. Restart your dev server

### Option 2: Upgrade Polygon.io Plan

If you want to stick with Polygon.io:
1. Go to: https://polygon.io/pricing
2. Upgrade to a plan that includes options data
3. Your existing API key will work once upgraded

### Option 3: Use Mock Data (For Testing)

The app will automatically use mock data if real API calls fail. This is fine for:
- Testing the interface
- Learning how delta calculations work
- Development and demos

## How to Check Which Provider is Being Used

The app will automatically try:
1. Polygon.io (if API key is set)
2. MarketData.app (if API key is set)
3. Mock data (if both fail or aren't configured)

## Current Status

- ✅ Your Polygon.io API key is valid
- ✅ Stock data works (you can get prices)
- ❌ Options data requires paid plan
- ✅ App falls back to mock data automatically

## Recommendation

For free options data, use **MarketData.app** - they offer options data on their free tier.


