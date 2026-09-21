import { NextResponse } from "next/server";
import { authenticateUser, createSession, setSessionCookie } from "@/lib/auth";

export async function POST(request) {
  try {
    const body = await request.json();
    const user = authenticateUser(body.email, body.password);
    await setSessionCookie(createSession(user.id));
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
