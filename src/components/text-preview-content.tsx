"use client";

import { useState, useEffect } from "react";
import { getPreviewType, type FileItem, type PreviewType } from "@/lib/file-utils";
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 min-h-[200px]">
        <div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-[70vh]">
      <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words bg-muted/30 rounded-lg m-2">
        {textContent}
      </pre>
    </ScrollArea>
  );
}

export { TextPreviewContent };
