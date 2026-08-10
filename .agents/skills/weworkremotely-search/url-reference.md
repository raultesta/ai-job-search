# We Work Remotely URL Reference

Public, unauthenticated RSS feed. Worldwide remote job board, English-language postings.
Investigated live on 2026-08-08.

## Search (RSS feed, fixed category — no keyword param)

```
GET https://weworkremotely.com/categories/remote-design-jobs.rss
```

There is **no server-side keyword-search endpoint**. This URL is a fixed-category feed
(Design) that returns the site's most recent postings in that category — roughly 90 items
at time of writing. The CLI's `--query`/`-q` is a **client-side filter**: it downloads the
full feed and keeps only items whose title or description contains the query as a
case-insensitive substring. There is no `--query` value that reaches the server; requesting
a narrower query does not reduce the amount fetched, only what's kept after the fetch.

Other WWR category feeds follow the same `/categories/<slug>.rss` pattern (e.g.
`remote-programming-jobs.rss`, `remote-customer-support-jobs.rss`) but this skill only wires
up the Design category, since that's the relevant one for product-design job search.

### `<item>` structure (confirmed live, 2026-08-08)

```xml
<item>
  <media:content url="https://wwr-pro.s3.amazonaws.com/logos/.../logo.gif" type="image/png"/>
  <title>Kazaar Fragrances: Brand &amp; Creative Designer (Freelance, 100% Remote)</title>
  <region>Anywhere in the World</region>
  <country>🇦🇩 Andorra, 🇦🇪 United Arab Emirates, ...</country>
  <state>Thurgau</state>
  <skills>Ad Design, Adobe Photoshop, Figma, ...</skills>
  <category>Design</category>
  <type>Full-Time</type>
  <description>&lt;p&gt;...full HTML-escaped job posting body...&lt;/p&gt;</description>
  <pubDate>Fri, 07 Aug 2026 09:59:18 +0000</pubDate>
  <expires_at>Sun, 06 Sep 2026 09:59:18 +0000</expires_at>
  <guid>https://weworkremotely.com/remote-jobs/kazaar-fragrances-brand-creative-designer-freelance-100-remote</guid>
  <link>https://weworkremotely.com/remote-jobs/kazaar-fragrances-brand-creative-designer-freelance-100-remote</link>
</item>
```

Field notes:

| Field | Notes |
|-------|-------|
| `<title>` | Almost always `"<Company>: <Job Title>"`. The CLI splits on the **first** `": "`. A handful of postings have no colon (rare); the CLI falls back to `company: null, title: <full string>`. |
| `<region>` | Never empty in the sample fetched (90/90 items populated). Common values: `"Anywhere in the World"`, `"Remote"`, or a specific place (US state, city, or country subdivision, e.g. `"Berlin"`, `"Texas"`, `"Distrito Nacional"`). Used as the primary `location` source. |
| `<country>` | Comma-separated list of eligible countries, each prefixed with a flag emoji (e.g. `"🇩🇪 Germany, 🇩🇰 Denmark"`). Often empty even when `<region>` is populated. Used as a secondary detail field, not the primary `location`. |
| `<state>` | US state or sub-region when applicable; often empty. Not surfaced as a separate field — folded into `location` only if `<region>` is empty (never observed, but defensive). |
| `<skills>` | Comma-separated skill tags. Surfaced only in `detail` output, not in `search` result rows. |
| `<category>` | Always `"Design"` for this feed. Not surfaced (redundant). |
| `<type>` | Employment type, e.g. `"Full-Time"`. Surfaced in `detail` output. |
| `<description>` | HTML-escaped (entities like `&lt;p&gt;`, not CDATA — confirmed no `<![CDATA[` anywhere in the feed). Contains the **entire** job posting body (headquarters, about, responsibilities, requirements, how-to-apply), not a snippet. This means `detail` never needs a second HTTP request — see below. |
| `<pubDate>` | RFC 822 format (`Fri, 07 Aug 2026 09:59:18 +0000`), parses directly with `new Date(...)`. Used as `date` and for `--jobage` filtering. |
| `<guid>` / `<link>` | Identical in every sampled item — the job's canonical URL, `https://weworkremotely.com/remote-jobs/<slug>`. The CLI uses the URL's trailing `<slug>` as the result `id` (WWR RSS items carry no numeric ID). |

XML parsing: items never nest, so the CLI splits the feed with a non-greedy
`/<item>([\s\S]*?)<\/item>/g` match, then parses each chunk independently with per-tag
regexes — one malformed item cannot break the rest (same chunk-then-parse convention as
`linkedin-search`'s `parseJobCards`). No CDATA sections were found, so a plain
`&entity;`-decode + tag-strip pass is sufficient; no XML/DOM library needed.

## Detail — quirk: the job page is Cloudflare-walled, so `detail` re-fetches the RSS feed instead

The spec pattern (fetch the RSS item's `<link>` and scrape the HTML) **does not work here**.
Live checks on 2026-08-08:

```
GET https://weworkremotely.com/                                    -> 403 (cf-mitigated: challenge)
GET https://weworkremotely.com/categories/remote-design-jobs        -> 200 (HTML listing page, works)
GET https://weworkremotely.com/categories/remote-design-jobs.rss    -> 200 (RSS feed, works)
GET https://weworkremotely.com/remote-jobs/<any-slug>               -> 403 (cf-mitigated: challenge)
```

Individual job-posting pages and the homepage sit behind a Cloudflare JS challenge and return
`403` to a plain `fetch`/`curl` request regardless of User-Agent — this is a bot-detection
wall, not a `robots.txt` restriction (robots.txt allows `/remote-jobs/` and `/categories/`;
only `/admin/`, `/account/`, `/job-seekers/account/`, `/job-seekers/profile/`,
`/manage-company/` are disallowed). Since the RSS `<description>` already contains the full
posting body (see above), there's no need to fight the challenge: **`detail <id|url>`
re-fetches the same RSS feed, finds the item whose `<link>` slug matches the requested id,
and returns its already-complete `<description>`.** No second HTTP request per detail call —
simpler and more reliable than the page-scrape pattern, at the cost of re-downloading the
~90-item feed on every `detail` call (acceptable at this volume; the feed is small, `ttl` 60
minutes).

## robots.txt (fetched live, 2026-08-08)

```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /account/
Disallow: /job-seekers/account/
Disallow: /job-seekers/profile/
Disallow: /manage-company/
Disallow: /*edit?token=/
Disallow: /*cancel?token=/
Sitemap: https://weworkremotely.com/sitemap.xml
```

`/categories/`, `/remote-jobs/`, and the `.rss` feed are all allowed. No personal-use warning
required by ToS/robots.txt (unlike `linkedin-search`); the only real constraint is the
Cloudflare challenge on job-detail/home pages, which the `detail` design above avoids
entirely by never fetching those pages.

## `--jobage` mapping

The feed has no server-side age parameter (RSS always returns the current recent-postings
window — no pagination or offset either). `--jobage <days>` is applied **client-side**: after
parsing, items whose `pubDate` is older than N days are dropped. This is imprecise in one
direction only — it can never surface postings older than what the feed currently carries
(WWR's own feed retention, effectively a rolling recent-postings window), but it never returns
false-fresh results either.

## `--page` / `--limit`

No pagination parameter exists on the feed — it always returns the same fixed set of recent
items. `--page` and `--limit` are both applied client-side: the (query + jobage)-filtered
result array is paginated with a fixed page size of 20 (`--page 2` returns items 21-40 of the
filtered set, etc.), then `--limit` caps the final emitted count.

## `--location`

No location query parameter exists. Location is a derived, best-effort field per result
(from `<region>`, see field notes above), not a filterable server param. Per the
`jobindex-search` convention: to narrow by place, add the place name to `--query` and it will
match against title/description text (most WWR design postings don't mention a specific city
in the title, so this is weak — `--query` narrowing works far better for role/skill terms than
for geography on this portal).
