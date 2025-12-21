# How to Share Option Max Pain

## Option 1: Deploy Live (Best for Showing Off)

### Deploy to Vercel (Recommended - Free & Easy)

1. **Push to GitHub first** (see Option 2 below)
2. Go to [vercel.com](https://vercel.com) and sign up with GitHub
3. Click "New Project"
4. Import your GitHub repository
5. Vercel will auto-detect Next.js and deploy
6. Your site will be live at: `your-project-name.vercel.app`
7. You can add a custom domain later (optionmaxpain.com)

**Benefits:**
- ✅ Free hosting
- ✅ Automatic deployments when you push code
- ✅ Live URL to share with friends
- ✅ Easy to update

### Alternative: Deploy to Netlify

1. Push to GitHub (see Option 2)
2. Go to [netlify.com](https://netlify.com) and sign up
3. Click "Add new site" → "Import an existing project"
4. Connect your GitHub repo
5. Deploy!

---

## Option 2: Share Code on GitHub (Best for Collaboration)

### Step 1: Create GitHub Repository

1. Go to [github.com](https://github.com) and sign up/login
2. Click the "+" icon → "New repository"
3. Name it: `option-max-pain` (or any name you like)
4. Make it **Public** (so your friend can see it)
5. **Don't** initialize with README (you already have one)
6. Click "Create repository"

### Step 2: Push Your Code

Open terminal in your project folder and run:

```bash
# Initialize git (if not already done)
git init
# Add all files
git add .

# Create first commit
git commit -m "Initial commit - Option Max Pain"

# Add your GitHub repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/option-max-pain.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 3: Share the Link

Send your friend the GitHub URL:
```
https://github.com/YOUR_USERNAME/option-max-pain
```

### Step 4: Let Your Friend Clone It

Your friend can then:

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/option-max-pain.git

# Go into the folder
cd option-max-pain

# Install dependencies
npm install

# Run locally
npm run dev
```

---

## Option 3: Share Files Directly (Quick but Limited)

### Create a Zip File

1. **Exclude node_modules** (it's huge - ~200MB+)
2. Zip the project folder
3. Share via:
   - Google Drive
   - Dropbox
   - Email (if small enough)
   - WeTransfer

**Important:** Your friend will need to:
```bash
npm install  # Install dependencies
npm run dev  # Run the project
```

---

## Option 4: Collaborate on GitHub

### Add Your Friend as Collaborator

1. Go to your GitHub repository
2. Click "Settings" → "Collaborators"
3. Click "Add people"
4. Enter your friend's GitHub username or email
5. They'll get an invitation to collaborate

### Working Together

- **Pull latest changes**: `git pull`
- **Make changes**: Edit files
- **Commit changes**: `git commit -m "Description of changes"`
- **Push changes**: `git push`
- **Create branches** for features: `git checkout -b feature-name`

---

## What Your Friend Needs

### Prerequisites:
- Node.js installed ([nodejs.org](https://nodejs.org))
- Code editor (VS Code recommended)
- Git (for GitHub collaboration)

### Setup Steps:
1. Clone/download the project
2. Run `npm install` to install dependencies
3. Create `.env.local` file (see README_API_KEYS.md for API keys)
4. Run `npm run dev` to start
5. Open http://localhost:3000

---

## Recommended Approach

**Best for showing off:**
1. Push to GitHub (Option 2)
2. Deploy to Vercel (Option 1)
3. Share both links:
   - Live site: `your-project.vercel.app`
   - Code: `github.com/your-username/option-max-pain`

**Best for collaboration:**
1. Push to GitHub
2. Add friend as collaborator
3. Both work on the same repository
4. Deploy to Vercel for live preview

---

## Security Note

**Don't commit API keys!** The `.env.local` file is already in `.gitignore`, so it won't be shared. Your friend will need to:
- Get their own API keys (see README_API_KEYS.md)
- Create their own `.env.local` file

---

## Quick Start Commands

```bash
# First time setup
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/option-max-pain.git
git push -u origin main

# Daily workflow
git pull          # Get latest changes
# Make your changes
git add .
git commit -m "Description"
git push          # Share your changes
```


