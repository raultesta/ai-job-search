# remoteok-cli

CLI for searching worldwide-remote job listings on RemoteOK's free public
JSON API, across any sector but especially tech/design roles.

**Data source**: `https://remoteok.com/api` (RemoteOK's public API).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Note on filtering.** RemoteOK's `tag` parameter genuinely filters
> server-side (confirmed live). Its `search`/`q`/`position` keyword
> parameters and `page`/`limit`/`offset` pagination parameters do **not** —
> all were tested and silently ignored. This CLI fetches the (optionally
> tag-filtered) fixed ~100-job window RemoteOK returns and does keyword
> filtering, ranking, and pagination client-side. See `../url-reference.md`
> for the full live-test findings.

## Installation

```bash
cd .agents/skills/remoteok-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (tag-filtered server-side + keyword-filtered client-side) |
| `detail` | Fetch full detail for a single job listing by id or URL |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Product design roles, worldwide remote
bun run src/cli.ts search -q "Product Designer" --format table

# Design-tagged roles (server-side tag filter), capped at 5 results
bun run src/cli.ts search --tag design --limit 5 --format table

# Full detail for one job
bun run src/cli.ts detail 1136308 --format plain
```

See `../SKILL.md` for the full flag reference.

## Search flags

| Flag | Alias | Description |
|------|-------|--------------|
| `--query` | `-q` | Keywords (title / company / tags / description). Filtered client-side. |
| `--tag` | | RemoteOK tag slug (e.g. `design`, `dev`). Applied server-side. |
| `--jobage` | | Posted within N days, filtered client-side. |
| `--page` | | 1-indexed page (10 results/page) over the filtered set. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## Why no `--location` flag

RemoteOK's API has no location/country search parameter. Every result's
`location` field carries RemoteOK's free-text `location` value verbatim
(often just a city with no country, or blank for fully-remote-anywhere
roles) for downstream eligibility filtering to use instead.
