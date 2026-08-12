import { err, ok } from 'neverthrow';
import { z } from 'zod';

import type { GithubClientConfig } from '@/config/config.js';
import type { HttpClient } from '@/lib/http/index.js';
import type { GithubMetrics } from '@/metrics/metrics.js';

import { ReleaseSchema, RepoResponseSchema, TagSchema, toRepo } from './github.schema.js';

export type GithubClient = ReturnType<typeof createGithubClient>;

type Deps = {
  httpClient: HttpClient;
  config: GithubClientConfig;
  metrics: GithubMetrics;
};

export function createGithubClient({ config, httpClient, metrics }: Deps) {
  function getHeaders() {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (config.authToken) {
      headers['Authorization'] = `Bearer ${config.authToken}`;
    }
    return headers;
  }

  const httpGet: typeof httpClient.httpGet = (url, bodySchema, opts) =>
    httpClient
      .httpGet(`${config.baseUrl}${url}`, bodySchema, {
        headers: { ...getHeaders(), ...opts?.headers },
        timeoutMs: opts?.timeoutMs ?? config.timeoutMs,
        abortSignal: opts?.abortSignal,
      })
      .orTee((e) => {
        if (e.type === 'HTTP_ERROR') {
          metrics.onError();
          if (e.error.type === 'HttpTooManyRequests') {
            metrics.onRateLimitError();
          }
        }
      });

  function getRepo(owner: string, repo: string, abortSignal?: AbortSignal) {
    return httpGet(`/repos/${owner}/${repo}`, RepoResponseSchema, {
      abortSignal,
    }).map(toRepo);
  }

  function getLatestReleaseTag(owner: string, repo: string, abortSignal?: AbortSignal) {
    return httpGet(`/repos/${owner}/${repo}/releases/latest`, ReleaseSchema, {
      abortSignal,
    }).map((data) => data.tag_name);
  }

  function getLatestTag(owner: string, repo: string, abortSignal?: AbortSignal) {
    return httpGet(`/repos/${owner}/${repo}/tags`, z.array(TagSchema), {
      abortSignal,
    }).andThen((data) => {
      const tagValue = data[0]?.name;
      return tagValue ? ok(tagValue) : err({ type: 'NO_LATEST_TAG' as const });
    });
  }

  function getLatestRelease(owner: string, repo: string, abortSignal?: AbortSignal) {
    return getLatestReleaseTag(owner, repo, abortSignal).orElse((error) =>
      error.type === 'HTTP_ERROR' && error.error.type === 'HttpNotFound'
        ? getLatestTag(owner, repo, abortSignal)
        : err(error),
    );
  }

  return {
    getRepo,
    getLatestRelease,
  };
}
