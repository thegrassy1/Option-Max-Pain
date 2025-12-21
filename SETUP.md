# Real Options Data Setup Guide

This guide will help you set up real options data from various exchanges and configure scheduled updates.

## Step 1: Choose a Data Provider

The application supports multiple options data providers. Here are the recommended options:

### Option 1: Polygon.io (Recommended)
- **Website**: https://polygon.io/
- **Pricing**: Free tier available, paid plans for more data
- **Coverage**: Comprehensive options data for US markets
- **Sign up**: https://polygon.io/dashboard/signup

### Option 2: MarketData.app
- **Website**: https://www.marketdata.app/
- **Pricing**: Free tier available
- **Coverage**: Real-time and historical options data
- **Sign up**: https://www.marketdata.app/

### Option 3: Multiple Providers (Recommended for Production)
Use multiple providers for redundancy and better coverage.

## Step 2: Get API Keys

1. Sign up for an account with your chosen provider(s)
2. Navigate to your API keys/dashboard section
3. Copy your API key

## Step 3: Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` and add your API keys:
   ```env
   POLYGON_API_KEY=your_actual_polygon_key_here
   MARKETDATA_API_KEY=your_actual_marketdata_key_here
   CRON_SECRET=generate-a-random-secret-string-here
   ```

3. Generate a secure CRON_SECRET:
   ```bash
   # On Linux/Mac
   openssl rand -hex 32
   
   # Or use any random string generator
   ```

## Step 4: Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:3000
3. Enter a ticker like "TSLA" and click "Analyze"
4. If you see real data, the integration is working!

## Step 5: Set Up Scheduled Updates (3x Daily)

The application is configured to refresh data 3 times per day:
- **9:30 AM** (Market Open)
- **12:00 PM** (Midday)
- **4:00 PM** (Market Close)

### Option A: Using Cron (Linux/Mac)

1. Make the script executable:
   ```bash
   chmod +x scripts/scheduled-refresh.js
   ```

2. Edit your crontab:
   ```bash
   crontab -e
   ```

3. Add these lines (adjust paths as needed):
   ```cron
   # Refresh options data 3x daily
   30 9 * * 1-5 cd /path/to/options && /usr/bin/node scripts/scheduled-refresh.js
   0 12 * * 1-5 cd /path/to/options && /usr/bin/node scripts/scheduled-refresh.js
   0 16 * * 1-5 cd /path/to/options && /usr/bin/node scripts/scheduled-refresh.js
   ```

4. Set environment variables in crontab or use a wrapper script:
   ```bash
   # Create wrapper script: refresh-wrapper.sh
   #!/bin/bash
   export POLYGON_API_KEY="your_key"
   export CRON_SECRET="your_secret"
   export API_URL="http://localhost:3000"
   cd /path/to/options
   /usr/bin/node scripts/scheduled-refresh.js
   ```

### Option B: Using Windows Task Scheduler

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger times:
   - 9:30 AM daily (weekdays)
   - 12:00 PM daily (weekdays)
   - 4:00 PM daily (weekdays)
4. Action: Start a program
   - Program: `node`
   - Arguments: `C:\path\to\options\scripts\scheduled-refresh.js`
   - Start in: `C:\path\to\options`
5. Add environment variables in the task's environment settings

### Option C: Using Vercel Cron Jobs (If Deployed on Vercel)

1. Create `vercel.json`:
   ```json
   {
     "crons": [
       {
         "path": "/api/refresh",
         "schedule": "30 9 * * 1-5"
       },
       {
         "path": "/api/refresh",
         "schedule": "0 12 * * 1-5"
       },
       {
         "path": "/api/refresh",
         "schedule": "0 16 * * 1-5"
       }
     ]
   }
   ```

2. Add environment variables in Vercel dashboard
3. Deploy to Vercel

### Option D: Using GitHub Actions (Free Option)

Create `.github/workflows/refresh-data.yml`:
```yaml
name: Refresh Options Data

on:
  schedule:
    - cron: '30 9 * * 1-5'  # 9:30 AM weekdays
    - cron: '0 12 * * 1-5'   # 12:00 PM weekdays
    - cron: '0 16 * * 1-5'   # 4:00 PM weekdays

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - name: Refresh Data
        run: |
          curl -X POST https://your-domain.com/api/refresh \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

## Step 6: Verify Scheduled Updates

1. Manually test the refresh endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/refresh \
     -H "Authorization: Bearer your-cron-secret"
   ```

2. Check the response - it should show successful refreshes

3. Check your application logs to confirm data is being refreshed

## How It Works

1. **Cached Data**: The app caches options data to reduce API calls
2. **Automatic Refresh**: Data is automatically refreshed 3x daily
3. **Live Data**: Users can click "Refresh Live Data" to get real-time data on demand
4. **Fallback**: If all providers fail, the app falls back to mock data

## Troubleshooting

### No data showing?
- Check that your API keys are correct in `.env.local`
- Verify the API key has the right permissions
- Check browser console for errors
- Try the "Refresh Live Data" button

### Scheduled refresh not working?
- Verify cron job is running: `crontab -l`
- Check cron logs: `/var/log/cron` or `journalctl -u cron`
- Test the script manually: `node scripts/scheduled-refresh.js`
- Verify CRON_SECRET matches in both places

### API rate limits?
- Consider using multiple providers (load balancing)
- Reduce refresh frequency if needed
- Check your API provider's rate limits

## Production Considerations

1. **Use a database** instead of in-memory cache (Redis recommended)
2. **Add monitoring** for API failures
3. **Set up alerts** for failed refreshes
4. **Use environment-specific API keys**
5. **Implement proper authentication** for the refresh endpoint
6. **Add logging** for data refresh operations



