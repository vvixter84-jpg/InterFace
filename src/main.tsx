import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";

import App from "./App";
import { WidgetApp } from "./widgets/WidgetApp";
import type { WidgetKind } from "./types";
import "./styles/global.css";

// Единый список видов: если добавить виджет, его нужно добавить и сюда,
// иначе окно получит метку, но отрисует главный интерфейс.
const WIDGET_KINDS: WidgetKind[] = [
  "cpu",
  "memory",
  "network",
  "disks",
  "processes",
  "clock",
  "battery",
  "diskio",
  "memorytop",
  "calendar",
  "cpuactivity",
  "gpu",
];

const label = getCurrentWindow().label;
const suffix = label.startsWith("widget-") ? label.slice("widget-".length) : "";
const widgetKind = WIDGET_KINDS.find((kind) => kind === suffix);

const container = document.getElementById("root");
if (!container) throw new Error("не найден корневой узел #root");

// В окне виджета фон должен быть прозрачным: тело документа общее на все окна.
if (widgetKind) document.documentElement.classList.add("is-widget");

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    {widgetKind ? <WidgetApp kind={widgetKind} /> : <App />}
  </React.StrictMode>,
);
