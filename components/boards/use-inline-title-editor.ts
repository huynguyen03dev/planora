"use client";

import { useRef, useState, useTransition } from "react";

type SaveResult = { success: true } | { success: false; error: string };

type UseInlineTitleEditorOptions = {
  initialTitle: string;
  canEdit: boolean;
  onSave: (nextTitle: string) => Promise<SaveResult>;
};

type UseInlineTitleEditorResult = {
  actionsMenuRef: React.MutableRefObject<HTMLDivElement | null>;
  draftTitle: string;
  editing: boolean;
  error: string;
  isPending: boolean;
  clearError: () => void;
  setError: (nextError: string) => void;
  setDraftTitle: (nextTitle: string) => void;
  startEditing: () => void;
  handleBlur: (event: React.FocusEvent<HTMLInputElement>) => void;
  handleInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  handleActionsMenuPointerDown: () => void;
  cancelEditing: () => void;
};

export function useInlineTitleEditor({
  initialTitle,
  canEdit,
  onSave,
}: UseInlineTitleEditorOptions): UseInlineTitleEditorResult {
  const [draftTitle, setDraftTitleState] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const skipBlurSaveRef = useRef(false);
  const editGenerationRef = useRef(0);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  function setDraftTitle(nextTitle: string) {
    setDraftTitleState(nextTitle);
  }

  function clearError() {
    setError("");
  }

  function startEditing() {
    if (!canEdit) {
      return;
    }

    skipBlurSaveRef.current = false;
    editGenerationRef.current += 1;
    setDraftTitleState(initialTitle);
    setError("");
    setEditing(true);
  }

  function cancelEditing() {
    skipBlurSaveRef.current = true;
    editGenerationRef.current += 1;
    setDraftTitleState(initialTitle);
    setError("");
    setEditing(false);
  }

  function saveTitle() {
    if (!canEdit) {
      setEditing(false);
      return;
    }

    if (isPending) {
      return;
    }

    const nextTitle = draftTitle.trim();

    if (nextTitle === "") {
      setError("Title is required");
      setEditing(true);
      return;
    }

    if (nextTitle === initialTitle.trim()) {
      setError("");
      setEditing(false);
      setDraftTitleState(initialTitle);
      return;
    }

    const savedGeneration = editGenerationRef.current;

    startTransition(async () => {
      const result = await onSave(nextTitle);

      if (editGenerationRef.current !== savedGeneration) {
        // The edit was cancelled (or superseded by a new edit) while
        // this save was in flight — discard the result so we never
        // reopen the editor with a stale error.
        return;
      }

      if (!result.success) {
        setError(result.error);
        setEditing(true);
        return;
      }

      setError("");
      setEditing(false);
    });
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (skipBlurSaveRef.current) {
      skipBlurSaveRef.current = false;
      return;
    }

    const nextFocused = event.relatedTarget;
    if (nextFocused instanceof Node && actionsMenuRef.current?.contains(nextFocused)) {
      return;
    }

    saveTitle();
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      saveTitle();
      return;
    }

    if (event.key === "Escape") {
      cancelEditing();
    }
  }

  function handleActionsMenuPointerDown() {
    if (editing) {
      skipBlurSaveRef.current = true;
    }
  }

  return {
    actionsMenuRef,
    draftTitle,
    editing,
    error,
    isPending,
    clearError,
    setError,
    setDraftTitle,
    startEditing,
    handleBlur,
    handleInputKeyDown,
    handleActionsMenuPointerDown,
    cancelEditing,
  };
}
