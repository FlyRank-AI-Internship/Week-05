import { z } from 'zod';

// The shape of a finished, storable record (Stage 4).
// A record that fails this goes to errors.json, never to books.json.
export const BookSchema = z.object({
  title: z.string().min(1, 'title is required'),
  product_url: z.string().url('product_url must be an absolute URL'),
  price_text: z.string().min(1, 'price_text is required'),
  price_gbp: z.number().positive('price_gbp must be a positive number'),
  availability_text: z.string().min(1, 'availability_text is required'),
  rating_text: z.string().nullable(),
  description: z.string().nullable(),
  source_page: z.string().url('source_page must be an absolute URL'),
  fetched_at: z.string().min(1, 'fetched_at is required'),
});
