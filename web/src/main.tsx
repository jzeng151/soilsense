import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./tokens.css"; // brand guide tokens: load first, everything else reads from it
import "./styles.css";
import "./shell.css";
import "./a11y.css";
import { Shell } from "./Shell";
import { LanguageProvider } from "./i18n";

// Preload only the initial route; Vite also preloads its static dependencies.
if (window.location.hash === "#/how-it-works") void import("./pages/HowItWorksPage").catch(() => {});
else if (!window.location.hash || window.location.hash === "#/") void import("./App").catch(() => {});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider><Shell /></LanguageProvider>
  </StrictMode>,
);
