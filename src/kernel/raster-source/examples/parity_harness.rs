#[path = "../tests/support/parity_cases.rs"]
mod parity_cases;
use std::sync::OnceLock;
static REPORT: OnceLock<Vec<u8>> = OnceLock::new();
#[no_mangle]
pub extern "C" fn raster_parity_run() -> *const u8 {
    REPORT.get_or_init(parity_cases::report).as_ptr()
}
#[no_mangle]
pub extern "C" fn raster_parity_len() -> usize {
    REPORT.get_or_init(parity_cases::report).len()
}
fn main() {
    let report = REPORT.get_or_init(parity_cases::report);
    let hex: String = report.iter().map(|v| format!("{v:02x}")).collect();
    println!("RASTER_PARITY_V2:{hex}");
}
