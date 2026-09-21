import Link from "next/link";
import AuthForm from "../components/AuthForm";

export const metadata = {
  title: "تسجيل الدخول",
  description: "سجل الدخول إلى حسابك في Nuvello.",
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="section-label">Nuvello Account</p>
        <h1>تسجيل الدخول</h1>
        <p className="legal-lead">ادخل إلى حسابك لمتابعة استخدامك اليومي وإدارة الخطة.</p>
        <AuthForm mode="login" />
        <p className="auth-switch">ليس لديك حساب؟ <Link href="/signup">أنشئ حساباً جديداً</Link></p>
      </section>
    </main>
  );
}
