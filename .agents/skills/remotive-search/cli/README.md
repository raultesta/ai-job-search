# remotive-cli

CLI for searching worldwide-remote job listings on Remotive's free public
JSON API, across any sector but especially design/product roles.

**Data source**: `https://remotive.com/api/remote-jobs` (Remotive's public API — `github.com/remotive-io/remote-jobs-api`).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **⚠️ Rate limit.** Remotive advises max ~4 requests/day to this endpoint
> and will block excessive callers (>2/min). Every `search`/`detail` call
> hits the same endpoint — don't loop, poll, or script repeated calls. See
> `../url-reference.md` for the full terms and the live-tested filtering
> quirk this CLI works around (client-side keyword filtering, since the
> API's own `category`/`search` params were observed not being applied
> server-side).

## Installation

```bash
cd .agents/skills/remotive-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (keyword-filtered client-side) |
| `detail` | Fetch full detail for a single job listing by id or URL |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Product design roles, worldwide remote
bun run src/cli.ts search -q "Product Designer" --format table

# UX roles, capped at 5 results
bun run src/cli.ts search -q "UX" --limit 5 --format table

# Full detail for one job
bun run src/cli.ts detail 2091081 --format plain
```

See `../SKILL.md` for the full flag reference and the rate-limit note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title / skill / role). Filtered client-side. |
| `--category` | | Remotive category slug. Default: `design`. Sent best-effort. |
| `--jobage` | | Posted within N days, filtered client-side. |
| `--page` | | 1-indexed page (10 results/page) over the filtered set. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## Why no `--location` flag

Remotive's API has no location/country search parameter. Every result's
`location` field carries `candidate_required_location` verbatim (e.g.
`"Worldwide"`, `"USA"`, `"Europe, UK, Germany, France"`) for downstream
eligibility filtering to use instead.
