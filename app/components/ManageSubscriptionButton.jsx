"use client";

import { ExternalLink, LoaderCircle } from "lucide-react";
import { useState } from "react";

export default function ManageSubscriptionButton({ hasBilling }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function openPortal() {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "تعذر فتح بوابة الاشتراك.");
    } catch {
      setError("تعذر الاتصال بخدمة الدفع.");
    }
    setIsLoading(false);
  }

  if (!hasBilling) return null;

  return (
    <div className="plan-action">
      <button className="button secondary" type="button" onClick={openPortal} disabled={isLoading}>
        {isLoading ? <LoaderCircle className="spin" size={17} /> : <ExternalLink size={17} />}
        إدارة الاشتراك
      </button>
      {error && <p className="plan-error">{error}</p>}
    </div>
  );
}
