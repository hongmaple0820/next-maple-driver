import { RegisterPage } from "./register-client";
import { I18nProvider } from "@/lib/i18n";

export default function RegisterPageWrapper() {
  return (
    <I18nProvider>
      <RegisterPage />
    </I18nProvider>
  );
}
