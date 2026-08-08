# The polite scraper — Books to Scrape

FlyRank Internship · Backend Track · Week 5 · Assignment A9

A small, polite scraping pipeline: it downloads the first three catalogue pages of
[Books to Scrape](https://books.toscrape.com), visits all 60 book pages, turns messy HTML into
clean, checked JSON records, survives a broken page without crashing, and ends every run with a
short report of what happened.

## Target classification (Stage 0)

- **Site:** `books.toscrape.com`
- **Why this site:** it is a public sandbox built specifically for scraping practice. The
  homepage says so directly: *"We love being scraped!"*
- **Scope:** the first 3 catalogue pages only (`page-1.html` → `page-2.html` → `page-3.html`,
  following the site's own "next" link — no page numbers are hardcoded), plus the 60 book detail
  pages linked from those 3 pages.
- **Data collected:** title, price, availability, star rating, description, and provenance
  (which page it came from and when it was fetched) — all fields already present in the HTML the
  server sends.
- **`robots.txt` check:** requesting `https://books.toscrape.com/robots.txt` returns **HTTP 404 —
  no robots file found**. A missing file is not permission by itself, so permission here comes
  from the site's own stated purpose as a scraping sandbox, not from an absent `robots.txt`.
- I will not reuse this code on another site without checking its rules and terms first.

## Ethics note

- Prefer an official API over scraping whenever one exists.
- Never bypass a login, a paywall, or an explicit block (a `403` or a disallowed `robots.txt`
  rule means stop, not "try harder").
- Collect only the fields actually needed for the task, and only from a site whose owner has
  invited this kind of use.

## The pipeline

| Step | Question it answers | Proof |
|---|---|---|
| Classify | May I automate this site? | this README section |
| Fetch | Did the page really arrive? | `cache/*.html` + status 200 |
| Extract | Which parts of the page do I need? | raw text fields |
| Normalize | How does `"£51.77"` become a number? | clean values, absolute URLs |
| Validate | Is every record safe to store? | Zod schema check; bad records set aside |
| Store | Can another program use this? | `output/books.json` |
| Report | Did the run actually work? | `output/run-report.json` |

## Lane & install

**Lane:** JavaScript (Node.js 20+), no TypeScript build step needed.

```bash
git clone https://github.com/FlyRank-AI-Internship/Week-05.git
cd Week-05
npm install
npm start
```

That single command runs the whole pipeline and writes:

- `output/books.json` — 60 validated, unique records
- `output/errors.json` — any records that failed validation, with a reason
- `output/run-report.json` — counts and timing for the run

To prove the run survives a broken page (Stage 5), run:

```bash
INJECT_FAKE_URL=1 npm start
```

On Windows PowerShell:

```powershell
$env:INJECT_FAKE_URL=1
npm start
Remove-Item Env:INJECT_FAKE_URL   # unset it afterwards, or every later run will inject the fake URL too
```

This adds one made-up book URL to the queue before fetching. The run still finishes,
`books.json` still has the 60 good records, and `run-report.json` shows `failed_pages: 1`.

Run the unit tests (price parsing, relative→absolute URLs, missing description, duplicate URLs,
one malformed fixture — 10 tests total) with:

```bash
npm test
```

## Record schema

Every record in `output/books.json` has this shape (enforced with Zod, see `src/schema.js`):

```json
{
  "title": "A Light in the Attic",
  "product_url": "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
  "price_text": "£51.77",
  "price_gbp": 51.77,
  "availability_text": "In stock (22 available)",
  "rating_text": "Three",
  "description": "It's hard to imagine a world without A Light in the Attic...",
  "source_page": "https://books.toscrape.com/catalogue/page-1.html",
  "fetched_at": "2026-08-08T10:00:00.000Z"
}
```

- `product_url` is each record's canonical identity — running the scraper twice produces the
  same 60 records, never 120.
- `description` is `null` (never invented text) when a book has no description paragraph.
- `price_text` (raw) and `price_gbp` (clean, numeric) are kept side by side.

## Politeness rules this scraper follows

- **User-agent:** every real request sends
  `FlyRankInternshipA9/1.0 (+https://github.com/FlyRank-AI-Internship/Week-05)` — a site owner
  who sees it in their logs can find out who's making the request and why.
- **Timeout:** every request gives up after 8 seconds — never waits forever.
- **Delay:** at least 500ms between real requests to the site. Cached pages need no delay; they
  never leave your computer.
- **Cache-first:** every URL is saved to `cache/` on first fetch and read from there on every
  later run, so the site is asked for a given page exactly once per cache lifetime.
- **Status-code aware retries:** a `5xx` or timeout gets one polite retry after a short wait; a
  `404` or `403` is never retried — the page doesn't exist, or the site said no.

## Run reports (real runs)

**First run** — fresh fetch, all 3 catalogue pages + 60 book pages, nothing cached yet:

```json
{
  "start_time": "2026-08-08T09:04:09.145Z",
  "duration_ms": 35834,
  "catalogue_pages": 3,
  "pages_fetched": 63,
  "cache_hits": 0,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 0
}
```

**Rerun** — idempotency proof: same 60 records, no duplicates, almost entirely from cache
(788ms vs. 35.8s):

```json
{
  "start_time": "2026-08-08T09:05:16.987Z",
  "duration_ms": 788,
  "catalogue_pages": 3,
  "pages_fetched": 63,
  "cache_hits": 63,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 0
}
```

**`INJECT_FAKE_URL=1` run** — Stage 5 proof: one made-up book URL added to the queue, gets a
404, is skipped without a retry, and the 60 good records survive untouched:

```json
{
  "start_time": "2026-08-08T09:05:58.025Z",
  "duration_ms": 1738,
  "catalogue_pages": 3,
  "pages_fetched": 64,
  "cache_hits": 63,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 1
}
```

## Why this assignment needed no browser

The book title, price, availability, rating, and description are all present in the HTML the
server sends for both the catalogue pages and the book detail pages — there's no JavaScript
rendering step between the response and the data. Loading a full browser (e.g. Playwright) here
would only add startup cost and memory for no extra data.

## A note on how this was built and verified

The extraction selectors (`.product_pod`, `.price_color`, `.availability`, `p.star-rating`,
`#product_description + p`) were checked against the real site's markup before the first live
run, and the selector logic is exercised by the test suite against fixture HTML files
(`test/fixtures/`) that mirror the real page structure — including a page with no "next" link, a
book with no description, and a book with irregular whitespace in its availability text. The
three run reports above are from real end-to-end runs against `books.toscrape.com`: a fresh run,
a rerun proving idempotency, and a run with a deliberately broken URL proving Stage 5.

## Limitations

- Retries are minimal by design (Stage 5 asks for "simple and working," not gold-plated) — a
  single retry on timeout/5xx, no exponential backoff or `Retry-After` handling. That's the
  explicit scope of next week's assignment (A16).
- The cache has no expiry — delete the `cache/` folder if you want a fully fresh run.