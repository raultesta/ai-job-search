// Data source: We Work Remotely's public Design-category RSS feed. No authentication
// required. There is no server-side keyword-search endpoint — the feed is a fixed
// recent-postings list, so `--query` is applied client-side against title/description.
//
// Individual job-posting pages (and the homepage) sit behind a Cloudflare JS challenge
// and return 403 to plain fetch/curl requests regardless of User-Agent — confirmed live,
// see ../../url-reference.md. Since the RSS <description> already carries the full
// posting body, `detail` re-fetches the same feed and reads the matching item's
// description instead of scraping the job page. No second HTTP request is made.

export const FEED_URL = "https://weworkremotely.com/categories/remote-design-jobs.rss"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch text with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function textFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  skills: string | null
  countries: string | null
  region: string | null
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points decode correctly, and
 * drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

// Strips tags but preserves newlines (only collapses horizontal whitespace), so callers
// that insert "\n" markers for <br>/block-close tags before calling this keep paragraph
// breaks in the output instead of losing them to a blanket \s+ collapse.
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
}

/** Extract the text of a simple (non-nesting) XML tag from a chunk. */
function tag(chunk: string, name: string): string | null {
  const m = chunk.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, "i"))
  if (!m) return null
  const raw = decodeXmlEntities(m[1]).trim()
  return raw === "" ? null : raw
}

/** Pull the trailing slug off a weworkremotely.com job URL — used as the result id. */
export function slugFromUrl(url: string): string {
  const m = url.match(/\/remote-jobs\/([^/?#]+)/)
  return m ? m[1] : url
}

/** Split "Company: Job Title" into its two parts. Falls back gracefully if there's no colon. */
export function splitTitle(raw: string): { company: string | null; title: string } {
  const idx = raw.indexOf(": ")
  if (idx === -1) return { company: null, title: raw }
  return { company: raw.slice(0, idx).trim() || null, title: raw.slice(idx + 2).trim() }
}

/** Best-effort location from <region> (always populated in practice) falling back to <country>. */
function deriveLocation(region: string | null, country: string | null): string | null {
  if (region) return region
  if (country) return country.split(",")[0]?.trim() || null
  return null
}

export interface RawFeedItem {
  title: string
  region: string | null
  country: string | null
  skills: string | null
  type: string | null
  description: string | null
  pubDate: string | null
  link: string
}

/**
 * Parse the RSS feed into raw per-item records. Items never nest, so we split on
 * non-greedy <item>...</item> boundaries and parse each chunk independently — one
 * malformed item cannot break the rest (same convention as linkedin-search's
 * chunk-then-parse HTML parsing).
 */
export function parseFeedItems(xml: string): RawFeedItem[] {
  const items: RawFeedItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(xml)) !== null) {
    const chunk = m[1]
    const title = tag(chunk, "title")
    const link = tag(chunk, "link") ?? tag(chunk, "guid")
    if (!title || !link) continue
    items.push({
      title,
      region: tag(chunk, "region"),
      country: tag(chunk, "country"),
      skills: tag(chunk, "skills"),
      type: tag(chunk, "type"),
      description: tag(chunk, "description"),
      pubDate: tag(chunk, "pubDate"),
      link,
    })
  }
  return items
}

function toCard(item: RawFeedItem): JobCard {
  const { company, title } = splitTitle(item.title)
  return {
    id: slugFromUrl(item.link),
    title,
    company,
    location: deriveLocation(item.region, item.country),
    date: item.pubDate ? new Date(item.pubDate).toISOString() : null,
    url: item.link,
  }
}

/** Search results: id/title/company/location/date/url per the portal-skill contract. */
export function parseJobCards(xml: string): JobCard[] {
  return parseFeedItems(xml).map(toCard)
}

/** Full detail for one item, matched by id (URL slug) against the freshly-fetched feed. */
export function findJobDetail(xml: string, id: string): JobDetail | null {
  const items = parseFeedItems(xml)
  const match = items.find((it) => slugFromUrl(it.link) === id)
  if (!match) return null
  const card = toCard(match)
  let description: string | null = null
  if (match.description) {
    // The feed's <description> is HTML-escaped once for XML (handled by tag()'s decode
    // pass, which is why <br>/<p> etc. are already real tags here) but the HTML source
    // itself has its own entities (e.g. "&amp;amp;" -> one XML-decode -> literal "&amp;"
    // text) — so decode entities a second time after stripping tags to get plain text.
    const withBreaks = match.description
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    description = decodeXmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, "\n\n").trim() || null
  }
  return {
    ...card,
    description,
    employmentType: match.type,
    skills: match.skills,
    countries: match.country,
    region: match.region,
  }
}

/** True if `text` contains `query` as a case-insensitive substring. */
export function matchesQuery(query: string, ...text: (string | null)[]): boolean {
  const q = query.toLowerCase()
  return text.some((t) => (t || "").toLowerCase().includes(q))
}

/** Client-side posting-age filter: keep items whose date is within N days of now. */
export function withinJobAge(dateIso: string | null, days: number): boolean {
  if (!days || days >= 9999) return true
  if (!dateIso) return true // unknown date — don't drop it
  const ageMs = Date.now() - new Date(dateIso).getTime()
  return ageMs <= days * 86400 * 1000
}
