---
name: remotive-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for worldwide-remote job
  listings, find remote job openings, or look up a specific remote job
  posting on Remotive — a global remote-work job board (no single country
  focus, English-language postings). Invoke for remote jobs, work-from-home
  roles, remote-first companies, or distributed-team openings across any
  sector, but especially design/product roles. Trigger phrases: remote jobs,
  remote job search, work from home jobs, fully remote positions, remote
  openings, Remotive, distributed team jobs, "any remote design jobs",
  "search Remotive for X".
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/remotive-search/cli/src/cli.ts *)
---

# Remotive Search Skill

Search live job listings from Remotive's free, public, unauthenticated JSON
API (`https://remotive.com/api/remote-jobs`). Worldwide-remote only —
Remotive doesn't list on-site/hybrid roles — English-language postings, no
single-country focus. **Zero runtime dependencies** — it runs with just `bun`.

## ⚠️ Rate limit — read this before running the CLI

Remotive's own API terms: *"there is absolutely no need to request Remotive
Job data too frequently... we advise max. 4 times a day... excessive requests
will be blocked."* **Every `search` and `detail` call hits this same
endpoint** — budget total daily usage (search + detail combined) at roughly
**4 calls**. Don't loop, poll, or script repeated calls against this CLI.
`https://remotive.com/robots.txt` also disallows `/api/*` for crawlers,
alongside Remotive's own docs (`github.com/remotive-io/remote-jobs-api`)
explicitly inviting third-party programmatic use of this exact endpoint under
those rate-limit and attribution terms — recorded plainly here per policy;
see `url-reference.md` for the full detail. Attribution is required: link
back to the job's Remotive URL and credit Remotive as the source when
surfacing results, and never resubmit Remotive jobs to other job boards.

## Known API quirk (live-tested, see `url-reference.md`)

Remotive's `category`/`search` querystring filters were **not being applied
server-side** at investigation time — every request returned the same set of
recent jobs regardless of parameters. This CLI compensates by fetching a
generous window and filtering/ranking **client-side** by keyword (word-level
match against title, description, and tags). Results may therefore include
jobs outside the `design` category — that's expected, not a bug.

## When to use this skill

- Search for worldwide-remote job openings, optionally by keyword
- Filter by recency (posted in the last N days)
- Get the full description of a specific Remotive job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/remotive-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, or role). Recommended.
- `--category <slug>` — Remotive category slug. Default: `design`. (Sent to the API best-effort; see the quirk above — the CLI's own client-side keyword filter is what actually narrows results right now.)
- `--jobage <days>` — posted within N days, filtered client-side against `publication_date`. Omit for all postings.
- `--page <n>` — page number (1-indexed, 10 results per page) over the filtered/ranked result set.
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

**No `--location` flag**: Remotive's API has no location/country search
parameter. Every result's `location` field carries Remotive's
`candidate_required_location` value verbatim (e.g. `"Worldwide"`, `"USA"`,
`"Europe, UK, Germany, France"`) so downstream eligibility filtering — e.g.
this repo's `job-scraper` skill — can pattern-match it against the
candidate's own eligibility instead of relying on a portal-side filter that
doesn't exist. Include a location term in `--query` if you want it to
influence the keyword match (results aren't guaranteed to respect it).

### Fetch full job detail

```bash
bun run .agents/skills/remotive-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job id from `search` results, or a full
`remotive.com/remote-jobs/...` URL. Remotive has **no id-based detail
endpoint** — `detail` re-fetches a large listing window and looks the id up
client-side, so very old ids that have rolled out of that window will return
`NOT_FOUND`. Returns the full description, category, job type, and salary
(when Remotive provides one).

## Usage examples

```bash
# Product design roles, worldwide remote
bun run .agents/skills/remotive-search/cli/src/cli.ts search -q "Product Designer" --format table

# UX roles, capped at 5 results
bun run .agents/skills/remotive-search/cli/src/cli.ts search -q "UX" --limit 5 --format table

# Design roles posted in the last 14 days
bun run .agents/skills/remotive-search/cli/src/cli.ts search -q "designer" --jobage 14 --format table

# Any category, not just design
bun run .agents/skills/remotive-search/cli/src/cli.ts search -q "product manager" --category product --format table

# Full detail for a specific job
bun run .agents/skills/remotive-search/cli/src/cli.ts detail 2091081 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from Remotive's free public API — no credentials required.
- Listings are delayed ~24h from Remotive's own site (per their terms).
- The CLI retries 429/5xx with exponential backoff, but given the strict
  daily rate limit, a 429 likely means you've already used up today's budget
  — back off for the day rather than retrying harder.
- Job ids are numeric (e.g. `2091081`) — pass them as-is to `detail`.
- See `url-reference.md` for the full endpoint/field reference and the live
  investigation notes (category slugs, the filtering quirk, robots.txt).
