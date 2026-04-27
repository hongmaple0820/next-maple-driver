// In-memory store for QR upload sessions
// Sessions expire after 10 minutes and are cleaned up periodically

interface QrSession {
  sessionId: string;
  userId: string | null;
  createdAt: number;
  expiresAt: number;
}

const sessions = new Map<string, QrSession>();

// Cleanup expired sessions every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions) {
      if (session.expiresAt < now) {
        sessions.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

export function createSession(sessionId: string, userId: string | null, ttlMs: number = 10 * 60 * 1000): QrSession {
  const now = Date.now();
  const session: QrSession = {
    sessionId,
    userId,
    createdAt: now,
    expiresAt: now + ttlMs,
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): QrSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return undefined;
  }
  return session;
}

export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function getAllSessions(): QrSession[] {
  return Array.from(sessions.values());
}
