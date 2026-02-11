# Cookbook PDF Service

Backend microservice that generates styled PDF cookbooks from structured recipe data. Built as the PDF export backend for the Cookbook app — accepts cookbook JSON, renders it to a print-ready PDF with Puppeteer, and uploads it to Supabase Storage.

## Tech Stack

- **Node.js** — runtime
- **Express 4.18** — web server
- **Puppeteer 24.12** — headless Chrome for HTML-to-PDF rendering
- **@supabase/supabase-js 2.39** — uploads PDFs to Supabase Storage
- **Railway** — deployment platform (configured via `railway.toml`, uses nixpacks with system Chromium)

## Quick Start

1. Clone the repo:
   ```bash
   git clone https://github.com/jmann29/puppeteer-js.git
   cd puppeteer-js
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```bash
   cp .env.example .env
   ```

4. Run the server:
   ```bash
   npm start
   ```

5. Verify it's working:
   ```bash
   curl http://localhost:3000/
   # Should return: {"status":"ok","service":"cookbook-pdf-service"}
   ```

## Project Structure

```
puppeteer-js/
├── index.js          # Entire server — Express app, PDF generation, HTML templates
├── package.json      # Dependencies and start script
├── railway.toml      # Railway deployment config (nixpacks, system Chromium path)
├── .env.example      # Required environment variables
└── .gitignore
```

## How It Works

1. `POST /generate-pdf` receives `{ user_id, cookbook_id, cookbook_data }`
2. `cookbook_data` contains: recipes, cover info, TOC style, front matter pages, content ordering, dividers
3. Server generates a full HTML document with inline CSS (Georgia serif font, cream background, print-ready layout)
4. Puppeteer renders it to a Letter-size PDF with 0.5" margins
5. PDF is uploaded to Supabase Storage bucket `ebook-exports` at `{user_id}/{cookbook_id}.pdf`
6. Returns a signed URL valid for 1 year

## Current Status

- **Working**: PDF generation from cookbook JSON data, Supabase upload, signed URL return
- **Working**: Cover page, table of contents, recipe pages (ingredients + directions + photo), section dividers, front matter (dedication, foreword, photo, story pages)
- **Working**: Railway deployment with system Chromium
- **Working**: Graceful shutdown on SIGTERM/SIGINT
- **Not wired up**: No authentication/authorization on the endpoint (relies on the calling app to handle auth)
- **Not wired up**: TOC page numbers are approximate (hardcoded 2-page-per-recipe assumption)

## Next Steps

1. **Add request authentication** — the `/generate-pdf` endpoint is currently open. Add a shared secret or JWT verification so only the Cookbook app can call it.
2. **Fix TOC page numbering** — current logic assumes every recipe is exactly 2 pages. Recipes with long ingredient/direction lists may overflow, making page numbers inaccurate.
3. **Add input sanitization** — cookbook data fields (title, ingredients, directions) are injected directly into HTML. Should escape HTML entities to prevent rendering issues with special characters.
4. **Support custom fonts/themes** — the styles are hardcoded (Georgia serif, cream background, orange accent). Could accept a theme parameter.
5. **Add error reporting** — currently logs errors to console. Could report to an error tracking service for production visibility.

## Notes

- **Single file architecture**: Everything is in `index.js` — Express server, HTML generation, CSS styles, all helper functions. This was intentional to keep deployment simple on Railway.
- **Railway + Chromium**: Railway's nixpacks builder provides system Chromium at `/usr/bin/chromium`. The `railway.toml` sets `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` and `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` so Puppeteer uses the system binary instead of downloading its own.
- **Supabase Storage**: Uses the `ebook-exports` bucket with `upsert: true`, so regenerating a PDF for the same cookbook overwrites the previous one.
- **Signed URLs**: Generated URLs are valid for 1 year (365 days). The Cookbook app stores and serves these URLs directly to users.
- **50MB request limit**: `express.json({ limit: '50mb' })` is set to handle large cookbook payloads with embedded base64 images.
