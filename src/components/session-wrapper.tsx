"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import CloudDriveApp from "@/app/cloud-drive-app";
import { Loader2, Cloud } from "lucide-react";

/**
 * SessionWrapper handles the client-side session check.
 * 
 * Auth flow:
 * 1. Middleware (server-side) redirects unauthenticated users to /login
 * 2. This component is a client-side fallback that handles edge cases
 *    and shows appropriate loading states
 */
export function SessionWrapper() {
  const { status } = useSession();
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Client-side fallback: redirect if middleware didn't catch it
    // (e.g., when JS takes over navigation)
    if (status === "unauthenticated" && !hasRedirected.current) {
      hasRedirected.current = true;
      router.replace("/login");
    }
  }, [status, router]);

  // Show a stable loading state while session is being resolved
  // This prevents the flash of content before redirect
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

  // Show redirecting state briefly (middleware should have already redirected)
  if (status === "unauthenticated") {
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
