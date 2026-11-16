import { useI18n } from "./i18n";
import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from "react";
import { landingRedirect } from "./components/explore/location";
const ExplorePage = lazy(() => import('./pages/ExplorePage').then(m => ({ default: m.ExplorePage })));
const DemoFarmsPage = lazy(() => import('./pages/DemoFarmsPage').then(m => ({ default: m.DemoFarmsPage })));
import { FieldWatchPage } from "./pages/FieldWatchPage";
import { LanguageProvider } from "./i18n";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { DocsAdmin } from "./components/DocsAdmin";
import { ScoutSessionProvider, useScoutSession } from "./ScoutSession";
import { GUEST_ID } from "./chats";
import { ExploreRail, NavAccountContext, NavRailProvider, type RailHref } from "./components/explore/ExploreRail";
import { ScoutPage } from "./pages/ScoutPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SourcesPage } from "./pages/SourcesPage";
import { LivePage } from "./pages/LivePage";
import { AuthPage } from "./pages/AuthPage";
import { getMe, SIGNED_OUT_EVENT, signOut, type User } from "./auth";

export type Route = "planner" | "scout" | "live" | "sources" | "how-it-works" | "settings" | "signin" | "explore" | "demo";
type WorkspaceRoute = Route | "admin/docs";
/** Which rail link is highlighted on each Shell route (Explore and Demo render their own rail). */
const RAIL_CURRENT: Record<WorkspaceRoute, RailHref | null> = {
  planner: "#/field-watch", scout: "#/scout", live: "#/live", sources: "#/sources", "how-it-works": "#/how-it-works",
  settings: "#/settings", signin: null, explore: "#/explore", demo: "#/demo", "admin/docs": null,
};
const routeFromHash = (): WorkspaceRoute => {
  const h = window.location.hash;
  if (h === "#/field-watch" || h === "#/planner") return "planner";
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
    <LanguageProvider><NavRailProvider><ScoutSessionProvider ownerId={user?.id ?? GUEST_ID}><Workspace
      key={user?.id ?? GUEST_ID}
      user={user}
      onSignedIn={setUser}
      onSignOut={async () => {
        await signOut();
        setUser(null);
      }}
    /></ScoutSessionProvider></NavRailProvider></LanguageProvider>
  );
}

function Workspace({ user, onSignedIn, onSignOut }: { user: User | null; onSignedIn: (u: User) => void; onSignOut: () => void }) {
  const { t: tx } = useI18n();
  const [route, setRoute] = useState<WorkspaceRoute>(routeFromHash);
  const [exploreVisited, setExploreVisited] = useState(route === "explore");
  useEffect(() => { if (route === "explore") setExploreVisited(true); }, [route]);
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
  const { activeId } = useScoutSession();

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
    const hash = r === "planner" ? "#/field-watch" : `#/${r}`;
    if (window.location.hash !== hash) window.location.hash = hash;
  }, []);
  const account = useMemo(() => ({ user, onSignOut }), [user, onSignOut]);

  return (
    <NavAccountContext.Provider value={account}>
    {/* Keep the selected field, exact plan and active tab when opening full chat. */}
    {(exploreVisited || route === "explore") && <div hidden={route !== "explore"}>
      <Suspense fallback={<main aria-busy="true">Soil Sense…</main>}><ExplorePage active={route === "explore"} /></Suspense>
    </div>}
    {route === "demo" ? <Suspense fallback={<main aria-busy="true">Soil Sense…</main>}><DemoFarmsPage /></Suspense> : route === "explore" ? null : (
    <div className={`shell route-${route}`}>
      {/* WCAG 2.4.1: let keyboard and screen-reader users jump past the navigation rail. */}
      <a className="skip-link" href="#content" onClick={(e) => { e.preventDefault(); document.getElementById("content")?.focus(); }}>
        {tx("Skip to main content")}
      </a>
      {/* One navigation for every page: the same rail as Explore and Demo, solid because no map sits behind it. */}
      <ExploreRail solid current={RAIL_CURRENT[route]} />
      <div className="shell-main" id="content" tabIndex={-1}>
        {route === "admin/docs" ? (
          <DocsAdmin />
        ) : route === "scout" ? (
          <ScoutPage key={activeId} />
        ) : route === "live" ? (
          <LivePage />
        ) : route === "how-it-works" ? (
          <HowItWorksPage />
        ) : route === "sources" ? (
          <SourcesPage />
        ) : route === "settings" || route === "signin" ? (
          user && route === "settings" ? (
            <SettingsPage />
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
          <FieldWatchPage />
        )}
      </div>
    </div>
    )}
    </NavAccountContext.Provider>
  );
}
