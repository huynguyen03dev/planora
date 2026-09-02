import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SignInForm } from "./sign-in-form";

const { mockPush, mockSignInEmail, mockSendVerificationEmail } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSignInEmail: vi.fn(),
  mockSendVerificationEmail: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth-client", () => ({
  signIn: { email: mockSignInEmail },
  sendVerificationEmail: mockSendVerificationEmail,
}));

const user = userEvent.setup({ pointerEventsCheck: 0 });

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email and password inputs with correct autocomplete tokens", () => {
    render(<SignInForm />);

    const emailInput = screen.getByLabelText("Email");
    expect(emailInput).toHaveAttribute("autocomplete", "email");

    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("autocomplete", "current-password");
  });

  it("shows error in role=alert with aria-invalid on inputs and re-enables submit", async () => {
    mockSignInEmail.mockImplementation((_data, { onError }) => {
      onError?.({ error: { message: "Invalid credentials" } });
      return Promise.resolve();
    });

    render(<SignInForm />);

    // Fill in fields so HTML5 required validation passes
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");

    await user.click(screen.getByRole("button", { name: "Sign In" }));

    // Mock should have been called
    expect(mockSignInEmail).toHaveBeenCalled();

    // Error renders inside role="alert"
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials");
    });

    // Inputs carry aria-invalid
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");

    // Submit button re-enabled after loading reset
    await waitFor(() => {
      const button = screen.getByRole("button", { name: "Sign In" });
      expect(button).not.toBeDisabled();
    });
  });

  it("submit button is not disabled on initial render", () => {
    render(<SignInForm />);
    const button = screen.getByRole("button", { name: "Sign In" });
    expect(button).not.toBeDisabled();
  });

  it("routes unverified sign-in to recovery without a destructive error", async () => {
    mockSignInEmail.mockImplementation((_data, { onError }) => {
      onError?.({
        error: {
          message: "Email not verified",
          code: "EMAIL_NOT_VERIFIED",
        },
      });
      return Promise.resolve();
    });
    render(<SignInForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        "/verify-email?email=test%40example.com&callbackURL=%2Fboards",
      );
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mockSendVerificationEmail).not.toHaveBeenCalled();
  });

  it("does not offer resend for a generic sign-in error (U4)", async () => {
    mockSignInEmail.mockImplementation((_data, { onError }) => {
      onError?.({ error: { message: "Invalid credentials" } });
      return Promise.resolve();
    });

    render(<SignInForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Invalid credentials",
      );
    });
    expect(
      screen.queryByRole("button", { name: "Resend verification email" }),
    ).not.toBeInTheDocument();
  });

});
