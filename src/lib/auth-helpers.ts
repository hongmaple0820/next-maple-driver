import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Get the authenticated user from the current session.
 * Returns the user object or null if not authenticated.
 * Never throws - returns null on errors.
 */
export async function getAuthUser() {
  try {
    const session = await getServerSession(authOptions);
    return session?.user ?? null;
  } catch {
    // If session retrieval fails (e.g., database unavailable),
    // return null instead of throwing
    return null;
  }
}

/**
 * Get the authenticated user's ID from the session.
 * Returns the user ID string or null if not authenticated.
 */
export async function getAuthUserId(): Promise<string | null> {
  const user = await getAuthUser();
  return (user as Record<string, unknown> | null)?.id as string | null ?? null;
}

/**
 * Require authentication - returns the user object or an unauthorized response.
 * Use this in API routes as: const user = await requireAuth(); if (!user) return unauthorizedResponse();
 * 
 * Note: We return null instead of throwing so callers can customize their error responses.
 */
export async function requireAuth() {
  const user = await getAuthUser();
  if (!user) {
    return null;
  }
  return user;
}

/**
 * Check if the authenticated user is an admin.
 * Returns true if the user has the "admin" role, false otherwise.
 */
export async function isAuthAdmin(): Promise<boolean> {
  const user = await getAuthUser();
  return (user as Record<string, unknown> | null)?.role === "admin";
}

// Helper to create unauthorized response
export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Authentication required" },
    { status: 401 }
  );
}

// Helper to create forbidden response (authenticated but not authorized)
export function forbiddenResponse(message = "Admin access required") {
  return NextResponse.json(
    { error: message },
    { status: 403 }
  );
}
