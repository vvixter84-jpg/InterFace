import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { api } from "../lib/tauri";
import type { Settings, WidgetConfig, WidgetKind } from "../types";

const META: Record<WidgetKind, { title: string; hint: string }> = {
  cpu: { title: "Процессор", hint: "загрузка, потоки и график" },
  memory: { title: "Память", hint: "занято и свободно" },
  network: { title: "Сеть", hint: "приём и отдача" },
  disks: { title: "Накопители", hint: "место по томам" },
  processes: { title: "Процессы", hint: "топ-3 по нагрузке" },
  clock: { title: "Время", hint: "часы, дата и аптайм" },
  battery: { title: "Батарея", hint: "заряд, питание и остаток" },
  diskio: { title: "Диски: обмен", hint: "скорости чтения и записи" },
  memorytop: { title: "Память: топ", hint: "кто съел больше всего RAM" },
  calendar: { title: "Календарь", hint: "месяц и сегодняшний день" },
  cpuactivity: { title: "Активность CPU", hint: "график, частота и пик ядра" },
  gpu: { title: "Видеокарта", hint: "загрузка, VRAM и температура" },
};

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

interface WidgetsPageProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<string | null>;
}

export function WidgetsPage({ settings, update }: WidgetsPageProps) {
  const [draft, setDraft] = useState<WidgetConfig[]>(settings.widgets);
  const [notice, setNotice] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const state = await api.widgetsState();
        if (!alive) return;
        setHidden(state.manualHidden);
        setPaused(state.paused);
      } catch {
        // состояние необязательное — молча пропускаем
      }
    };
    void load();
    const poll = window.setInterval(() => void load(), 3000);
    return () => {
      alive = false;
      window.clearInterval(poll);
    };
  }, []);

  const toggleHidden = async () => {
    const next = !hidden;
    setHidden(next);
    setPaused(next);
    try {
      await api.setWidgetsHidden(next);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    setDraft(settings.widgets);
  }, [settings.widgets]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  const flash = (text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  };

  const schedule = (next: WidgetConfig[], immediate = false) => {
    setDraft(next);
    window.clearTimeout(timer.current);
    const run = () => {
      void update({ widgets: next }).catch((error: unknown) => console.error(error));
    };
    if (immediate) run();
    else timer.current = window.setTimeout(run, 220);
  };

  const patch = (id: WidgetKind, patch: Partial<WidgetConfig>, immediate = false) => {
    schedule(
      draft.map((widget) => (widget.id === id ? { ...widget, ...patch } : widget)),
      immediate,
    );
  };

  const resetLayout = async () => {
    const defaults = await api.defaultWidgets();
    const next = draft.map((widget) => {
      const base = defaults.find((item) => item.id === widget.id);
      return base
        ? {
            ...widget,
            x: base.x,
            y: base.y,
            width: base.width,
            height: base.height,
          }
        : widget;
    });
    schedule(next, true);
    flash("Раскладка сброшена — виджеты вернулись в левый угол");
  };

  const enabledCount = draft.filter((widget) => widget.enabled).length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Рабочий стол</div>
          <h1>Виджеты</h1>
        </div>
        <div className="head-meta">
          <span>
            {settings.widgetsEnabled
              ? `включено ${enabledCount} из ${draft.length}`
              : "виджеты выключены"}
          </span>
          <span className="meta-dot" />
          <span>{settings.widgetsMode === "desktop" ? "на рабочем столе" : "обычные окна"}</span>
        </div>
      </header>

      {notice ? <div className="inline-notice">{notice}</div> : null}

      <section className="settings-section">
        <h2 className="section-title">Рабочий стол</h2>
        <p className="section-hint">
          В режиме «рабочий стол» виджеты лежат на обоях под всеми окнами и не перехватывают
          фокус. Клик по виджету не поднимает его поверх приложений — как у гаджетов.
        </p>

        <Row title="Показывать виджеты" hint="Каждый виджет — отдельное лёгкое окно">
          <Toggle
            checked={settings.widgetsEnabled}
            onChange={(value) => {
              void update({ widgetsEnabled: value });
            }}
          />
        </Row>

        <Row title="Режим" hint="«Рабочий стол» прячет виджеты под окна, «обычные окна» — свободные окна">
          <div className="segmented">
            <button
              type="button"
              className={`segment${settings.widgetsMode === "desktop" ? " is-active" : ""}`}
              onClick={() => void update({ widgetsMode: "desktop" })}
            >
              Рабочий стол
            </button>
            <button
              type="button"
              className={`segment${settings.widgetsMode === "window" ? " is-active" : ""}`}
              onClick={() => void update({ widgetsMode: "window" })}
            >
              Обычные окна
            </button>
          </div>
        </Row>

        <Row
          title="Автоскрытие в полноэкранных приложениях"
          hint="Игра, фильм или презентация на весь экран — виджеты прячутся, опрос системы останавливается"
        >
          <Toggle
            checked={settings.autoHideFullscreen}
            onChange={(value) => void update({ autoHideFullscreen: value })}
          />
        </Row>

        <div className="button-row">
          <button
            type="button"
            className="button"
            disabled={!settings.widgetsEnabled}
            onClick={() => void toggleHidden()}
          >
            {hidden ? "Показать виджеты" : "Скрыть виджеты"}
          </button>
          <span className="toolbar-note">
            {!settings.widgetsEnabled
              ? "выключены — включи «Показывать виджеты»"
              : paused
                ? "сейчас скрыты — обновления на паузе"
                : "виджеты видны, обновления идут"}
          </span>
        </div>

        <div className="button-row">
          <button type="button" className="button" onClick={() => void resetLayout()}>
            Сбросить раскладку
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="section-title">Виджеты</h2>
        <p className="section-hint">
          Перетаскивай виджеты прямо на рабочем столе — позиция запоминается. Здесь настраиваются
          размер, прозрачность, масштаб и собственный акцент.
        </p>

        <div className="widget-grid">
          {draft.map((widget) => {
            const meta = META[widget.id];
            return (
              <article key={widget.id} className={`widget-card${widget.enabled ? " is-on" : ""}`}>
                <header className="widget-card-head">
                  <div>
                    <div className="widget-card-title">{meta.title}</div>
                    <div className="widget-card-hint">{meta.hint}</div>
                  </div>
                  <Toggle
                    checked={widget.enabled}
                    onChange={(value) => patch(widget.id, { enabled: value }, true)}
                  />
                </header>

                <div className="widget-card-body">
                  <label className="control">
                    <span className="control-label">
                      Фон <b>{Math.round(widget.opacity * 100)}%</b>
                    </span>
                    <input
                      type="range"
                      min={15}
                      max={100}
                      value={Math.round(widget.opacity * 100)}
                      onChange={(event) =>
                        patch(widget.id, { opacity: Number(event.target.value) / 100 })
                      }
                    />
                  </label>

                  <label className="control">
                    <span className="control-label">
                      Масштаб <b>{Math.round(widget.scale * 100)}%</b>
                    </span>
                    <input
                      type="range"
                      min={70}
                      max={160}
                      value={Math.round(widget.scale * 100)}
                      onChange={(event) =>
                        patch(widget.id, { scale: Number(event.target.value) / 100 })
                      }
                    />
                  </label>

                  <div className="control-pair">
                    <label className="control">
                      <span className="control-label">
                        Ширина <b>{Math.round(widget.width)}</b>
                      </span>
                      <input
                        type="range"
                        min={180}
                        max={620}
                        step={10}
                        value={Math.round(widget.width)}
                        onChange={(event) =>
                          patch(widget.id, { width: Number(event.target.value) })
                        }
                      />
                    </label>

                    <label className="control">
                      <span className="control-label">
                        Высота <b>{Math.round(widget.height)}</b>
                      </span>
                      <input
                        type="range"
                        min={90}
                        max={420}
                        step={10}
                        value={Math.round(widget.height)}
                        onChange={(event) =>
                          patch(widget.id, { height: Number(event.target.value) })
                        }
                      />
                    </label>
                  </div>

                  <div className="check-row">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={widget.chart}
                        onChange={(event) =>
                          patch(widget.id, { chart: event.target.checked }, true)
                        }
                      />
                      график
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={widget.label}
                        onChange={(event) =>
                          patch(widget.id, { label: event.target.checked }, true)
                        }
                      />
                      заголовок
                    </label>
                    <label className="check" title="Стекло поверх обоев: красивее, но заметно дороже">
                      <input
                        type="checkbox"
                        checked={widget.transparent}
                        onChange={(event) =>
                          patch(widget.id, { transparent: event.target.checked }, true)
                        }
                      />
                      прозрачность окна
                    </label>
                  </div>

                  <div className="accent-row">
                    <button
                      type="button"
                      className={`chip${widget.accent === null ? " is-active" : ""}`}
                      onClick={() => patch(widget.id, { accent: null }, true)}
                    >
                      Авто
                    </button>
                    {ACCENTS.map((accent) => (
                      <button
                        key={accent.value}
                        type="button"
                        title={accent.name}
                        aria-label={accent.name}
                        className={`chip-dot${widget.accent === accent.value ? " is-active" : ""}`}
                        style={{ background: accent.value }}
                        onClick={() => patch(widget.id, { accent: accent.value }, true)}
                      />
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
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
