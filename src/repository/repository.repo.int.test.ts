import { describe, it } from "vitest"

describe("RepositoryRepository (integration)", () => {

  it("creates a repository record", async () => {
    // arrange: seed DB if needed

    // act: call createRepo()

    // assert: row exists with correct fields
  })

  it("fetches repository by full name", async () => {
    // arrange: insert repo

    // act: findByFullName()

    // assert: correct repo returned
  })

  it("updates repository metadata", async () => {
    // arrange: existing repo

    // act: update repo fields (lastCheckedAt, etc.)

    // assert: DB reflects changes
  })

  it("returns null when repository does not exist", async () => {
    // act: query non-existing repo

    // assert: null returned
  })
})