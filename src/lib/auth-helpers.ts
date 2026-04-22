import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function getAuthUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

export async function requireAuth() {
  const user = await getAuthUser();
  if (!user) {
    return null;
  }
  return user;
}

// Helper to create unauthorized response
export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Authentication required" },
    { status: 401 }
  );
}
