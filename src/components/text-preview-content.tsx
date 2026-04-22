"use client";

import { useState, useEffect, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

function TextPreviewContent({ fileId }: { fileId: string }) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/files/download?id=${fileId}`)
      .then((res) => {
        if (res.ok) return res.text();
        throw new Error("Failed to load");
      })
      .then((text) => {
        if (!cancelled) setTextContent(text);
      })
      .catch(() => {
        if (!cancelled) setTextContent("Failed to load file content.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const lines = useMemo(() => {
    if (!textContent) return [];
    return textContent.split("\n");
  }, [textContent]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 min-h-[200px]">
        <div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-[70vh]">
      <div className="flex min-w-0 m-2 bg-muted/30 rounded-lg overflow-hidden">
        {/* Line numbers */}
        <div className="flex-shrink-0 py-4 px-2 text-right select-none border-r border-border/50 bg-muted/50">
          {lines.map((_, index) => (
            <div
              key={index}
              className="text-xs font-mono text-muted-foreground/50 leading-5 h-5"
            >
              {index + 1}
            </div>
          ))}
        </div>
        {/* Code content */}
        <pre className="flex-1 p-4 text-sm font-mono whitespace-pre-wrap break-words min-w-0 overflow-x-auto">
          {textContent}
        </pre>
      </div>
    </ScrollArea>
  );
}

export { TextPreviewContent };
