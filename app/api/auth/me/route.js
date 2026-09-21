import { NextResponse } from "next/server";
import { getCurrentUser, getGuestId, getUserSubscription, getUserUsage, usageSubjectId } from "@/lib/auth";
import { planIdForUser, quotaSnapshot } from "@/lib/plans";

export async function GET() {
  const user = await getCurrentUser();

  if (user) {
    const usage = await getUserUsage(user.id);
    return NextResponse.json({
      user,
      guest: false,
      ...quotaSnapshot(planIdForUser(user), usage),
      subscription: await getUserSubscription(user.id),
    });
  }

  const guestId = await getGuestId({ create: true });
  const usage = await getUserUsage(usageSubjectId(null, guestId));
  return NextResponse.json({ user: null, guest: true, ...quotaSnapshot("guest", usage) });
}
