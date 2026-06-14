import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";

const saved = JSON.parse(localStorage.getItem("mc-panel-theme") || "{}");
document.documentElement.setAttribute("data-theme", saved?.state?.theme ?? "dark");
document.documentElement.style.fontSize = (saved?.state?.fontSize ?? 15) + "px";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);