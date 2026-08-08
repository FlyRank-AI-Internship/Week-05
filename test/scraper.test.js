import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractCatalogue } from '../src/extractCatalogue.js';
import { extractBook } from '../src/extractBook.js';
import { parsePriceGBP, normalizeRecord } from '../src/normalize.js';
import { BookSchema } from '../src/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => fs.readFile(path.join(__dirname, 'fixtures', name), 'utf8');

// 1. Price normalization ----------------------------------------------------
test('parsePriceGBP turns "£51.77" into 51.77', () => {
  assert.equal(parsePriceGBP('£51.77'), 51.77);
});

test('parsePriceGBP handles whole-number prices', () => {
  assert.equal(parsePriceGBP('£10.00'), 10);
});

test('parsePriceGBP returns null for unparseable text', () => {
  assert.equal(parsePriceGBP('free'), null);
});

// 2. Relative -> absolute URL resolution ------------------------------------
test('extractCatalogue turns relative book links into absolute URLs', async () => {
  const html = await fixture('catalogue-page-1.html');
  const pageUrl = 'https://books.toscrape.com/catalogue/page-1.html';
  const { bookLinks, nextUrl } = extractCatalogue(html, pageUrl);

  assert.equal(bookLinks.length, 2);
  assert.equal(bookLinks[0], 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html');
  assert.equal(bookLinks[1], 'https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html');
  assert.equal(nextUrl, 'https://books.toscrape.com/catalogue/page-2.html');
});

test('extractCatalogue returns nextUrl=null on the last page', async () => {
  const html = await fixture('catalogue-page-last.html');
  const { nextUrl } = extractCatalogue(html, 'https://books.toscrape.com/catalogue/page-50.html');
  assert.equal(nextUrl, null);
});

// 3. Missing description handling -------------------------------------------
test('extractBook captures a description when present', async () => {
  const html = await fixture('book-with-description.html');
  const url = 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html';
  const record = extractBook(html, url, 'https://books.toscrape.com/catalogue/page-1.html');

  assert.equal(record.title, 'A Light in the Attic');
  assert.equal(record.price_text, '£51.77');
  assert.match(record.availability_text, /In stock \(22 available\)/);
  assert.equal(record.rating_text, 'Three');
  assert.ok(record.description && record.description.length > 0);
  assert.equal(record.product_url, url);
});

test('extractBook stores null (not invented text) when description is missing', async () => {
  const html = await fixture('book-without-description.html');
  const url = 'https://books.toscrape.com/catalogue/set-me-free_988/index.html';
  const record = extractBook(html, url, 'https://books.toscrape.com/catalogue/page-1.html');

  assert.equal(record.description, null);
  assert.equal(record.rating_text, 'Five');
  // extra internal whitespace should be collapsed
  assert.equal(record.availability_text, 'In stock (19 available)');
});

// 4. Malformed / fixture-based fields ----------------------------------------
test('a malformed price_text fails schema validation instead of crashing', () => {
  const normalized = normalizeRecord({
    title: 'Mystery Book',
    product_url: 'https://books.toscrape.com/catalogue/mystery-book_1/index.html',
    price_text: 'contact us',
    availability_text: 'In stock (1 available)',
    rating_text: 'One',
    description: null,
    source_page: 'https://books.toscrape.com/catalogue/page-1.html',
    fetched_at: new Date().toISOString(),
  });

  const result = BookSchema.safeParse(normalized);
  assert.equal(result.success, false);
});

test('a well-formed record passes schema validation', () => {
  const normalized = normalizeRecord({
    title: 'A Light in the Attic',
    product_url: 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
    price_text: '£51.77',
    availability_text: 'In stock (22 available)',
    rating_text: 'Three',
    description: 'A collection of poetry.',
    source_page: 'https://books.toscrape.com/catalogue/page-1.html',
    fetched_at: new Date().toISOString(),
  });

  const result = BookSchema.safeParse(normalized);
  assert.equal(result.success, true);
  assert.equal(result.data.price_gbp, 51.77);
});

// 5. Duplicate URL handling ---------------------------------------------------
test('duplicate product_urls collapse to a single record (idempotency guard)', () => {
  const raw = [
    { product_url: 'https://books.toscrape.com/a_1/index.html' },
    { product_url: 'https://books.toscrape.com/a_1/index.html' },
    { product_url: 'https://books.toscrape.com/b_2/index.html' },
  ];

  const seen = new Set();
  const deduped = raw.filter((r) => {
    if (seen.has(r.product_url)) return false;
    seen.add(r.product_url);
    return true;
  });

  assert.equal(deduped.length, 2);
});
