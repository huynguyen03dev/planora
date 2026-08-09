import { vi, describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";

// Set env vars before module loads — vi.hoisted runs before imports
vi.hoisted(() => {
  process.env.EMAIL_FROM =
    "Planora <notifications@planora.hazeruno.dpdns.org>";
  // Must be set so getResendClient() creates the (mocked) Resend client
  process.env.RESEND_API_KEY = "test-key";
});

// Mock Resend so we can capture the .send() argument without sending real email
const mockResendSend = vi.hoisted(() =>
  vi
    .fn<() => Promise<{ error: null | { message: string } }>>()
    .mockResolvedValue({ error: null }),
);
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: { send: mockResendSend },
  })),
}));

import { sendEmail, resolveFrom } from "./email";

const dummyReact = createElement("div");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveFrom", () => {
  it("returns EMAIL_FROM verbatim when fromName is omitted", () => {
    expect(resolveFrom()).toBe(
      "Planora <notifications@planora.hazeruno.dpdns.org>",
    );
  });

  it('builds "<fromName> <<address>>" when fromName is provided', () => {
    expect(resolveFrom("Jane (Planora)")).toBe(
      "Jane (Planora) <notifications@planora.hazeruno.dpdns.org>",
    );
  });

  it("builds display name with mentioning style", () => {
    expect(resolveFrom("Alice mentioned you (Planora)")).toBe(
      "Alice mentioned you (Planora) <notifications@planora.hazeruno.dpdns.org>",
    );
  });

  it("builds display name with invite style", () => {
    expect(resolveFrom("Bob invited you to Planora")).toBe(
      "Bob invited you to Planora <notifications@planora.hazeruno.dpdns.org>",
    );
  });
});

describe("sendEmail from composition (Resend mock)", () => {
  it("passes EMAIL_FROM verbatim when fromName is omitted", async () => {
    await sendEmail({
      to: "user@test.com",
      subject: "Test",
      react: dummyReact,
    });

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Planora <notifications@planora.hazeruno.dpdns.org>",
      }),
    );
  });

  it("passes composed from header when fromName is provided", async () => {
    await sendEmail({
      to: "user@test.com",
      subject: "Test",
      react: dummyReact,
      fromName: "Jane (Planora)",
    });

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Jane (Planora) <notifications@planora.hazeruno.dpdns.org>",
      }),
    );
  });

  it("still works when RESEND_API_KEY is missing (no-op log path)", async () => {
    const origKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    await expect(
      sendEmail({
        to: "user@test.com",
        subject: "Test",
        react: dummyReact,
      }),
    ).resolves.toBeUndefined();

    // Should not have called the mock (no Resend client created)
    expect(mockResendSend).not.toHaveBeenCalled();

    process.env.RESEND_API_KEY = origKey;
  });

  it("rejects when Resend returns a provider error", async () => {
    mockResendSend.mockResolvedValueOnce({
      error: { message: "Provider unavailable" },
    });

    await expect(
      sendEmail({
        to: "user@test.com",
        subject: "Test",
        react: dummyReact,
      }),
    ).rejects.toThrow("Provider unavailable");
  });

  it("rejects when the Resend request throws", async () => {
    mockResendSend.mockRejectedValueOnce(new Error("Network unavailable"));

    await expect(
      sendEmail({
        to: "user@test.com",
        subject: "Test",
        react: dummyReact,
      }),
    ).rejects.toThrow("Network unavailable");
  });
});

describe("resolveFrom with malformed EMAIL_FROM (no <>)", () => {
  it("falls back to EMAIL_FROM verbatim when regex does not match", async () => {
    // Reset modules so we can import with a different EMAIL_FROM value
    vi.resetModules();
    process.env.EMAIL_FROM = "no-angle-brackets@test.com";

    const { resolveFrom: resolveFromAlt } = await import("./email");

    // Without fromName, returns the malformed string as-is
    expect(resolveFromAlt()).toBe("no-angle-brackets@test.com");

    // With fromName, the whole malformed EMAIL_FROM becomes the address part
    expect(resolveFromAlt("Test Name")).toBe(
      "Test Name <no-angle-brackets@test.com>",
    );
  });
});

describe("resolveFrom sanitizes user-controlled fromName", () => {
  // fromName is interpolated from user.name, which has no DB-level character
  // constraint — these guard against SMTP header injection and malformed from.
  it("strips CRLF that could inject SMTP headers", () => {
    expect(resolveFrom("Alice\r\nBcc: victim@test.com")).toBe(
      "AliceBcc: victim@test.com <notifications@planora.hazeruno.dpdns.org>",
    );
  });

  it("strips angle brackets that could forge a sender address", () => {
    expect(resolveFrom("Alice <evil@attacker.com>")).toBe(
      "Alice evil@attacker.com <notifications@planora.hazeruno.dpdns.org>",
    );
  });

  it("falls back to EMAIL_FROM when fromName is empty", () => {
    expect(resolveFrom("")).toBe(
      "Planora <notifications@planora.hazeruno.dpdns.org>",
    );
  });

  it("falls back to EMAIL_FROM when fromName is only whitespace/brackets", () => {
    expect(resolveFrom("  \r\n<> ")).toBe(
      "Planora <notifications@planora.hazeruno.dpdns.org>",
    );
  });

  it("trims surrounding whitespace from a valid name", () => {
    expect(resolveFrom("  Jane  ")).toBe(
      "Jane <notifications@planora.hazeruno.dpdns.org>",
    );
  });
});
