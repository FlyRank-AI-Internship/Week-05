/**
 * "£51.77" -> 51.77. Returns null if nothing numeric could be found,
 * so validation (not this function) is what rejects a bad record.
 */
export function parsePriceGBP(priceText) {
  if (typeof priceText !== 'string') return null;
  const digitsAndDot = priceText.replace(/[^\d.]/g, '');
  const value = parseFloat(digitsAndDot);
  return Number.isFinite(value) ? value : null;
}

/**
 * Take a raw Stage 3 record and add the clean fields Stage 4 needs.
 * The raw text is kept side by side with the clean value.
 */
export function normalizeRecord(raw) {
  return {
    ...raw,
    price_gbp: parsePriceGBP(raw.price_text),
  };
}
