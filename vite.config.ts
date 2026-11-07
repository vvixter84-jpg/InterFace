import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Порт фиксирован: Tauri открывает окно на строго заданном адресе.
// Оверлей ошибок Vite отключён, чтобы не заслонять интерфейс.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1421,
    strictPort: true,
    watch: {
      // Каталог сборки Rust и временные папки атомарной записи редактора:
      // их исчезновение роняло watcher с ENOENT.
      ignored: ["**/src-tauri/**", "**/*.tmpdir/**"],
      // Атомарная запись (temp → rename) не всегда доходит событиями
      // нативного вотчера, поэтому опрашиваем файлы сами.
      usePolling: true,
      interval: 400,
    },
  },
  build: {
    target: "chrome105",
    sourcemap: false,
  },
});
