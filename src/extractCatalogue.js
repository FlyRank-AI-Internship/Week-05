import * as cheerio from 'cheerio';

/**
 * Parse a catalogue (listing) page.
 * @param {string} html
 * @param {string} pageUrl - the absolute URL this HTML was fetched from (base for relative links)
 * @returns {{ bookLinks: string[], nextUrl: string|null }}
 */
export function extractCatalogue(html, pageUrl) {
  const $ = cheerio.load(html);

  const bookLinks = [];
  $('.product_pod h3 a').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      bookLinks.push(new URL(href, pageUrl).toString());
    }
  });

  const nextHref = $('.next a').attr('href');
  const nextUrl = nextHref ? new URL(nextHref, pageUrl).toString() : null;

  return { bookLinks, nextUrl };
}
