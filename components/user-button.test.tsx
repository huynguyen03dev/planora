/**
 * UserButton — the account-menu trigger needs a stable accessible name.
 *
 * The trigger is an avatar; without an explicit label its name would fall back
 * to the initials (or nothing while the session loads). The label must be
 * present and stable in both the pending and loaded states.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/realtime/client", () => ({
  disconnectSocket: vi.fn(),
}));

const sessionState = vi.hoisted(() => ({
  data: null as { user: { name: string; email: string; image: string | null } } | null,
  isPending: false,
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => sessionState,
  signOut: vi.fn(),
}));

import { UserButton } from "./user-button";

describe("UserButton — account-menu trigger accessible name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.data = null;
    sessionState.isPending = false;
  });

  it("names the trigger with the signed-in user (stable, not initials)", () => {
    sessionState.data = {
      user: { name: "Jane Doe", email: "jane@example.com", image: null },
    };
    render(<UserButton />);

    expect(
      screen.getByRole("button", { name: "Open account menu for Jane Doe" }),
    ).toBeInTheDocument();
  });

  it("still names the trigger while the session is pending (no dead name)", () => {
    sessionState.data = null;
    sessionState.isPending = true;
    render(<UserButton />);

    expect(
      screen.getByRole("button", { name: "Open account menu" }),
    ).toBeInTheDocument();
  });

  it("falls back to the generic name when the session has no user data", () => {
    sessionState.data = null;
    sessionState.isPending = false;
    render(<UserButton />);

    expect(
      screen.getByRole("button", { name: "Open account menu" }),
    ).toBeInTheDocument();
  });
});
