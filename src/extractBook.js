import * as cheerio from 'cheerio';

const RATING_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five'];

/**
 * Parse a single book detail page into the raw (pre-normalization) record
 * shape described in the assignment (Stage 3).
 *
 * @param {string} html
 * @param {string} url - absolute URL of this book's detail page
 * @param {string} sourcePage - absolute URL of the catalogue page this book was discovered on
 * @returns {object} raw record with all 8 fields, description as null when missing
 */
export function extractBook(html, url, sourcePage) {
  const $ = cheerio.load(html);
  const main = $('.product_main');

  const title = main.find('h1').first().text().trim();
  const priceText = main.find('.price_color').first().text().trim();
  const availabilityText = main
    .find('.availability')
    .first()
    .text()
    .trim()
    .replace(/\s+/g, ' ');

  let ratingText = null;
  const ratingClass = main.find('p.star-rating').attr('class') || '';
  for (const word of RATING_WORDS) {
    if (ratingClass.includes(word)) {
      ratingText = word;
      break;
    }
  }

  // Some books have no description paragraph at all - store null, never invent text.
  const descEl = $('#product_description').next('p');
  const description = descEl.length ? descEl.text().trim() : null;

  return {
    title,
    product_url: url,
    price_text: priceText,
    availability_text: availabilityText,
    rating_text: ratingText,
    description,
    source_page: sourcePage,
    fetched_at: new Date().toISOString(),
  };
}
  