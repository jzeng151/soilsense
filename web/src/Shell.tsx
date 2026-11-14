import { useCallback, useEffect, useState } from "react";
import { App } from "./App";
import type { UIMessage } from "ai";
import { firstUserText, loadChats, newChatId, saveChats, titleFrom, type ScoutChat } from "./chats";
import { Sidebar, type Route } from "./components/Sidebar";
import { ScoutPage } from "./pages/ScoutPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SourcesPage } from "./pages/SourcesPage";
import { AuthPage } from "./pages/AuthPage";
import { getMe, SIGNED_OUT_EVENT, signOut, type User } from "./auth";

const routeFromHash = (): Route => {
  const h = window.location.hash;
  if (h.startsWith("#/scout")) return "scout";
  if (h.startsWith("#/sources")) return "sources";
  if (h.startsWith("#/settings")) return "settings";
  return "planner";
};

/** Checks the session first: shows the sign-in screen, or the app for a signed-in user. */
export function Shell() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [checkError, setCheckError] = useState<string | null>(null);

  const check = useCallback(() => {
    setCheckError(null);
    getMe()
      .then(setUser)
      .catch((e: unknown) => setCheckError(e instanceof Error ? e.message : "Couldn't reach SoilSense."));
  }, []);

  useEffect(check, [check]);

  // Any API call that comes back 401 (expired or revoked session) returns to the sign-in screen.
  useEffect(() => {
    const onSignedOut = () => setUser(null);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  if (checkError)
    return (
      <div className="auth-splash">
        <p>{checkError}</p>
        <button type="button" className="auth-submit" onClick={check}>
          Try again
        </button>
      </div>
    );
  if (user === undefined) return <div className="auth-splash" aria-busy="true" aria-label="Loading" />;
  if (user === null) return <AuthPage onSignedIn={setUser} />;
  return (
    <Workspace
      key={user.id}
      user={user}
      onSignOut={async () => {
        await signOut();
        setUser(null);
      }}
    />
  );
}

function Workspace({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chats, setChats] = useState<ScoutChat[]>(() => loadChats(user.id));
  // Always points at a chat; a brand-new chat only enters the list once it has messages.
  const [activeId, setActiveId] = useState<string>(newChatId);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => saveChats(user.id, chats), [user.id, chats]);

  const go = useCallback((r: Route) => {
    setRoute(r);
    setSidebarOpen(false);
    const hash = r === "planner" ? "#/" : `#/${r}`;
    if (window.location.hash !== hash) window.location.hash = hash;
  }, []);

  const saveMessages = useCallback((id: string, messages: UIMessage[]) => {
    if (!messages.length) return;
    setChats((prev) => {
      const old = prev.find((x) => x.id === id);
      const chat: ScoutChat = { id, title: old?.title ?? titleFrom(firstUserText(messages)), messages, updatedAt: Date.now() };
      return [chat, ...prev.filter((x) => x.id !== id)];
    });
  }, []);

  const active = chats.find((c) => c.id === activeId) ?? null;

  return (
    <div className={`shell route-${route}`}>
      <Sidebar
        route={route}
        user={user}
        onSignOut={onSignOut}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        chats={chats}
        activeChatId={activeId}
        onNavigate={go}
        onNewChat={() => {
          setActiveId(newChatId());
          go("scout");
        }}
        onOpenChat={(id) => {
          setActiveId(id);
          go("scout");
        }}
        onDeleteChat={(id) => {
          setChats((prev) => prev.filter((c) => c.id !== id));
          if (id === activeId) setActiveId(newChatId());
        }}
      />
      <div className="shell-main">
        {route === "scout" ? (
          <ScoutPage key={activeId} chatId={activeId} initialMessages={active?.messages ?? []} onMessages={saveMessages} onMenu={() => setSidebarOpen(true)} />
        ) : route === "sources" ? (
          <SourcesPage onMenu={() => setSidebarOpen(true)} />
        ) : route === "settings" ? (
          <SettingsPage onMenu={() => setSidebarOpen(true)} />
        ) : (
          <>
            <button type="button" className="sb-toggle" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <App />
          </>
        )}
      </div>
    </div>
  );
}
