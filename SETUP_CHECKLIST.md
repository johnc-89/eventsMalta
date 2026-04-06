# Setup Checklist - Copy & Paste Version

Use this condensed checklist to track your setup progress.

## ☐ Supabase Setup
- [ ] Go to https://supabase.com → Sign up
- [ ] Create project named "events-malta"
- [ ] Copy Project URL from Settings → API
- [ ] Copy anon key from Settings → API
- [ ] Go to SQL Editor and run the SQL below:

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

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON events
  FOR SELECT USING (true);

CREATE POLICY "Public insert" ON events
  FOR INSERT WITH CHECK (true);
```

## ☐ Local Environment
- [ ] Open `.env.local`
- [ ] Add Supabase URL: `NEXT_PUBLIC_SUPABASE_URL=YOUR_URL`
- [ ] Add Supabase key: `NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_KEY`
- [ ] Run: `npm install`
- [ ] Run: `npm run dev`
- [ ] Verify: http://localhost:3000 works

## ☐ GitHub Setup
- [ ] Go to https://github.com/signup (create account if needed)
- [ ] Go to https://github.com/new
- [ ] Create repo "events-malta"
- [ ] Copy your repo URL
- [ ] Run in terminal:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_REPO_URL
git branch -M main
git push -u origin main
```

## ☐ Vercel Deployment
- [ ] Go to https://vercel.com → Sign up
- [ ] Click "New Project"
- [ ] Connect GitHub, select events-malta repo
- [ ] Add environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Click Deploy
- [ ] Wait 2-3 minutes
- [ ] Visit your Vercel URL (it's live!)

## ☐ Test Everything
- [ ] Local works: `npm run dev` → http://localhost:3000
- [ ] GitHub has your code: Check GitHub repo
- [ ] Vercel is live: Visit your Vercel URL
- [ ] Auto-deploy works: Edit file → `git push` → changes appear on Vercel

## 🎉 You're Ready!

All accounts created:
- Supabase ✅
- GitHub ✅
- Vercel ✅

Start building features! 🚀

### Your Important URLs

- **Local dev:** http://localhost:3000
- **GitHub:** https://github.com/YOUR_USERNAME/events-malta
- **Live site:** https://events-malta-XXXXX.vercel.app (from Vercel dashboard)
- **Supabase dashboard:** https://supabase.com/dashboard/projects

### Your First Commands

```bash
npm run dev          # Local development
git add .
git commit -m "message"
git push             # Auto-deploys to Vercel
```

That's it! You're set up for development. 🎉
