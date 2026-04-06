# Events Malta - Setup Guide

This is your Next.js + Supabase starter project for the Events Malta website.

## Quick Start

### 1. Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- A Supabase account (free tier available at https://supabase.com)

### 2. Initial Setup

#### Clone/Install dependencies:
```bash
npm install
```

#### Set up Supabase:
1. Go to https://supabase.com and create a new project
2. Once created, go to Project Settings → API
3. Copy your:
   - `Project URL`
   - `Anon Key`

#### Configure environment variables:
1. Create a `.env.local` file in the root directory (copy from `.env.local.example`)
2. Paste your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Run the development server:
```bash
npm run dev
```

Open http://localhost:3000 in your browser. You should see the welcome page.

## Next Steps

### Create Your Database Schema

In your Supabase dashboard:

1. Go to the **SQL Editor**
2. Create an `events` table (example):
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
```

3. Create other tables as needed for your event management system

### Enable Row Level Security (RLS)

For security, enable RLS on your tables:
1. Go to **Authentication** → **Policies**
2. Create policies for reading/writing data

### Connect to Your Database

Update `app/page.tsx` to fetch data:
```typescript
import { supabase } from '@/lib/supabase'

export default async function Home() {
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .order('date', { ascending: true })

  return (
    // Your JSX here
  )
}
```

## Project Structure

```
events-malta/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   └── globals.css         # Global styles
├── lib/
│   └── supabase.ts         # Supabase client
├── public/                 # Static assets
├── package.json
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Create production build
- `npm start` - Start production server
- `npm run lint` - Run linter

## Styling

This project uses **Tailwind CSS** for styling. You can use any Tailwind utility classes in your components.

## Deployment

### Vercel (Recommended for Next.js)
1. Push your code to GitHub
2. Go to https://vercel.com and connect your repository
3. Add your environment variables in Vercel settings
4. Deploy with one click

### Other Platforms
- Netlify, Railway, or any Node.js hosting platform work fine
- Just ensure you set the environment variables in your hosting platform

## Useful Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [React Documentation](https://react.dev)

## Troubleshooting

**"Cannot find module '@supabase/supabase-js'"**
- Run `npm install` again to ensure all dependencies are installed

**"NEXT_PUBLIC_SUPABASE_URL is not defined"**
- Check that `.env.local` file exists and has the correct values
- Restart your dev server after adding environment variables

**Supabase connection issues**
- Verify your Supabase URL and Anon Key are correct
- Check that your Supabase project is active

## Need Help?

Refer to the official documentation or check the project repository for updates.

Happy coding! 🚀
