"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cloud, Shield, Zap, Globe, Eye, EyeOff, Loader2, ArrowRight, Check,
  QrCode, RefreshCw, CheckCircle2, Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import Link from "next/link";
import QRCode from "qrcode";

type QrLoginState = "idle" | "loading" | "pending" | "scanned" | "confirmed" | "expired" | "error";

function getPasswordStrength(password: string): { level: number; label: string; color: string } {
  if (password.length === 0) return { level: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: "weak", color: "bg-red-400" };
  if (score === 2) return { level: 2, label: "fair", color: "bg-amber-400" };
  if (score === 3) return { level: 3, label: "good", color: "bg-emerald-400" };
  return { level: 4, label: "strong", color: "bg-emerald-500" };
}

export function LoginRegisterPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<"login" | "register" | "qrcode">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");

  // QR login state
  const [qrLoginState, setQrLoginState] = useState<QrLoginState>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrSessionId, setQrSessionId] = useState<string>("");
  const [expiresIn, setExpiresIn] = useState<number>(300);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  const features = [
    { icon: Shield, title: t.auth.secureStorage, description: t.auth.secureStorageDesc },
    { icon: Zap, title: t.auth.lightningFast, description: t.auth.lightningFastDesc },
    { icon: Globe, title: t.auth.accessAnywhere, description: t.auth.accessAnywhereDesc },
  ];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email: loginEmail,
        password: loginPassword,
        redirect: false,
      });

      if (result?.error) {
        setError(t.auth.invalidCredentials);
      } else {
        router.push("/");
      }
    } catch {
      setError(t.auth.unexpectedError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (registerPassword !== registerConfirmPassword) {
      setError(t.auth.passwordMismatch);
      return;
    }

    if (registerPassword.length < 6) {
      setError(t.auth.passwordTooShort);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: registerName,
          email: registerEmail,
          password: registerPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.includes("already") || data.error?.includes("exists")) {
          setError(t.auth.emailExists);
        } else {
          setError(data.error || t.auth.registrationFailed);
        }
        return;
      }

      // Auto sign in after successful registration
      await signIn("credentials", {
        email: registerEmail,
        password: registerPassword,
        redirect: false,
      });

      router.push("/");
    } catch {
      setError(t.auth.unexpectedError);
    } finally {
      setIsLoading(false);
    }
  };

  // QR Login: Generate a new QR session
  const generateQrSession = useCallback(async () => {
    setQrLoginState("loading");
    setQrDataUrl("");

    try {
      const res = await fetch("/api/auth/qr-login", {
        method: "POST",
      });

      if (!res.ok) {
        setQrLoginState("error");
        return;
      }

      const data = await res.json();
      setQrSessionId(data.sessionId);
      setExpiresIn(300);

      const qrUrl = await QRCode.toDataURL(data.qrData, {
        width: 200,
        margin: 2,
        color: {
          dark: "#059669",
          light: "#ffffff",
        },
        errorCorrectionLevel: "M",
      });
      setQrDataUrl(qrUrl);
      setQrLoginState("pending");
    } catch {
      setQrLoginState("error");
    }
  }, []);

  // Start polling when QR is generated
  useEffect(() => {
    if (qrLoginState !== "pending" && qrLoginState !== "scanned") {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/qr-login/${qrSessionId}`);
        if (!res.ok) {
          setQrLoginState("error");
          return;
        }
        const data = await res.json();

        if (data.status === "expired") {
          setQrLoginState("expired");
        } else if (data.status === "scanned") {
          setQrLoginState("scanned");
        } else if (data.status === "confirmed" && data.token) {
          setQrLoginState("confirmed");
          try {
            await signIn("credentials", {
              email: "__qr_token__",
              password: data.token,
              redirect: false,
            });
            router.push("/");
          } catch {
            setQrLoginState("error");
          }
        }
      } catch {
        // Network error, keep polling
      }
    }, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [qrLoginState, qrSessionId, router]);

  // Countdown timer
  useEffect(() => {
    if (qrLoginState !== "pending" && qrLoginState !== "scanned") {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    countdownRef.current = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev <= 1) {
          setQrLoginState("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [qrLoginState]);

  // Generate QR when switching to QR tab
  useEffect(() => {
    if (activeTab === "qrcode" && qrLoginState === "idle") {
      generateQrSession();
    }
  }, [activeTab, qrLoginState, generateQrSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const switchTab = (tab: "login" | "register" | "qrcode") => {
    setActiveTab(tab);
    setError("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const passwordStrength = getPasswordStrength(registerPassword);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left branding panel - hidden on mobile */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid-shared" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-shared)" />
          </svg>
        </div>

        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-emerald-300/10 blur-3xl" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-16 xl:px-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {/* Logo */}
            <div className="flex items-center gap-4 mb-10">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-xl">
                <Cloud className="w-8 h-8 text-white" />
              </div>
              <span className="text-3xl font-bold text-white tracking-tight">CloudDrive</span>
            </div>

            {/* Tagline */}
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
              {t.auth.secureCloudStorage}
              <br />
              {t.auth.forAllYourFiles}
            </h1>
            <p className="text-emerald-100/80 text-lg mb-12 max-w-md">
              {t.auth.storeShareManage}
            </p>

            {/* Features */}
            <div className="space-y-5">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 + index * 0.15, ease: "easeOut" }}
                  className="flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/15 shrink-0">
                    <feature.icon className="w-5 h-5 text-emerald-200" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-base">{feature.title}</h3>
                    <p className="text-emerald-200/70 text-sm">{feature.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-emerald-900/50 to-transparent" />
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 lg:p-12 relative">
        {/* Language switcher - top right */}
        <div className="absolute top-4 right-4">
          <LanguageSwitcher variant="ghost" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-[420px]"
        >
          {/* Mobile-only branding */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-800 bg-clip-text text-transparent">CloudDrive</span>
          </div>

          <Card className="border-border/50 shadow-xl shadow-black/5 dark:shadow-black/20">
            <CardContent className="p-6 sm:p-8">
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight">
                  {activeTab === "login" ? t.auth.welcomeBack : t.auth.createAccount}
                </h2>
                <p className="text-muted-foreground text-sm mt-1.5">
                  {activeTab === "login"
                    ? t.auth.signInToAccess
                    : t.auth.getStarted}
                </p>
              </div>

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={(v) => switchTab(v as "login" | "register" | "qrcode")}>
                <TabsList className="grid w-full grid-cols-3 mb-6 h-10">
                  <TabsTrigger value="login" className="gap-1 text-xs sm:text-sm">
                    <Shield className="w-3.5 h-3.5 hidden sm:block" />
                    {t.auth.signIn}
                  </TabsTrigger>
                  <TabsTrigger value="register" className="gap-1 text-xs sm:text-sm">
                    {t.auth.createAccount}
                  </TabsTrigger>
                  <TabsTrigger value="qrcode" className="gap-1 text-xs sm:text-sm">
                    <QrCode className="w-3.5 h-3.5 hidden sm:block" />
                    {t.auth.qrLogin}
                  </TabsTrigger>
                </TabsList>

                {/* Error message */}
                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, y: -8, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: "auto" }}
                      exit={{ opacity: 0, y: -8, height: 0 }}
                      className="mb-4 overflow-hidden"
                    >
                      <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-2">
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zM8 11a1 1 0 100-2 1 1 0 000 2z"/>
                        </svg>
                        {error}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Login Form */}
                <TabsContent value="login" className="mt-0">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">{t.auth.email}</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder={t.auth.enterEmail}
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                        disabled={isLoading}
                        autoComplete="email"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-password">{t.auth.password}</Label>
                        <button
                          type="button"
                          className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium transition-colors"
                        >
                          {t.auth.forgotPassword}
                        </button>
                      </div>
                      <div className="relative">
                        <Input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          placeholder={t.auth.enterPassword}
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          required
                          disabled={isLoading}
                          autoComplete="current-password"
                          className="h-11 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    {/* Remember me */}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="remember-me"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked === true)}
                        className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                      />
                      <Label htmlFor="remember-me" className="text-sm text-muted-foreground cursor-pointer select-none">
                        {t.auth.rememberMe}
                      </Label>
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-11 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg shadow-emerald-500/25 transition-all duration-200"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t.auth.signingIn}
                        </>
                      ) : (
                        <>
                          {t.auth.signIn}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </form>
                </TabsContent>

                {/* Register Form */}
                <TabsContent value="register" className="mt-0">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-name">{t.auth.fullName}</Label>
                      <Input
                        id="register-name"
                        type="text"
                        placeholder={t.auth.enterName}
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                        required
                        disabled={isLoading}
                        autoComplete="name"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-email">{t.auth.email}</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder={t.auth.enterEmail}
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        required
                        disabled={isLoading}
                        autoComplete="email"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">{t.auth.password}</Label>
                      <div className="relative">
                        <Input
                          id="register-password"
                          type={showPassword ? "text" : "password"}
                          placeholder={t.auth.atLeast6Chars}
                          value={registerPassword}
                          onChange={(e) => setRegisterPassword(e.target.value)}
                          required
                          disabled={isLoading}
                          autoComplete="new-password"
                          className="h-11 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {/* Password strength indicator */}
                      <AnimatePresence>
                        {registerPassword.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="flex gap-1 mt-1.5">
                              {[1, 2, 3, 4].map((level) => (
                                <div
                                  key={level}
                                  className={cn(
                                    "h-1.5 flex-1 rounded-full transition-colors duration-300",
                                    level <= passwordStrength.level
                                      ? passwordStrength.color
                                      : "bg-muted"
                                  )}
                                />
                              ))}
                            </div>
                            <p className={cn(
                              "text-xs mt-1 font-medium",
                              passwordStrength.level <= 1 && "text-red-500",
                              passwordStrength.level === 2 && "text-amber-500",
                              passwordStrength.level === 3 && "text-emerald-500",
                              passwordStrength.level >= 4 && "text-emerald-600",
                            )}>
                              {passwordStrength.level <= 1 && t.auth.passwordWeak}
                              {passwordStrength.level === 2 && t.auth.passwordFair}
                              {passwordStrength.level === 3 && t.auth.passwordGood}
                              {passwordStrength.level >= 4 && t.auth.passwordStrong}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-confirm">{t.auth.confirmPassword}</Label>
                      <div className="relative">
                        <Input
                          id="register-confirm"
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder={t.auth.repeatPassword}
                          value={registerConfirmPassword}
                          onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                          required
                          disabled={isLoading}
                          autoComplete="new-password"
                          className="h-11 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          tabIndex={-1}
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {registerConfirmPassword.length > 0 && registerPassword === registerConfirmPassword && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-1.5 mt-1.5 text-emerald-600 dark:text-emerald-400"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">{t.auth.passwordsMatch}</span>
                        </motion.div>
                      )}
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-11 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg shadow-emerald-500/25 transition-all duration-200"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t.auth.creatingAccount}
                        </>
                      ) : (
                        <>
                          {t.auth.createAccountBtn}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </form>
                </TabsContent>

                {/* QR Code Login Tab */}
                <TabsContent value="qrcode" className="mt-0">
                  <div className="flex flex-col items-center py-4">
                    <AnimatePresence mode="wait">
                      {/* Loading state */}
                      {qrLoginState === "loading" && (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center gap-4 py-8"
                        >
                          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                          <p className="text-sm text-muted-foreground">{t.auth.signingIn}</p>
                        </motion.div>
                      )}

                      {/* Pending - show QR code */}
                      {(qrLoginState === "pending" || qrLoginState === "scanned") && qrDataUrl && (
                        <motion.div
                          key="qr"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="flex flex-col items-center gap-4"
                        >
                          {/* QR Code */}
                          <div className="relative">
                            <div className={cn(
                              "p-4 bg-white rounded-2xl shadow-lg border border-border/50 transition-opacity duration-300",
                              qrLoginState === "scanned" && "opacity-50",
                            )}>
                              <img
                                src={qrDataUrl}
                                alt="QR Code"
                                width={200}
                                height={200}
                                className="rounded-lg"
                              />
                            </div>

                            {/* Scanned overlay */}
                            {qrLoginState === "scanned" && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-2xl"
                              >
                                <div className="text-center">
                                  <Smartphone className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                                  <p className="text-sm font-medium text-emerald-700">
                                    {t.auth.scannedWaitingConfirm}
                                  </p>
                                </div>
                              </motion.div>
                            )}
                          </div>

                          {/* Status text */}
                          <div className="text-center">
                            <p className="text-sm font-medium mb-1">
                              {qrLoginState === "pending"
                                ? t.auth.waitingForScan
                                : t.auth.scannedWaitingConfirm}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t.auth.qrLoginDesc}
                            </p>
                          </div>

                          {/* Countdown & Refresh */}
                          <div className="flex items-center gap-4 mt-2">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <div className={cn(
                                "w-2 h-2 rounded-full",
                                expiresIn > 60 ? "bg-emerald-500" : expiresIn > 30 ? "bg-amber-500" : "bg-destructive",
                                expiresIn <= 30 && "animate-pulse",
                              )} />
                              <span>
                                {t.auth.qrExpiresIn.replace("{seconds}", String(expiresIn))}
                              </span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 h-7 text-xs"
                              onClick={generateQrSession}
                            >
                              <RefreshCw className="w-3 h-3" />
                              {t.auth.refreshQr}
                            </Button>
                          </div>
                        </motion.div>
                      )}

                      {/* Confirmed */}
                      {qrLoginState === "confirmed" && (
                        <motion.div
                          key="confirmed"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center gap-4 py-8"
                        >
                          <div className="p-4 rounded-full bg-emerald-500/10">
                            <CheckCircle2 className="w-12 h-12 text-emerald-600" />
                          </div>
                          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                            {t.auth.loginSuccessful}
                          </p>
                        </motion.div>
                      )}

                      {/* Expired */}
                      {qrLoginState === "expired" && (
                        <motion.div
                          key="expired"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center gap-4 py-6"
                        >
                          <div className="p-4 rounded-full bg-muted">
                            <QrCode className="w-12 h-12 text-muted-foreground" />
                          </div>
                          <p className="text-sm font-medium">{t.auth.qrExpired}</p>
                          <Button
                            className="gap-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg shadow-emerald-500/25"
                            onClick={generateQrSession}
                          >
                            <RefreshCw className="w-4 h-4" />
                            {t.auth.refreshQr}
                          </Button>
                        </motion.div>
                      )}

                      {/* Error */}
                      {qrLoginState === "error" && (
                        <motion.div
                          key="error"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center gap-4 py-6"
                        >
                          <div className="p-4 rounded-full bg-destructive/10">
                            <QrCode className="w-12 h-12 text-destructive" />
                          </div>
                          <p className="text-sm font-medium text-destructive">
                            {t.auth.unexpectedError}
                          </p>
                          <Button
                            className="gap-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg shadow-emerald-500/25"
                            onClick={generateQrSession}
                          >
                            <RefreshCw className="w-4 h-4" />
                            {t.auth.refreshQr}
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Footer */}
              <div className="mt-6 pt-5 border-t border-border/50">
                <p className="text-xs text-muted-foreground text-center leading-relaxed">
                  {t.auth.byContinuing}{" "}
                  <span className="underline cursor-pointer hover:text-foreground transition-colors">
                    {t.auth.termsOfService}
                  </span>{" "}
                  {t.auth.and}{" "}
                  <span className="underline cursor-pointer hover:text-foreground transition-colors">
                    {t.auth.privacyPolicy}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Demo credentials hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="mt-4 text-center"
          >
            <p className="text-xs text-muted-foreground/60">
              {t.auth.demoHint}
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
