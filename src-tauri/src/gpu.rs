//! Загрузка видеокарты через NVML (поставляется драйвером NVIDIA).
//! Библиотека подгружается динамически: без NVIDIA-драйвера приложение
//! работает как обычно, а виджет показывает «нет данных».

use std::ffi::c_void;
use std::sync::OnceLock;

use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub utilization: u32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub temperature: u32,
}

#[repr(C)]
#[derive(Default)]
struct NvmlUtilization {
    gpu: u32,
    memory: u32,
}

#[repr(C)]
#[derive(Default)]
struct NvmlMemory {
    total: u64,
    free: u64,
    used: u64,
}

type InitFn = unsafe extern "system" fn() -> i32;
type GetCountFn = unsafe extern "system" fn(*mut u32) -> i32;
type GetHandleFn = unsafe extern "system" fn(u32, *mut *mut c_void) -> i32;
type GetNameFn = unsafe extern "system" fn(*mut c_void, *mut u8, u32) -> i32;
type GetUtilFn = unsafe extern "system" fn(*mut c_void, *mut NvmlUtilization) -> i32;
type GetMemFn = unsafe extern "system" fn(*mut c_void, *mut NvmlMemory) -> i32;
type GetTempFn = unsafe extern "system" fn(*mut c_void, u32, *mut u32) -> i32;

struct Nvml {
    device: *mut c_void,
    name: String,
    get_util: GetUtilFn,
    get_mem: GetMemFn,
    get_temp: GetTempFn,
}

// Указатель на устройство NVML живёт всё время работы процесса и потокобезопасен.
unsafe impl Send for Nvml {}
unsafe impl Sync for Nvml {}

static NVML: OnceLock<Option<Nvml>> = OnceLock::new();

pub fn sample() -> Option<GpuInfo> {
    let nvml = NVML.get_or_init(load).as_ref()?;

    let mut utilization = NvmlUtilization::default();
    let mut memory = NvmlMemory::default();
    let mut temperature: u32 = 0;

    unsafe {
        if (nvml.get_util)(nvml.device, &mut utilization) != 0 {
            return None;
        }
        (nvml.get_mem)(nvml.device, &mut memory);
        let _ = (nvml.get_temp)(nvml.device, 0, &mut temperature);
    }

    Some(GpuInfo {
        name: nvml.name.clone(),
        utilization: utilization.gpu.min(100),
        memory_used: memory.used,
        memory_total: memory.total,
        temperature,
    })
}

#[cfg(windows)]
fn load() -> Option<Nvml> {
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    unsafe {
        let mut library = std::ptr::null_mut();
        for candidate in ["nvml.dll", "C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvml.dll"] {
            let wide: Vec<u16> = candidate.encode_utf16().chain(std::iter::once(0)).collect();
            library = LoadLibraryW(wide.as_ptr());
            if !library.is_null() {
                break;
            }
        }
        if library.is_null() {
            return None;
        }

        let symbol = |name: &[u8]| GetProcAddress(library, name.as_ptr());

        let init: InitFn = std::mem::transmute(symbol(b"nvmlInit_v2\0")?);
        if init() != 0 {
            return None;
        }

        let get_count: GetCountFn = std::mem::transmute(symbol(b"nvmlDeviceGetCount_v2\0")?);
        let get_handle: GetHandleFn =
            std::mem::transmute(symbol(b"nvmlDeviceGetHandleByIndex_v2\0")?);
        let get_name: GetNameFn = std::mem::transmute(symbol(b"nvmlDeviceGetName\0")?);
        let get_util: GetUtilFn = std::mem::transmute(symbol(b"nvmlDeviceGetUtilizationRates\0")?);
        let get_mem: GetMemFn = std::mem::transmute(symbol(b"nvmlDeviceGetMemoryInfo\0")?);
        let get_temp: GetTempFn = std::mem::transmute(symbol(b"nvmlDeviceGetTemperature\0")?);

        let mut count = 0u32;
        if get_count(&mut count) != 0 || count == 0 {
            return None;
        }

        let mut device: *mut c_void = std::ptr::null_mut();
        if get_handle(0, &mut device) != 0 {
            return None;
        }

        let mut buffer = [0u8; 96];
        let name = if get_name(device, buffer.as_mut_ptr(), buffer.len() as u32) == 0 {
            let end = buffer.iter().position(|byte| *byte == 0).unwrap_or(buffer.len());
            String::from_utf8_lossy(&buffer[..end]).to_string()
        } else {
            "GPU".to_string()
        };

        Some(Nvml {
            device,
            name,
            get_util,
            get_mem,
            get_temp,
        })
    }
}

#[cfg(not(windows))]
fn load() -> Option<Nvml> {
    None
}
