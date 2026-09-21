import { NextResponse } from "next/server";
import { clearUserSessions, getCurrentUser, requireAdmin, resetUserUsage, setUserPlan, setUserRole } from "@/lib/auth";

export async function POST(request) {
  try {
    const currentUser = await getCurrentUser();
    requireAdmin(currentUser);

    const { userId, action, value } = await request.json();
    if (!userId || !action) throw new Error("طلب غير مكتمل.");

    if (action === "plan") await setUserPlan(userId, value);
    else if (action === "role") await setUserRole(userId, value);
    else if (action === "clearSessions") await clearUserSessions(userId);
    else if (action === "resetUsage") await resetUserUsage(userId);
    else throw new Error("إجراء غير معروف.");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
}
