import { NextResponse } from "next/server";
import { getCurrentUser, getGuestId, reserveUsage, usageSubjectId } from "@/lib/auth";
import { FREE_DAILY_LIMIT, GUEST_DAILY_LIMIT, dailyLimitForPlan, planIdForUser, quotaSnapshot } from "@/lib/plans";

function limitMessage(planId) {
  if (planId === "guest") return `استنفدت حصة الزائر لهذا اليوم (${GUEST_DAILY_LIMIT} صور).`;
  return `وصلت إلى حد الخطة المجانية لهذا اليوم (${FREE_DAILY_LIMIT} صورة).`;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const requested = Math.max(1, Math.floor(Number(body?.count)) || 1);

  const user = await getCurrentUser();
  const planId = planIdForUser(user);
  const guestId = user ? null : await getGuestId({ create: true });
  const subjectId = usageSubjectId(user, guestId);
  if (!subjectId) {
    return NextResponse.json({ error: "تعذر تحديد الحصة اليومية." }, { status: 400 });
  }

  // Reserved, not charged: the client releases quota for images that fail.
  const reserved = await reserveUsage(subjectId, requested, dailyLimitForPlan(planId));
  const payload = { guest: !user, allowed: reserved.allowed, ...quotaSnapshot(planId, reserved.usage) };

  if (reserved.allowed === 0) {
    return NextResponse.json({ ok: false, ...payload, error: limitMessage(planId) }, { status: 403 });
  }

  return NextResponse.json({ ok: true, ...payload });
}
