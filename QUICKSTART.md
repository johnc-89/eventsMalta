# Quick Start Guide - Events Malta

Get your project live in 15 minutes.

## 1. Local Setup (5 minutes)

```bash
# Install dependencies
npm install

# Create .env.local file
cp .env.local.example .env.local

# Add your Supabase credentials to .env.local
# Get them from: https://supabase.com → Your Project → Settings → API
```

Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key_here
```

```bash
# Test locally
npm run dev
# Open http://localhost:3000
```

## 2. GitHub Setup (3 minutes)

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/events-malta.git
git branch -M main
git push -u origin main
```

## 3. Deploy on Vercel (7 minutes)

1. Go to https://vercel.com
2. Click "New Project"
3. Select your GitHub repo
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Click Deploy

**Done!** Your site is live. Every `git push` auto-deploys.

## Create Your First Event Table

In Supabase dashboard → SQL Editor, run:

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

-- Enable RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "Public read" ON events
  FOR SELECT
  USING (true);
```

## Useful Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run lint     # Check code quality
npm start        # Start production server
```

## Next: What to Build

Pick one:
- Event listing page (display all events)
- Event detail page (single event view)
- Event creation form (add new events)
- Search/filter functionality
- User authentication (sign up/login)

See `SETUP.md` and `DEPLOYMENT.md` for detailed guides.

## File Structure Reminder

```
app/              - Pages & layout
├── page.tsx      - Home page
├── layout.tsx    - Root layout
└── api/          - API routes

components/       - Reusable components
lib/              - Utilities (Supabase client)
types/            - TypeScript types
public/           - Static files
```

That's it! You're ready to build. 🚀
