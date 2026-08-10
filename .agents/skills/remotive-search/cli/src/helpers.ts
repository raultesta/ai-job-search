// Data source: Remotive's free public JSON API (https://remotive.com/api/remote-jobs).
// No authentication required. See ../../url-reference.md for the full field
// reference and the live-tested quirk this file works around: as of the last
// investigation, the API's own `category`/`search` querystring filters were
// not being applied server-side (every request returned the same ~23
// most-recent jobs regardless of params). We still send those params (in
// case Remotive fixes it), but we never trust them — every result is
// filtered client-side against the requested query before being returned.

export const REMOTIVE_URL = "https://remotive.com/api/remote-jobs"

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

export interface RemotiveJob {
  id: number
  url: string
  title: string
  company_name: string
  category: string
  tags: string[]
  job_type: string
  publication_date: string
  candidate_required_location: string
  salary: string
  description: string
}

export interface RemotiveResponse {
  "job-count": number
  "total-job-count": number
  jobs: RemotiveJob[]
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
  category: string | null
  jobType: string | null
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

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
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

/** Strip HTML from a Remotive job description, preserving paragraph breaks. */
export function cleanDescription(html: string): string | null {
  if (!html) return null
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const text = decodeHtmlEntities(stripTagsKeepNewlines(withBreaks)).replace(/\n{3,}/g, "\n\n").trim()
  return text || null
}

/** Fetch a page of jobs from Remotive. category/search are sent best-effort
 * (see the file header note) but the caller must not rely on them alone. */
export async function fetchJobs(opts: {
  category?: string
  search?: string
  limit?: number
}): Promise<RemotiveJob[]> {
  const params = new URLSearchParams()
  if (opts.category) params.set("category", opts.category)
  if (opts.search) params.set("search", opts.search)
  if (opts.limit) params.set("limit", String(opts.limit))
  const url = `${REMOTIVE_URL}?${params.toString()}`
  const data = (await jsonFetch(url)) as RemotiveResponse | null
  if (!data || !Array.isArray(data.jobs)) return []
  return data.jobs
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
 * its title, description, or tags. Required because Remotive's own
 * `search`/`category` querystring filters were observed not to be applied
 * server-side (see url-reference.md). Jobs are ranked by number of matched
 * words (most first), title matches weighted above description-only matches,
 * ties broken by publication date (newest first). If the query is empty,
 * every fetched job is returned as-is (already newest-first from the API).
 */
export function filterAndRankJobs(jobs: RemotiveJob[], query?: string): RemotiveJob[] {
  if (!query || !query.trim()) return jobs
  const words = queryWords(query)
  if (words.length === 0) return jobs

  const scored = jobs
    .map((job) => {
      const title = (job.title || "").toLowerCase()
      const haystack = `${title} ${(job.description || "").toLowerCase()} ${(job.tags || []).join(" ").toLowerCase()}`
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
    return (b.job.publication_date || "").localeCompare(a.job.publication_date || "")
  })

  return scored.map((s) => s.job)
}

export function toJobCard(job: RemotiveJob): JobCard {
  return {
    id: String(job.id),
    title: job.title || "(untitled)",
    // Remotive returns "" (not omitted) for missing company/location/date;
    // normalize empty strings to null per the portal-skill contract.
    company: job.company_name || null,
    location: job.candidate_required_location || null,
    date: job.publication_date || null,
    url: job.url || "",
  }
}

export function toJobDetail(job: RemotiveJob): JobDetail {
  return {
    ...toJobCard(job),
    description: cleanDescription(job.description),
    category: job.category || null,
    jobType: job.job_type || null,
    salary: job.salary || null,
  }
}
