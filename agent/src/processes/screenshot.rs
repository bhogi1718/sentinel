use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits, ReleaseDC,
    SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, SRCCOPY,
};
use windows::Win32::UI::HiDpi::{SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2};
use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN};

/// Captures the full virtual screen (all monitors, spanning their actual
/// arrangement) as PNG bytes. Must run in the interactive user's session -
/// GetDC(None) returns a DC for the calling process's own desktop, which a
/// Session-0 LocalSystem service doesn't have (see windows_apps.rs for the
/// same constraint applied to window enumeration). This is why capture
/// lives in the per-session helper rather than the main service.
pub fn capture_virtual_screen_png() -> Result<Vec<u8>, String> {
    // Without this, GDI calls made from a process that hasn't opted into
    // per-monitor DPI awareness capture at a DPI-virtualized (scaled, often
    // blurry) resolution rather than the monitors' real pixel dimensions.
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }

    let (x, y, width, height) = unsafe {
        (
            GetSystemMetrics(SM_XVIRTUALSCREEN),
            GetSystemMetrics(SM_YVIRTUALSCREEN),
            GetSystemMetrics(SM_CXVIRTUALSCREEN),
            GetSystemMetrics(SM_CYVIRTUALSCREEN),
        )
    };

    if width <= 0 || height <= 0 {
        return Err(format!("Invalid virtual screen dimensions: {width}x{height}"));
    }

    let rgb = unsafe { capture_region_rgb(x, y, width, height) }?;
    encode_png(width as u32, height as u32, &rgb)
}

/// SAFETY: caller must ensure this runs on a thread with access to an
/// interactive desktop (see module doc comment) - GetDC(None) silently
/// returns a null/invalid DC otherwise rather than failing loudly.
unsafe fn capture_region_rgb(x: i32, y: i32, width: i32, height: i32) -> Result<Vec<u8>, String> {
    let screen_dc = GetDC(HWND::default());
    if screen_dc.is_invalid() {
        return Err("GetDC returned an invalid device context (no interactive desktop?)".to_string());
    }

    let mem_dc = CreateCompatibleDC(screen_dc);
    if mem_dc.is_invalid() {
        ReleaseDC(HWND::default(), screen_dc);
        return Err("CreateCompatibleDC failed".to_string());
    }

    let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
    if bitmap.is_invalid() {
        let _ = DeleteDC(mem_dc);
        ReleaseDC(HWND::default(), screen_dc);
        return Err("CreateCompatibleBitmap failed".to_string());
    }

    let previous_bitmap = SelectObject(mem_dc, bitmap);

    let blit_result = BitBlt(mem_dc, 0, 0, width, height, screen_dc, x, y, SRCCOPY);

    let mut pixels = vec![0u8; (width as usize) * (height as usize) * 4];
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            // Negative height requests a top-down DIB (row 0 = top of
            // image) - GetDIBits defaults to bottom-up otherwise, which
            // would render the capture upside down.
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };

    let dib_result = GetDIBits(
        mem_dc,
        bitmap,
        0,
        height as u32,
        Some(pixels.as_mut_ptr() as *mut _),
        &mut bmi,
        DIB_RGB_COLORS,
    );

    SelectObject(mem_dc, previous_bitmap);
    let _ = DeleteObject(bitmap);
    let _ = DeleteDC(mem_dc);
    ReleaseDC(HWND::default(), screen_dc);

    if let Err(e) = blit_result {
        return Err(format!("BitBlt failed: {e}"));
    }
    if dib_result == 0 {
        return Err("GetDIBits failed to copy pixel data".to_string());
    }

    // GDI's 32-bit DIB format is BGRX, not RGB - swap in place before
    // handing off to the PNG encoder, which expects RGB byte order.
    for pixel in pixels.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }

    Ok(pixels)
}

fn encode_png(width: u32, height: u32, bgrx_swapped_to_rgbx: &[u8]) -> Result<Vec<u8>, String> {
    let mut png_bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png_bytes, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|e| format!("PNG header write failed: {e}"))?;
        writer
            .write_image_data(bgrx_swapped_to_rgbx)
            .map_err(|e| format!("PNG image data write failed: {e}"))?;
    }
    Ok(png_bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_png_produces_a_valid_png_signature_and_decodes_back_to_the_same_pixels() {
        let width = 4u32;
        let height = 2u32;
        let mut pixels = vec![0u8; (width * height * 4) as usize];
        for (i, byte) in pixels.iter_mut().enumerate() {
            *byte = (i % 256) as u8;
        }

        let png_bytes = encode_png(width, height, &pixels).expect("encoding should succeed");

        // The 8-byte PNG file signature - a cheap, exact way to confirm this
        // is a real PNG stream rather than encode_png silently producing
        // garbage that happens to not error.
        assert_eq!(&png_bytes[0..8], &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

        let decoder = png::Decoder::new(png_bytes.as_slice());
        let mut reader = decoder.read_info().expect("should parse the header back out");
        let mut decoded = vec![0u8; reader.output_buffer_size()];
        let info = reader.next_frame(&mut decoded).expect("should decode the image data");

        assert_eq!(info.width, width);
        assert_eq!(info.height, height);
        assert_eq!(&decoded[..info.buffer_size()], pixels.as_slice());
    }

    #[test]
    fn captures_a_real_screenshot_with_plausible_dimensions() {
        // Same live-desktop precondition as windows_apps::tests -
        // meaningful only when run from a process with an interactive
        // session (the per-session helper's actual runtime context), not
        // from a Session-0 service.
        let png_bytes = capture_virtual_screen_png().expect("capture should succeed on an interactive desktop");

        assert_eq!(&png_bytes[0..8], &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

        let decoder = png::Decoder::new(png_bytes.as_slice());
        let reader = decoder.read_info().expect("should parse the captured PNG header");
        let (width, height) = reader.info().size();
        assert!(width > 0 && height > 0, "captured image should have nonzero dimensions, got {width}x{height}");
    }
}
