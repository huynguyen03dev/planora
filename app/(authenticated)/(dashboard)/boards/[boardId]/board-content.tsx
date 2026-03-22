"use client";

import { AddListButton } from "@/components/boards/add-list-button";
import { ListColumn } from "@/components/boards/list-column";
import { ScrollArea } from "@/components/ui/scroll-area";

type BoardContentProps = {
  boardId: string;
  lists: Array<{
    id: string;
    title: string;
    boardId: string;
  }>;
  canEdit: boolean;
  canDelete: boolean;
  canCreateList: boolean;
};

export function BoardContent({
  boardId,
  lists,
  canEdit,
  canDelete,
  canCreateList,
}: BoardContentProps) {
  return (
    <ScrollArea className="flex-1" showHorizontalScrollbar>
      <div className="flex w-max min-w-full gap-4 p-4">
        {lists.map((list) => (
          <ListColumn key={list.id} list={list} canEdit={canEdit} canDelete={canDelete} />
        ))}
        <AddListButton boardId={boardId} canCreate={canCreateList} />
      </div>
    </ScrollArea>
  );
}
