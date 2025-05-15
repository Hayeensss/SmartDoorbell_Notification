# Smart Doorbell Notification Worker

A Cloudflare Worker that sends email notifications for smart doorbell events. It polls your Supabase Postgres DB for new events, looks up device ownership via Clerk, and sends emails through Resend.

## Tech Stack

- **Platform**: Cloudflare Workers (Edge compute)
- **Database**: Supabase Postgres (via `@supabase/supabase-js`)
- **Authentication**: Clerk (user info API)
- **Email Delivery**: Resend (transactional emails)
- **Deployment**: Wrangler CLI
- **Language**: Modern JavaScript (ES Modules)

## Getting Started

1. **Clone the repo**
   ```bash
   git clone https://github.com/your-org/smart-doorbell-notification.git
   cd smart-doorbell-notification
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Configure environment**
   - Create a `.dev.vars` in the project root with:
     ```dotenv
     SUPABASE_URL=your_supabase_url
     SUPABASE_KEY=your_supabase_anon_or_service_key
     RESEND_API_KEY=your_resend_api_key
     CLERK_SECRET_KEY=your_clerk_secret_key
     EMAIL_FROM_NAME="Smart Doorbell"
     EMAIL_FROM_ADDRESS="onboarding@resend.dev"
     ```
   - Load these locally:
     ```bash
     source .dev.vars
     ```

4. **Run locally**
   ```bash
   bun run dev   # launches Wrangler in dev mode
   ```
   - `GET /health` → returns 200 if worker is up
   - `POST /`    → processes up to 5 unsent events

5. **Deploy**
   ```bash
   bun run deploy
   ```

## Environment Variables

| Variable             | Description                                                   |
|----------------------|---------------------------------------------------------------|
| SUPABASE_URL         | Your Supabase project URL (e.g. `https://xyz.supabase.co`)    |
| SUPABASE_KEY         | Supabase anon or service role key                             |
| RESEND_API_KEY       | API key from your Resend account                              |
| CLERK_SECRET_KEY     | Secret key from your Clerk dashboard                          |
| EMAIL_FROM_NAME      | Display name for email From header (e.g. `Smart Doorbell`)   |
| EMAIL_FROM_ADDRESS   | Email address for From header (e.g. `onboarding@resend.dev`) |

Set these in Cloudflare Dashboard or with Wrangler:
```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put CLERK_SECRET_KEY
wrangler secret put EMAIL_FROM_NAME
wrangler secret put EMAIL_FROM_ADDRESS
```

## HTTP Endpoints

- `GET /health` — returns 200 OK if the worker is up
- `POST /`       — fetches up to 5 unsent events, sends emails, and marks them sent

## Automatic Scheduled Processing

This Worker uses Cloudflare Cron Triggers to run `processEvents` every minute. The schedule is defined in `wrangler.toml`:
```toml
[triggers]
crons = ["* * * * *"]
```
The `scheduled(event, env, ctx)` handler calls `ctx.waitUntil(processEvents(...))` so the job runs in the background, with no external scheduler required.
