import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { api } from "../lib/tauri";
import type { Settings, Snapshot } from "../types";

const ACCENTS = [
  { name: "Белый", value: "#F2F2F4" },
  { name: "Лайм", value: "#C6F24E" },
  { name: "Мята", value: "#3DDC97" },
  { name: "Циан", value: "#4CC9F0" },
  { name: "Индиго", value: "#7C8CFF" },
  { name: "Амбра", value: "#FFB020" },
  { name: "Коралл", value: "#FF6B57" },
  { name: "Магента", value: "#F050B0" },
];

const SAMPLE_RATES = [500, 1000, 2000];

interface SettingsPageProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<string | null>;
  snapshot: Snapshot | null;
}

export function SettingsPage({ settings, update, snapshot }: SettingsPageProps) {
  const [hotkey, setHotkey] = useState(settings.hotkey);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const noticeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setHotkey(settings.hotkey);
  }, [settings.hotkey]);

  useEffect(
    () => () => {
      window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  const flash = (text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000);
  };

  const apply = async (patch: Partial<Settings>, message?: string) => {
    const problem = await update(patch);
    if (problem) {
      setError(problem);
      setNotice(null);
      return false;
    }
    setError(null);
    if (message) flash(message);
    return true;
  };

  const commitHotkey = async () => {
    const value = hotkey.trim();
    if (!value || value === settings.hotkey) {
      setHotkey(settings.hotkey);
      return;
    }
    const saved = await apply({ hotkey: value }, "Сочетание обновлено");
    if (!saved) setHotkey(settings.hotkey);
  };

  const exportHistory = async () => {
    setExporting(true);
    try {
      const path = await api.exportHistory();
      flash(`История сохранена: ${path}`);
      setError(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Конфигурация</div>
          <h1>Настройки</h1>
        </div>
        <div className="head-meta">
          <span>InterFace 0.1.0</span>
          <span className="meta-dot" />
          <span>
            {snapshot ? `${snapshot.osName} ${snapshot.osVersion}` : "Windows"}
          </span>
        </div>
      </header>

      {error ? (
        <div className="inline-error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? <div className="inline-notice">{notice}</div> : null}

      <section className="settings-section">
        <h2 className="section-title">Оформление</h2>
        <p className="section-hint">
          Интерфейс остаётся чёрно-белым: акцент применяется к графикам, индикаторам и активным
          элементам.
        </p>

        <div className="swatches">
          {ACCENTS.map((item) => {
            const active = settings.accent.toUpperCase() === item.value.toUpperCase();
            return (
              <button
                key={item.value}
                type="button"
                className={`swatch${active ? " is-active" : ""}`}
                style={{ background: item.value }}
                title={item.name}
                aria-label={item.name}
                onClick={() => void apply({ accent: item.value })}
              />
            );
          })}

          <label className="swatch swatch-custom" title="Свой цвет">
            <input
              type="color"
              value={settings.accent}
              onChange={(event) => void apply({ accent: event.target.value })}
            />
          </label>

          <span className="swatch-value mono">{settings.accent.toUpperCase()}</span>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="section-title">Поведение</h2>

        <Row
          title="Глобальная клавиша"
          hint="Мгновенно показать или спрятать окно из любого приложения"
        >
          <input
            className="text-input mono"
            value={hotkey}
            spellCheck={false}
            onChange={(event) => setHotkey(event.target.value)}
            onBlur={() => void commitHotkey()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        </Row>

        <Row title="Автозапуск" hint="Запускать InterFace при входе в Windows">
          <Toggle
            checked={settings.autostart}
            onChange={(value) => void apply({ autostart: value }, value ? "Автозапуск включён" : "Автозапуск выключен")}
          />
        </Row>

        <Row title="Старт в трее" hint="Не показывать окно при запуске">
          <Toggle
            checked={settings.startMinimized}
            onChange={(value) => void apply({ startMinimized: value })}
          />
        </Row>

        <Row title="Меню запуска" hint="ASCII-заставка с анимированным логотипом при открытии">
          <Toggle
            checked={settings.showBootMenu}
            onChange={(value) => void apply({ showBootMenu: value })}
          />
        </Row>

        <Row
          title="Крестик прячет в трей"
          hint="Выключи, если хочешь, чтобы закрытие окна завершало приложение"
        >
          <Toggle
            checked={settings.closeToTray}
            onChange={(value) => void apply({ closeToTray: value })}
          />
        </Row>

        <Row title="Поверх всех окон" hint="Удобно, когда нужен постоянный контроль нагрузки">
          <Toggle
            checked={settings.alwaysOnTop}
            onChange={(value) => void apply({ alwaysOnTop: value })}
          />
        </Row>

        <Row title="Оповещения о нагрузке" hint="Сообщать, если CPU или память долго держатся выше 90%">
          <Toggle
            checked={settings.alerts}
            onChange={(value) => void apply({ alerts: value })}
          />
        </Row>

        <Row title="Частота опроса" hint="Реже — меньше расход ресурсов на сам мониторинг">
          <div className="segmented">
            {SAMPLE_RATES.map((rate) => (
              <button
                key={rate}
                type="button"
                className={`segment${settings.sampleMs === rate ? " is-active" : ""}`}
                onClick={() => void apply({ sampleMs: rate })}
              >
                {rate === 500 ? "0,5 с" : `${rate / 1000} с`}
              </button>
            ))}
          </div>
        </Row>
      </section>

      <section className="settings-section">
        <h2 className="section-title">Данные</h2>
        <p className="section-hint">
          История нагрузки хранится в памяти и очищается при выходе. Экспорт кладёт CSV в папку
          «Загрузки».
        </p>

        <div className="button-row">
          <button type="button" className="button" disabled={exporting} onClick={() => void exportHistory()}>
            {exporting ? "Сохраняю…" : "Экспортировать историю"}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="section-title">О программе</h2>
        <div className="about-grid">
          <div>
            <span className="summary-label">Версия</span>
            <span className="mono">0.1.0</span>
          </div>
          <div>
            <span className="summary-label">Ядро</span>
            <span className="mono">Tauri 2 · Rust</span>
          </div>
          <div>
            <span className="summary-label">Система</span>
            <span className="mono truncate">
              {snapshot ? `${snapshot.osName} ${snapshot.osVersion}` : "—"}
            </span>
          </div>
          <div>
            <span className="summary-label">Хост</span>
            <span className="mono truncate">{snapshot?.hostname ?? "—"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

interface RowProps {
  title: string;
  hint?: string;
  children: ReactNode;
}

function Row({ title, hint, children }: RowProps) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <span className="setting-title">{title}</span>
        {hint ? <span className="setting-hint">{hint}</span> : null}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}
