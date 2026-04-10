import { z } from 'zod';

export const RepoSchema = z.object({
  full_name: z.string(),
  owner: z.object({ login: z.string() }),
  name: z.string(),
});

export type Repo = z.infer<typeof RepoSchema>;

export const ReleaseSchema = z.object({
  tag_name: z.string(),
});

export const TagSchema = z.object({
  name: z.string(),
});
