import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { VerifyEmail } from "./verify-email";

const { mockVerifyEmail } = vi.hoisted(() => ({
  mockVerifyEmail: vi.fn(),
}));

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}));

const { mockUseSearchParams } = vi.hoisted(() => ({
  mockUseSearchParams: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@/lib/auth-client", () => ({
  verifyEmail: mockVerifyEmail,
  sendVerificationEmail: vi.fn(),
}));

describe("VerifyEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows verifying state on mount", () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("token=valid-token"),
    );

    render(<VerifyEmail />);

    expect(screen.getByText("Verifying your email")).toBeInTheDocument();
  });

  it("calls verifyEmail with the token and redirects on success", async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("token=valid-token"),
    );
    mockVerifyEmail.mockResolvedValue({ error: null });

    render(<VerifyEmail />);

    await waitFor(() => {
      expect(mockVerifyEmail).toHaveBeenCalledWith({ query: { token: "valid-token" } });
    });

    // Shows success and eventually redirects
    await waitFor(() => {
      expect(screen.getByText("Email verified!")).toBeInTheDocument();
    });

    await waitFor(
      () => {
        expect(mockPush).toHaveBeenCalledWith("/boards");
      },
      { timeout: 3000 },
    );
  });

  it("shows error when token is absent", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams(""));

    render(<VerifyEmail />);

    await waitFor(() => {
      expect(screen.getByText("Verification failed")).toBeInTheDocument();
    });

    expect(mockVerifyEmail).not.toHaveBeenCalled();
  });

  it("shows error when verifyEmail fails", async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("token=expired-token"),
    );
    mockVerifyEmail.mockResolvedValue({
      error: { message: "Token expired" },
    });

    render(<VerifyEmail />);

    await waitFor(() => {
      expect(screen.getByText("Verification failed")).toBeInTheDocument();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Token expired");
  });

  it("shows the failure message once — in the alert, not duplicated in the description (U7)", async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("token=expired-token"),
    );
    mockVerifyEmail.mockResolvedValue({
      error: { message: "Token expired" },
    });

    render(<VerifyEmail />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Token expired");
    });
    expect(screen.getAllByText("Token expired")).toHaveLength(1);
  });
});
