// Scout chat history, kept in this browser only (localStorage, best effort).
// Messages are AI SDK UIMessages, so a saved chat can be handed straight back to useChat.

import type { UIMessage } from "ai";

export interface ScoutChat {
  id: string;
  title: string;
  messages: UIMessage[];
  updatedAt: number;
}

const KEY = "fieldshift.scout.chats.v1";

/** Chats saved before the AI SDK switch stored { role, text } messages; convert them. */
function migrate(chat: ScoutChat): ScoutChat {
  const messages = (chat.messages as unknown[]).map((m, i) => {
    const msg = m as Partial<UIMessage> & { text?: string; error?: boolean };
    if (Array.isArray(msg.parts)) return msg as UIMessage;
    return { id: `${chat.id}-${i}`, role: msg.role === "assistant" ? "assistant" : "user", parts: [{ type: "text", text: String(msg.text ?? "") }] } as UIMessage;
  });
  return { ...chat, messages };
}

/** Each account gets its own history, so people sharing a computer don't see each other's chats. */
const userKey = (userId: string) => `${KEY}:${userId}`;

/** Chat history owner when nobody is signed in (the public demo). */
export const GUEST_ID = "guest";

export function loadChats(userId: string): ScoutChat[] {
  try {
    let raw = localStorage.getItem(userKey(userId));
    // Chats saved before accounts existed go to the first account that signs in on this browser.
    const legacy = raw === null && userId !== GUEST_ID ? localStorage.getItem(KEY) : null;
    if (legacy !== null) {
      raw = legacy;
      localStorage.setItem(userKey(userId), legacy);
      localStorage.removeItem(KEY);
    }
    const parsed = raw ? (JSON.parse(raw) as ScoutChat[]) : [];
    return Array.isArray(parsed) ? parsed.map(migrate).sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

export function saveChats(userId: string, chats: ScoutChat[]): void {
  try {
    localStorage.setItem(userKey(userId), JSON.stringify(chats.slice(0, 50)));
  } catch {
    /* storage unavailable or full: history just won't persist */
  }
}

export function newChatId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random());
}

export function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 48 ? `${t.slice(0, 45)}…` : t || "New chat";
}

export function firstUserText(messages: UIMessage[]): string {
  const m = messages.find((x) => x.role === "user");
  const part = m?.parts.find((p) => p.type === "text");
  return part && "text" in part ? part.text : "";
}
