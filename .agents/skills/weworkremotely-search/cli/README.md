# weworkremotely-cli

CLI for searching We Work Remotely's public **Design-category RSS feed** — worldwide
remote, English-language postings, any design-adjacent role.

**Data source**: `https://weworkremotely.com/categories/remote-design-jobs.rss`.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Portal quirk**: this is a fixed-category feed, not a keyword-search endpoint. `--query`
> filters the fetched feed client-side (title/company substring match) rather than
> narrowing what the server returns. See `../url-reference.md` for the full write-up,
> including why `detail` re-fetches the feed instead of scraping the job's own page
> (job pages are Cloudflare-challenge-walled; confirmed live).

## Installation

```bash
cd .agents/skills/weworkremotely-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Fetch the Design RSS feed and filter/paginate client-side |
| `detail` | Look up one posting's full description from the same feed |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Product design roles, worldwide remote
bun run src/cli.ts search -q "Product Designer" --limit 5 --format table

# Broader UX search, last 14 days
bun run src/cli.ts search -q "UX" --jobage 14 --format table

# Full detail for one posting (id is the URL slug from a search result)
bun run src/cli.ts detail acme-inc-product-designer --format plain
```

See `../SKILL.md` for the full flag reference and portal-quirk notes.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Client-side keyword filter against title/company. See portal-quirk note above. |
| `--jobage` | | Posted within N days — filtered client-side against `pubDate`. |
| `--page` | | 1-indexed page (20 results/page, client-side). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
