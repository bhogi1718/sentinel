use windows::core::PCWSTR;
use windows::Win32::Foundation::{HINSTANCE, HWND};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, RegisterClassW, HWND_MESSAGE, WNDCLASSW, WNDPROC, WS_OVERLAPPED,
};

/// A message-only window (HWND_MESSAGE) - receives window messages without
/// ever being shown on screen. This is the standard Win32 pattern for a
/// background service that needs to receive session/power notifications.
pub struct MessageOnlyWindow {
    hwnd: HWND,
}

impl MessageOnlyWindow {
    pub fn create(class_name: &str, wndproc: WNDPROC) -> Result<Self, String> {
        let class_name_wide: Vec<u16> = class_name.encode_utf16().chain(std::iter::once(0)).collect();

        unsafe {
            let module = GetModuleHandleW(None).map_err(|e| format!("GetModuleHandleW failed: {e}"))?;
            let instance: HINSTANCE = module.into();

            let wc = WNDCLASSW {
                lpfnWndProc: wndproc,
                hInstance: instance,
                lpszClassName: PCWSTR(class_name_wide.as_ptr()),
                ..Default::default()
            };

            let atom = RegisterClassW(&wc);
            if atom == 0 {
                return Err("RegisterClassW failed".to_string());
            }

            let hwnd = CreateWindowExW(
                Default::default(),
                PCWSTR(class_name_wide.as_ptr()),
                PCWSTR::null(),
                WS_OVERLAPPED,
                0,
                0,
                0,
                0,
                HWND_MESSAGE,
                None,
                module,
                None,
            )
            .map_err(|e| format!("CreateWindowExW failed: {e}"))?;

            Ok(Self { hwnd })
        }
    }

    pub fn hwnd(&self) -> HWND {
        self.hwnd
    }
}
