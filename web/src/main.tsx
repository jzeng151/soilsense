import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./tokens.css"; // brand guide tokens: load first, everything else reads from it
import "./styles.css";
import "./shell.css";
import "./a11y.css";
import { preloadInitialRoute, Shell } from "./Shell";
import { LanguageProvider } from "./i18n";

// Resolve the initial route before mounting: avoid React's fallback reveal delay.
// Imports are still split, and Vite preloads only this route's static dependencies.
void preloadInitialRoute().catch(() => {}).then(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider><Shell /></LanguageProvider>
  </StrictMode>,
));
