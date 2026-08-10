import { fetchJobs, toJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

// No id-based detail endpoint exists on Remotive's API (confirmed against
// the official docs — see url-reference.md). We re-fetch a large unfiltered
// window and look the id up client-side. Every job object already carries
// its full description, so no second request is needed once found.
const FETCH_LIMIT = 250

/** Accept a raw numeric id or a full remotive.com job URL ending in -<id>. */
function normalizeId(input: string): string | null {
  const bare = input.match(/^\d+$/)
  if (bare) return input
  const fromUrl = input.match(/-(\d+)(?:[/?]|$)/)
  if (fromUrl) return fromUrl[1]
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const jobs = await fetchJobs({ limit: FETCH_LIMIT })
    const job = jobs.find((j) => String(j.id) === id)
    if (!job) {
      writeError(
        `Job ${id} not found in the current listing window (Remotive has no id-based lookup endpoint — see url-reference.md)`,
        "NOT_FOUND",
      )
      return 1
    }
    const detail = toJobDetail(job)

    if (opts.format === "plain") {
      const lines = [
        detail.title,
        `${detail.company || "—"} · ${detail.location || "—"}`,
        "",
        detail.category ? `Category: ${detail.category}` : "",
        detail.jobType ? `Type: ${detail.jobType}` : "",
        detail.salary ? `Salary: ${detail.salary}` : "",
        "",
        detail.description || "(no description)",
        "",
        `URL: ${detail.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(detail, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
