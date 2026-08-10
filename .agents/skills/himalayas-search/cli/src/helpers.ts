// Data source: Himalayas' free public JSON API
// (https://himalayas.app/jobs/api and https://himalayas.app/jobs/api/search).
// No authentication required. See ../../url-reference.md for the full field
// reference and the live-investigation notes this file works from.
//
// Unlike Remotive, Himalayas' server-side `q` keyword filter and its other
// search params (country/seniority/employment_type/company/timezone/sort)
// were confirmed live to actually narrow results — this CLI trusts the
// server and does not re-filter client-side.
//
// ATTRIBUTION (Himalayas' own terms, quoted in url-reference.md): "If you
// display Himalayas job data on your own website or application, include a
// visible link back to himalayas.app and mention that the data is sourced
// from Himalayas." Every result carries its himalayas.app URL in `url` for
// exactly this reason — never strip it when displaying results downstream,
// and never resubmit this data to other job boards.

export const HIMALAYAS_BROWSE_URL = "https://himalayas.app/jobs/api"
export const HIMALAYAS_SEARCH_URL = "https://himalayas.app/jobs/api/search"

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
      // Himalayas returns 400 with a JSON body ({"ok":false,"errors":"..."})
      // for invalid enum params (seniority/employment_type/sort) — surface
      // that message rather than a bare status line when we can.
      let detail = ""
      try {
        const body = (await response.json()) as { errors?: string }
        if (body?.errors) detail = `: ${body.errors}`
      } catch {
        // ignore — body wasn't JSON, fall through to the generic message
      }
      throw new Error(`Request failed: ${response.status} ${response.statusText}${detail}`)
    }
    return response.json()
  }
  throw new Error("Request failed after max retries")
}

export interface HimalayasJob {
  title: string
  excerpt: string
  companyName: string
  companySlug: string
  companyLogo: string
  employmentType: string
  minSalary: number | null
  maxSalary: number | null
  salaryPeriod: string | null
  currency: string | null
  seniority: string[]
  locationRestrictions: string[]
  timezoneRestrictions: number[]
  categories: string[]
  parentCategories: string[]
  description: string
  pubDate: number
  expiryDate: number
  applicationLink: string
  guid: string
}

export interface HimalayasResponse {
  offset: number
  limit: number
  totalCount: number
  jobs: HimalayasJob[]
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
  seniority: string | null
  salary: string | null
  categories: string[]
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

/** Strip HTML from a Himalayas job description, preserving paragraph breaks. */
export function cleanDescription(html: string): string | null {
  if (!html) return null
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const text = decodeHtmlEntities(stripTagsKeepNewlines(withBreaks)).replace(/\n{3,}/g, "\n\n").trim()
  return text || null
}

/** Himalayas dates are Unix epoch seconds (confirmed live) — convert to ISO 8601. */
export function epochSecondsToISO(epoch: number | null | undefined): string | null {
  if (epoch === null || epoch === undefined || !isFinite(epoch) || epoch <= 0) return null
  const d = new Date(epoch * 1000)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

/** locationRestrictions: [] means worldwide-eligible (no country restriction). */
export function formatLocation(restrictions: string[] | null | undefined): string | null {
  if (!restrictions || restrictions.length === 0) return "Worldwide"
  return restrictions.join(", ")
}

/** Parse a job id (companySlug/jobSlug) out of a full himalayas.app job URL. */
export function parseIdFromUrl(url: string): string | null {
  const m = url.match(/\/companies\/([^/]+)\/jobs\/([^/?#]+)/)
  if (!m) return null
  return `${m[1]}/${m[2]}`
}

/** Build the stable id this CLI uses (companySlug/jobSlug) from a job's guid. */
export function jobId(job: HimalayasJob): string {
  return parseIdFromUrl(job.guid) ?? parseIdFromUrl(job.applicationLink) ?? job.guid
}

export function toJobCard(job: HimalayasJob): JobCard {
  return {
    id: jobId(job),
    title: job.title || "(untitled)",
    company: job.companyName || null,
    location: formatLocation(job.locationRestrictions),
    date: epochSecondsToISO(job.pubDate),
    url: job.applicationLink || job.guid || "",
  }
}

function formatSalary(job: HimalayasJob): string | null {
  if (!job.minSalary && !job.maxSalary) return null
  const currency = job.currency || ""
  const period = job.salaryPeriod || ""
  const range =
    job.minSalary && job.maxSalary
      ? `${job.minSalary}-${job.maxSalary}`
      : String(job.minSalary || job.maxSalary)
  return [currency, range, period].filter(Boolean).join(" ").trim() || null
}

export function toJobDetail(job: HimalayasJob): JobDetail {
  return {
    ...toJobCard(job),
    description: cleanDescription(job.description),
    employmentType: job.employmentType || null,
    seniority: job.seniority && job.seniority.length > 0 ? job.seniority.join(", ") : null,
    salary: formatSalary(job),
    categories: job.categories || [],
  }
}

/** Fetch the browse endpoint (unfiltered feed, offset/limit pagination, capped at 20/request). */
export async function fetchBrowse(opts: { offset?: number; limit?: number }): Promise<HimalayasResponse> {
  const params = new URLSearchParams()
  if (opts.offset) params.set("offset", String(opts.offset))
  if (opts.limit) params.set("limit", String(opts.limit))
  const url = `${HIMALAYAS_BROWSE_URL}?${params.toString()}`
  const data = (await jsonFetch(url)) as HimalayasResponse | null
  if (!data || !Array.isArray(data.jobs)) return { offset: 0, limit: 0, totalCount: 0, jobs: [] }
  return data
}

export interface SearchParams {
  q?: string
  country?: string
  worldwide?: boolean
  exclude_worldwide?: boolean
  seniority?: string
  employment_type?: string
  company?: string
  timezone?: string
  sort?: string
  page?: number
}

/** Fetch the search endpoint (server-side filtered — see url-reference.md for confirmed params). */
export async function fetchSearch(opts: SearchParams): Promise<HimalayasResponse> {
  const params = new URLSearchParams()
  if (opts.q) params.set("q", opts.q)
  if (opts.country) params.set("country", opts.country)
  if (opts.worldwide) params.set("worldwide", "true")
  if (opts.exclude_worldwide) params.set("exclude_worldwide", "true")
  if (opts.seniority) params.set("seniority", opts.seniority)
  if (opts.employment_type) params.set("employment_type", opts.employment_type)
  if (opts.company) params.set("company", opts.company)
  if (opts.timezone) params.set("timezone", opts.timezone)
  if (opts.sort) params.set("sort", opts.sort)
  if (opts.page && opts.page > 1) params.set("page", String(opts.page))
  const url = `${HIMALAYAS_SEARCH_URL}?${params.toString()}`
  const data = (await jsonFetch(url)) as HimalayasResponse | null
  if (!data || !Array.isArray(data.jobs)) return { offset: 0, limit: 0, totalCount: 0, jobs: [] }
  return data
}
