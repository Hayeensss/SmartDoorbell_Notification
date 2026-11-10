# Smart Doorbell Notification Worker

The email-notification component of my [Smart Doorbell System](https://github.com/Hayeensss/Smart_Doorbell). It processes pending device events and sends email alerts to the device owner's address.

## Notification flow

The implementation in [worker.js](worker.js):

1. Reads up to five events whose `send_email` flag is false, oldest first.
2. Looks up the event's device and its owner in the database.
3. Resolves the owner's primary email address through Clerk.
4. Creates an event-specific email and calls the Resend API.
5. Updates the event's sent flag after the send call returns.

This is a project integration, not a claim of a production delivery service.

## Stack and contribution

JavaScript on Cloudflare Workers, with Supabase PostgreSQL, Clerk and Resend. My project work covers the pending-event processing and the device-owner email notification integration.

## Run locally

Install dependencies with `npm ci`, then use the package's `dev` script to run Wrangler locally. Configure your own `SUPABASE_URL`, `SUPABASE_KEY`, `CLERK_SECRET_KEY` and `RESEND_API_KEY` in local development secrets. Do not commit them.

A GET request returns a worker status message. A POST request triggers pending-event processing and can send real email; use a dedicated development database and test recipients. The sender address is currently defined in `worker.js` and requires a sender authorised by your Resend account.

## Current limitations

- The current export implements HTTP `fetch` handling, not a `scheduled` handler. A cron setting alone does not make this worker process events automatically.
- Email delivery and production operation have not been verified in the current portfolio review.
- The code does not establish exactly-once delivery or concurrency-safe event claiming. It also needs delivery-result checking before its sent flag can be treated as durable delivery evidence.

See the [web application](https://github.com/Hayeensss/Smart_Doorbell) for the event-history interface and project context.
