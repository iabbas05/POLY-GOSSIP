# Gossip BH on Cloudflare

Cloudflare Workers hosts the frontend and API. D1 stores student accounts and sessions.

## Cloudflare Git settings

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`
- Production branch: `main`

Before the first deployment, replace both placeholders in `wrangler.jsonc`:

- `PASTE_D1_DATABASE_ID_HERE`
- `PASTE_YOUR_DOMAIN_HERE`

Create these Worker secrets in Cloudflare:

- `AUTH_SECRET`
- `RESEND_API_KEY`

Create this Worker environment variable after verifying the domain in Resend:

- `MAIL_FROM`, for example `Gossip BH <auth@yourdomain.com>`

Apply the database migration once:

`npx wrangler d1 migrations apply gossip-bh-db --remote`
