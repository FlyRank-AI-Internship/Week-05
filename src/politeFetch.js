import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// --- Politeness config -----------------------------------------------------
// Swap YOUR_USERNAME/YOUR_REPO for your real GitHub repo before you publish.
export const USER_AGENT = 'FlyRankInternshipA9/1.0 (+https://github.com/FlyRank-AI-Internship/Week-05)';
const TIMEOUT_MS = 8000;
const MIN_DELAY_MS = 500;
const MAX_RETRIES = 1; // one retry, only for timeouts / 5xx

const CACHE_DIR = path.resolve('cache');

function cacheKeyFor(url) {
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 10);
  const safeName = url
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .slice(0, 60);
  return `${safeName}-${hash}.html`;
}

async function readCache(url) {
  const file = path.join(CACHE_DIR, cacheKeyFor(url));
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

async function writeCache(url, html) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, cacheKeyFor(url));
  await fs.writeFile(file, html, 'utf8');
}

// A single shared "last request" clock so we never hammer the site,
// no matter how many callers are in flight.
let lastRequestTime = 0;
async function politeDelay() {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a URL politely: cache-first, honest user-agent, timeout, a single
 * delayed retry on timeout/5xx, no retry on 404/403.
 *
 * @returns {Promise<{html: string|null, fromCache: boolean, status: number, bytes: number, error?: string}>}
 */
export async function politeFetch(url, { useCache = true } = {}) {
  if (useCache) {
    const cached = await readCache(url);
    if (cached !== null) {
      return { html: cached, fromCache: true, status: 200, bytes: Buffer.byteLength(cached) };
    }
  }

  let attempt = 0;
  let lastError = null;

  while (attempt <= MAX_RETRIES) {
    attempt += 1;
    await politeDelay(); // only real network hits pay the delay, cache hits already returned above

    try {
      const res = await fetchWithTimeout(url);

      if (res.status === 200) {
        const html = await res.text();
        await writeCache(url, html);
        return { html, fromCache: false, status: 200, bytes: Buffer.byteLength(html) };
      }

      // Never re-ask for a page that doesn't exist or that we were told no on.
      if (res.status === 404 || res.status === 403) {
        return { html: null, fromCache: false, status: res.status, bytes: 0 };
      }

      // Server-side trouble: worth one polite retry.
      if (res.status >= 500 && attempt <= MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      return { html: null, fromCache: false, status: res.status, bytes: 0 };
    } catch (err) {
      lastError = err;
      if (attempt <= MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      return { html: null, fromCache: false, status: 0, bytes: 0, error: String(err) };
    }
  }

  return { html: null, fromCache: false, status: 0, bytes: 0, error: String(lastError) };
}
