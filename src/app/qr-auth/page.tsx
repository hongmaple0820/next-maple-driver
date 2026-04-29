import { Suspense } from "react";
import { QrAuthClient } from "./qr-auth-client";
import { I18nProvider } from "@/lib/i18n";

export default function QrAuthPage() {
  return (
    <I18nProvider>
      <Suspense>
        <QrAuthClient />
      </Suspense>
    </I18nProvider>
  );
}
