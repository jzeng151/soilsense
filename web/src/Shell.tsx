import { useI18n } from "./i18n";
import { useCallback, useEffect, useState, lazy, Suspense } from "react";
import { landingRedirect } from "./components/explore/location";
const ExplorePage = lazy(() => import('./pages/ExplorePage').then(m => ({ default: m.ExplorePage })));
const DemoFarmsPage = lazy(() => import('./pages/DemoFarmsPage').then(m => ({ default: m.DemoFarmsPage })));
import { App } from "./App";
import { LanguageProvider } from "./i18n";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { DocsAdmin } from "./components/DocsAdmin";
import { ScoutSessionProvider, useScoutSession } from "./ScoutSession";
import { GUEST_ID } from "./chats";
import { Sidebar, type Route } from "./components/Sidebar";
import { ScoutPage } from "./pages/ScoutPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SourcesPage } from "./pages/SourcesPage";
import { LivePage } from "./pages/LivePage";
import { AuthPage } from "./pages/AuthPage";
import { getMe, SIGNED_OUT_EVENT, signOut, type User } from "./auth";

type WorkspaceRoute = Route | "admin/docs";
const routeFromHash = (): WorkspaceRoute => {
  const h = window.location.hash;
  if (h.startsWith("#/explore")) return "explore";
  if (h === "#/demo") return "demo";
  if (h === "#/admin/docs") return "admin/docs";
  if (h.startsWith("#/scout")) return "scout";
  if (h.startsWith("#/sources")) return "sources";
  if (h === "#/how-it-works") return "how-it-works";
  if (h.startsWith("#/live")) return "live";
  if (h.startsWith("#/settings")) return "settings";
  if (h.startsWith("#/signin")) return "signin";
  return "planner";
};

/**
 * The app opens straight away for everyone: no account needed for the planner, Scout or Sources.
 * A team member can sign in (sidebar link) to reach Settings, which edits the live phone agent.
 */
export function Shell() {
  const [user, setUser] = useState<User | null>(null);

  // Quietly pick up an existing team session; if the check fails, just stay a public visitor.
  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  // A 401 (expired team session) simply returns to public mode.
  useEffect(() => {
    const onSignedOut = () => setUser(null);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  return (
    <LanguageProvider><ScoutSessionProvider ownerId={user?.id ?? GUEST_ID}><Workspace
      key={user?.id ?? GUEST_ID}
      user={user}
      onSignedIn={setUser}
      onSignOut={async () => {
        await signOut();
        setUser(null);
      }}
    /></ScoutSessionProvider></LanguageProvider>
  );
}

function Workspace({ user, onSignedIn, onSignOut }: { user: User | null; onSignedIn: (u: User) => void; onSignOut: () => void }) {
  const { t: tx } = useI18n();
  const [route, setRoute] = useState<WorkspaceRoute>(routeFromHash);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exploreLanding, setExploreLanding] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/ui/status').then(r => r.ok ? r.json() : null).then(status => {
      if (!active) return;
      const enabled = status?.exploreLanding === true;
      setExploreLanding(enabled);
      const redirect = landingRedirect(window.location.hash, enabled);
      if (redirect) window.location.hash = redirect;
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const { chats, activeId, newChat, openChat, deleteChat } = useScoutSession();

  useEffect(() => {
    const onHash = () => {
      const redirect = landingRedirect(window.location.hash, exploreLanding);
      if (redirect) window.location.hash = redirect;
      else setRoute(routeFromHash());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [exploreLanding]);



  const go = useCallback((r: Route) => {
    setRoute(r);
    setSidebarOpen(false);
    const hash = r === "planner" ? (exploreLanding ? "#/planner" : "#/") : `#/${r}`;
    if (window.location.hash !== hash) window.location.hash = hash;
  }, [exploreLanding]);


  if (route === 'explore' || route === 'demo') return <Suspense fallback={<main aria-busy="true">Soil Sense…</main>}>{route === 'explore' ? <ExplorePage/> : <DemoFarmsPage/>}</Suspense>;

  return (
    <div className={`shell route-${route}`}>
      {/* WCAG 2.4.1: let keyboard and screen-reader users jump past the sidebar. */}
      <a className="skip-link" href="#content" onClick={(e) => { e.preventDefault(); document.getElementById("content")?.focus(); }}>
        {tx("Skip to main content")}
      </a>
      <Sidebar
        route={route === "admin/docs" ? "planner" : route}
        user={user}
        onSignOut={onSignOut}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        chats={chats}
        activeChatId={activeId}
        onNavigate={go}
        onNewChat={() => {
          newChat();
          go("scout");
        }}
        onOpenChat={(id) => {
          openChat(id);
          go("scout");
        }}
        onDeleteChat={deleteChat}
      />
      <div className="shell-main" id="content" tabIndex={-1}>
        {route === "admin/docs" ? (
          <DocsAdmin />
        ) : route === "scout" ? (
          <ScoutPage key={activeId} onMenu={() => setSidebarOpen(true)} />
        ) : route === "live" ? (
          <LivePage onMenu={() => setSidebarOpen(true)} />
        ) : route === "how-it-works" ? (
          <HowItWorksPage onMenu={() => setSidebarOpen(true)} />
        ) : route === "sources" ? (
          <SourcesPage onMenu={() => setSidebarOpen(true)} />
        ) : route === "settings" || route === "signin" ? (
          user && route === "settings" ? (
            <SettingsPage onMenu={() => setSidebarOpen(true)} />
          ) : (
            // Settings changes the live phone agent, so it needs a team account.
            <AuthPage
              onSignedIn={(u) => {
                onSignedIn(u);
                if (route === "signin") go("planner");
              }}
            />
          )
        ) : (
          <>
            <button type="button" className="sb-toggle" aria-label={tx("Open sidebar")} onClick={() => setSidebarOpen(true)}>
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
