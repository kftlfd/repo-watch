import { err, ok, ResultAsync } from 'neverthrow';
import { z } from 'zod';

import { env } from '@/config/env.js';
import type { AppError } from '@/utils/errors.js';

const BASE_URL = 'https://api.github.com';

const RepoSchema = z.object({
  full_name: z.string(),
  owner: z.object({ login: z.string() }),
  name: z.string(),
});

const ReleaseSchema = z.object({
  tag_name: z.string(),
});

const TagSchema = z.object({
  name: z.string(),
});

export type Repo = z.infer<typeof RepoSchema>;

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function httpGet(url: string) {
  return fetch(url, { headers: getHeaders() });
}

function mapResponseToError(response: Response, context?: string): AppError {
  if (response.status === 404) {
    return { type: 'NotFound', message: context ?? 'Resource not found' };
  }
  if (response.status === 401 || response.status === 403) {
    return { type: 'External', service: 'github', message: 'Authentication failed' };
  }
  if (response.status === 429) {
    return { type: 'External', service: 'github', message: 'Rate limited' };
  }
  return { type: 'External', service: 'github', message: response.statusText };
}

export function getRepo(owner: string, repo: string) {
  const fetched = ResultAsync.fromPromise(
    httpGet(`${BASE_URL}/repos/${owner}/${repo}`),
    () => ({ type: 'Internal', message: 'Failed to fetch from GitHub API' }) as AppError,
  );

  const checked = fetched.andThen((response) =>
    response.ok
      ? ok(response)
      : err(mapResponseToError(response, `Repository ${owner}/${repo} not found`)),
  );

  const jsonData = checked.andThen((response) =>
    ResultAsync.fromPromise(
      response.json(),
      () => ({ type: 'Internal', message: 'Failed to parse GitHub response' }) as AppError,
    ),
  );

  const repoInfo = jsonData.andThen((data) => {
    const result = RepoSchema.safeParse(data);
    return result.success
      ? ok(result.data)
      : err({ type: 'Internal', message: 'Invalid GitHub API response' } as AppError);
  });

  return repoInfo;
}

function getLatestReleaseTag(owner: string, repo: string) {
  const fetched = ResultAsync.fromPromise(
    httpGet(`${BASE_URL}/repos/${owner}/${repo}/releases/latest`),
    () => ({ type: 'Internal', message: 'Failed to fetch from GitHub API' }) as AppError,
  );

  const checked = fetched.andThen((response) =>
    response.ok
      ? ok(response)
      : response.status === 404
        ? err({ type: 'NotFound', message: 'No releases found, trying tags' } as AppError)
        : err(mapResponseToError(response)),
  );

  const jsonData = checked.andThen((response) =>
    ResultAsync.fromPromise(
      response.json(),
      () => ({ type: 'Internal', message: 'Failed to parse GitHub response' }) as AppError,
    ),
  );

  const tag = jsonData.andThen((data) => {
    const result = ReleaseSchema.safeParse(data);
    return result.success
      ? ok(result.data.tag_name)
      : err({ type: 'Internal', message: 'Invalid GitHub API response' } as AppError);
  });

  return tag;
}

function getLatestTag(owner: string, repo: string) {
  const fetched = ResultAsync.fromPromise(
    httpGet(`${BASE_URL}/repos/${owner}/${repo}/tags`),
    () => ({ type: 'Internal', message: 'Failed to fetch from GitHub API' }) as AppError,
  );

  const checked = fetched.andThen((response) =>
    response.ok
      ? ok(response)
      : err(mapResponseToError(response, `No releases or tags found for ${owner}/${repo}`)),
  );

  const jsonData = checked.andThen((response) =>
    ResultAsync.fromPromise(
      response.json(),
      () => ({ type: 'Internal', message: 'Failed to parse GitHub response' }) as AppError,
    ),
  );

  const tag = jsonData.andThen((data) => {
    const result = z.array(TagSchema).safeParse(data);
    if (!result.success) {
      return err({ type: 'Internal', message: 'Invalid GitHub API response' } as AppError);
    }
    const tagValue = result.data[0]?.name;
    if (!tagValue) {
      return err({ type: 'NotFound', message: `No tags found for ${owner}/${repo}` } as AppError);
    }
    return ok(tagValue);
  });

  return tag;
}

export function getLatestRelease(owner: string, repo: string) {
  return getLatestReleaseTag(owner, repo).orElse((error) =>
    error.type === 'NotFound' ? getLatestTag(owner, repo) : err(error),
  );
}
