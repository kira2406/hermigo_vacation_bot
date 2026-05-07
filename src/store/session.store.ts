// store/session.store.ts

// ✅ Define a generic session type (can evolve later)
export interface SessionData {
  [key: string]: any;
  updatedAt?: Date;
}

// ✅ Strongly type the Map
const sessions: Map<string, SessionData> = new Map();

// ✅ Save session
export function saveSession(
  chatId: string,
  data: SessionData
): void {
  sessions.set(chatId, {
    ...data,
    updatedAt: new Date()
  });
}

// ✅ Get session
export function getSession(
  chatId: string
): SessionData | undefined {
  return sessions.get(chatId);
}