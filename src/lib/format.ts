const UNITS = ["Б", "КБ", "МБ", "ГБ", "ТБ"];

export function bytes(value: number, digits = 1): string {
  if (!Number.isFinite(value) || value <= 0) return "0 Б";
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const precision = unit === 0 || size >= 100 ? 0 : digits;
  return `${size.toFixed(precision).replace(".", ",")} ${UNITS[unit]}`;
}

export const rate = (value: number): string => `${bytes(value)}/с`;

export const percent = (part: number, total: number): number =>
  total > 0 ? Math.min(100, Math.max(0, (part / total) * 100)) : 0;

export function frequency(mhz: number): string {
  if (!mhz) return "—";
  return mhz >= 1000 ? `${(mhz / 1000).toFixed(2).replace(".", ",")} ГГц` : `${mhz} МГц`;
}

export function uptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} д ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

export function duration(seconds: number): string {
  if (seconds < 60) return "меньше минуты";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} д ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

export function clockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function shortPath(path: string): string {
  if (!path) return "";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/** Русское склонение: plural(1, "том", "тома", "томов") → "1 том". */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  const word =
    mod100 >= 11 && mod100 <= 14 ? many : mod10 === 1 ? one : mod10 >= 2 && mod10 <= 4 ? few : many;
  return `${count} ${word}`;
}

export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value.padEnd(6, "0").slice(0, 6);
  const number = Number.parseInt(full, 16);
  if (Number.isNaN(number)) return `rgba(242, 242, 244, ${alpha})`;
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value.padEnd(6, "0").slice(0, 6);
  const number = Number.parseInt(full, 16);
  if (Number.isNaN(number)) return 1;
  const red = ((number >> 16) & 255) / 255;
  const green = ((number >> 8) & 255) / 255;
  const blue = (number & 255) / 255;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
