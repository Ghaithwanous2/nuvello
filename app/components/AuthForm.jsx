"use client";

import { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";

export default function AuthForm({ mode }) {
  const isRegister = mode === "register";
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
    };

    const response = await fetch(isRegister ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setIsLoading(false);

    if (!response.ok) {
      setError(data.error || "حدث خطأ غير متوقع.");
      return;
    }

    window.location.href = "/account";
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      {isRegister && (
        <label>
          <span>الاسم</span>
          <input name="name" type="text" minLength="2" required autoComplete="name" />
        </label>
      )}
      <label>
        <span>البريد الإلكتروني</span>
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        <span>كلمة المرور</span>
        <input name="password" type="password" minLength="8" required autoComplete={isRegister ? "new-password" : "current-password"} />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button className="button primary auth-submit" type="submit" disabled={isLoading}>
        {isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
        {isLoading ? "جار المعالجة..." : isRegister ? "إنشاء حساب" : "تسجيل الدخول"}
      </button>
    </form>
  );
}
