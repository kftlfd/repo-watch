import { z } from 'zod';

export const RepoResponseSchema = z.object({
  full_name: z.string(),
  owner: z.object({ login: z.string() }),
  name: z.string(),
});

export type RepoResponse = z.infer<typeof RepoResponseSchema>;

export const RepoSchema = z.object({
  fullName: z.string(),
  owner: z.string(),
  name: z.string(),
});

export type Repo = z.infer<typeof RepoSchema>;

export const toRepo = (r: RepoResponse): Repo => ({
  fullName: r.full_name,
  owner: r.owner.login,
  name: r.name,
});

export const ReleaseSchema = z.object({
  tag_name: z.string(),
});

export const TagSchema = z.object({
  name: z.string(),
});
