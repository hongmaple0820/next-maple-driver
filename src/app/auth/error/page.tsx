"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Cloud, AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

const errorMessages: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: "Server Configuration Error",
    description:
      "There is a problem with the server authentication configuration. Please try again later or contact support.",
  },
  AccessDenied: {
    title: "Access Denied",
    description:
      "You do not have permission to sign in. Please contact your administrator if you believe this is an error.",
  },
  Verification: {
    title: "Verification Failed",
    description:
      "The verification token has expired or has already been used. Please request a new one.",
  },
  Default: {
    title: "Authentication Failed",
    description:
      "We couldn't sign you in. Please check your credentials and try again.",
  },
  Signin: {
    title: "Sign In Failed",
    description:
      "The sign in process was interrupted. Please try again.",
  },
  OAuthSignin: {
    title: "OAuth Sign In Error",
    description:
      "There was an error initiating the OAuth sign in flow. Please try again.",
  },
  OAuthCallback: {
    title: "OAuth Callback Error",
    description:
      "There was an error processing the OAuth callback. Please try again.",
  },
  OAuthCreateAccount: {
    title: "Account Creation Failed",
    description:
      "We couldn't create your account using the OAuth provider. Please try a different sign in method.",
  },
  EmailCreateAccount: {
    title: "Account Creation Failed",
    description:
      "We couldn't create your account using this email. Please try a different method.",
  },
  Callback: {
    title: "Callback Error",
    description:
      "There was an error in the authentication callback. Please try again.",
  },
  OAuthAccountNotLinked: {
    title: "Account Not Linked",
    description:
      "This OAuth account is not linked to any existing account. Please sign in with your original method first.",
  },
  EmailSignin: {
    title: "Email Sign In Error",
    description:
      "We couldn't send the sign in email. Please check your email address and try again.",
  },
  CredentialsSignin: {
    title: "Invalid Credentials",
    description:
      "The email or password you entered is incorrect. Please check your credentials and try again.",
  },
  SessionRequired: {
    title: "Session Required",
    description:
      "You must be signed in to access this page. Please sign in and try again.",
  },
};


function AuthErrorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const errorParam = searchParams.get("error") || "Default";
  const errorInfo =
    errorMessages[errorParam] || errorMessages.Default;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-emerald-500/5 dark:bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-emerald-500/5 dark:bg-emerald-500/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="border-border/50 dark:border-border/30 shadow-xl shadow-black/5 dark:shadow-black/30 dark:bg-card">
          <CardContent className="p-8">
            {/* Logo */}
            <div className="flex items-center justify-center mb-8">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/25 dark:shadow-emerald-500/10">
                  <Cloud className="w-6 h-6 text-white" />
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-800 dark:from-emerald-400 dark:to-emerald-600 bg-clip-text text-transparent">
                  CloudDrive
                </span>
              </div>
            </div>

            {/* Error Icon */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="flex justify-center mb-6"
            >
              <div className="w-16 h-16 rounded-full bg-destructive/10 dark:bg-destructive/15 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-destructive dark:text-red-400" />
              </div>
            </motion.div>

            {/* Error Title */}
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-xl font-bold text-center mb-2 text-foreground"
            >
              {errorInfo.title}
            </motion.h1>

            {/* Error Description */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="text-sm text-muted-foreground text-center mb-6 leading-relaxed"
            >
              {errorInfo.description}
            </motion.p>

            {/* Error code (for debugging) */}
            {errorParam !== "Default" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-center mb-6"
              >
                <span className="inline-block text-[10px] font-mono text-muted-foreground/60 dark:text-muted-foreground/50 bg-muted/50 dark:bg-muted/30 px-2 py-1 rounded">
                  Error code: {errorParam}
                </span>
              </motion.div>
            )}

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="space-y-3"
            >
              <Button
                asChild
                className="w-full h-11 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg shadow-emerald-500/25 dark:shadow-emerald-500/10 transition-all duration-200"
              >
                <Link href="/login">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Login
                </Link>
              </Button>

              <Button
                variant="outline"
                className="w-full h-11 dark:border-border/50 dark:hover:bg-accent/50"
                onClick={() => router.push("/")}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Go to Home
              </Button>
            </motion.div>

            {/* Help text */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="text-xs text-muted-foreground/60 dark:text-muted-foreground/50 text-center mt-6"
            >
              If this problem persists, please contact your administrator.
            </motion.p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background dark:bg-background">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <Cloud className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
