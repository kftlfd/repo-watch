import { err, ok, ResultAsync } from 'neverthrow';
import { z, ZodType } from 'zod';

import { env } from '@/config/env.js';
import type { HttpError } from '@/utils/errors.js';

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

function httpGet<TSchema extends ZodType>(
  url: string,
  bodySchema: TSchema,
): ResultAsync<z.infer<TSchema>, HttpError> {
  const response = ResultAsync.fromPromise(
    fetch(url, { headers: getHeaders() }),
    (): HttpError => ({ type: 'NetworkError', message: 'Failed to fetch' }),
  );

  const checked = response.andThen((resp) => (resp.ok ? ok(resp) : err(mapResponseToError(resp))));

  const jsonData = checked.andThen((resp) =>
    ResultAsync.fromPromise(
      resp.json(),
      (): HttpError => ({ type: 'BadResponse', message: 'Failed to parse json' }),
    ),
  );

  const parsedBody = jsonData.andThen((resp) => {
    const result = bodySchema.safeParse(resp);
    return result.success
      ? ok(result.data)
      : err({ type: 'BadResponse', message: 'Failed to validate body' } as HttpError);
  });

  return parsedBody;
}

function mapResponseToError(response: Response): HttpError {
  if (response.status === 404) {
    return { type: 'NotFound', message: 'Resource not found' };
  }
  if (response.status === 401 || response.status === 403) {
    return { type: 'Unauthorized', message: 'Authentication failed' };
  }
  if (response.status === 429) {
    return { type: 'TooManyRequests' };
  }
  return { type: 'Unknown', statusCode: response.status, message: response.statusText };
}

export function getRepo(owner: string, repo: string) {
  return httpGet(`${BASE_URL}/repos/${owner}/${repo}`, RepoSchema);
}

function getLatestReleaseTag(owner: string, repo: string) {
  return httpGet(`${BASE_URL}/repos/${owner}/${repo}/releases/latest`, ReleaseSchema).map(
    (data) => data.tag_name,
  );
}

function getLatestTag(owner: string, repo: string) {
  return httpGet(`${BASE_URL}/repos/${owner}/${repo}/tags`, z.array(TagSchema)).andThen((data) => {
    const tagValue = data[0]?.name;
    return tagValue
      ? ok(tagValue)
      : err({ type: 'NotFound', message: `No tags found for ${owner}/${repo}` } as HttpError);
  });
}

export function getLatestRelease(owner: string, repo: string) {
  return getLatestReleaseTag(owner, repo).orElse((error) =>
    error.type === 'NotFound' ? getLatestTag(owner, repo) : err(error),
  );
}
