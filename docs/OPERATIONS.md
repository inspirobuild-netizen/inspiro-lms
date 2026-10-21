# Operations notes

Things that keep the production server (`200.97.162.147`, `/opt/inspiro`)
working without anyone touching it — and what broke when they didn't.

## TLS certificate (api.inspiroiasacademy.in)

Let's Encrypt, renewed by the host's `certbot.timer` (twice a day; it only
acts within 30 days of expiry).

- **Renewal goes through nginx** (webroot). certbot writes the HTTP-01
  challenge into `/var/www/certbot` on the host; the `inspiro-nginx` container
  mounts that directory read-only and serves
  `/.well-known/acme-challenge/` from it on port 80 (see
  `nginx/inspiro.conf`).
- **A deploy hook reloads nginx** after each renewal:
  `/etc/letsencrypt/renewal-hooks/deploy/reload-inspiro-nginx.sh`. Without it
  nginx keeps serving the old certificate until it expires.
- Check: `certbot renew --dry-run` must end in "all simulated renewals
  succeeded".

**Outage 5–15 Oct 2026.** The certificate had been issued with certbot's
*standalone* mode, which binds port 80 itself — impossible while nginx holds
it — so every renewal failed with "Address already in use" and the
certificate expired on 5 Oct 13:01 UTC. Every app request then failed the TLS
check, which the app reports as "Something went wrong"; sign-up, sign-in and
the admin panel were all down for ten days and nobody was alerted. An
external monitor that alerts on certificate expiry (UptimeRobot and similar
do this free) would have caught it 30 days early.

## www.inspiroiasacademy.in

The website (`inspiroiasacademy.in`) is built and hosted by another company,
on their own Vercel account. Its `www` address is **ours**: since 21 Oct 2026
the `www` DNS record is an A record pointing at this server, where nginx holds
a certificate for `www` (same webroot renewal and reload hook as the API's)
and answers every request with a 301 to `https://inspiroiasacademy.in`,
keeping the path.

Why: `www` used to be a CNAME to the website on Vercel, which served it under
a wildcard certificate (`*.inspiroiasacademy.in`) it cannot renew while the
domain's DNS is at GoDaddy. That certificate expired on 14 Aug 2026 and
Chrome blocked everyone who arrived on `www`. To hand `www` back to the
website team, set the GoDaddy record back to `CNAME www → inspiroiasacademy.in`
*after* they have added `www` to their Vercel project.

## The domain itself

GoDaddy, registered 15 Jan 2026, **expires 15 Jan 2027**; auto-renew was found
OFF on 21 Oct 2026. If it lapses, the website, both apps (`api.`), the admin
panel (`admin.`) and outgoing email (`send.`, `resend._domainkey`) all stop.
Records that belong to the app — never delete or change them: `api`, `admin`,
`www`, `send` (MX + TXT), `resend._domainkey`, `_vercel` (the admin entry).

## AI provider key (Groq)

`GROQ_API_KEY` in `/opt/inspiro/.env.production`, read by the `ai` service.
The AI coach, AI doubt answers and the daily current-affairs summaries all
depend on it. Changing it needs the container recreated, not restarted:

```
docker compose -f docker-compose.prod.yml up -d --no-deps ai
```

**Outage from 4 Oct 2026.** Groq answered `401 expired_api_key`. The coach
returned 503, AI doubts fell back to the mentor queue, and current-affairs
ingestion skipped every article, so the feed stopped at 3 Oct.

## Compose file

The server's `docker-compose.prod.yml` is the source of truth; keep the repo
copy identical. It once lacked the `inspiro_uploads` volume (notes PDFs) that
the server had — copying the repo version over the server's would have
unmounted every uploaded note.
