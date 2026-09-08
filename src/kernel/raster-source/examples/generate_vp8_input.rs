use std::path::PathBuf;
fn main() {
    let out = PathBuf::from(std::env::args().nth(1).expect("own-run output path"));
    let run =
        PathBuf::from(std::env::var("PROJECT_REVIEW_RUN").expect("dot-source development env"));
    assert!(out.is_absolute() && out.starts_with(&run));
    let mut rgb = Vec::new();
    for y in 0..24u32 {
        for x in 0..32u32 {
            rgb.extend_from_slice(&if (i32::try_from(x).unwrap() - 16).pow(2)
                + (i32::try_from(y).unwrap() - 12).pow(2)
                < 64
            {
                [220, 40, 70]
            } else {
                [(x * 7) as u8, (y * 9) as u8, 180]
            });
        }
    }
    let file = std::fs::File::create(out).unwrap();
    let mut enc = png::Encoder::new(file, 32, 24);
    enc.set_color(png::ColorType::Rgb);
    enc.set_depth(png::BitDepth::Eight);
    enc.set_source_srgb(png::SrgbRenderingIntent::Perceptual);
    enc.write_header().unwrap().write_image_data(&rgb).unwrap();
}
