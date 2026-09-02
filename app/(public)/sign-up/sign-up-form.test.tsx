import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SignUpForm } from "./sign-up-form";

const {
  mockPush,
  mockSignUpEmail,
  mockSendVerificationEmail,
  mockUseSearchParams,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSignUpEmail: vi.fn(),
  mockSendVerificationEmail: vi.fn(),
  mockUseSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@/lib/auth-client", () => ({
  signUp: { email: mockSignUpEmail },
  sendVerificationEmail: mockSendVerificationEmail,
}));

const user = userEvent.setup({ pointerEventsCheck: 0 });

describe("SignUpForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockSendVerificationEmail.mockResolvedValue({ error: null });
  });

  it("renders name, email, password, and confirmation inputs with correct autocomplete tokens", () => {
    render(<SignUpForm />);

    const nameInput = screen.getByLabelText("Name");
    expect(nameInput).toHaveAttribute("autocomplete", "name");

    const emailInput = screen.getByLabelText("Email");
    expect(emailInput).toHaveAttribute("autocomplete", "email");

    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("autocomplete", "new-password");

    const confirmationInput = screen.getByLabelText("Confirm password");
    expect(confirmationInput).toHaveAttribute("autocomplete", "new-password");
  });

  it("shows password helper text", () => {
    render(<SignUpForm />);
    const helper = screen.getByText("Minimum 8 characters");
    expect(helper).toBeInTheDocument();
    expect(helper).toHaveAttribute("id", "pw-help");
  });

  it("shows a server error without falsely marking unrelated fields invalid", async () => {
    mockSignUpEmail.mockImplementation((_data, { onError }) => {
      onError?.({ error: { message: "Email already in use" } });
      return Promise.resolve();
    });

    render(<SignUpForm />);

    // Fill in fields so HTML5 required validation passes
    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "password123");

    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    // Mock should have been called
    expect(mockSignUpEmail).toHaveBeenCalled();

    // Error renders inside role="alert"
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Email already in use");
    });

    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-invalid",
      "false",
    );

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

  it("routes successful signup to the verification hub", async () => {
    mockSignUpEmail.mockImplementation((_data, { onSuccess }) => {
      onSuccess?.();
      return Promise.resolve();
    });

    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "password123");

    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        "/verify-email?email=test%40example.com&callbackURL=%2Fboards&delivery=sent",
      );
    });
  });

  it("renders the page-level heading as a real h1", () => {
    render(<SignUpForm />);

    const formHeading = screen.getByRole("heading", {
      level: 1,
      name: "Create an account",
    });
    expect(formHeading).toBeInTheDocument();
  });

  it("blocks signup and scopes the error when password confirmation does not match", async () => {
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "password124");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "false");
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("passes the safe callback through signup and into the verification hub", async () => {
    mockSignUpEmail.mockImplementation((_data, { onSuccess }) => {
      onSuccess?.();
      return Promise.resolve();
    });

    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("redirect=%2Finvite%3FinvitationId%3Dinvite-1"),
    );

    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    await waitFor(() => {
      expect(mockSignUpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: "/invite?invitationId=invite-1",
        }),
        expect.anything(),
      );
    });
    expect(mockPush).toHaveBeenCalledWith(
      "/verify-email?email=test%40example.com&callbackURL=%2Finvite%3FinvitationId%3Dinvite-1&delivery=sent",
    );
  });
});
