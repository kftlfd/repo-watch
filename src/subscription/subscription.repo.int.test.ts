import { describe, it } from "vitest"

describe("SubscriptionRepository (integration)", () => {

  it("inserts subscription into DB", async () => {
    // arrange:
    // - real DB

    // act:
    // - create subscription

    // assert:
    // - row exists in DB
  })

  it("finds subscription by email", async () => {
    // arrange:
    // - seed DB

    // act:
    // - query repo

    // assert:
    // - correct row returned
  })

  it("updates subscription confirmation status", async () => {
    // arrange:
    // - existing subscription

    // act:
    // - confirm subscription

    // assert:
    // - DB updated correctly
  })
})