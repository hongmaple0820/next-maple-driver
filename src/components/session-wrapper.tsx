"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import CloudDriveApp from "@/app/cloud-drive-app";
import { Loader2, Cloud } from "lucide-react";

export function SessionWrapper() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Only redirect once to prevent flickering loops
    // Middleware handles the initial redirect, but this is a client-side fallback
    if (status === "unauthenticated" && !hasRedirected.current) {
      hasRedirected.current = true;
      const callbackUrl = searchParams.get("callbackUrl") || "/";
      // Only redirect if we're not already on a public page
      // (middleware should have handled this, but just in case)
      router.replace("/login");
    }
  }, [status, router, searchParams]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <Cloud className="w-8 h-8 text-white" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading CloudDrive...</span>
          </div>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    // Show loading while redirect is happening (instead of blank/null)
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <Cloud className="w-8 h-8 text-white" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Redirecting to login...</span>
          </div>
        </div>
      </div>
    );
  }

  return <CloudDriveApp />;
}
