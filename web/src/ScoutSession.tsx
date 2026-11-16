import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { authFetch } from "./auth";
import { useI18n } from "./i18n";
import { firstUserText, loadChats, newChatId, saveChats, titleFrom, type ScoutChat } from "./chats";
import type { PlanResponse } from "../../src/shared/types";
import { LANGUAGE_NAMES } from "../../src/shared/language";
import type { FieldAssistantContext } from "./components/assistant/FieldAssistantPanel";

type FieldContext = { location: FieldAssistantContext | null; plan: PlanResponse | null };
type Session = ReturnType<typeof useChat> & {
  chats: ScoutChat[]; activeId: string; newChat: () => void; clearChat: () => void;
  openChat: (id: string) => void; deleteChat: (id: string) => void;
  setFieldContext: (context: FieldContext) => void; httpError: number;
};
const Context = createContext<Session | null>(null);
export const useOptionalScoutSession = () => useContext(Context);
export function useScoutSession(): Session {
  const session = useOptionalScoutSession();
  if (!session) throw new Error("ScoutSessionProvider is required");
  return session;
}
const sessionKey = (owner: string) => `fieldshift.scout.active.v1:${owner}`;
function loadActive(owner: string): { id: string; field?: FieldContext } {
  try { const saved = JSON.parse(localStorage.getItem(sessionKey(owner)) ?? "null"); if (typeof saved?.id === "string") return saved; } catch { /* best effort */ }
  return { id: newChatId() };
}

/** Account-keyed, above the route split: only this owner calls useChat, never a view. */
export function ScoutSessionProvider({ ownerId, children }: { ownerId: string; children: ReactNode }) {
  // Also enforce isolation when a caller forgets to key the provider on account changes.
  return <AccountSession key={ownerId} ownerId={ownerId}>{children}</AccountSession>;
}
function AccountSession({ ownerId, children }: { ownerId: string; children: ReactNode }) {
  const [chats, setChats] = useState(() => loadChats(ownerId));
  const [saved] = useState(() => loadActive(ownerId));
  const [activeId, setActiveId] = useState(saved.id);
  const [field, setFieldContext] = useState<FieldContext>(saved.field ?? { location: null, plan: null });
  useEffect(() => saveChats(ownerId, chats), [ownerId, chats]);
  useEffect(() => { try { localStorage.setItem(sessionKey(ownerId), JSON.stringify({ id: activeId, field })); } catch { /* best effort */ } }, [ownerId, activeId, field]);
  const save = (messages: UIMessage[]) => {
    if (!messages.length) return;
    setChats(prev => [{ id: activeId, title: prev.find(c => c.id === activeId)?.title ?? titleFrom(firstUserText(messages)), messages, updatedAt: Date.now() }, ...prev.filter(c => c.id !== activeId)]);
  };
  return <LiveSession id={activeId} initialMessages={chats.find(c => c.id === activeId)?.messages ?? []}
    field={field} save={save} controls={{ chats, activeId, setFieldContext,
      newChat: () => setActiveId(newChatId()), openChat: setActiveId,
      // Clear removes the saved conversation too; a late token cannot resurrect it.
      clearChat: () => { setChats(prev => prev.filter(c => c.id !== activeId)); setActiveId(newChatId()); },
      deleteChat: id => { setChats(prev => prev.filter(c => c.id !== id)); if (id === activeId) setActiveId(newChatId()); },
    }}>{children}</LiveSession>;
}
function LiveSession({ id, initialMessages, field, save, controls, children }: {
  id: string; initialMessages: UIMessage[]; field: FieldContext; save: (messages: UIMessage[]) => void;
  controls: Pick<Session, "chats" | "activeId" | "setFieldContext" | "newChat" | "openChat" | "clearChat" | "deleteChat">; children: ReactNode;
}) {
  const { language } = useI18n();
  const latest = useRef({ field, language }); latest.current = { field, language };
  const [httpError, setHttpError] = useState(0);
  useEffect(() => { setHttpError(0); }, [id]);
  // Stable transport, fresh language/context for EVERY send and retry. No stale useChat closure.
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/scout/chat",
    fetch: async (url, options) => { const res = await authFetch(url, options); setHttpError(res.ok ? 0 : res.status); return res; },
    prepareSendMessagesRequest: ({ messages, body }) => {
      const { field: { location, plan }, language } = latest.current;
      const context = location ? `\n\nSelected location and client plan context (verify claims with data tools; field ids are memory lookup identifiers, not current measurements):\n${JSON.stringify({ location, plan: plan ? { generatedAt: plan.generatedAt, summary: plan.explanation.summary, facts: plan.facts, assumptions: plan.assumptions, topRotation: plan.plans[0]?.years.map(y => ({ year: y.year, crop: y.cropName })) } : null })}\nReply in ${LANGUAGE_NAMES[language]}.` : "";
      // Enrich only the last USER turn, including retries after an assistant error.
      const lastUser = messages.map(m => m.role).lastIndexOf("user");
      return { body: { ...body, language, messages: messages.map((m, i) => i === lastUser && context ? { ...m, parts: [...m.parts, { type: "text", text: context }] } : m) } };
    },
  }), []);
  const chat = useChat({ id, messages: initialMessages, transport });
  const saveRef = useRef(save); saveRef.current = save;
  // Save partial output as well: reload restores the latest received text, never replays a request.
  useEffect(() => { saveRef.current(chat.messages); }, [chat.messages]);
  // AI SDK owns cancellation when id changes or this account owner unmounts.
  // Do not key this provider by id: New/Clear must not remount the Explore map.
  return <Context.Provider value={{ ...chat, ...controls, httpError }}>{children}</Context.Provider>;
}
