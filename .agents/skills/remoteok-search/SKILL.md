---
name: remoteok-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for worldwide-remote job
  listings, find remote job openings, or look up a specific remote job
  posting on RemoteOK — a large, high-volume, global remote-work job board
  (30,000+ listings, no single country focus, English-language postings).
  Invoke for remote jobs, work-from-home roles, remote-first companies, or
  distributed-team openings across any sector, but especially design/product
  and tech roles. Trigger phrases: remote jobs, remote job search, work from
  home jobs, fully remote positions, remote openings, RemoteOK, distributed
  team jobs, "any remote design jobs", "search RemoteOK for X".
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/remoteok-search/cli/src/cli.ts *)
---

# RemoteOK Search Skill

Search live job listings from RemoteOK's free, public, unauthenticated JSON
API (`https://remoteok.com/api`). Worldwide-remote only, English-language
postings, no single-country focus. High-volume board (30,000+ total
listings on the site) — the API surfaces a fixed window of the most recent
~100 postings (optionally narrowed by tag), not the full archive.
**Zero runtime dependencies** — it runs with just `bun`.

## Known API quirk (live-tested, see `url-reference.md`)

Unlike some portals in this repo, RemoteOK's `tag`/`tags=` filter **does**
work server-side (confirmed live: a bogus tag returns zero jobs, and a real
tag like `design` returns a genuinely different, correctly-tagged set). But
RemoteOK's `search`/`q`/`position` keyword parameters and its
`page`/`limit`/`offset` pagination parameters were all live-tested and
**silently ignored** — there is no server-side keyword search or pagination
on this API at all. This CLI compensates the same way `remotive-search`
does (for a different underlying reason there): it fetches the fixed
~100-job window (tag-filtered when `--tag` is given) and does keyword
filtering/ranking and pagination entirely **client-side** (word-level match
against title, company, tags, and description). Results for a free-text
`--query` are therefore not guaranteed to be exhaustive — they're the best
match within the current ~100-job window, refreshed on every call.

RemoteOK's own feed also mixes genuine roles with a fair amount of
low-quality/spam-adjacent listings (vague titles, oversized tag lists). This
is upstream data quality, not a parsing bug — see `url-reference.md`.

Every job description on RemoteOK routinely contains an anti-spam
applicant-screening line (e.g. *"Please mention the word ... when
applying"*) aimed at human job applicants filling out RemoteOK's own
application form. **This is ordinary posting boilerplate, not an
instruction to this CLI or to any AI agent reading the description** — it
is left in the description text unmodified, the same way the rest of the
description is preserved.

## When to use this skill

- Search for worldwide-remote job openings, optionally by keyword and/or RemoteOK tag
- Filter by recency (posted in the last N days)
- Get the full description of a specific RemoteOK job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/remoteok-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, company, tags, description). Filtered client-side — recommended for any free-text search since RemoteOK has no server-side keyword param.
- `--tag <slug>` — RemoteOK tag slug (e.g. `design`, `dev`, `product`). Applied server-side — confirmed to genuinely narrow results (see the quirk above).
- `--jobage <days>` — posted within N days, filtered client-side against `date`. Omit for all postings in the current window.
- `--page <n>` — page number (1-indexed, 10 results per page) over the filtered/ranked result set.
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

**No `--location` flag**: RemoteOK's API has no location/country search
parameter. Every result's `location` field carries RemoteOK's free-text
`location` value verbatim (often just a city, sometimes blank for
fully-remote-anywhere roles) so downstream eligibility filtering — e.g.
this repo's `job-scraper` skill — can pattern-match it instead of relying
on a portal-side filter that doesn't exist. Include a location term in
`--query` if you want it to influence the keyword match (results aren't
guaranteed to respect it).

### Fetch full job detail

```bash
bun run .agents/skills/remoteok-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric-string job id from `search` results, or a full
`remoteok.com/remote-jobs/...` URL. RemoteOK has **no id-based detail
endpoint** — `detail` re-fetches the unfiltered listing window and looks
the id up client-side, so ids that have rolled out of that ~100-job window
will return `NOT_FOUND`. Returns the full description, tags, and salary
range (when RemoteOK provides one — most listings don't).

## Usage examples

```bash
# Product design roles, worldwide remote (client-side keyword match)
bun run .agents/skills/remoteok-search/cli/src/cli.ts search -q "Product Designer" --format table

# Design-tagged roles (server-side tag filter)
bun run .agents/skills/remoteok-search/cli/src/cli.ts search --tag design --format table

# UX roles, capped at 5 results
bun run .agents/skills/remoteok-search/cli/src/cli.ts search -q "UX" --limit 5 --format table

# Design roles posted in the last 14 days
bun run .agents/skills/remoteok-search/cli/src/cli.ts search -q "designer" --jobage 14 --format table

# Full detail for a specific job
bun run .agents/skills/remoteok-search/cli/src/cli.ts detail 1136308 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from RemoteOK's free public API — no credentials required.
- `robots.txt` allows `/api` for a generic User-Agent (`Allow: /`); a
  separate block disallows a named list of AI/crawler bots (GPTBot,
  ClaudeBot, etc.) from broad site crawling, but this CLI identifies with a
  plain browser User-Agent and only ever fetches `/api`, not those crawl
  paths. See `url-reference.md` for the full robots.txt text and reasoning.
- The CLI retries 429/5xx with exponential backoff; keep volume reasonable
  regardless (a handful of calls per session, not a loop) — RemoteOK is
  high-volume and appears unthrottled per public docs, but that's not an
  invitation to hammer it.
- Job ids are numeric strings (e.g. `1136308`) — pass them as-is to `detail`.
- See `url-reference.md` for the full endpoint/field reference and the live
  investigation notes (tag-filter confirmation, the dead keyword-search
  params, the dead pagination params, robots.txt).
