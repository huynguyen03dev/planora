import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  updateMemberRoleAction: vi.fn(),
  removeMemberAction: vi.fn(),
  leaveWorkspaceAction: vi.fn(),
}));

const routerRefresh = vi.hoisted(() => vi.fn());
const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: routerPush }),
}));

vi.mock(
  "@/app/(authenticated)/(dashboard)/workspace/[slug]/members/actions",
  () => actions,
);

import { MemberRow } from "./member-row";
import type { ManagedWorkspaceMember } from "@/lib/workspace-members";

const user = userEvent.setup({ pointerEventsCheck: 0 });

function makeMember(
  overrides: Partial<ManagedWorkspaceMember> = {},
): ManagedWorkspaceMember {
  return {
    memberId: "member-1",
    userId: "user-1",
    name: "Alice",
    email: "alice@example.com",
    image: null,
    role: "editor",
    ...overrides,
  };
}

type MemberRowProps = Parameters<typeof MemberRow>[0];

function renderRow(props: Partial<MemberRowProps> = {}) {
  const onError = props.onError ?? vi.fn();
  const rendered = render(
    <MemberRow
      workspaceId="ws-1"
      member={makeMember()}
      canManage={true}
      isSelf={false}
      onError={onError}
      {...props}
    />,
  );
  return { onError, ...rendered };
}

describe("MemberRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.updateMemberRoleAction.mockResolvedValue({ success: true });
    actions.removeMemberAction.mockResolvedValue({ success: true });
    actions.leaveWorkspaceAction.mockResolvedValue({
      success: true,
      redirectTo: "/workspaces",
    });
  });

  // ── Rendering ────────────────────────────────────────────────────────────

  it("renders member name, email, and role", () => {
    renderRow({
      member: makeMember({
        name: "Alice",
        email: "alice@example.com",
        role: "editor",
      }),
    });

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("shows (you) indicator when isSelf", () => {
    renderRow({ isSelf: true, member: makeMember({ name: "Alice" }) });
    expect(screen.getByText("(you)")).toBeInTheDocument();
  });

  it("renders Badge instead of Select when canManage is false", () => {
    renderRow({ canManage: false, member: makeMember({ role: "viewer" }) });

    expect(screen.getByText("Viewer")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders Badge with crown icon for admin role", () => {
    renderRow({ canManage: false, member: makeMember({ role: "admin" }) });
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("renders Select trigger for role when canManage is true", () => {
    renderRow({ canManage: true, member: makeMember({ role: "editor" }) });
    expect(
      screen.getByRole("combobox", { name: "Role for Alice" }),
    ).toBeInTheDocument();
  });

  // ── Menu visibility ──────────────────────────────────────────────────────

  it("hides the actions menu when canManage is false and isSelf is false", () => {
    renderRow({
      canManage: false,
      isSelf: false,
      member: makeMember({ name: "Alice" }),
    });

    expect(
      screen.queryByLabelText("Actions for Alice"),
    ).not.toBeInTheDocument();
  });

  it("shows Leave workspace in menu when isSelf", async () => {
    renderRow({ isSelf: true, member: makeMember({ name: "Alice" }) });

    await user.click(screen.getByLabelText("Actions for Alice"));
    expect(screen.getByText("Leave workspace")).toBeInTheDocument();
  });

  it("shows Remove from workspace in menu when canManage and not self", async () => {
    renderRow({
      canManage: true,
      isSelf: false,
      member: makeMember({ name: "Alice" }),
    });

    await user.click(screen.getByLabelText("Actions for Alice"));
    expect(screen.getByText("Remove from workspace")).toBeInTheDocument();
  });

  // ── Remove member ────────────────────────────────────────────────────────

  it("removes a member via confirm dialog and refreshes on success", async () => {
    renderRow({ member: makeMember({ name: "Alice", userId: "user-1" }) });

    await user.click(screen.getByLabelText("Actions for Alice"));
    await user.click(screen.getByText("Remove from workspace"));

    expect(screen.getByText("Remove Alice?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(actions.removeMemberAction).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        targetUserId: "user-1",
      });
      expect(routerRefresh).toHaveBeenCalled();
    });
  });

  it("shows admin-specific warning when removing an admin", async () => {
    renderRow({ member: makeMember({ name: "Bob", role: "admin" }) });

    await user.click(screen.getByLabelText("Actions for Bob"));
    await user.click(screen.getByText("Remove from workspace"));

    expect(
      screen.getByText(/This member is an admin/),
    ).toBeInTheDocument();
  });

  it("shows inline error in dialog and does not call onError when remove fails", async () => {
    actions.removeMemberAction.mockResolvedValue({
      success: false,
      error: "Cannot remove last admin",
    });
    const onError = vi.fn();
    renderRow({ onError, member: makeMember({ name: "Alice" }) });

    await user.click(screen.getByLabelText("Actions for Alice"));
    await user.click(screen.getByText("Remove from workspace"));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(
        screen.getByText("Cannot remove last admin"),
      ).toBeInTheDocument();
    });
    expect(onError).not.toHaveBeenCalled();
  });

  // ── Leave workspace ──────────────────────────────────────────────────────

  it("calls leaveWorkspaceAction and navigates on leave confirm", async () => {
    renderRow({ isSelf: true, member: makeMember({ name: "Alice" }) });

    await user.click(screen.getByLabelText("Actions for Alice"));
    await user.click(screen.getByText("Leave workspace"));

    expect(screen.getByText("Leave this workspace?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Leave" }));

    await waitFor(() => {
      expect(actions.leaveWorkspaceAction).toHaveBeenCalledWith({
        workspaceId: "ws-1",
      });
      expect(routerPush).toHaveBeenCalledWith("/workspaces");
      expect(routerRefresh).toHaveBeenCalled();
    });
  });

  it("shows inline error in leave dialog when leaveWorkspaceAction fails", async () => {
    actions.leaveWorkspaceAction.mockResolvedValue({
      success: false,
      error: "You are the last admin",
    });
    renderRow({ isSelf: true, member: makeMember({ name: "Alice" }) });

    await user.click(screen.getByLabelText("Actions for Alice"));
    await user.click(screen.getByText("Leave workspace"));
    await user.click(screen.getByRole("button", { name: "Leave" }));

    await waitFor(() => {
      expect(screen.getByText("You are the last admin")).toBeInTheDocument();
    });
  });

  // ── Role change ──────────────────────────────────────────────────────────

  it("calls updateMemberRoleAction on role change via Select", async () => {
    renderRow({
      member: makeMember({ role: "editor", userId: "user-1", name: "Alice" }),
    });

    const trigger = screen.getByRole("combobox", {
      name: "Role for Alice",
    });
    await user.click(trigger);

    const adminOption = screen.getByRole("option", { name: "Admin" });
    await user.click(adminOption);

    await waitFor(() => {
      expect(actions.updateMemberRoleAction).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        targetUserId: "user-1",
        role: "admin",
      });
      expect(routerRefresh).toHaveBeenCalled();
    });
  });

  it("calls onError when updateMemberRoleAction fails", async () => {
    actions.updateMemberRoleAction.mockResolvedValue({
      success: false,
      error: "Not authorized",
    });
    const onError = vi.fn();
    renderRow({
      onError,
      member: makeMember({ role: "editor", userId: "user-1", name: "Alice" }),
    });

    const trigger = screen.getByRole("combobox", {
      name: "Role for Alice",
    });
    await user.click(trigger);

    const adminOption = screen.getByRole("option", { name: "Admin" });
    await user.click(adminOption);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Not authorized");
    });
  });
});
