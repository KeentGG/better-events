import "./lib/demoBoot";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DesignPreview } from "./design/DesignPreview";
import "./index.css";

// The design system preview lives at /#/design until the app gets a router.
const Root = location.hash === "#/design" ? DesignPreview : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
