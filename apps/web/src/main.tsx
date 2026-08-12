import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./tokens.css";
import "./app.css";

const root = document.getElementById("root");
if (!root) throw new Error("the page has no root element to draw into");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
