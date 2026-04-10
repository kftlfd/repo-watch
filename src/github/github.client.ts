import { err, ok, ResultAsync } from 'neverthrow';
import { z, ZodType } from 'zod';

import type { GithubClientConfig } from '@/config/config.js';
import type { HttpError } from '@/utils/errors.js';
import { env } from '@/config/env.js';
import { parseRetryAfter } from '@/utils/errors.js';

import type { Repo } from './github.schema.js';
import { ReleaseSchema, RepoSchema, TagSchema } from './github.schema.js';

export type GithubClient = {
  getRepo(owner: string, repo: string): ResultAsync<Repo, HttpError>;
  getLatestRelease(owner: string, repo: string): ResultAsync<string, HttpError>;
};

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
    return {
      type: 'TooManyRequests',
      retryAfter: parseRetryAfter(response.headers.get('retry-after')),
    };
  }
  return { type: 'Unknown', statusCode: response.status, message: response.statusText };
}

export function createGithubClient(config: GithubClientConfig): GithubClient {
  function getRepo(owner: string, repo: string) {
    return httpGet(`${config.baseUrl}/repos/${owner}/${repo}`, RepoSchema);
  }

  function getLatestReleaseTag(owner: string, repo: string) {
    return httpGet(`${config.baseUrl}/repos/${owner}/${repo}/releases/latest`, ReleaseSchema).map(
      (data) => data.tag_name,
    );
  }

  function getLatestTag(owner: string, repo: string) {
    return httpGet(`${config.baseUrl}/repos/${owner}/${repo}/tags`, z.array(TagSchema)).andThen(
      (data) => {
        const tagValue = data[0]?.name;
        return tagValue
          ? ok(tagValue)
          : err({ type: 'NotFound', message: `No tags found for ${owner}/${repo}` } as HttpError);
      },
    );
  }

  function getLatestRelease(owner: string, repo: string) {
    return getLatestReleaseTag(owner, repo).orElse((error) =>
      error.type === 'NotFound' ? getLatestTag(owner, repo) : err(error),
    );
  }

  return {
    getRepo,
    getLatestRelease,
  };
}
