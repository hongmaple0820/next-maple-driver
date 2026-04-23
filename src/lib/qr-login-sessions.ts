// In-memory store for QR login sessions
// Sessions expire after 5 minutes and are cleaned up periodically

export interface QrLoginSession {
  sessionId: string;
  status: "pending" | "scanned" | "confirmed" | "expired";
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userRole: string | null;
  token: string | null;
  createdAt: number;
  expiresAt: number;
}

const sessions = new Map<string, QrLoginSession>();

// Cleanup expired sessions every 2 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions) {
      if (session.expiresAt < now) {
        session.status = "expired";
        sessions.delete(key);
      }
    }
  }, 2 * 60 * 1000);
}

export function createQrLoginSession(ttlMs: number = 5 * 60 * 1000): QrLoginSession {
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const session: QrLoginSession = {
    sessionId,
    status: "pending",
    userId: null,
    userEmail: null,
    userName: null,
    userRole: null,
    token: null,
    createdAt: now,
    expiresAt: now + ttlMs,
  };
  sessions.set(sessionId, session);
  return session;
}

export function getQrLoginSession(sessionId: string): QrLoginSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  if (session.expiresAt < Date.now()) {
    session.status = "expired";
    sessions.delete(sessionId);
    return { ...session, status: "expired" };
  }
  return session;
}

export function updateQrLoginSession(sessionId: string, updates: Partial<QrLoginSession>): QrLoginSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return undefined;
  }
  Object.assign(session, updates);
  return session;
}

export function deleteQrLoginSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}
