import { useEffect, useState } from "react";

import { AlertStack } from "./components/AlertStack";
import { Sidebar, type Tab } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { useMetrics } from "./hooks/useMetrics";
import { useSettings } from "./hooks/useSettings";
import { luminance, withAlpha } from "./lib/format";
import { NetworkPage } from "./pages/NetworkPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProcessesPage } from "./pages/ProcessesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StoragePage } from "./pages/StoragePage";
import { WidgetsPage } from "./pages/WidgetsPage";

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const { settings, update } = useSettings();
  const { snapshot, history, alerts, dismiss } = useMetrics(settings.alerts);

  // Акцент живёт в CSS-переменных: перекрашивать компоненты не нужно,
  // достаточно поменять пять значений на корне документа.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", settings.accent);
    root.style.setProperty("--accent-soft", withAlpha(settings.accent, 0.14));
    root.style.setProperty("--accent-line", withAlpha(settings.accent, 0.32));
    root.style.setProperty("--accent-glow", withAlpha(settings.accent, 0.22));
    // Фоновые пятна: три уровня силы, чтобы свечение было объёмным, а не плоским.
    root.style.setProperty("--glow-strong", withAlpha(settings.accent, 0.26));
    root.style.setProperty("--glow-soft", withAlpha(settings.accent, 0.13));
    root.style.setProperty("--glow-faint", withAlpha(settings.accent, 0.06));
    root.style.setProperty(
      "--accent-ink",
      luminance(settings.accent) > 0.55 ? "#08080a" : "#ffffff",
    );
  }, [settings.accent]);

  return (
    <div className="app">
      <TitleBar />

      <div className="shell">
        <Sidebar tab={tab} onChange={setTab} snapshot={snapshot} />

        <main className="content">
          {tab === "overview" ? (
            <OverviewPage
              snapshot={snapshot}
              history={history}
              onOpenProcesses={() => setTab("processes")}
            />
          ) : null}

          {tab === "processes" ? <ProcessesPage snapshot={snapshot} /> : null}
          {tab === "storage" ? <StoragePage snapshot={snapshot} /> : null}
          {tab === "network" ? <NetworkPage snapshot={snapshot} /> : null}
          {tab === "widgets" ? <WidgetsPage settings={settings} update={update} /> : null}
          {tab === "settings" ? (
            <SettingsPage settings={settings} update={update} snapshot={snapshot} />
          ) : null}
        </main>
      </div>

      <AlertStack alerts={alerts} onDismiss={dismiss} />
    </div>
  );
}
