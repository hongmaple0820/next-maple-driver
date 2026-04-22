import { RegisterPage } from "./register-client";
import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/lib/i18n";

export default function RegisterPageWrapper() {
  return (
    <I18nProvider>
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    </I18nProvider>
  );
}
