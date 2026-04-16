import { z } from 'zod';

export const SubscribeInputSchema = z.object({
  email: z.email(),
  repo: z.string().regex(/^[^/]+\/[^/]+$/, 'Invalid format. Use owner/repo'),
});

export type SubscribeInput = z.infer<typeof SubscribeInputSchema>;
