# 🔑 How to Add API Keys - Simple Guide

## What You Need to Know

**API Keys = Passwords to access options data from data providers**

These are NOT from exchanges. They're from companies like Polygon.io that collect and sell access to options data.

## Quick 3-Step Process

### 1️⃣ Get a Free API Key

**Go to Polygon.io (recommended):**
- Website: https://polygon.io/dashboard/signup
- Click "Sign Up" (free account, no credit card)
- After signing up, find your API key in the dashboard
- Copy it (looks like: `abc123xyz456`)

### 2️⃣ Create `.env.local` File

**In Cursor:**
1. Look at your file list on the left side
2. Right-click in the `options` folder
3. Select "New File"
4. Name it exactly: `.env.local` (with the dot at the start!)

### 3️⃣ Paste Your Key

**In the `.env.local` file, type:**

```
POLYGON_API_KEY=your_actual_key_here
CRON_SECRET=any-random-string
```

**Replace `your_actual_key_here`** with the key you copied from Polygon.io

**Save the file** (Ctrl+S)

**Restart your server** if it's running:
- Press Ctrl+C in terminal to stop
- Run `npm run dev` again

## That's It! 🎉

Now when you enter a ticker like "TSLA", you'll get **real options data** instead of mock data.

## File Location

Your `.env.local` file should be here:

```
options/                    ← Your project folder
├── app/
├── components/
├── lib/
├── .env.local             ← CREATE THIS FILE HERE
├── package.json
└── README.md
```

## Still Confused?

1. **Don't have an API key yet?** → Go to https://polygon.io/dashboard/signup and sign up (it's free)
2. **Can't find the API key?** → After signing up, check the dashboard page for "API Keys" section
3. **File not working?** → Make sure it's named `.env.local` (with the dot!) and in the root folder
4. **Still seeing fake data?** → Restart your dev server after creating the file

## Want More Help?

See `QUICK_START.md` for detailed step-by-step instructions with screenshots locations.



