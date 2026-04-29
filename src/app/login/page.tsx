import { LoginPage } from "./login-client";
import { I18nProvider } from "@/lib/i18n";

export default function LoginPageWrapper() {
  return (
    <I18nProvider>
      <LoginPage />
    </I18nProvider>
  );
}
