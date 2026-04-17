import { z } from 'zod';

export const SubscribeInputSchema = z.object({
  email: z.email().meta({ description: 'Email', example: 'user@mail.com' }),
  repo: z
    .string()
    .regex(/^[^/]+\/[^/]+$/, 'Invalid format. Use owner/repo')
    .meta({ description: 'GitHub repo in "owner/repo" format', example: 'torvalds/linux' }),
});

export type SubscribeInput = z.infer<typeof SubscribeInputSchema>;

export const ApiErrorSchema = z.object({
  message: z.string(),
});
