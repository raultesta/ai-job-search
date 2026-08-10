---
name: himalayas-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for worldwide-remote job
  listings, find remote job openings, or look up a specific remote job
  posting on Himalayas — a global remote-work job board (no single country
  focus, English-language postings). Invoke for remote jobs, work-from-home
  roles, remote-first companies, or distributed-team openings across any
  sector, but especially design/product roles. Trigger phrases: remote jobs,
  remote job search, work from home jobs, fully remote positions, remote
  openings, Himalayas, distributed team jobs, "any remote design jobs",
  "search Himalayas for X".
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/himalayas-search/cli/src/cli.ts *)
---

# Himalayas Search Skill

Search live job listings from Himalayas' free, public, unauthenticated JSON
API (`https://himalayas.app/jobs/api` browse, `https://himalayas.app/jobs/api/search`
filtered search — documented at `https://himalayas.app/docs/remote-jobs-api`).
Worldwide-remote only, English-language postings, no single-country focus.
**Zero runtime dependencies** — it runs with just `bun`.

## ⚠️ Attribution required — read this before displaying results

Himalayas' own docs, quoted verbatim: *"If you display Himalayas job data on
your own website or application, include a visible link back to
himalayas.app and mention that the data is sourced from Himalayas."* Every
result from this CLI carries the job's himalayas.app URL in its `url` field
— **keep that link attached whenever you show or forward these results, and
credit Himalayas as the source.** Do not resubmit Himalayas job data to
other third-party job boards. See `url-reference.md` for the full terms and
the live investigation this skill was built from.

## API quirks worth knowing (live-tested, see `url-reference.md`)

- **Server-side filtering works reliably** (unlike some other portal CLIs in
  this repo) — `--query`, `--country`, `--seniority`, `--employment-type`,
  `--company`, `--worldwide`/`--exclude-worldwide`, and `--sort` were all
  confirmed live against the real API. No client-side re-filtering is needed
  for keyword search.
- **`--seniority` and `--employment-type` are closed enums** server-side —
  an unrecognized value returns HTTP 400, which this CLI surfaces as-is
  rather than guessing a validation list. Pass values exactly as they appear
  in job data (e.g. `Senior`, `Full Time`).
- **Max page size is 20**, fixed server-side — `--limit` above 20 has no
  effect on how much is fetched per page (the API silently caps it); this
  CLI's `--limit` only trims what's *emitted* from a page.
- **No numeric job id exists.** `detail` takes `companySlug/jobSlug` (or a
  full himalayas.app job URL) instead, because that's the only stable
  identifier Himalayas exposes. See the CLI README for why.
- **Job detail pages are Cloudflare-protected** (403 to a plain fetch), so
  `detail` doesn't scrape them — it re-queries the search endpoint scoped to
  the job's company slug, since every job object already carries its full
  description inline.

## When to use this skill

- Search for worldwide-remote job openings, optionally by keyword, country,
  seniority, employment type, or company
- Filter by recency (posted in the last N days)
- Get the full description of a specific Himalayas job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/himalayas-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, or role), server-side filtered. Recommended.
- `--country <name>` — country filter (e.g. `Portugal`), server-side. Includes worldwide-eligible jobs too unless combined with `--exclude-worldwide`.
- `--worldwide` — worldwide-eligible jobs only (no country restriction).
- `--exclude-worldwide` — combined with `--country`, strips out worldwide-only jobs so results are country-restricted-only.
- `--seniority <value>` — closed enum server-side, e.g. `Senior`.
- `--employment-type <value>` — closed enum server-side, e.g. `Full Time`.
- `--company <slug>` — restrict to one company's postings, e.g. `spotme`.
- `--timezone <offset>` — timezone offset filter, e.g. `-5`.
- `--sort <order>` — only `recent` confirmed valid server-side; omit for default (relevance-weighted with `--query`).
- `--jobage <days>` — posted within N days, filtered client-side against `pubDate`. Omit for all postings.
- `--page <n>` — page number (1-indexed, 20 results/page, server-side pagination).
- `--limit <n>` / `-n <n>` — cap results emitted per page (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/himalayas-search/cli/src/cli.ts detail <companySlug/jobSlug|url> [--format json|plain]
```

`id` is `companySlug/jobSlug` from a `search` result's `id` field, or a full
`himalayas.app/companies/<slug>/jobs/<slug>` URL. Returns the full
description, seniority, employment type, and salary (when Himalayas provides
one). If the posting has since expired/been removed from that company's live
listings, returns `NOT_FOUND`.

## Usage examples

```bash
# Product design roles, worldwide remote
bun run .agents/skills/himalayas-search/cli/src/cli.ts search -q "Product Designer" --format table

# UX roles, capped at 5 results
bun run .agents/skills/himalayas-search/cli/src/cli.ts search -q "UX" --limit 5 --format table

# Design roles restricted to Portugal, excluding worldwide-only postings
bun run .agents/skills/himalayas-search/cli/src/cli.ts search -q "designer" --country Portugal --exclude-worldwide --format table

# Senior product design roles
bun run .agents/skills/himalayas-search/cli/src/cli.ts search -q "Product Designer" --seniority Senior --format table

# Design roles posted in the last 14 days
bun run .agents/skills/himalayas-search/cli/src/cli.ts search -q "designer" --jobage 14 --format table

# Full detail for a specific job
bun run .agents/skills/himalayas-search/cli/src/cli.ts detail spotme/technical-support-specialist-us-remote --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing ids to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from Himalayas' free public API — no credentials required.
- Data is cached and refreshed roughly every 24h on Himalayas' end (per their
  docs) — there's no benefit to calling this more than once a day for the
  same query.
- Job ids are `companySlug/jobSlug` (e.g.
  `spotme/technical-support-specialist-us-remote`), not numeric — pass them
  as-is to `detail`, or pass the full himalayas.app URL instead.
- The CLI retries 429/5xx with exponential backoff.
- See `url-reference.md` for the full endpoint/field reference and the live
  investigation notes (confirmed params, the closed-enum errors, the
  Cloudflare-walled detail pages, and the attribution requirement's exact
  wording).
