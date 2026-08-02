# Papi frontend

React + Vite child/parent web app for Papi (Pipa).

## Stack

- Vite + React
- Supabase email auth
- SpeechC API (Railway): `https://api-production-fa6b.up.railway.app`

## Local

```bash
cp .env.example .env
# fill VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev
```

## Vercel

1. Import this repo in Vercel
2. Set env vars from `.env.example`
3. Framework preset: Vite
4. Build command: `npm run build`
5. Output directory: `dist`

Add the Vercel domain to:

- Supabase Auth → Redirect URLs → `https://YOUR_DOMAIN/auth/callback`
- Railway `FRONTEND_ORIGIN` + `CORS_ORIGINS`
