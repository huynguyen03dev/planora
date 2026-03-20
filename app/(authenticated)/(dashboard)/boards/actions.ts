"use server";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/dal";
import { createWorkspaceForCurrentUser } from "@/lib/workspace";

type CreateWorkspaceResult =
  | { success: true; workspaceId: string }
  | { success: false; error: string };

export async function createWorkspaceAction(
  formData: FormData,
): Promise<CreateWorkspaceResult> {
  await verifySession();

  const nameValue = formData.get("workspaceName");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";

  if (!name) {
    return { success: false, error: "Workspace name is required" };
  }

  if (name.length < 2) {
    return {
      success: false,
      error: "Workspace name must be at least 2 characters",
    };
  }

  if (name.length > 64) {
    return {
      success: false,
      error: "Workspace name must be 64 characters or less",
    };
  }

  try {
    const workspace = await createWorkspaceForCurrentUser(name);
    revalidatePath("/boards");

    return { success: true, workspaceId: workspace.id };
  } catch {
    return {
      success: false,
      error: "Failed to create workspace. Please try again.",
    };
  }
}
