export interface CpuInfo {
  total: number;
  perCore: number[];
  brand: string;
  frequency: number;
  cores: number;
  threads: number;
}

export interface MemoryInfo {
  total: number;
  used: number;
  available: number;
  swapTotal: number;
  swapUsed: number;
}

export interface DiskInfo {
  name: string;
  mount: string;
  fileSystem: string;
  total: number;
  available: number;
  removable: boolean;
  kind: string;
  readRate: number;
  writeRate: number;
}

export interface NetInfo {
  name: string;
  rxRate: number;
  txRate: number;
  totalRx: number;
  totalTx: number;
}

export interface ProcessRow {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  virtualMemory: number;
  status: string;
  exe: string;
  runTime: number;
  diskRead: number;
  diskWritten: number;
}

export interface BatteryInfo {
  percent: number;
  charging: boolean;
  acOnline: boolean;
  secondsLeft: number | null;
}

export interface GpuInfo {
  name: string;
  utilization: number;
  memoryUsed: number;
  memoryTotal: number;
  temperature: number;
}

export interface Snapshot {
  ts: number;
  hostname: string;
  osName: string;
  osVersion: string;
  kernel: string;
  uptime: number;
  cpu: CpuInfo;
  memory: MemoryInfo;
  disks: DiskInfo[];
  networks: NetInfo[];
  top: ProcessRow[];
  topMemory: ProcessRow[];
  processCount: number;
  battery: BatteryInfo | null;
  gpu: GpuInfo | null;
}

export interface HistoryPoint {
  ts: number;
  cpu: number;
  mem: number;
  rx: number;
  tx: number;
}

export type WidgetKind =
  | "cpu"
  | "memory"
  | "network"
  | "disks"
  | "processes"
  | "clock"
  | "battery"
  | "diskio"
  | "memorytop"
  | "calendar"
  | "cpuactivity"
  | "gpu";

export interface WidgetConfig {
  id: WidgetKind;
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  scale: number;
  accent: string | null;
  chart: boolean;
  label: boolean;
  transparent: boolean;
}

export type WidgetsMode = "desktop" | "window";

export interface Settings {
  accent: string;
  hotkey: string;
  autostart: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  alerts: boolean;
  alwaysOnTop: boolean;
  sampleMs: number;
  showBootMenu: boolean;
  widgetsEnabled: boolean;
  widgetsMode: WidgetsMode;
  autoHideFullscreen: boolean;
  widgets: WidgetConfig[];
}
