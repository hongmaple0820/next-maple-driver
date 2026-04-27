import { LoginPage } from "./login-client";
import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/lib/i18n";

export default function LoginPageWrapper() {
  return (
    <I18nProvider>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </I18nProvider>
  );
}
