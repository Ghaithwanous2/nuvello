import Link from "next/link";
import { FREE_DAILY_LIMIT } from "@/lib/plans";
import AuthForm from "../components/AuthForm";

export const metadata = {
  title: "إنشاء حساب",
  description: "أنشئ حساباً في Nuvello لإدارة الاستخدام والخطة.",
  alternates: { canonical: "/signup" },
};

export default function SignupPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="section-label">ابدأ مجاناً</p>
        <h1>إنشاء حساب</h1>
        <p className="legal-lead">الخطة المجانية تشمل {FREE_DAILY_LIMIT} صورة يومياً، وترقية Pro اختيارية في أي وقت.</p>
        <AuthForm mode="register" />
        <p className="auth-switch">لديك حساب؟ <Link href="/login">سجل الدخول</Link></p>
      </section>
    </main>
  );
}
