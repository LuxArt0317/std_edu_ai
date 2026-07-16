# Setup

## Requirements

- Node.js 24 or newer
- npm 11 or newer

## Install

```bash
npm install
```

## Environment

For live Supabase reads, configure these variables in the local shell or in the Vercel project settings:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The app now renders without them, but the Supabase panel will stay in fallback mode until both values are present.

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
