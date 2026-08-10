# Search Queries for Job Scraper

<!-- SETUP: Customize these queries based on your skills, target roles, and location -->

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search` and `freehire-search`; Danish demos and any skill you add with `/add-portal` are included the same way. You do **not** need a matching `site:` line below for those CLIs to run.

The `site:` query templates in this file are the **WebSearch fallback** — for portals without a CLI, company career pages, or when a CLI fails.

**Language scope:** write every query category in every language listed in your CLAUDE.md Languages table (typically 1-2, sometimes more). A posting requiring a language you have *not* declared, as a job condition, is excluded before scoring; a posting requiring a *higher level* than you declared in a language you *do* work in is flagged for your own judgment, not excluded — see `04-job-evaluation.md`'s Language Gate, the single source of truth for this rule. Translate each category's keywords rather than machine-translating word-for-word (e.g. "Frontend Developer" -> "Desarrollador Frontend", not a literal word-for-word translation) if you work in more than one language.

## Search Sites

Primary (remote-first, worldwide - no single "home market" board since the candidate is remote-only and location-agnostic):
- **linkedin.com/jobs** - LinkedIn job listings (filter: Remote); also covered by `linkedin-search` CLI
- **freehire-search CLI** - remote-first job board, covered automatically. **Use the `--region eu,global,none` facet** (or `--region eu,us,global,none` if you want US-remote-but-worldwide-eligible roles too) rather than an unfiltered query — an unscoped freehire search over-returns "Remote US"-only postings that fail the location gate downstream. See "Location Filter" below.
- **weworkremotely-search CLI** - We Work Remotely's Design-category RSS feed, worldwide remote, covered automatically. `--query` is a client-side filter (the feed has no server-side search param) — see `.agents/skills/weworkremotely-search/SKILL.md` for the full quirk write-up.
- **remotive-search CLI** - Remotive's free public JSON API, worldwide remote, covered automatically. `--query` is a client-side filter (Remotive's own `category`/`search` params were observed not being applied server-side — see `.agents/skills/remotive-search/url-reference.md`). **Rate-limited to ~4 requests/day per Remotive's own terms — do not loop or poll this CLI.**
- **himalayas-search CLI** - Himalayas' free public JSON API, worldwide remote, covered automatically. Server-side `--query`/`--country`/`--seniority`/`--employment-type` filters are confirmed reliable (unlike Remotive's) — see `.agents/skills/himalayas-search/url-reference.md`. **Attribution required: Himalayas' own terms require a visible link back to each job's himalayas.app URL and credit to Himalayas as the source whenever this data is displayed — never resubmit it to other job boards.**
- **remoteok-search CLI** - RemoteOK's free public JSON API, worldwide remote, high-volume (30,000+ listings), covered automatically. `--tag` (e.g. `design`) is confirmed to filter server-side, but `--query` is a client-side filter like Remotive's — RemoteOK's own `search`/`q`/`position` keyword params and its `page`/`limit`/`offset` pagination params were live-tested and found to be silently ignored server-side — see `.agents/skills/remoteok-search/url-reference.md`. Feed quality is noisier than the other installed CLIs (some spam-adjacent listings); no strict documented rate cap, but keep volume reasonable regardless.
- **wellfound.com** (formerly AngelList) - startup/Web3-heavy remote roles (optional, WebSearch fallback)
- **cryptocurrencyjobs.co / web3.career** - Web3/DeFi-specific boards (optional, WebSearch fallback)

## Installed MCP connectors

Not a portal CLI - an authenticated MCP connector already attached to this account. Call directly in Step 1 alongside the CLI portals.

- **Indeed** (`mcp__4fc4f9b3-fe43-4300-88f5-1b26a0c51ed6__search_jobs`) - requires `search` (keyword), `location` (use `"remote"`), and `country_code` (ISO 3166 two-letter, e.g. `PT`) - there is no single "worldwide" query, so run it once per relevant market (at minimum `PT`; add others like `DE`/`GB`/`US` if the query category warrants it). Follow up with `get_job_details` on promising hits for the full description and application link. **Caveat confirmed 2026-08-09: the connected Indeed profile (`get_resume`) has stale, wrong preference data (minimum salary listed as EUR40,000/year, preferred titles include "CMO"/"QA Tester") - do not use `get_resume`'s preferences to filter or influence search queries; only use `search_jobs`'s own explicit params, sourced from this file same as every other portal.** `get_company_data` is useful for the Job Evaluation Framework's Behavioral Fit research (ratings, culture, salary benchmarks by company) but is not a discovery tool - don't call it during Step 1.

Secondary (company career pages via Google):
- Direct Google searches with `site:` filters for known DeFi/Web3 and AI-native product companies

**Recommended additional sources (not yet installed as portal CLIs — see FIXER note 2026-08-07):**
- ~~**We Work Remotely**~~ - installed as the `weworkremotely-search` CLI (see Installed portal CLIs above, and `.agents/skills/weworkremotely-search/`); no longer a "not yet installed" candidate.
- ~~**Remotive**~~ - installed as the `remotive-search` CLI (see Installed portal CLIs above, and `.agents/skills/remotive-search/`); no longer a "not yet installed" candidate.
- **web3.career** - dedicated Web3/crypto job API (101k+ listings, design/product role filter, remote filter) but requires free signup for an API key (`docs.bondex.app`) — the account-creation step itself is out of scope for Claude to perform per this repo's safety rules, so this would need the user to obtain the key manually before `/add-portal` could wire it up.
- **Landing.jobs** - EU tech-marketplace board (Portugal-headquartered, pan-European remote listings), but its public API (`github.com/LandingJobs/LandingJobs-api`) only exposes authenticated per-company endpoints, not a general public search endpoint — likely not feasible as a clean `/add-portal` CLI without a partner key. Lower priority than Remotive/WWR.

## Query Categories

Queries are grouped by priority. Write **each category in every language from your Languages table** (see Language scope above). Combine each query with your location terms (e.g. your city, region, or metro area) where the site supports it.

### Priority 1: Lead / Senior Product Designer (DeFi & Web3)

These match the strongest and most desired career direction - continuing DeFi/Web3 product design leadership.

```
site:linkedin.com/jobs "Lead Product Designer" DeFi Remote
site:linkedin.com/jobs "Senior Product Designer" Web3 Remote
site:linkedin.com/jobs "Product Designer" DeFi OR Web3 OR RWA "Remote (EU)" OR "Remote (Worldwide)" OR "Remote - Europe"
"Product Designer" "DeFi" Remote job -"Remote US" -"US only"
"UX Architect" Web3 Remote
"Product Designer" "RWA" OR "real-world assets" Remote
```

Portuguese:
```
"Designer de Produto" DeFi remoto
```

### Priority 2: AI-Native Product Designer (broader, any industry)

Leans into the AI-assisted prototyping angle (Claude Code, Claude Design, Lovable, Figma Make) across any product domain.

```
site:linkedin.com/jobs "AI Product Designer" Remote
site:linkedin.com/jobs "Product Designer" "Figma Make" OR "Lovable" OR "Claude Code" OR "Cursor" Remote
"AI-native designer" Remote job
"Product Designer" "AI prototyping" Remote
"agent-native design" OR "agentic design" "Product Design" Remote
"Product Designer" "Claude Code" OR "Cursor" OR "Lovable" "Remote (EU)" OR "Remote Worldwide"
```

Portuguese:
```
"Designer de Produto" "IA" remoto
```

### Priority 3: Design Leadership (Head of Design / Design Director)

Adjacent leadership roles to pivot into.

```
site:linkedin.com/jobs "Head of Design" Remote
site:linkedin.com/jobs "Design Director" Remote
"Head of Design" DeFi OR Web3 Remote
"Design Lead" fintech Remote
"Head of Design" OR "Design Director" "Remote (EU)" OR "Remote Worldwide" -"Remote US"
```

### Priority 4: Broader Product Design / Consulting

Wider net for general remote product design roles.

```
site:linkedin.com/jobs "Product Designer" Remote design systems -"Remote US"
"UX Designer" Remote fintech
"Design Consultant" AI OR Web3 Remote
```

## Location Filter

The candidate is remote-only with no location or commute preference (worldwide). When evaluating results, apply only the remote-work filter, not a geographic one:
- Fully remote: acceptable, any country
- Hybrid or on-site required: excluded (hard deal-breaker, see CLAUDE.md)
- Relocation required: excluded

**FIXER note (2026-08-07):** a plain `Remote` keyword does not distinguish worldwide-remote from
`Remote US`/`Remote - US`-only postings — the batch this note responds to pulled in 6 US-only-remote
or on-site/hybrid postings out of 12 results, a majority. Two fixes now applied to reduce this at
search time rather than catching it only downstream during fit assessment:
1. Several query strings above now add `"Remote (EU)"`/`"Remote Worldwide"`/`-"Remote US"` qualifiers.
2. The freehire-search CLI call should pass `--region eu,global,none` (see Search Sites note above)
   so region-resolved US-only postings are excluded before they ever reach the candidate list.

This is a bias, not a hard filter — Google's `site:` operator and freehire's region facet cannot
perfectly separate "Remote US" from genuinely worldwide-remote roles, since many postings resolve
their region field to `us` even when the description text says "worldwide." **Always confirm the
posting's own structured location data (Ashby/Greenhouse job-board API, or the posting's explicit
"countries we consider" field) before writing a final REJECT on location** — see the 2026-08-07
candidates file for the Mural/Ethos Life/Kindred verification pattern to follow.

## Language Filter

Your working languages and levels are in CLAUDE.md's Languages table. When filtering scraped results, apply `04-job-evaluation.md`'s Language Gate: a posting requiring a language you haven't declared at all is excluded; a posting requiring a higher level than you declared in a language you do work in is not excluded, flag it clearly instead (see `job-scraper/SKILL.md`'s Step 3 "Quick Fit Assessment" for how the flag surfaces in `/scrape` output). Postings simply *written* in a language you don't work in, that don't require it on the job, are fine.

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape [focus_area]" -> relevant category queries + custom focus-specific queries
