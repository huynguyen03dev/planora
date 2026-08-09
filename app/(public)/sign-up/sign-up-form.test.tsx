import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SignUpForm } from "./sign-up-form";

const { mockSignUpEmail, mockSendVerificationEmail } = vi.hoisted(() => ({
  mockSignUpEmail: vi.fn(),
  mockSendVerificationEmail: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth-client", () => ({
  signUp: { email: mockSignUpEmail },
  sendVerificationEmail: mockSendVerificationEmail,
}));

const user = userEvent.setup({ pointerEventsCheck: 0 });

describe("SignUpForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders name, email, and password inputs with correct autocomplete tokens", () => {
    render(<SignUpForm />);

    const nameInput = screen.getByLabelText("Name");
    expect(nameInput).toHaveAttribute("autocomplete", "name");

    const emailInput = screen.getByLabelText("Email");
    expect(emailInput).toHaveAttribute("autocomplete", "email");

    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("autocomplete", "new-password");
  });

  it("shows password helper text", () => {
    render(<SignUpForm />);
    const helper = screen.getByText("Minimum 8 characters");
    expect(helper).toBeInTheDocument();
    expect(helper).toHaveAttribute("id", "pw-help");
  });

  it("shows error in role=alert with aria-invalid on inputs and re-enables submit", async () => {
    mockSignUpEmail.mockImplementation((_data, { onError }) => {
      onError?.({ error: { message: "Email already in use" } });
      return Promise.resolve();
    });

    render(<SignUpForm />);

    // Fill in fields so HTML5 required validation passes
    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");

    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    // Mock should have been called
    expect(mockSignUpEmail).toHaveBeenCalled();

    // Error renders inside role="alert"
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Email already in use");
    });

    // Inputs carry aria-invalid
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");

    // Submit button re-enabled after loading reset
    await waitFor(() => {
      const button = screen.getByRole("button", { name: "Sign Up" });
      expect(button).not.toBeDisabled();
    });
  });

  it("submit button is not disabled on initial render", () => {
    render(<SignUpForm />);
    const button = screen.getByRole("button", { name: "Sign Up" });
    expect(button).not.toBeDisabled();
  });

  it("shows verify-pending state on success instead of redirecting", async () => {
    mockSignUpEmail.mockImplementation((_data, { onSuccess }) => {
      onSuccess?.();
      return Promise.resolve();
    });

    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");

    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeInTheDocument();
    });

    // Should NOT redirect to /boards
    const { push } = vi.mocked(await import("next/navigation")).useRouter();
    expect(push).not.toHaveBeenCalled();

    // Resend control should call sendVerificationEmail
    const resendButton = screen.getByText("resend");
    await user.click(resendButton);
    expect(mockSendVerificationEmail).toHaveBeenCalledWith({ email: "test@example.com" });
  });

  it("renders the page-level heading as a real h1 (not a div) in both states", async () => {
    render(<SignUpForm />);

    const formHeading = screen.getByRole("heading", {
      level: 1,
      name: "Create an account",
    });
    expect(formHeading).toBeInTheDocument();

    mockSignUpEmail.mockImplementation((_data, { onSuccess }) => {
      onSuccess?.();
      return Promise.resolve();
    });
    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Check your email" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("heading", { level: 1, name: "Create an account" }),
    ).not.toBeInTheDocument();
  });

  it("moves focus to the success heading after sign-up (view-swap focus, not a steal)", async () => {
    mockSignUpEmail.mockImplementation((_data, { onSuccess }) => {
      onSuccess?.();
      return Promise.resolve();
    });

    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");

    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    const successHeading = await screen.findByRole("heading", {
      level: 1,
      name: "Check your email",
    });
    await waitFor(() => {
      expect(successHeading).toHaveFocus();
    });
    // The heading is focusable for AT but stays out of the tab order.
    expect(successHeading).toHaveAttribute("tabindex", "-1");
  });

  it("announces the resend result through a persistent polite status region", async () => {
    mockSignUpEmail.mockImplementation((_data, { onSuccess }) => {
      onSuccess?.();
      return Promise.resolve();
    });

    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    await screen.findByRole("heading", { level: 1, name: "Check your email" });

    // The region exists (empty) before the resend so the announcement is not
    // a mount-time flash; it flips to "Sent!" only after the request resolves.
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    expect(mockSendVerificationEmail).not.toHaveBeenCalled();

    mockSendVerificationEmail.mockResolvedValue(undefined);
    await user.click(screen.getByText("resend"));

    await waitFor(() => {
      expect(status).toHaveTextContent("Sent!");
    });
    expect(mockSendVerificationEmail).toHaveBeenCalledWith({
      email: "test@example.com",
    });

    // A second resend clears the region while the request is in flight, so a
    // repeat success re-announces (the visible button label alone is never
    // announced by AT). Drive it with a deferred promise to observe the gap.
    const deferredSecondResend: { resolve: (() => void) | null } = {
      resolve: null,
    };
    mockSendVerificationEmail.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          deferredSecondResend.resolve = resolve;
        }),
    );
    await user.click(screen.getByRole("button", { name: "Sent!" }));
    expect(status).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();

    deferredSecondResend.resolve?.();
    await waitFor(() => {
      expect(status).toHaveTextContent("Sent!");
    });
  });
});
