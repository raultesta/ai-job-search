// Data source: RemoteOK's free public JSON API (https://remoteok.com/api).
// No authentication required. See ../../url-reference.md for the full field
// reference and the live-tested findings this file works around:
//   - The response array's first element is a legacy metadata/notice object,
//     not a job (it has no `id` field) — filtered out below.
//   - `tag`/`tags=<one tag>` filtering IS applied server-side (confirmed
//     live), unlike Remotive's broken filter.
//   - `search`/`q`/`position` keyword params and `page`/`limit`/`offset`
//     pagination params are all silently ignored server-side — there is no
//     keyword search or pagination on this API. We fetch the (optionally
//     tag-filtered) fixed ~100-job window and do keyword filtering/ranking
//     and pagination entirely client-side.

export const REMOTEOK_URL = "https://remoteok.com/api"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404. */
export async function jsonFetch(url: string): Promise<unknown | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
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
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.json()
  }
  throw new Error("Request failed after max retries")
}

export interface RemoteOKJob {
  id: string
  slug: string
  company: string
  position: string
  tags: string[]
  date: string
  location: string
  url: string
  apply_url: string
  description: string
  salary_min: number
  salary_max: number
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
  tags: string[]
  salary: string | null
}

function decodeHtmlEntities(text: string): string {
  function numericEntity(cp: number): string {
    return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
  }
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

/**
 * Strip HTML tags while preserving newlines already present in the input
 * (collapses only runs of spaces/tabs, not the \n itself). Used by
 * cleanDescription, which first converts block-level closing tags to \n.
 */
function stripTagsKeepNewlines(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim()
}

/**
 * Strip HTML from a RemoteOK job description, preserving paragraph breaks.
 * Note: RemoteOK descriptions routinely contain an anti-spam applicant-
 * screening line (e.g. "Please mention the word ... when applying") — this
 * is ordinary posting text aimed at human applicants, left untouched here
 * like the rest of the description. See url-reference.md.
 */
export function cleanDescription(html: string): string | null {
  if (!html) return null
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const text = decodeHtmlEntities(stripTagsKeepNewlines(withBreaks)).replace(/\n{3,}/g, "\n\n").trim()
  return text || null
}

/**
 * Fetch the current job window from RemoteOK. `tag` is sent server-side
 * (confirmed to genuinely filter, see url-reference.md); omit it to get the
 * plain unfiltered ~100-most-recent window. The response's first array
 * element is always a legacy metadata object (no `id` field) — filtered out
 * here rather than assumed to be at index 0, in case RemoteOK ever reorders
 * the array.
 */
export async function fetchJobs(opts: { tag?: string }): Promise<RemoteOKJob[]> {
  const params = new URLSearchParams()
  if (opts.tag) params.set("tag", opts.tag)
  const qs = params.toString()
  const url = qs ? `${REMOTEOK_URL}?${qs}` : REMOTEOK_URL
  const data = await jsonFetch(url)
  if (!Array.isArray(data)) return []
  return data.filter((j): j is RemoteOKJob => !!j && typeof j === "object" && "id" in j)
}

// Common short English stopwords to drop from matching. Deliberately does
// NOT include two-letter tech terms that are meaningful search words in this
// domain (UX, AI, ML, PM, QA, HR, ...) — only >=2 char words survive, and
// only these specific stopwords are excluded by name.
const STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "to", "for", "and", "or",
  "is", "at", "by", "as", "with", "from",
])

/** Split a query into words worth matching on (drop stopwords and 1-char noise). */
function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
}

/**
 * Client-side relevance filter: a job matches if any query word appears in
 * its title, company, tags, or description. Required because RemoteOK's API
 * has no keyword/title search parameter at all (see url-reference.md) — this
 * is the only filtering mechanism for free-text queries like "Product
 * Designer". Jobs are ranked by number of matched words (most first), title
 * matches weighted above tag/description-only matches, ties broken by date
 * (newest first). If the query is empty, every fetched job is returned as-is
 * (already newest-first from the API).
 */
export function filterAndRankJobs(jobs: RemoteOKJob[], query?: string): RemoteOKJob[] {
  if (!query || !query.trim()) return jobs
  const words = queryWords(query)
  if (words.length === 0) return jobs

  const scored = jobs
    .map((job) => {
      const title = (job.position || "").toLowerCase()
      const tags = (job.tags || []).join(" ").toLowerCase()
      const haystack = `${title} ${(job.company || "").toLowerCase()} ${tags} ${(job.description || "").toLowerCase()}`
      let score = 0
      for (const w of words) {
        if (title.includes(w)) score += 2
        else if (haystack.includes(w)) score += 1
      }
      return { job, score }
    })
    .filter((s) => s.score > 0)

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (b.job.date || "").localeCompare(a.job.date || "")
  })

  return scored.map((s) => s.job)
}

// Some RemoteOK listings carry literal newlines / control characters inside
// `position` (e.g. "IDEAS THAT\nSTICK.\nliterally <mojibake>", observed
// live) — upstream data quality, not a parsing bug (see url-reference.md).
// Collapse all whitespace runs (including embedded newlines) to a single
// space so table/plain output never breaks onto extra rows.
function cleanText(text: string | undefined | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim()
}

export function toJobCard(job: RemoteOKJob): JobCard {
  return {
    id: String(job.id),
    title: cleanText(job.position) || "(untitled)",
    // RemoteOK returns "" (not omitted) for missing company/location;
    // normalize empty/whitespace-only strings to null per the portal-skill
    // contract (location is often "City, " with a trailing empty country).
    company: cleanText(job.company).replace(/,\s*$/, "") || null,
    location: cleanText(job.location).replace(/,\s*$/, "") || null,
    date: job.date || null,
    url: job.url || "",
  }
}

export function toJobDetail(job: RemoteOKJob): JobDetail {
  const hasSalary = (job.salary_min ?? 0) > 0 || (job.salary_max ?? 0) > 0
  return {
    ...toJobCard(job),
    description: cleanDescription(job.description),
    tags: job.tags || [],
    salary: hasSalary ? `$${job.salary_min} - $${job.salary_max}` : null,
  }
}
