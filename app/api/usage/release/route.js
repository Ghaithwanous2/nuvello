import { NextResponse } from "next/server";
import { getCurrentUser, getGuestId, getUserUsage, releaseUsage, usageSubjectId } from "@/lib/auth";
import { planIdForUser, quotaSnapshot } from "@/lib/plans";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const user = await getCurrentUser();
  const planId = planIdForUser(user);
  // Read-only lookup: never mint a guest cookie just to give quota back.
  const guestId = user ? null : await getGuestId();
  const subjectId = usageSubjectId(user, guestId);

  const released = subjectId ? releaseUsage(subjectId, body?.count) : 0;

  return NextResponse.json({
    ok: true,
    released,
    guest: !user,
    ...quotaSnapshot(planId, subjectId ? getUserUsage(subjectId) : 0),
  });
}
