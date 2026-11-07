import { useEffect, useMemo, useRef, useState } from "react";

import type { Tab } from "./Sidebar";

interface BootTarget {
  id: Tab | "quit";
  label: string;
  hint: string;
}

const MENU: BootTarget[] = [
  { id: "overview", label: "Открыть панель", hint: "обзор системы" },
  { id: "processes", label: "Диспетчер задач", hint: "процессы и память" },
  { id: "widgets", label: "Виджеты", hint: "рабочий стол" },
  { id: "settings", label: "Настройки", hint: "акцент, хоткей, трей" },
  { id: "quit", label: "Выход", hint: "закрыть InterFace" },
];

// 5×7 точечный шрифт: из него собирается слово INTERFACE.
const FONT: Record<string, string[]> = {
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
};

const WORD = "INTERFACE";

/** Раскладываем слово в битовую карту один раз при загрузке модуля. */
const BITMAP: boolean[][] = (() => {
  const rows: boolean[][] = Array.from({ length: 7 }, () => []);
  for (let letter = 0; letter < WORD.length; letter += 1) {
    const glyph = FONT[WORD[letter]];
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        rows[y].push(glyph[y][x] === "1");
      }
      if (letter < WORD.length - 1) {
        rows[y].push(false);
        rows[y].push(false);
      }
    }
  }
  return rows;
})();

/** Два слоя: светящиеся пиксели букв и фон из точек и двоеточий. */
function artLayers(phase: number): { on: string[]; off: string[] } {
  const on: string[] = [];
  const off: string[] = [];

  for (let y = 0; y < BITMAP.length; y += 1) {
    let onRow = "";
    let offRow = "";
    for (let x = 0; x < BITMAP[y].length; x += 1) {
      // Волна проходит по слову наискосок — буквы «дышат».
      const shimmer = Math.sin(phase * 0.55 - x * 0.42 + y * 0.6);
      if (BITMAP[y][x]) {
        onRow += shimmer > 0.25 ? "●" : "◉";
        offRow += " ";
      } else {
        onRow += " ";
        offRow += shimmer > 0.35 ? ":" : ".";
      }
    }
    on.push(onRow);
    off.push(offRow);
  }

  return { on, off };
}

/** Кольцо из кругляшков, которое медленно вращается вокруг центра. */
function orbRows(phase: number): string[] {
  const size = 9;
  const center = (size - 1) / 2;
  const radius = 3.35;
  const ring = ["○", "◉", "●", "◉", "○", ":"];
  const rows: string[] = [];

  for (let y = 0; y < size; y += 1) {
    let row = "";
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.hypot(dx, dy);

      if (Math.abs(distance - radius) < 0.6) {
        const angle = Math.atan2(dy, dx);
        const step = Math.floor(
          ((angle + Math.PI) / (Math.PI * 2)) * 12 + phase * 0.9,
        );
        row += ring[((step % ring.length) + ring.length) % ring.length];
      } else if (distance < radius - 1) {
        row += (x + y + phase) % 6 === 0 ? "·" : " ";
      } else {
        row += " ";
      }
    }
    rows.push(row);
  }

  return rows;
}

/** Бегущий импульс — тот же ЭКГ-знак, что и в логотипе, но символами. */
function waveRow(phase: number): string {
  const width = 58;
  const pulse = phase * 1.7;
  let row = "";

  for (let x = 0; x < width; x += 1) {
    const base = Math.sin(x * 0.32 + phase * 0.85) * 0.45;
    const raw = ((x - pulse) % width + width) % width;
    const distance = Math.min(raw, width - raw);
    const spike = Math.exp(-(distance * distance) / 10) * 2.3;
    const level = base + spike;

    if (level > 1.55) row += "●";
    else if (level > 1) row += "◉";
    else if (level > 0.5) row += "○";
    else if (level > 0.05) row += ":";
    else if (level > -0.5) row += ".";
    else row += "·";
  }

  return row;
}

interface BootMenuProps {
  onDone: (target: Tab | "quit") => void;
}

export function BootMenu({ onDone }: BootMenuProps) {
  const [phase, setPhase] = useState(0);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPhase((value) => (value + 1) % 100000);
    }, 90);
    return () => window.clearInterval(timer);
  }, []);

  const choose = (target: Tab | "quit") => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    window.setTimeout(() => onDone(target), 190);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "Tab") {
        event.preventDefault();
        setIndex((value) => (value + 1) % MENU.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setIndex((value) => (value - 1 + MENU.length) % MENU.length);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose(MENU[index].id);
      } else if (event.key === "Escape") {
        event.preventDefault();
        choose("overview");
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index]);

  const art = useMemo(() => artLayers(phase), [phase]);
  const orb = useMemo(() => orbRows(phase).join("\n"), [phase]);
  const wave = useMemo(() => waveRow(phase), [phase]);

  return (
    <div className={`boot${leaving ? " is-leaving" : ""}`}>
      <div className="boot-stage">
        <pre className="boot-orb">{orb}</pre>

        <div className="boot-word">
          <pre className="boot-art boot-art-off">{art.off.join("\n")}</pre>
          <pre className="boot-art boot-art-on">{art.on.join("\n")}</pre>
        </div>

        <div className="boot-tag">системный ассистент · v0.1.1</div>

        <pre className="boot-wave">{wave}</pre>

        <div className="boot-menu" role="menu">
          {MENU.map((item, position) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`boot-item${position === index ? " is-active" : ""}`}
              onMouseEnter={() => setIndex(position)}
              onClick={() => choose(item.id)}
            >
              <span className="boot-cursor">{position === index ? "›" : " "}</span>
              <span className="boot-label">{item.label}</span>
              <span className="boot-hint">{item.hint}</span>
            </button>
          ))}
        </div>

        <div className="boot-foot">↑ ↓ выбор · Enter открыть · Esc пропустить</div>
      </div>
    </div>
  );
}
