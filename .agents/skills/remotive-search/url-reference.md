# Remotive API Reference

Free, public, unauthenticated JSON API. Documented at
`https://remotive.com/api-documentation` (redirects to
`https://github.com/remotive-io/remote-jobs-api`). Worldwide-remote listings,
English-language postings, no single-country focus.

> **⚠️ Rate limit — read before running this more than a couple of times.**
> Remotive's own docs: *"there is absolutely no need to request Remotive Job
> data too frequently. Typically, you only need to GET Remotive job data
> through this API a couple of times a day (we advise max. 4 times a day)...
> Note that excessive requests will be blocked."* A documented blocking
> threshold of **>2 requests/minute** also applies. Every `search` and
> `detail` invocation of this CLI hits the same endpoint, so **treat total
> daily calls (search + detail combined) as capped at ~4.** Do not loop or
> poll this CLI.

## robots.txt

`https://remotive.com/robots.txt` disallows `/api/*` and `/*search=`:

```
Disallow: /api/*
Disallow: /*search=
```

This sits alongside Remotive's own API documentation, which explicitly
invites third-party developers to consume this exact endpoint programmatically
(subject to the rate limit and attribution terms below) — the `/api/*`
disallow is almost certainly aimed at keeping search-engine crawlers from
indexing raw JSON, not at revoking the documented API grant. Recorded here
per policy rather than silently ignored. Job **detail pages** (`/remote-jobs/<category>/<slug>-<id>`,
what `detail`'s `url` field points to) are **not** in the disallow list either
(only the legacy `/jobs/*` and `/remote-job/detail/*` paths are), so linking
out to them is uncontroversial.

## Terms of use (from the API's legal notice, returned in every response body
under the `0-legal-notice` key)

- Attribution required: link back to the job's Remotive URL and credit Remotive as the source.
- Do not resubmit Remotive jobs to other job boards (Jooble, Neuvoo, Google Jobs, LinkedIn Jobs, etc.).
- Do not use the data to collect signups/emails.
- Listings are delayed 24h from Remotive's own site.

## Search

```
GET https://remotive.com/api/remote-jobs?category=design&search=<term>&limit=<n>
```

| Param | Meaning | Example |
|-------|---------|---------|
| `category` | Category slug filter | `design` (confirmed valid slug via `GET /api/remote-jobs/categories` — id 21, name "Design") |
| `search` | Case-insensitive substring match against title/description | `Product Designer` |
| `company_name` | Case-insensitive partial company match | `Acme` |
| `limit` | Cap on returned jobs | `250` |

**Live-tested quirk (2026-08-07/08, confirmed across 4 separate requests with
different `category`/`search` values):** the API currently returns the
**identical set of ~23 most-recent jobs across all categories** regardless of
`category` or `search` values sent — filtering does not appear to be applied
server-side right now (looks like a caching layer keyed on path only, not
querystring; `total-job-count` was `23` in every variant tested, including
`category=software-development` with no `search`, and `category=design` with
and without `search=Product Designer`). `limit` was not verified to change
this. **Consequence: the CLI does its own client-side filtering** after
fetching (word-level match against title/description/tags; a job is kept if
any query word ≥3 chars appears in any of those fields) rather than trusting
the server to have filtered. This also means results may include jobs outside
the `design` category — that's expected given the current server behavior,
not a CLI bug. Re-verify server-side filtering periodically; if Remotive fixes
it, the client-side filter becomes a harmless second pass.

### Response shape

```json
{
  "00-warning": "...",
  "0-legal-notice": "...",
  "job-count": 23,
  "total-job-count": 23,
  "jobs": [ { ...one job object... } ]
}
```

Per-job fields used by this CLI:

| Field | Maps to | Notes |
|-------|---------|-------|
| `id` | `id` | Numeric. No separate detail endpoint exists — `detail <id>` re-fetches the list and looks the id up client-side (see below). |
| `title` | `title` | |
| `company_name` | `company` | |
| `candidate_required_location` | `location` | Free text, e.g. `"USA"`, `"Worldwide"`, `"Europe, EMEA, UK, Germany, France, European timezones"`. No structured country/city split — see Notes. |
| `publication_date` | `date` | ISO 8601, e.g. `2026-08-07T01:10:06`. |
| `url` | `url` | Full `https://remotive.com/remote-jobs/<category-slug>/<slug>-<id>` link. Points to the same page whether the data came from `search` or `detail`. |
| `description` | `description` (detail only) | Rich HTML (`<p>`, `<ul>`, `<strong>`, MS-Word inline styles). Stripped to plain text with paragraph breaks preserved. |
| `category` | (not in the required JSON shape; informational only) | Free text category name, e.g. `"Design"`, `"Software Development"`. |
| `job_type` | (informational) | `full_time`, `freelance`, `contract`, `part_time`, or empty string. |
| `tags` | (used for client-side keyword matching only) | Array of free-text skill tags. |

## Categories endpoint (reference, not used per-request)

```
GET https://remotive.com/api/remote-jobs/categories
```

Confirms valid `category` slugs. `design` (id 21) is a real, valid slug — the
filtering bug above is not a typo on our side. Not called by the CLI at
runtime (would burn rate-limit budget for no runtime benefit); recorded here
so a future maintainer doesn't have to rediscover it.

## Detail

**No id-based detail endpoint exists** (confirmed against the official docs).
`detail <id>` works by calling the same search endpoint with a large `limit`
and no `category`/`search` filter (to maximize the chance the id is present
in whatever window the server currently returns), then finding the matching
`id` in the `jobs` array client-side. If the id has rolled out of that window,
`detail` returns a `NOT_FOUND` error — this is an inherent limitation of the
upstream API, not a parsing bug. Every job object already carries the full
`description` HTML, so no second fetch/page is needed once the id is located.

## Notes

- No authentication, no API key.
- No native location/country search parameter — `candidate_required_location`
  is free text on each job (e.g. `"Worldwide"`, `"USA"`, `"Europe, UK,
  Germany, France"`). This CLI surfaces it verbatim in the `location` field of
  every result so downstream eligibility filtering (e.g. this repo's
  `job-scraper` skill) can pattern-match it against the candidate's own
  eligibility (EU / remote-worldwide).
- `search` matches title + description server-side per the docs, but given
  the live quirk above, don't rely on server-side relevance — the CLI's
  client-side word match is the actual filter in effect right now.
- Legacy domain `remotive.io` is deprecated in favor of `remotive.com` (per
  the `00-warning` key in every response).
