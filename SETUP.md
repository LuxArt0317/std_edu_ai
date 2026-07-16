# Setup

## Requirements

- Node.js 22
- npm 10 or newer

## Install

```bash
npm ci
```

## Environment

For live Supabase reads, configure these variables in the local shell or in the Vercel project settings:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The homepage and current AI drawer render without these variables. The Supabase client remains available for later research modules and degrades safely when the variables are absent.

The homepage currently references official public STU media assets from `www.stu.edu.tw`. An internet connection is required to load those images and the Roboto web font during local development.

## Run Locally

```bash
npm run dev
```

The Vite dev server will print a local URL, usually `http://localhost:5173`.

## Build

```bash
npm run build
```

## Preview Production Build

```bash
npm run preview
```

## Deploy to Vercel

Vercel reads `vercel.json`, installs the locked dependencies with `npm ci`, runs
`npm run vercel-build`, and publishes `dist`. Node.js 22 is pinned through the
`engines` field in `package.json`. The rewrite rule keeps client-side routes
working when opened directly.

Connect this repository to a Vercel project and deploy the `main` branch. Add
the optional Supabase variables above in the Vercel project settings if live
data is required.
