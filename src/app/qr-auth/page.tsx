import { Suspense } from "react";
import { QrAuthClient } from "./qr-auth-client";
import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/lib/i18n";

export default function QrAuthPage() {
  return (
    <I18nProvider>
      <AuthProvider>
        <Suspense>
          <QrAuthClient />
        </Suspense>
      </AuthProvider>
    </I18nProvider>
  );
}
