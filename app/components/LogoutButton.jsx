"use client";

import { LogOut } from "lucide-react";

export default function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <button className="button secondary" type="button" onClick={logout}>
      <LogOut size={17} />
      خروج
    </button>
  );
}
