import { NextResponse } from "next/server";
import { createSession, createUser, setSessionCookie } from "@/lib/auth";

export async function POST(request) {
  try {
    const body = await request.json();
    const user = await createUser(body);
    await setSessionCookie(await createSession(user.id));
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
