import { describe, it } from "vitest"

describe("ScannerService", () => {

  it("detects new release and triggers update flow", async () => {
    // arrange:
    // - repo list
    // - github client returns new tag

    // act:
    // - run scan()

    // assert:
    // - repo updated
    // - jobs queued
  })

  it("does nothing if tag unchanged", async () => {
    // arrange:
    // - cached tag == github tag

    // act:
    // - run scan()

    // assert:
    // - no DB update
    // - no queue push
  })

  it("handles github errors gracefully", async () => {
    // arrange:
    // - github client returns Err

    // act:
    // - run scan()

    // assert:
    // - scan continues for other repos
  })

  it("updates cache after detecting new release", async () => {
    // arrange: new tag detected

    // act

    // assert: repo cache updated
  })
})