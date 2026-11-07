import { getCurrentWindow } from "@tauri-apps/api/window";

import { IconClose, IconMaximize, IconMinimize } from "./icons";

const appWindow = getCurrentWindow();

export function TitleBar() {
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">INTERFACE</span>
        <span className="brand-tag">системный ассистент</span>
      </div>

      <div className="titlebar-controls">
        <button
          type="button"
          className="win-button"
          title="Свернуть"
          onClick={() => void appWindow.minimize()}
        >
          <IconMinimize />
        </button>
        <button
          type="button"
          className="win-button"
          title="Развернуть"
          onClick={() => void appWindow.toggleMaximize()}
        >
          <IconMaximize />
        </button>
        <button
          type="button"
          className="win-button win-button-close"
          title="Скрыть в трей"
          onClick={() => void appWindow.close()}
        >
          <IconClose />
        </button>
      </div>
    </header>
  );
}
