# Claude Code Setup Instructions - Events Malta

Paste this into Claude Code to set up your project for development.

---

## Complete Setup Workflow for Events Malta

You have a Next.js + Supabase project structure ready. This guide will walk you through:
1. Creating necessary accounts (Supabase, GitHub, Vercel)
2. Setting up local development environment
3. Getting API credentials
4. Pushing code to GitHub
5. Deploying to Vercel

### Prerequisites
- Node.js 18+ installed
- Git installed
- A web browser

---

## Step 1: Create Supabase Account & Project

**Task:** Set up your Supabase backend

1. Go to https://supabase.com and sign up (free tier is perfect)
2. Create a new project:
   - Click "New Project"
   - Enter project name: `events-malta`
   - Set a strong password
   - Select region closest to Malta or your location
   - Click "Create new project" (takes ~2 minutes)

3. Once created, go to **Settings → API**
4. Copy these two values:
   - `Project URL` (keep this safe)
   - `anon public key` (keep this safe)

5. In Supabase, go to **SQL Editor** and create your first table:

```sql
CREATE TABLE events (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  date TIMESTAMP NOT NULL,
  location VARCHAR(255),
  image_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Public read" ON events
  FOR SELECT
  USING (true);

-- Allow public insert (you can restrict this later with authentication)
CREATE POLICY "Public insert" ON events
  FOR INSERT
  WITH CHECK (true);
```

✅ Supabase is ready!

---

## Step 2: Configure Local Environment

**Task:** Add Supabase credentials to your local project

1. In your project root, open `.env.local` (you have `.env.local.example` as reference)
2. Add your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL_HERE
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
```

Replace with the values you copied from Supabase Settings → API

3. Save the file

✅ Local environment configured!

---

## Step 3: Install Dependencies & Test

**Task:** Make sure everything works locally

Run these commands in your project terminal:

```bash
# Install all dependencies
npm install

# Start development server
npm run dev
```

You should see:
```
> ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

Open http://localhost:3000 in your browser - you should see the welcome page.

**If you get errors:**
- Check that `.env.local` has correct Supabase credentials
- Try `npm install` again if node_modules issues
- Restart the dev server with `npm run dev`

✅ Local development is working!

---

## Step 4: Create GitHub Account & Repository

**Task:** Push your code to GitHub

1. **Create GitHub account** at https://github.com/signup (if you don't have one)
2. **Create new repository:**
   - Go to https://github.com/new
   - Repository name: `events-malta`
   - Description: "Events management website for Malta"
   - Choose **Public** (or Private if you prefer)
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
   - Click "Create repository"

3. **Copy the repository URL** (you'll need it next)

✅ GitHub repository created!

---

## Step 5: Initialize Git & Push Code

**Task:** Get your code on GitHub

Run these commands in your project terminal:

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Next.js + Supabase setup"

# Add remote origin (replace with YOUR repository URL)
git remote add origin https://github.com/YOUR_USERNAME/events-malta.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

After this completes, go to your GitHub repository URL and verify your code is there.

✅ Code is on GitHub!

---

## Step 6: Set Up Vercel Deployment

**Task:** Deploy your site live

1. Go to https://vercel.com/signup and sign up (free tier)
2. Click "New Project"
3. Select **Import Git Repository**
4. Click "Connect GitHub" (follow the prompts to authorize)
5. Select your `events-malta` repository
6. In the "Environment Variables" section, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = (your Supabase URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (your anon key)
7. Click **Deploy**

**Wait for deployment to complete** (usually 1-3 minutes)

You'll get a live URL like: `https://events-malta-abc123.vercel.app`

Test it in your browser to make sure it works!

✅ Site is live on Vercel!

---

## Step 7: Verify Everything Works

**Test the complete workflow:**

1. **Test local development:**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

2. **Test fetching from Supabase:**
   - In your Supabase dashboard, add a test event
   - Your local app should show it (once you implement the component)

3. **Test live deployment:**
   - Open your Vercel URL
   - It should match your local version

4. **Test Git workflow:**
   ```bash
   # Make a small change to app/page.tsx
   # Save the file
   git add .
   git commit -m "Test deployment"
   git push
   # Wait a minute, then refresh your Vercel URL
   # Your change should be live automatically!
   ```

✅ Everything is working!

---

## You're Ready to Build! 🚀

Your setup is complete:

- ✅ **Supabase** backend configured
- ✅ **GitHub** repository created
- ✅ **Vercel** deployment live
- ✅ **Local development** working
- ✅ **CI/CD** pipeline ready (auto-deploys on push)

### Next Steps - Start Building Features

Pick one to build first:

1. **Event List Page** - Display all events from Supabase
2. **Event Detail Page** - Show single event details
3. **Event Creation Form** - Allow adding new events
4. **Search/Filter** - Filter events by date/location
5. **User Authentication** - Sign up/login with Supabase Auth

### Development Workflow

Going forward, your workflow is simple:

```bash
# Make changes locally
npm run dev

# Test in browser at http://localhost:3000

# When happy with changes:
git add .
git commit -m "Your feature description"
git push

# Automatic! Vercel deploys your changes
# Your live site updates in 1-2 minutes
```

---

## Quick Reference

**Common Commands:**
```bash
npm run dev      # Start local development
npm run build    # Build for production
npm run lint     # Check code quality
npm start        # Run production server locally
```

**Useful Links:**
- Local development: http://localhost:3000
- Vercel dashboard: https://vercel.com
- Supabase dashboard: https://supabase.com
- GitHub repository: https://github.com/YOUR_USERNAME/events-malta

**Important Files:**
- `.env.local` - Your secrets (never commit this!)
- `app/page.tsx` - Home page
- `app/api/events/route.ts` - API endpoint for events
- `components/EventCard.tsx` - Example event component
- `lib/supabase.ts` - Supabase client configuration

---

## Troubleshooting

**"Cannot find module '@supabase/supabase-js'"**
```bash
npm install
```

**"NEXT_PUBLIC_SUPABASE_URL is undefined"**
- Check `.env.local` exists and has correct values
- Restart `npm run dev` after editing `.env.local`

**"Vercel deployment failed"**
- Check Vercel logs in dashboard
- Verify environment variables are set in Vercel
- Make sure code builds locally: `npm run build`

**"Supabase connection error"**
- Verify URL and key are correct (copy fresh from Supabase Settings)
- Check that your Supabase project is active
- Ensure table exists in database

---

## You're all set! Start building your Events Malta website. 🎉

Questions? Reference the guides:
- `SETUP.md` - Detailed setup guide
- `DEPLOYMENT.md` - GitHub & deployment details
- `QUICKSTART.md` - Quick reference

Happy coding! 💻
