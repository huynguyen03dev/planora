import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { VerifyEmail } from "./verify-email";

const { mockVerifyEmail, mockSendVerificationEmail } = vi.hoisted(() => ({
  mockVerifyEmail: vi.fn(),
  mockSendVerificationEmail: vi.fn(),
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
  sendVerificationEmail: mockSendVerificationEmail,
}));

const user = userEvent.setup({ pointerEventsCheck: 0 });

describe("VerifyEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows verifying state on mount", () => {
    mockVerifyEmail.mockReturnValue(new Promise(() => undefined));
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
      expect(mockVerifyEmail).toHaveBeenCalledWith({
        query: { token: "valid-token" },
      });
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

  it("shows the resend request form when token is absent", () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("email=test%40example.com&callbackURL=%2Finvite%3FinvitationId%3D1"),
    );

    render(<VerifyEmail />);

    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("test@example.com");
    expect(screen.getByRole("button", { name: "Send verification email" })).toBeInTheDocument();
    expect(mockVerifyEmail).not.toHaveBeenCalled();
  });

  it("submits a neutral resend response with the safe callback and starts cooldown", async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("email=test%40example.com&callbackURL=%2Finvite%3FinvitationId%3D1"),
    );
    mockSendVerificationEmail.mockResolvedValue({ data: { status: true }, error: null });

    render(<VerifyEmail />);
    await user.click(screen.getByRole("button", { name: "Send verification email" }));

    await waitFor(() => {
      expect(mockSendVerificationEmail).toHaveBeenCalledWith({
        email: "test@example.com",
        callbackURL: "/invite?invitationId=1",
      });
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "If an account needs verification, we've sent a new link",
    );
    expect(screen.getByRole("button", { name: /send again in 30s/i })).toBeDisabled();
  });

  it("shows a resend failure and never claims success", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("email=test%40example.com"));
    mockSendVerificationEmail.mockResolvedValue({
      data: null,
      error: { message: "Provider unavailable" },
    });

    render(<VerifyEmail />);
    await user.click(screen.getByRole("button", { name: "Send verification email" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "We couldn't send the verification email. Please try again.",
      );
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send new verification email" })).toBeInTheDocument();
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

  it("redirects successful verification to a safe internal callback", async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("token=valid-token&callbackURL=%2Finvite%3FinvitationId%3D1"),
    );
    mockVerifyEmail.mockResolvedValue({ error: null });

    render(<VerifyEmail />);

    await waitFor(
      () => {
        expect(mockPush).toHaveBeenCalledWith("/invite?invitationId=1");
      },
      { timeout: 3000 },
    );
  });

  it("rejects an external callback and falls back to boards", async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(
        "token=valid-token&callbackURL=https%3A%2F%2Fevil.example%2Fsteal",
      ),
    );
    mockVerifyEmail.mockResolvedValue({ error: null });

    render(<VerifyEmail />);

    await waitFor(
      () => {
        expect(mockPush).toHaveBeenCalledWith("/boards");
      },
      { timeout: 3000 },
    );
  });
});
