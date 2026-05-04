import { err, ok, ResultAsync } from 'neverthrow';
import { z, ZodType } from 'zod';

import type { GithubClientConfig } from '@/config/config.js';
import type { HttpBadResponseError, HttpNetworkError } from '@/utils/errors.js';
import { httpErrors } from '@/utils/errors.js';

import type { HttpRequestError } from './utils.js';
import { ReleaseSchema, RepoResponseSchema, TagSchema, toRepo } from './github.schema.js';
import { mapResponseToError } from './utils.js';

export type GithubClient = ReturnType<typeof createGithubClient>;

export function createGithubClient(config: GithubClientConfig) {
  function getHeaders() {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (config.authToken) {
      headers['Authorization'] = `Bearer ${config.authToken}`;
    }
    return headers;
  }

  function httpGet<TSchema extends ZodType>(
    url: string,
    bodySchema: TSchema,
  ): ResultAsync<z.infer<TSchema>, HttpNetworkError | HttpRequestError | HttpBadResponseError> {
    const response = ResultAsync.fromPromise(
      fetch(url, { headers: getHeaders(), signal: AbortSignal.timeout(config.timeoutMs) }),
      (e) => httpErrors.NetworkError(e),
    );

    const checked = response.andThen((resp) => (resp.ok ? ok(resp) : mapResponseToError(resp)));

    const jsonData = checked.andThen((resp) =>
      ResultAsync.fromPromise(resp.json(), () => httpErrors.BadResponse('Failed to parse json')),
    );

    const parsedBody = jsonData.andThen((resp) => {
      const parsed = bodySchema.safeParse(resp);
      return parsed.success
        ? ok(parsed.data)
        : err(httpErrors.BadResponse('Failed to validate body'));
    });

    return parsedBody;
  }

  function getRepo(owner: string, repo: string) {
    return httpGet(`${config.baseUrl}/repos/${owner}/${repo}`, RepoResponseSchema).map(toRepo);
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
          : err(httpErrors.NotFound(`No tags found for ${owner}/${repo}`));
      },
    );
  }

  function getLatestRelease(owner: string, repo: string) {
    return getLatestReleaseTag(owner, repo).orElse((error) =>
      error.type === 'HttpNotFound' ? getLatestTag(owner, repo) : err(error),
    );
  }

  return {
    getRepo,
    getLatestRelease,
  };
}
