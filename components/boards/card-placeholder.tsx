"use client";

import { Card, CardContent } from "@/components/ui/card";

interface CardPlaceholderProps {
  title: string;
}

export function CardPlaceholder({ title }: CardPlaceholderProps) {
  return (
    <Card size="sm" className="cursor-pointer shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-3">
        <span className="text-sm">{title}</span>
      </CardContent>
    </Card>
  );
}
