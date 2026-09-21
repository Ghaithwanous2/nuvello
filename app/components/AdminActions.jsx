"use client";

import { Crown, RotateCcw, Shield, ShieldOff, UserX } from "lucide-react";
import { useState } from "react";

export default function AdminActions({ user }) {
  const [isLoading, setIsLoading] = useState(false);

  async function runAction(action, value) {
    setIsLoading(true);
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, action, value }),
    });
    setIsLoading(false);

    if (!response.ok) {
      const data = await response.json();
      alert(data.error || "تعذر تنفيذ العملية.");
      return;
    }

    window.location.reload();
  }

  return (
    <div className="admin-actions-row">
      <button className="mini-button" type="button" disabled={isLoading} onClick={() => runAction("plan", user.plan === "pro" ? "free" : "pro")}>
        <Crown size={15} />
        {user.plan === "pro" ? "Free" : "Pro"}
      </button>
      <button className="mini-button" type="button" disabled={isLoading} onClick={() => runAction("role", user.role === "admin" ? "user" : "admin")}>
        {user.role === "admin" ? <ShieldOff size={15} /> : <Shield size={15} />}
        {user.role === "admin" ? "User" : "Admin"}
      </button>
      <button className="mini-button" type="button" disabled={isLoading} onClick={() => runAction("resetUsage")}>
        <RotateCcw size={15} />
        تصفير
      </button>
      <button className="mini-button danger" type="button" disabled={isLoading} onClick={() => runAction("clearSessions")}>
        <UserX size={15} />
        إخراج
      </button>
    </div>
  );
}
