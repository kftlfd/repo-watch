import { describe, it } from "vitest"

describe("EmailService", () => {

  it("sends email with correct template", async () => {
    // arrange: mock SMTP client

    // act: send email

    // assert: correct template + recipient used
  })

  it("handles SMTP failure", async () => {
    // arrange: SMTP throws error

    // act: send email

    // assert: error returned or wrapped in Result
  })

  it("sanitizes input before sending", async () => {
    // arrange: unsafe input

    // act: send email

    // assert: sanitized payload sent
  })
})