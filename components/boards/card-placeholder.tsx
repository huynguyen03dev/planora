"use client";

import { Card, CardContent } from "@/components/ui/card";

interface CardPlaceholderProps {
  title: string;
}

export function CardPlaceholder({ title }: CardPlaceholderProps) {
  return (
    <Card size="sm" className="cursor-pointer shadow-sm hover:shadow-md transition-shadow">
      {/* Padding tracks ListCardItem's compact p-2 (US-044) so the placeholder
          height matches the dragged card and the board doesn't reflow on drop. */}
      <CardContent className="p-2">
        <span className="text-sm">{title}</span>
      </CardContent>
    </Card>
  );
}
