import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SignInForm } from "./sign-in-form";

const { mockSignInEmail, mockSendVerificationEmail } = vi.hoisted(() => ({
  mockSignInEmail: vi.fn(),
  mockSendVerificationEmail: vi.fn(),
}));

vi.mock("next/navigation", () => ({
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

  it("offers a resend-verification path when sign-in is blocked on an unverified email (U4)", async () => {
    mockSignInEmail.mockImplementation((_data, { onError }) => {
      onError?.({
        error: {
          message: "Email not verified",
          code: "EMAIL_NOT_VERIFIED",
        },
      });
      return Promise.resolve();
    });
    mockSendVerificationEmail.mockResolvedValue({});

    render(<SignInForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Resend verification email" }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Resend verification email" }),
    );

    await waitFor(() =>
      expect(mockSendVerificationEmail).toHaveBeenCalledWith({
        email: "test@example.com",
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        /check your inbox/i,
      );
    });
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

  it("hides the resend offer when the email field is edited again (U4)", async () => {
    mockSignInEmail.mockImplementation((_data, { onError }) => {
      onError?.({
        error: { message: "Email not verified", code: "EMAIL_NOT_VERIFIED" },
      });
      return Promise.resolve();
    });

    render(<SignInForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Resend verification email" }),
      ).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Email"), "x");
    expect(
      screen.queryByRole("button", { name: "Resend verification email" }),
    ).not.toBeInTheDocument();
  });
});
