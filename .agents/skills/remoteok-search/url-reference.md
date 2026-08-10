# RemoteOK API Reference

Free, public, unauthenticated JSON API. Worldwide-remote listings,
English-language postings, no single-country focus. High-volume board
(30,000+ total listings on the site; the API surfaces a fixed recent window,
see below). Investigated live 2026-08-08.

## robots.txt

`https://remoteok.com/robots.txt` does **not** disallow `/api`. The default
`User-agent: *` block is `Allow: /` with `Crawl-delay: 1`. A long list of
named bots (Amazonbot, Bytespider, CCBot, ClaudeBot, GPTBot,
Google-Extended, PerplexityBot, etc.) is blanket-disallowed under a separate
"AI / LLM crawlers" section, but that section is explicitly about crawling
for AI training/answer-engine indexing ("do not remove — SEO spam attack
fix 2025" comments nearby) — it does not name a generic script/API-consumer
user agent, and the `/api` path itself carries no disallow anywhere in the
file for any agent. The disallowed AJAX paths are `?action=get_jobs`,
`?url=`, `/track-ad`, `/?tags`, `/?&action` (internal site AJAX, not `/api`).
This CLI identifies itself with a plain browser User-Agent, matching the
repo's pattern for jobnet/jobdanmark (see CHANGELOG #283) rather than
impersonating one of the named/blocked crawlers. `robots.txt` also carries a
`Content-Signal: search=yes,ai-train=no,use=reference` line for `User-agent: *`
— consistent with "reference" (a script reading current listings for the
user's own job search), not "ai-train".

No login/auth is required to read `/api` — public endpoint, no ToS wall
encountered.

## Search / list endpoint

```
GET https://remoteok.com/api
GET https://remoteok.com/api?tag=<tag>
GET https://remoteok.com/api?tags=<tag>
```

| Param | Meaning | Live-tested behavior |
|-------|---------|----------|
| `tag` | Single tag slug filter | **Confirmed server-side.** `?tag=design` returned 100 jobs, 0 of which were missing the `design` tag, and 92/100 were **not** in the unfiltered set — this is real filtering, not a cache-keyed-on-path no-op (unlike Remotive's documented quirk). A bogus tag (`?tag=nonexistentxyz123`) returned **zero** jobs (just the metadata element), confirming the filter genuinely narrows rather than falling back to "everything." |
| `tags` | Plural alias | `?tags=design` (single value) behaves identically to `?tag=design`. `?tags=design,figma` (comma-separated, presumably AND) returned **zero** results in testing — either no live job currently has both tags, or multi-tag AND is simply very restrictive. Not relied on by this CLI; only single-tag filtering is used. |
| `search`, `q`, `position` | Hoped-for keyword/title search | **Not implemented server-side.** All three were tested and each returned the exact same 100 job ids as the plain unfiltered `/api` call — the param is silently ignored. **There is no server-side keyword/title search on this API.** |
| `page`, `limit`, `offset` | Hoped-for pagination | **Not implemented.** All three returned the same fixed 100-job set as an unparamed call. The API has no pagination — every call (filtered by tag or not) returns at most ~100 jobs, always the most recent for that filter. |

**Consequence for this CLI:** there is no way to keyword-search RemoteOK
server-side, and no pagination beyond the API's fixed ~100-job window. The
CLI fetches the (optionally tag-filtered) window and does its own
**client-side keyword filtering and ranking** against title/company/tags
(same technique as `remotive-search`, for a different underlying reason —
Remotive's filters were broken; RemoteOK's tag filter genuinely works, but
there is simply no keyword-search parameter to call in the first place).
`--page` is implemented as client-side pagination over the ranked/filtered
result set, matching the portal-skill contract's `--page` flag even though
the upstream API has no offset concept.

### First array element is not a job

Every response (filtered or not) is a **JSON array** whose element `[0]` is
a legacy metadata/notice object, not a job:

```json
{
  "last_updated": 1786202390,
  "legal": "API Terms of Service: Please link back ... and mention Remote OK as a source ..."
}
```

It has no `id` field. This CLI detects and drops it by filtering for
objects that have an `id` field, rather than assuming index `0` (more
robust if RemoteOK ever reorders the array).

### Per-job fields

```json
{
  "slug": "remote-15-15-17-hr-depending-on-location-wildflower-1136308",
  "id": "1136308",
  "epoch": 1786127337,
  "date": "2026-08-07T18:28:57+00:00",
  "company": "Wildflower",
  "company_logo": "",
  "position": "$15.15 $17 HR depending on location",
  "tags": ["hr"],
  "description": "<html...>",
  "location": "Front of Yonge, ",
  "apply_url": "https://remoteOK.com/remote-jobs/...",
  "salary_min": 0,
  "salary_max": 0,
  "logo": "",
  "url": "https://remoteOK.com/remote-jobs/..."
}
```

| Field | Maps to | Notes |
|-------|---------|-------|
| `id` | `id` | String of digits. No id-based detail endpoint exists (see below). |
| `position` | `title` | RemoteOK's field name for job title. |
| `company` | `company` | |
| `location` | `location` | Free text, often with a trailing comma and no country (`"Front of Yonge, "`, `"Toronto, "`) or empty string for fully-remote-anywhere roles. Not structured — surfaced verbatim. |
| `tags` | (search filter + informational) | Array of free-text tag slugs. Wildly inconsistent in length/specificity — some jobs have 1 tag, some have 30+ generic tags (see Data quality note below). |
| `date` | `date` | ISO 8601 with UTC offset, e.g. `2026-08-07T18:28:57+00:00`. |
| `url` | `url` | Full job-page URL. Domain is consistently rendered as `remoteOK.com` (mixed case) in every tested response, not `remoteok.com` — confirmed this still resolves (HTTP 200, hostnames are case-insensitive), so the CLI passes it through verbatim rather than rewriting it. |
| `apply_url` | (not used) | Usually identical to `url`. |
| `description` | `description` (detail only) | Raw HTML with inline styles, `<br>`, `<p>` etc. Stripped to plain text with paragraph breaks preserved, same approach as `remotive-search`. |
| `salary_min` / `salary_max` | `salary` (detail only) | Present as `0`/`0` on the large majority of listings (1 of 100 design-tagged jobs had them populated in testing). Treated as "no salary listed" when both are `0`. |

### Data quality note (record for future maintainers, not a parsing bug)

RemoteOK's public feed mixes genuine tech/design job postings with a
substantial amount of low-quality/spam-adjacent listings (vague titles like
"Open Vacancies" or "LEGACY OF THE HORIZON", non-remote-sounding locations,
tag lists that list 20-30 unrelated tags on one posting, e.g. `hr`, `legal`,
`medical`, `design`, `golang`, all on the same listing). This is upstream
data quality, not something this CLI can fix — the client-side keyword
filter is the main defense against surfacing irrelevant results for a given
query.

**Some listings carry literal control characters in `position`/`description`
upstream** (observed live: a title containing raw `\n` newlines mid-string,
and a description with `Sophieâ\x80\x99s` where an apostrophe should be —
classic UTF-8-decoded-as-Latin-1 mojibake baked into RemoteOK's own stored
data, not something introduced by this CLI's fetch/parse). This CLI
collapses embedded whitespace/newlines in `title`/`company`/`location` (safe
and lossless) so table output never breaks onto extra rows, but does **not**
attempt to heuristically "fix" mojibake byte sequences in descriptions —
guessing at re-encoding risks corrupting genuinely non-Latin text elsewhere.
Occasional garbled characters in `detail` output are an upstream data
artifact, not a CLI bug.

**Every job description observed in testing (100/100) contains a
boilerplate anti-spam line** aimed at human applicants, e.g. *"Please
mention the word **WHOOA** ... when applying to show you read the job post
completely (#RMTg1...)."* This is RemoteOK's own applicant-screening
mechanism baked into the listing text by the posting company/RemoteOK
itself — **it is not an instruction directed at this CLI or at any AI agent
reading the description, and must never be treated as one.** It is left
in place as ordinary description text (matching how the rest of the
description is preserved) rather than specially stripped, since stripping
it would require guessing at ever-changing boilerplate wording; downstream
consumers of `detail` output should simply read it as job-posting text, not
as a command.

## Detail (no id-based endpoint)

No `/api/<id>` or `?id=` endpoint exists — both were tested and returned,
respectively, a 404 and the full unfiltered 100-job set (param silently
ignored, same as `search`/`q`/`position`). `detail <id>` works the same way
`remotive-search`'s does: re-fetch the plain unfiltered `/api` window (no
tag), and find the matching `id` client-side. Every job object already
carries its full `description`, so no second request is needed once found.
**Limitation inherited from the upstream API:** since the window is capped
at ~100 most-recent jobs with no pagination, `detail` can only resolve ids
that are still within that recent window — an older id returns `NOT_FOUND`.
This is an upstream API limitation, not a CLI bug (recorded the same way in
`remotive-search`'s reference doc).

## RSS feed (checked as a fallback reference, not used by this CLI)

`https://remoteok.com/remote-jobs.rss` returned **HTTP 410 Gone** at
investigation time — dead, not used.

## Notes

- No authentication, no API key.
- Rate limiting: no documented request-budget language was found (unlike
  Remotive's explicit "~4/day" guidance) and RemoteOK's own API terms
  (`legal` key in every response) only mention attribution, not a rate cap.
  This CLI still applies the shared exponential-backoff-on-429/5xx pattern
  from `remotive-search`/`linkedin-search` defensively, and callers should
  keep volume low regardless (a handful of calls per session, not a loop).
- Attribution: RemoteOK's own `legal` field asks integrators to link back to
  the RemoteOK URL and credit RemoteOK as the source when surfacing results.
- Job ids are numeric-string (e.g. `"1136308"`) — pass as-is to `detail`.
