import fs from 'node:fs/promises';
import path from 'node:path';

import { politeFetch } from './politeFetch.js';
import { extractCatalogue } from './extractCatalogue.js';
import { extractBook } from './extractBook.js';
import { normalizeRecord } from './normalize.js';
import { BookSchema } from './schema.js';

const START_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const MAX_CATALOGUE_PAGES = 3;

// Stage 5 proof: `INJECT_FAKE_URL=1 node src/index.js` adds one made-up book
// URL to the queue so you can watch the run survive it.
const INJECT_FAKE_URL = process.env.INJECT_FAKE_URL === '1';

async function run() {
  const startTime = Date.now();
  let pagesFetched = 0;
  let cacheHits = 0;
  let failedPages = 0;

  // --- Stage 2: discover the 3 catalogue pages + every book link on them ---
  const bookUrlToSource = new Map(); // book URL -> catalogue page it was found on
  let pageUrl = START_URL;
  let catalogueCount = 0;

  while (pageUrl && catalogueCount < MAX_CATALOGUE_PAGES) {
    const result = await politeFetch(pageUrl);
    pagesFetched += 1;
    if (result.fromCache) cacheHits += 1;

    if (result.status !== 200 || !result.html) {
      console.error(`[catalogue] failed to fetch ${pageUrl} (status ${result.status})`);
      failedPages += 1;
      break;
    }

    console.log(`${result.fromCache ? 'CACHE HIT' : 'FETCH'} ${pageUrl} (${result.bytes} bytes)`);

    const { bookLinks, nextUrl } = extractCatalogue(result.html, pageUrl);
    for (const link of bookLinks) {
      if (!bookUrlToSource.has(link)) bookUrlToSource.set(link, pageUrl);
    }

    catalogueCount += 1;
    pageUrl = nextUrl;
  }

  console.log(
    `catalogue_pages=${catalogueCount} discovered=${bookUrlToSource.size} unique_urls=${bookUrlToSource.size}`
  );

  if (INJECT_FAKE_URL) {
    const fakeUrl = 'https://books.toscrape.com/catalogue/this-book-does-not-exist_9999/index.html';
    bookUrlToSource.set(fakeUrl, START_URL);
    console.log(`[stage 5 test] injected fake URL: ${fakeUrl}`);
  }

  // --- Stage 3: visit every book page, collect the 8 raw fields ---
  const rawRecords = [];

  for (const [url, sourcePage] of bookUrlToSource) {
    const result = await politeFetch(url);
    pagesFetched += 1;
    if (result.fromCache) cacheHits += 1;

    if (result.status === 404 || result.status === 403) {
      console.error(`[detail] SKIP ${url}: status ${result.status}`);
      failedPages += 1;
      continue;
    }
    if (result.status !== 200 || !result.html) {
      console.error(`[detail] SKIP ${url}: ${result.error || `status ${result.status}`}`);
      failedPages += 1;
      continue;
    }

    rawRecords.push(extractBook(result.html, url, sourcePage));
  }

  console.log(`detail_pages=${rawRecords.length}`);

  // --- Stage 4: normalize, validate, dedupe by canonical URL ---
  const validRecords = [];
  const invalidRecords = [];
  const seenUrls = new Set();

  for (const raw of rawRecords) {
    if (seenUrls.has(raw.product_url)) continue; // idempotency: same URL never counted twice
    seenUrls.add(raw.product_url);

    const normalized = normalizeRecord(raw);
    const parsed = BookSchema.safeParse(normalized);

    if (parsed.success) {
      validRecords.push(parsed.data);
    } else {
      invalidRecords.push({
        record: normalized,
        reason: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      });
    }
  }

  await fs.mkdir('output', { recursive: true });
  await fs.writeFile(path.join('output', 'books.json'), JSON.stringify(validRecords, null, 2));
  await fs.writeFile(path.join('output', 'errors.json'), JSON.stringify(invalidRecords, null, 2));

  // --- Stage 5: honest run report ---
  const durationMs = Date.now() - startTime;
  const report = {
    start_time: new Date(startTime).toISOString(),
    duration_ms: durationMs,
    catalogue_pages: catalogueCount,
    pages_fetched: pagesFetched,
    cache_hits: cacheHits,
    valid_records: validRecords.length,
    invalid_records: invalidRecords.length,
    failed_pages: failedPages,
  };
  await fs.writeFile(path.join('output', 'run-report.json'), JSON.stringify(report, null, 2));

  console.log('run-report:', report);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
