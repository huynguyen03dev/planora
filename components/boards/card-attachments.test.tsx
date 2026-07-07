import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AttachmentRecord } from "@/lib/attachment";

// ---------------------------------------------------------------------------
// Mock Server Action
// ---------------------------------------------------------------------------
const actions = vi.hoisted(() => ({
  uploadAttachmentAction: vi.fn(),
}));

vi.mock(
  "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions",
  () => actions,
);

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------
import { CardAttachments } from "./card-attachments";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeAttachment(overrides: Partial<AttachmentRecord> = {}): AttachmentRecord {
  return {
    id: "att-1",
    cardId: "card-1",
    userId: "user-1",
    fileName: "screenshot.png",
    fileUrl: "https://example.com/screenshot.png",
    fileType: "image/png",
    fileSize: 1024 * 150, // 150 KB
    createdAt: new Date("2026-07-01T12:00:00Z"),
    user: {
      id: "user-1",
      name: "Alice",
      image: null,
    },
    ...overrides,
  };
}

function renderCardAttachments(
  props: Partial<Parameters<typeof CardAttachments>[0]> = {},
) {
  return render(
    <CardAttachments
      cardId="card-1"
      attachments={[]}
      canEdit
      {...props}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("CardAttachments", () => {
  it("renders the section heading", () => {
    renderCardAttachments();
    expect(
      screen.getByRole("heading", { name: "Attachments" }),
    ).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // canEdit = true
  // ------------------------------------------------------------------
  describe("when canEdit is true", () => {
    it("shows the upload affordance text", () => {
      renderCardAttachments({ canEdit: true });
      expect(screen.getByText("Upload and manage")).toBeInTheDocument();
    });

    it("renders the empty state with the upload prompt", () => {
      renderCardAttachments({ canEdit: true, attachments: [] });
      expect(screen.getByText(/No attachments yet/)).toBeInTheDocument();
      expect(
        screen.getByText(/Upload files to share with your team./),
      ).toBeInTheDocument();
    });

    it("shows the upload button (enabled)", () => {
      renderCardAttachments({ canEdit: true });
      expect(
        screen.getByRole("button", { name: "Upload attachment" }),
      ).toBeEnabled();
    });
  });

  // ------------------------------------------------------------------
  // canEdit = false
  // ------------------------------------------------------------------
  describe("when canEdit is false", () => {
    it("shows view-only text", () => {
      renderCardAttachments({ canEdit: false });
      expect(screen.getByText("View only")).toBeInTheDocument();
    });

    it("hides the upload button", () => {
      renderCardAttachments({ canEdit: false });
      expect(
        screen.queryByRole("button", { name: "Upload attachment" }),
      ).not.toBeInTheDocument();
    });

    it("renders empty state without the upload prompt", () => {
      renderCardAttachments({ canEdit: false, attachments: [] });
      expect(screen.getByText("No attachments yet.")).toBeInTheDocument();
      expect(
        screen.queryByText(/Upload files to share with your team./),
      ).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Attachment rows
  // ------------------------------------------------------------------
  describe("attachment rows", () => {
    it("renders each attachment with file name, size, user and date", () => {
      const att = makeAttachment();
      renderCardAttachments({ attachments: [att] });

      // File name as a link
      const link = screen.getByRole("link", { name: "screenshot.png" });
      expect(link).toHaveAttribute("href", "https://example.com/screenshot.png");
      expect(link).toHaveAttribute("download", "screenshot.png");

      // Size
      expect(screen.getByText("150.0 KB")).toBeInTheDocument();

      // User name
      expect(screen.getByText("Alice")).toBeInTheDocument();

      // Date
      expect(screen.getByText(/Jul 1/)).toBeInTheDocument();

      // Download button
      const download = screen.getByRole("link", { name: "Download" });
      expect(download).toHaveAttribute("href", "https://example.com/screenshot.png");
      expect(download).toHaveAttribute("download", "screenshot.png");
    });

    it("renders multiple attachments", () => {
      renderCardAttachments({
        attachments: [
          makeAttachment({ id: "att-1", fileName: "doc.pdf" }),
          makeAttachment({ id: "att-2", fileName: "photo.jpg" }),
        ],
      });

      expect(screen.getByRole("link", { name: "doc.pdf" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "photo.jpg" })).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Error state
  // ------------------------------------------------------------------
  describe("error display", () => {
    it("shows nothing when uploadAttachmentAction returns success", async () => {
      actions.uploadAttachmentAction.mockResolvedValue({ success: true });

      renderCardAttachments({ canEdit: true });

      // Click the upload button which programmatically clicks the hidden
      // file input — the upload action fires only when a file is selected.
      // Without a real file the action won't be called, so there's no error.
      expect(
        screen.queryByText(/upload failed/i),
      ).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Edge / regression
  // ------------------------------------------------------------------
  describe("edge cases", () => {
    it("handles attachment with zero file size", () => {
      const att = makeAttachment({ fileSize: 0 });
      renderCardAttachments({ attachments: [att] });
      expect(screen.getByText("0.0 KB")).toBeInTheDocument();
    });

    it("handles attachment with long file name", () => {
      const att = makeAttachment({
        fileName: "very-long-project-proposal-final-v3-approved.pdf",
      });
      renderCardAttachments({ attachments: [att] });
      expect(
        screen.getByRole("link", {
          name: "very-long-project-proposal-final-v3-approved.pdf",
        }),
      ).toBeInTheDocument();
    });
  });
});
