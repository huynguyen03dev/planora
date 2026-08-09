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

  it("expands the trigger hit area around the avatar to >=36px pointer / >=44px coarse", () => {
    sessionState.data = {
      user: { name: "Jane Doe", email: "jane@example.com", image: null },
    };
    render(<UserButton />);

    const trigger = screen.getByRole("button", {
      name: "Open account menu for Jane Doe",
    });
    // 32px avatar + p-0.5 (2px each side) = 36px pointer target; p-1.5 on
    // coarse = 44px. The avatar's own size is unchanged (no desktop bulk).
    expect(trigger).toHaveClass("p-0.5", "pointer-coarse:p-1.5");
    expect(trigger.querySelector(".size-8")).toBeInTheDocument();
  });
});
