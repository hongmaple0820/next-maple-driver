"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Shield, Check, X, Loader2, AlertCircle, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export function QrAuthClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const { t } = useI18n();
  const sessionId = searchParams.get("session");

  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<"confirmed" | "denied" | null>(null);
  const [error, setError] = useState("");

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(window.location.href)}`);
    }
  }, [status, router]);

  const handleConfirm = useCallback(async () => {
    if (!sessionId) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/auth/qr-login/${sessionId}/confirm`, {
        method: "POST",
      });
      if (res.ok) {
        setResult("confirmed");
      } else {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        setError(data.error || t.auth.unexpectedError);
      }
    } catch {
      setError(t.auth.unexpectedError);
    } finally {
      setConfirming(false);
    }
  }, [sessionId, t]);

  const handleDeny = useCallback(() => {
    setResult("denied");
  }, []);

  if (!sessionId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-border/50 shadow-xl">
          <CardContent className="p-8 flex flex-col items-center gap-4">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <h2 className="text-lg font-bold">{t.auth.qrExpired}</h2>
            <p className="text-sm text-muted-foreground">{t.auth.unexpectedError}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (result === "confirmed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-background p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="w-full max-w-md border-emerald-200/50 dark:border-emerald-800/30">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold">{t.auth.loginSuccessful}</h2>
              <p className="text-sm text-muted-foreground text-center">
                {t.auth.authorizeLoginDesc}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (result === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-border/50 shadow-xl">
          <CardContent className="p-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <X className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-lg font-bold">{t.auth.deny}</h2>
            <p className="text-sm text-muted-foreground text-center">
              {t.auth.authorizeLoginDesc}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-50 dark:from-emerald-950/20 dark:via-background dark:to-sky-950/20 p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Card className="border-emerald-200/50 dark:border-emerald-800/30 shadow-xl">
          <CardContent className="p-8 flex flex-col items-center gap-6">
            {/* Branding */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <Cloud className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-800 bg-clip-text text-transparent">CloudDrive</span>
            </div>

            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Shield className="w-8 h-8 text-emerald-600" />
            </div>

            {/* Title */}
            <div className="text-center">
              <h2 className="text-lg font-bold">{t.auth.authorizeLogin}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t.auth.authorizeLoginDesc}
              </p>
            </div>

            {/* User info */}
            {session?.user && (
              <div className="w-full p-3 rounded-lg bg-muted/50 border border-border/50">
                <p className="text-sm font-medium">{session.user.name}</p>
                <p className="text-xs text-muted-foreground">{session.user.email}</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleDeny}
                disabled={confirming}
              >
                <X className="w-4 h-4 mr-1.5" />
                {t.auth.deny}
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleConfirm}
                disabled={confirming}
              >
                {confirming ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-1.5" />
                )}
                {t.auth.confirm}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
