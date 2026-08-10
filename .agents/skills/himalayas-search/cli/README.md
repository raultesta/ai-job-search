# himalayas-cli

CLI for searching worldwide-remote job listings on Himalayas' free public
JSON API, across any sector.

**Data source**: `https://himalayas.app/jobs/api` (browse) and
`https://himalayas.app/jobs/api/search` (filtered search) — Himalayas'
public API, documented at `https://himalayas.app/docs/remote-jobs-api`.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **⚠️ Attribution required.** Himalayas' own terms: *"If you display
> Himalayas job data on your own website or application, include a visible
> link back to himalayas.app and mention that the data is sourced from
> Himalayas."* Every result carries its himalayas.app URL in the `url`
> field for exactly this reason — keep it attached whenever you display or
> forward this data, and never resubmit it to other third-party job boards.
> See `../url-reference.md` for the full terms and the live-tested API
> behavior this CLI relies on.

## Installation

```bash
cd .agents/skills/himalayas-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (server-side keyword/filter, confirmed reliable — see url-reference.md) |
| `detail` | Fetch full detail for a single job by `companySlug/jobSlug` id or URL |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Product design roles, worldwide remote
bun run src/cli.ts search -q "Product Designer" --format table

# Design roles restricted to Portugal, excluding worldwide-only postings
bun run src/cli.ts search -q "designer" --country Portugal --exclude-worldwide --format table

# Full detail for one job
bun run src/cli.ts detail spotme/technical-support-specialist-us-remote --format plain
```

See `../SKILL.md` for the full flag reference and the attribution notice.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title / skill / role). Filtered server-side (confirmed reliable). |
| `--country` | | Country name, e.g. `Portugal`. Server-side. Includes worldwide-eligible jobs unless combined with `--exclude-worldwide`. |
| `--worldwide` | | Worldwide-eligible jobs only (no country restriction). |
| `--exclude-worldwide` | | With `--country`: strip out worldwide-only jobs. |
| `--seniority` | | Closed enum server-side (e.g. `Senior`) — invalid values 400. |
| `--employment-type` | | Closed enum server-side (e.g. `Full Time`) — invalid values 400. |
| `--company` | | Filter to one company's postings by slug. |
| `--timezone` | | Timezone offset filter, e.g. `-5`. |
| `--sort` | | Only `recent` confirmed valid; omit for default sort. |
| `--jobage` | | Posted within N days, filtered client-side against `pubDate`. |
| `--page` | | 1-indexed page (20 results/page, server-side, fixed size). |
| `--limit` | `-n` | Cap results emitted per page (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |

## Why `detail` takes `companySlug/jobSlug`, not a numeric id

Himalayas' API has no numeric/opaque job id and no per-job GET endpoint —
the closest identifier is the job's URL path,
`/companies/<companySlug>/jobs/<jobSlug>`. The job's own himalayas.app page
also sits behind a Cloudflare bot challenge that returns HTTP 403 to a plain
fetch, so `detail` can't just scrape that page. Instead it re-queries the
search endpoint scoped to `company=<companySlug>` (confirmed live to return
that company's current postings) and matches the job by slug — every job
object already carries its full description inline, so no second fetch is
needed once found. See `../url-reference.md` for the full write-up.
