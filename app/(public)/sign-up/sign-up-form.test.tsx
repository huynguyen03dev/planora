import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SignUpForm } from "./sign-up-form";

const { mockSignUpEmail } = vi.hoisted(() => ({
  mockSignUpEmail: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth-client", () => ({
  signUp: { email: mockSignUpEmail },
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
});
