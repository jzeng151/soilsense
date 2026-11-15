import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./tokens.css"; // brand guide tokens: load first, everything else reads from it
import "./styles.css";
import "./shell.css";
import "./a11y.css";
import { Shell } from "./Shell";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
