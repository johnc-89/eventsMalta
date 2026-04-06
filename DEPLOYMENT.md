# GitHub & Deployment Guide

## Part 1: GitHub Setup

### 1. Initialize Git Repository

```bash
# Navigate to your project directory
cd events-malta

# Initialize git
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Next.js + Supabase setup"
```

### 2. Create GitHub Repository

1. Go to https://github.com/new
2. Create a new repository named `events-malta`
3. **Do NOT** initialize with README, .gitignore, or license (we already have these)
4. Copy the repository URL

### 3. Push to GitHub

```bash
# Add remote origin
git remote add origin https://github.com/YOUR_USERNAME/events-malta.git

# Rename branch to main (if needed)
git branch -M main

# Push code to GitHub
git push -u origin main
```

## Part 2: Deployment Options

### Option 1: Vercel (RECOMMENDED)

**Why Vercel?** It's made by the Next.js team, deploys with zero config, and has generous free tier.

#### Steps:

1. **Sign up at https://vercel.com**
2. **Click "New Project"**
3. **Select your GitHub repository** (you may need to connect GitHub first)
4. **Configure environment variables:**
   - Add `NEXT_PUBLIC_SUPABASE_URL`
   - Add `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Click "Deploy"

That's it! Your site is live. Every push to `main` will auto-deploy.

**Features:**
- Auto-deploys on push
- Preview URLs for pull requests
- Zero-config for Next.js
- Free tier includes 3 projects
- Custom domains
- Automatic HTTPS

### Option 2: Railway.app

Simple alternative if you prefer something different.

#### Steps:

1. **Sign up at https://railway.app**
2. **Create new project → GitHub repo**
3. **Add environment variables** in Railway dashboard
4. **Deploy**

Railway also auto-deploys on push and has a generous free tier.

### Option 3: Netlify

Another popular option for Next.js.

#### Steps:

1. **Sign up at https://netlify.com**
2. **Connect GitHub repository**
3. **Build settings:**
   - Build command: `npm run build`
   - Publish directory: `.next`
4. **Add environment variables**
5. **Deploy**

## Part 3: GitHub Actions (Optional CI/CD)

Create automated testing and deployment with GitHub Actions.

Create `.github/workflows/deploy.yml`:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm install

    - name: Build
      run: npm run build

    - name: Lint
      run: npm run lint
```

This workflow:
- Runs on every push and pull request
- Installs dependencies
- Builds the project
- Runs linting
- Fails if anything breaks

## Part 4: Environment Variables in Production

**Important:** Never commit `.env.local` to GitHub!

For **Vercel**:
1. Go to Project Settings → Environment Variables
2. Add your Supabase credentials
3. They're automatically available during build and runtime

For **Railway** / **Netlify**:
- Similar process in their dashboards
- Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Part 5: Domain Setup

### Add Custom Domain (All Platforms)

**Vercel:**
1. Project Settings → Domains
2. Enter your domain
3. Update DNS records (instructions provided)

**Railway / Netlify:**
- Similar process in their dashboards
- Both support custom domains

### Get a Free Domain

- **Freenom.com** - Free domains (limited extensions)
- **CloudFlare** - Cheap domains + free DNS
- **Namecheap** - Affordable domains

## Quick Deployment Checklist

- [ ] GitHub repository created
- [ ] Code pushed to GitHub
- [ ] Vercel/Railway/Netlify account created
- [ ] Repository connected to deployment platform
- [ ] Environment variables added in platform dashboard
- [ ] First deploy successful
- [ ] Test the live URL
- [ ] (Optional) Add custom domain
- [ ] (Optional) Set up GitHub Actions

## Monitoring & Logs

**Vercel:**
- Dashboard shows all deployments
- Automatic rollback on failed deploys
- Real-time logs available

**Railway / Netlify:**
- Similar monitoring features
- Build logs available
- Error notifications

## Quick Tips

- **Preview URLs:** Every pull request gets a preview URL (Vercel)
- **Auto-rollback:** Failed builds prevent broken deploys
- **Environment-specific variables:** Can set different values for preview vs production
- **Database backups:** Regular backups in Supabase (free tier included)

## Troubleshooting

**"Build failed"**
- Check logs in deployment platform
- Usually missing environment variables
- Verify Node version matches locally

**"Database connection error"**
- Verify Supabase URL and key are correct
- Check they're in the right format (paste from Supabase dashboard)

**"Custom domain not working"**
- DNS changes take 24-48 hours to propagate
- Verify DNS records were updated correctly
- Check domain settings in your deployment platform

## Next Steps

1. Push code to GitHub
2. Deploy on Vercel (easiest for Next.js)
3. Test the live deployment
4. Set up custom domain (optional)
5. Monitor deployments as you add features

---

**Recommended Workflow:**
```
Local development → Git push → GitHub → Auto-deploy to Vercel → Live! 🚀
```

That's it! Your events website is ready to go live with zero-downtime deployments.
