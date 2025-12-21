# Quick Start Guide - Getting Real Options Data

## What Are API Keys?

API keys are like passwords that let your application access data from **third-party data providers**. These companies (like Polygon.io) collect options data from exchanges and sell access to it through APIs.

**You're NOT getting keys from exchanges directly** - you're getting them from data providers that aggregate the information.

## Step-by-Step: Get Your First API Key

### Step 1: Sign Up for Polygon.io (Free Tier Available)

1. Go to: **https://polygon.io/dashboard/signup**
2. Create a free account (no credit card needed for free tier)
3. After signing up, you'll be taken to your dashboard
4. Look for "API Keys" or "Your API Key" section
5. Copy your API key (it will look something like: `abc123xyz789`)

**Note**: Free tier gives you 5 API calls per minute - perfect for testing!

### Step 2: Create the `.env.local` File

1. In your Cursor editor, look at the file list on the left
2. You should see your project folder: `options`
3. **Right-click** in the file list (or use File → New File)
4. Create a new file called: `.env.local`
5. **Important**: The file MUST be named exactly `.env.local` (with the dot at the start)

### Step 3: Add Your API Key

Open the `.env.local` file you just created and paste this:

```env
POLYGON_API_KEY=paste_your_key_here
CRON_SECRET=any-random-string-123
```

**Replace `paste_your_key_here`** with the actual API key you copied from Polygon.io

**For CRON_SECRET**: Just type any random string (like `my-secret-123` or `refresh-token-abc`)

### Step 4: Save and Test

1. Save the file (Ctrl+S or Cmd+S)
2. Restart your development server if it's running:
   - Stop it (Ctrl+C in terminal)
   - Run `npm run dev` again
3. Go to http://localhost:3000
4. Enter "TSLA" and click "Analyze"
5. You should now see real options data!

## Visual Guide

```
Your Project Folder (options/)
├── app/
├── components/
├── lib/
├── .env.local          ← CREATE THIS FILE HERE (same level as app/)
├── package.json
└── README.md
```

## Where to Find Your API Key on Polygon.io

1. After logging in, go to: https://polygon.io/dashboard
2. Look for a section called "API Keys" or "Your API Key"
3. You might see a button like "Show API Key" or "Copy Key"
4. Click it and copy the key

## Troubleshooting

**"I can't find the API key on Polygon.io"**
- Make sure you're logged in
- Check the dashboard page
- Look for "API Keys", "Settings", or "Account" sections
- Some providers show the key only once after signup - check your email

**"The .env.local file isn't working"**
- Make sure it's named exactly `.env.local` (with the dot)
- Make sure it's in the root folder (same level as `package.json`)
- Restart your dev server after creating/modifying it
- Make sure there are no extra spaces around the `=` sign

**"Still seeing mock data"**
- Check that your API key is correct (no extra spaces)
- Check the terminal/console for error messages
- Try clicking "🔄 Refresh Live Data" button
- Verify your Polygon.io account is active

## Alternative: Use MarketData.app

If you prefer a different provider:

1. Go to: **https://www.marketdata.app/**
2. Sign up for free account
3. Get your API key from dashboard
4. Add to `.env.local`:
   ```env
   MARKETDATA_API_KEY=your_marketdata_key_here
   ```

## Do I Need Both?

**No!** You only need ONE provider to get started. Start with Polygon.io (it's the easiest). You can add more later if you want redundancy.

## What Happens Without API Keys?

If you don't add API keys, the app will:
- Still work!
- Use **mock/simulated data** instead of real data
- This is fine for testing the interface, but not for real trading decisions

## Next Steps

Once you have real data working:
- ✅ You'll see actual options chains
- ✅ Real open interest numbers
- ✅ Current market prices
- ✅ Accurate delta calculations

Then you can set up the scheduled updates (3x daily) - but that's optional for now!



