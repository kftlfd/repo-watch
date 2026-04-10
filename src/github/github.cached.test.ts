import { describe, it } from "vitest"

describe("CachedGitHubClient", () => {

  it("returns cached repo when available", async () => {
    // arrange:
    // - cache has value
    // - base client NOT called

    // act:
    // - call getRepo()

    // assert:
    // - cache.get called
    // - base client not called
  })

  it("fetches from API on cache miss", async () => {
    // arrange:
    // - cache miss
    // - mock base client response

    // act:
    // - call getRepo()

    // assert:
    // - base client called
    // - cache.set called
  })

  it("does not cache failed responses", async () => {
    // arrange:
    // - base client returns Err

    // act:
    // - call getRepo()

    // assert:
    // - cache.set NOT called
  })
})