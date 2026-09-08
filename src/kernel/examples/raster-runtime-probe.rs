fn main(){
 let result=arch_kernel::test_suite::arch_raster_test_run();
 let p=arch_kernel::test_suite::arch_raster_test_report_ptr();
 let n=arch_kernel::test_suite::arch_raster_test_report_len();
 println!("{}",std::str::from_utf8(unsafe{std::slice::from_raw_parts(p,n as usize)}).unwrap());
 if result!=1{std::process::exit(1)}
}
