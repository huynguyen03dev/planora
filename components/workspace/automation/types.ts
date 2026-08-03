// Client-side prop shapes for the automation UI. The page (server component)
// fetches these workspace-scoped option lists and the serialized rules/logs,
// then hands them to the client tree.

export type BoardOption = { id: string; title: string };

export type ListOption = { id: string; title: string; boardId: string; boardTitle: string };

export type LabelOption = {
  id: string;
  name: string;
  color: string;
  boardId: string;
  boardTitle: string;
};

export type MemberOption = { userId: string; name: string };

export type AutomationOptions = {
  boards: BoardOption[];
  lists: ListOption[];
  labels: LabelOption[];
  members: MemberOption[];
};

// A cross-cutting cycle-loop warning persists (manual dismiss); errors and
// plain confirmations auto-dismiss.
export type NotifyVariant = "error" | "info" | "warning";

export type NotifyFn = (message: string, variant: NotifyVariant) => void;
