---
name: weworkremotely-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for remote design/product-design jobs
  on We Work Remotely, a worldwide English-language remote job board. Invoke for open
  positions, vacancies, remote openings, and design/UX/product-design roles across any
  company or region — the board is worldwide-remote with no single country focus. Trigger
  phrases: find a remote job, we work remotely, WWR jobs, remote design jobs, remote UX
  jobs, remote product designer jobs, worldwide remote positions, look up this WWR posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/weworkremotely-search/cli/src/cli.ts *)
---

# We Work Remotely Search Skill

Search live job listings from We Work Remotely's public **Design-category RSS feed** —
worldwide remote, English-language postings, no single-country focus. No authentication,
no API key, and **zero runtime dependencies** — it runs with just `bun`.

## Portal quirk: `--query` is a client-side filter, not a server search

`https://weworkremotely.com/categories/remote-design-jobs.rss` is a **fixed-category
feed** (Design), not a keyword-search endpoint — there is no server-side query parameter.
`search -q "<term>"` downloads the feed (~90 recent Design postings at any given time) and
keeps only items whose title or company contains the term as a case-insensitive substring.
Narrower queries don't reduce what's fetched, only what's kept. See `url-reference.md` for
the full portal-quirk write-up.

## Portal quirk: `detail` re-fetches the feed instead of scraping the job page

Individual job-posting pages (and the WWR homepage) sit behind a Cloudflare JS challenge
and return `403` to a plain automated fetch — confirmed live, not a `robots.txt`
restriction (robots.txt allows `/remote-jobs/` and `/categories/`). Since the RSS feed's
`<description>` already contains the **entire** posting body, `detail <id>` re-fetches the
same RSS feed and reads the matching item's description, rather than making a second
request to the job's own page. No extra HTTP fetch per `detail` call, and it can't be
blocked the way a page-scrape would be.

## When to use this skill

- Search for worldwide-remote design/product-design/UX job openings
- Filter by recency (posted within N days)
- Get the full description of a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword filter (title, company). **Client-side** — see quirk note above.
- `--jobage <days>` — posted within N days, filtered client-side against `pubDate`. Omit for all postings currently in the feed.
- `--page <n>` — page number (1-indexed, 20 results/page, client-side — the feed has no pagination param).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

> **Location note**: there is no `--location` flag — the feed is worldwide by design and
> most postings don't name a specific city in the title. Each result's `location` field is
> a best-effort value from the feed's `<region>` tag (e.g. `"Anywhere in the World"`,
> `"Remote"`, or a specific place). To narrow by geography, add the place name to
> `--query` (weak — most results won't match on this) rather than relying on a dedicated flag.

### Fetch full job detail

```bash
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the URL slug from a `search` result's `id` field (e.g.
`acme-inc-product-designer`), or a full `weworkremotely.com/remote-jobs/...` URL. Returns
the full description, employment type, skills, and eligible-countries text.

## Usage examples

```bash
# Product designer roles, worldwide remote
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts search -q "Product Designer" --limit 5 --format table

# Broader UX search, last 14 days
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts search -q "UX" --jobage 14 --format table

# All current Design postings, table view
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts search --format table

# Full details for a specific posting
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts detail acme-inc-product-designer --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from We Work Remotely's public Design-category RSS feed — no credentials required.
- The feed returns a fixed, rolling window of recent postings (roughly 90 at time of
  writing) — there is no true pagination or total-count endpoint; `--page`/`--limit` are
  both applied client-side after fetching.
- `robots.txt` allows `/categories/` and `/remote-jobs/`; no personal-use warning is
  required the way `linkedin-search` needs one. The only real access constraint is the
  Cloudflare challenge on job-detail/home pages, which `detail`'s design avoids entirely.
- Job IDs are URL slugs (e.g. `acme-inc-product-designer`), not numeric — pass them as-is to `detail`.
- Title parsing splits on the first `": "` (`"Company: Job Title"`); a title with no colon
  is returned with `company: null` and the full string as `title`.
