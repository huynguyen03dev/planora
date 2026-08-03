import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ForgotPasswordForm } from "./forgot-password-form";

const { mockRequestPasswordReset } = vi.hoisted(() => ({
  mockRequestPasswordReset: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth-client", () => ({
  requestPasswordReset: mockRequestPasswordReset,
}));

const user = userEvent.setup({ pointerEventsCheck: 0 });

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email input with correct autocomplete token", () => {
    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText("Email");
    expect(emailInput).toHaveAttribute("autocomplete", "email");
  });

  it("submit button is not disabled on initial render", () => {
    render(<ForgotPasswordForm />);
    const button = screen.getByRole("button", { name: "Send reset link" });
    expect(button).not.toBeDisabled();
  });

  it("shows neutral success on known email (no error)", async () => {
    mockRequestPasswordReset.mockResolvedValue({ error: null });

    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "known@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(mockRequestPasswordReset).toHaveBeenCalledWith({
      email: "known@example.com",
    });

    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeInTheDocument();
    });

    // Neutral message — does not reveal whether email exists
    expect(
      screen.getByText(/If an account exists for that email/i),
    ).toBeInTheDocument();
  });

  it("shows neutral success on unknown email (no error)", async () => {
    // BA returns the same response for unknown emails (user-enumeration guard)
    mockRequestPasswordReset.mockResolvedValue({ error: null });

    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "unknown@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/If an account exists for that email/i),
    ).toBeInTheDocument();
  });

  it("shows accessible error on server error", async () => {
    mockRequestPasswordReset.mockResolvedValue({
      error: { message: "Rate limited. Try again later." },
    });

    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Rate limited. Try again later.",
      );
    });

    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("shows accessible error on client validation (empty email)", async () => {
    render(<ForgotPasswordForm />);

    const input = screen.getByLabelText("Email");
    expect(input).toBeRequired();
  });
});
