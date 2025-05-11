# Smart Doorbell Notification Worker

This Cloudflare Worker handles smart doorbell event notifications by monitoring a PostgreSQL database for new events and sending email notifications to users.

## Architecture

The worker uses two approaches to process notifications:

1. **Webhook Trigger (Real-time)**: A Supabase database webhook triggers the worker when new events are inserted, enabling immediate notification processing.
2. **Scheduled Processing (Backup)**: A cron job runs every minute to check for any missed events, ensuring reliability.

## Setup

### Prerequisites

- Cloudflare Workers account
- Supabase PostgreSQL database
- Resend account for email delivery

### Database Schema

The worker expects the following database structure:

```sql
-- Users table
CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT
);

-- Devices table
CREATE TABLE devices (
  device_id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(user_id),
  name TEXT NOT NULL,
  type TEXT NOT NULL
);

-- Events table
CREATE TABLE events (
  event_id SERIAL PRIMARY KEY,
  device_id UUID REFERENCES devices(device_id) NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  send_email BOOLEAN NOT NULL DEFAULT FALSE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Environment Variables

Set the following environment variables in your Cloudflare Workers dashboard or in `.dev.vars` locally:

```
DATABASE_URL=postgresql://postgres.uyuevbmeshcnwzdfysta:Iotproject000.@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres
RESEND_API_KEY=your_resend_api_key
```

### Supabase Database Webhook

Set up a Supabase database webhook with these settings:

1. Events: INSERT on table `events`
2. URL: `https://your-worker-url.workers.dev/webhook`

## API Endpoints

- `GET /health`: Health check endpoint
- `GET /process`: Manually trigger event processing
- `POST /webhook`: Webhook endpoint for Supabase database events

## Development

```bash
# Install dependencies
npm install

# Run locally with Wrangler
npm run dev

# Deploy to Cloudflare
npm run deploy
```

## Environment Setup

Before deployment, set your secrets using wrangler:

```bash
wrangler secret put DATABASE_URL
wrangler secret put RESEND_API_KEY
```
