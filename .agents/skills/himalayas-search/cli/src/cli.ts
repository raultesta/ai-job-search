#!/usr/bin/env bun
// Self-contained CLI for searching worldwide-remote jobs on Himalayas' free
// public JSON API. No external CLI framework, so it runs anywhere `bun` is
// available with zero install beyond the repo clone.
//
// ATTRIBUTION REQUIRED (Himalayas' own terms — see ../url-reference.md):
// "If you display Himalayas job data on your own website or application,
// include a visible link back to himalayas.app and mention that the data is
// sourced from Himalayas." Every result carries its himalayas.app URL — keep
// it attached when you display or forward these results, and don't resubmit
// this data to other third-party job boards.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit", l: "location" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `himalayas-cli — search worldwide-remote jobs on Himalayas

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <companySlug/jobSlug|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>       Keywords (job title, skill, or role). Server-side filtered.
  --country <name>         Country filter, e.g. "Portugal". Server-side filtered.
  --worldwide               Worldwide-eligible jobs only (no country restriction).
  --exclude-worldwide       With --country: exclude worldwide-only jobs from the results.
  --seniority <value>       e.g. "Senior". Closed enum server-side (400 if invalid).
  --employment-type <value> e.g. "Full Time". Closed enum server-side (400 if invalid).
  --company <slug>          Filter to one company's postings, e.g. "spotme".
  --timezone <offset>       Timezone offset filter, e.g. "-5".
  --sort <order>            Only "recent" confirmed valid; omit for default relevance sort.
  --jobage <days>           Posted within N days (client-side filter on pubDate).
  --page <n>                1-indexed page (20 results/page, server-side). Default 1.
  --limit, -n <n>           Cap results emitted (client-side, per page).
  --format <fmt>            json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "Product Designer" --format table
  bun run src/cli.ts search -q "designer" --country Portugal --exclude-worldwide --format table
  bun run src/cli.ts detail spotme/technical-support-specialist-us-remote --format plain

ATTRIBUTION REQUIRED — Himalayas' own terms: link back to each job's
himalayas.app URL and credit Himalayas as the source when displaying this
data. Do not resubmit it to other job boards. See ../url-reference.md.
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n")
        return null
      }
      return val
    }

    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      flags.jobage = String(v)
    }
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }

    if (!["json", "table", "plain"].includes(fmt)) {
      process.stderr.write(JSON.stringify({ error: `--format must be json, table, or plain, got "${fmt}"`, code: "BAD_ARG" }) + "\n")
      return 1
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      country: typeof flags.country === "string" ? flags.country : undefined,
      worldwide: flags.worldwide === true,
      excludeWorldwide: flags["exclude-worldwide"] === true,
      seniority: typeof flags.seniority === "string" ? flags.seniority : undefined,
      employmentType: typeof flags["employment-type"] === "string" ? (flags["employment-type"] as string) : undefined,
      company: typeof flags.company === "string" ? flags.company : undefined,
      timezone: typeof flags.timezone === "string" ? flags.timezone : undefined,
      sort: typeof flags.sort === "string" ? flags.sort : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <companySlug/jobSlug|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
