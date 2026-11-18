# Plans, payments, password reset and the connector

## Plans

| | Free | SWDR Pro (lifetime, £99 once) |
| --- | --- | --- |
| Writing, story, production, Creator studio, imports and exports on your device | ✓ | ✓ |
| Cloud team projects with live co-writing | 1 | Unlimited |
| AI partner on the workspace model | 10 a day | 150 a day |
| AI partner with your own key or OpenRouter | ✓ | ✓ |
| Claude and ChatGPT connector | — | ✓ |

While Stripe is not configured, every account has Pro limits. Change the limits with `SWDR_AI_DAILY_LIMIT` (free) and `SWDR_AI_PRO_LIMIT` (Pro), and the price with `SWDR_PRO_PRICE_PENCE` (default `9900`) and `SWDR_PRO_CURRENCY` (default `gbp`), or set `STRIPE_PRICE_ID` to a one-time price you created in Stripe.

## Stripe (lifetime upgrade)

1. In the Stripe Dashboard, copy the **secret key** (use test mode first).
2. **Developers → Webhooks → Add endpoint**: URL `https://<your-domain>/api/stripe-webhook`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy the **signing secret**.
3. In Vercel → Settings → Environment Variables add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (sensitive), then redeploy.
4. Test with card `4242 4242 4242 4242` in test mode: the account menu shows **Pro for life** within a minute.

Pro is granted only by the signed webhook, never by the browser returning from Checkout. Webhooks are verified against the raw body with a five-minute window, and repeats are harmless.

## Resend (password reset)

Resend's free tier (3,000 emails a month, 100 a day at the time of writing) is plenty for password resets.

1. Create a Resend account, **add and verify your domain** (a few DNS records). Until a domain is verified, Resend only delivers to your own address.
2. Create an API key with sending access.
3. In Vercel add `RESEND_API_KEY` (sensitive) and `RESEND_FROM`, for example `SWDR <noreply@yourdomain.com>`, then redeploy.

**Forgot your password?** on the sign-in page sends a link that works once, for one hour. The page answers the same way whether or not an account exists, requests are rate-limited, and finishing a reset signs the account out everywhere else.

## Claude and ChatGPT connector

Pro accounts open the account menu → **Claude & ChatGPT connector** → **Create connector link**. The link (`https://<your-domain>/mcp/…`) is a Model Context Protocol server:

- **Claude**: Settings → Connectors → Add custom connector → paste the link.
- **ChatGPT**: Settings → Apps & Connectors → Advanced settings → Developer mode → Create → paste the link, authentication **No authentication**.

The assistant can list cloud team projects, read projects, scripts (whole or by scene) and outlines, add outline beats and add scenes, with the account's own role and episode access. Writes go through the normal save path and appear in line history. The link is shown once, stored only as a digest, and can be revoked or replaced at any time; anyone holding it can act as the account, so keep it private.
