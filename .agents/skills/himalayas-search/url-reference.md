# Himalayas API Reference

Free, public, unauthenticated JSON API. Documented at
`https://himalayas.app/docs/remote-jobs-api`. Worldwide-remote listings,
English-language postings, no single-country focus.

Live-investigated 2026-08-08 (this file records exactly what was confirmed
against the real API, not just the docs page — the docs and the live
behavior agreed in every case tested).

## robots.txt

`https://himalayas.app/robots.txt`:

```
User-Agent: *
Allow: /
Disallow: /apply
```

Neither `/jobs/api` (browse) nor `/jobs/api/search` (search) is disallowed.
`/apply` is disallowed but not used by this CLI. Individual job detail pages
(`/companies/<slug>/jobs/<slug>`) sit behind Cloudflare bot-challenge ("Just a
moment...", HTTP 403 to a plain `curl`/`fetch` request) — see the Detail
section below for how this CLI works around that without needing those pages.

## Attribution requirement (from Himalayas's own docs — quote verbatim)

> "If you display Himalayas job data on your own website or application,
> include a visible link back to himalayas.app and mention that the data is
> sourced from Himalayas."

This CLI's `search` and `detail` output both carry each job's full
`https://himalayas.app/...` URL in the `url` field so any downstream display
of this data can honor that link-back requirement. Do not resubmit Himalayas
job data to other third-party job boards.

## Rate limits & caching

Docs: *"The data is cached and refreshed every 24 hours, so there is no
benefit to polling more frequently than once per day."* Exceeding the
(undocumented threshold) rate limit returns `429 Too Many Requests`, which
this CLI retries with exponential backoff. Given the 24h cache, there is no
reason to call this CLI more than a handful of times per session.

## Browse endpoint (full unfiltered feed)

```
GET https://himalayas.app/jobs/api?offset=<n>&limit=<n>
```

| Param | Meaning | Confirmed behavior |
|-------|---------|---------------------|
| `offset` | Jobs to skip | Default `0` |
| `limit` | Jobs per request | Default `20`. **Hard-capped at 20 server-side** — requesting `limit=50` still returns exactly 20 jobs and the response's own `limit` field reports `20`, not 50. |

## Search endpoint (filtered)

```
GET https://himalayas.app/jobs/api/search?q=<term>&country=<c>&worldwide=<bool>&exclude_worldwide=<bool>&seniority=<s>&employment_type=<e>&company=<slug>&timezone=<tz>&sort=<order>&page=<n>
```

All live-tested 2026-08-08 with real requests:

| Param | Meaning | Confirmed live |
|-------|---------|-----------------|
| `q` | Free-text keyword, server-side | **Works correctly.** `q=Product Designer` returned 509 total matches, every title on the first two pages contained "Product Designer" or "Designer". Unlike Remotive, Himalayas' server-side keyword filter is reliable — this CLI trusts it and does not re-filter client-side. |
| `country` | Country name filter | Works. `country=Portugal` returned jobs whose `locationRestrictions` included `"Portugal"` **plus** jobs with no restriction (worldwide-eligible) mixed in — the server appears to treat "no restriction" as implicitly eligible for any country query. Use `exclude_worldwide=true` alongside it to strip those out if you want country-restricted-only results. |
| `worldwide` | Worldwide-only filter | Works. `worldwide=true` returned jobs with empty `locationRestrictions` (i.e. no country restriction = open worldwide). |
| `exclude_worldwide` | Exclude worldwide-only jobs when `country` is also set | Works. Confirmed: with `country=Portugal&exclude_worldwide=true`, the previously-appearing empty-`locationRestrictions` job ("Design Director") was no longer present. |
| `seniority` | One or more seniority values | Works. `seniority=Senior` returned only jobs with `"seniority":["Senior"]`. Invalid values (tested `seniority=Bogus`) return **HTTP 400** `{"ok":false,"errors":"Invalid seniority"}` — so it's a closed enum, not free text. Confirmed valid value: `Senior`. The job objects themselves show other values in the wild (e.g. `Mid-level`) — pass the exact string as it appears in a job's own `seniority` array. |
| `employment_type` | One or more employment-type values | Works, but **must exactly match the string as returned in job objects**, URL-encoded (e.g. `Full%20Time`, not `full_time` or `Contract`). Tested `employment_type=Contract` → **HTTP 400** `{"ok":false,"errors":"Invalid employment_type"}`; `employment_type=Full Time` → HTTP 200, 840 total matches, all with `"employmentType":"Full Time"`. Closed enum, same pattern as `seniority`. |
| `company` | One or more company slugs | Works. `company=wave-hq` (no `q`) returned exactly 1 job, `companySlug: "wave-hq"`. `company=spotme` alone (no `q`) returned all 6 of that company's live postings — this is the mechanism `detail` uses to look up a single job (see below), since there's no per-job GET endpoint. |
| `timezone` | Timezone offset filter | Accepted (`timezone=-5` → HTTP 200), did not error, but result-set narrowing wasn't independently re-verified beyond "doesn't 400". Documented as supported per Himalayas' own docs. |
| `sort` | Sort order | Only `sort=recent` was confirmed to return HTTP 200. Tried `newest`, `date_desc`, `date_asc`, `relevance`, `latest`, `publish_date_desc` — all returned **HTTP 400** `{"ok":false,"errors":"Invalid sort"}`. Closed enum; `recent` is the only confirmed-valid value. Omit the flag to get the default (relevance-weighted when `q` is set).
| `page` | 1-based results page | Works. Page 1 and page 2 of `q=Product Designer` returned disjoint job sets (20 results/page, `offset`/`limit` echoed in the response). |

**No `limit` override on the search endpoint** — tested `limit=5`, the
response still carried `"limit":20` and returned 19-20 jobs (page size is
fixed at 20, not adjustable per the docs' stated 20/request cap). This CLI's
own `--limit` flag caps client-side after fetching a page.

### Response shape (both endpoints, identical job schema)

```json
{
  "comments": "...",
  "updatedAt": 1786214891,
  "offset": 0,
  "limit": 20,
  "totalCount": 99694,
  "jobs": [ { ...one job object... } ]
}
```

Per-job fields (confirmed live against real responses):

| Field | Maps to | Notes |
|-------|---------|-------|
| `title` | `title` | |
| `companyName` | `company` | |
| `companySlug` | (used to build `id`) | Stable slug, e.g. `spotme`. |
| `guid` | (used to build `id` and `url`) | Full URL, e.g. `https://himalayas.app/companies/spotme/jobs/technical-support-specialist-us-remote`. **No numeric/opaque id field exists in the API** — `guid` (identical to `applicationLink` in every job checked) is the closest thing to a stable identifier. |
| `applicationLink` | `url` | Same value as `guid` in every job checked live. Points to the job's own himalayas.app page — this is the link the attribution requirement above is about. |
| `locationRestrictions` | `location` | Array of country names, or `[]` when worldwide-eligible (no restriction). Joined to a comma-separated string for `location`, or `"Worldwide"` when empty. |
| `timezoneRestrictions` | (informational, detail only) | Array of UTC offset integers. |
| `pubDate` | `date` | **Unix epoch seconds**, not ISO string (e.g. `1786207825`). Converted to ISO 8601 for the `date` field. |
| `expiryDate` | (informational, detail only) | Unix epoch seconds. |
| `excerpt` | (informational, detail only, short teaser) | Plain text, short. |
| `description` | `description` (detail only) | Sanitized HTML, already present on **every** job object returned by both browse and search — no second fetch is needed to get the full description once a job is located. |
| `employmentType` | `employmentType` (detail only) | e.g. `"Full Time"`. |
| `seniority` | `seniority` (detail only) | Array, e.g. `["Senior"]`. |
| `minSalary` / `maxSalary` / `salaryPeriod` / `currency` | `salary` (detail only, composed) | Frequently `null`/`None` in practice. |
| `categories` / `parentCategories` | (informational only, not in the required JSON shape) | Free-text category slugs. |

## Detail (no per-job GET endpoint — worked around)

There is **no** `GET /jobs/api/<id>` endpoint, and the job's own himalayas.app
page (`guid`/`applicationLink`) sits behind a Cloudflare bot challenge that
returns HTTP 403 "Just a moment..." to a plain `fetch`/`curl` request — so
`detail` cannot simply fetch that URL and scrape it.

**Workaround (live-confirmed):** every job object already carries its full
`description` HTML inline, whether it came from the browse or the search
endpoint. This CLI treats a job's id as `<companySlug>/<jobSlug>` (parsed out
of `guid`'s path, e.g. `spotme/technical-support-specialist-us-remote`), and
`detail <id>` re-queries the **search** endpoint scoped to
`company=<companySlug>` (no `q`) — confirmed live to return every live
posting for that company (6 jobs for `company=spotme`) — then matches the
specific job by comparing the `jobSlug` portion of each candidate's `guid`.
This is cheap (one targeted request narrowed by company, not a full-feed
crawl) and avoids the Cloudflare-walled detail page entirely. If the id's
company slug no longer has that job live (posting expired/removed), `detail`
returns `NOT_FOUND`.

`detail` also accepts a full himalayas.app job URL directly (e.g.
`https://himalayas.app/companies/spotme/jobs/technical-support-specialist-us-remote`)
and parses the same `<companySlug>/<jobSlug>` pair out of it.

## Notes

- No authentication, no API key.
- Dates (`pubDate`, `expiryDate`) are Unix epoch **seconds**, not milliseconds
  or ISO strings — confirmed by converting a live `pubDate` value to a
  2026 date matching the job's apparent freshness.
- `location` is derived, not a literal API field: `locationRestrictions: []`
  means worldwide-eligible (no country restriction) and is surfaced as
  `"Worldwide"`; a non-empty array is joined with `", "`.
- `seniority` and `employment_type` are **closed enums** server-side (HTTP
  400 on an invalid value) — this CLI passes user-supplied values through
  as-is and surfaces the API's own 400 error rather than guessing a
  client-side validation list.
- `sort` only confirmed valid with the literal value `recent`; anything else
  tried returned 400.
