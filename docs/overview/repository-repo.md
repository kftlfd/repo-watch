# Repository Repo

## Overview

Database operations for tracked GitHub repositories.

## File

`src/repository/repository.repo.ts`

## Operations

| Method                                                 | Description                             |
| ------------------------------------------------------ | --------------------------------------- |
| `create(data)`                                         | Insert new repository                   |
| `update(id, data)`                                     | Update repository                       |
| `findByFullName(fullName)`                             | Find by owner/repo                      |
| `getLatestTag(repoId)`                                 | Get latest release tag (cached)         |
| `findBatchForScanning(limit)`                          | Get least-recently-checked active repos |
| `updateAfterScan(repoId, lastCheckedAt, lastSeenTag?)` | Update after scan                       |

## Caching

Latest tag is cached in Redis with configurable TTL to reduce DB queries:

1. Check cache for `repo:{repoId}:latest_tag`
2. On miss, query DB
3. On hit, populate cache

## Batch Query

`findBatchForScanning` returns active repos ordered by `lastCheckedAt ASC NULLS FIRST` - prioritizes repos that haven't been checked yet.

## Dependencies

- `Cache`: Redis cache for tags
- `Logger`: Structured logging
