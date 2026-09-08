//! Test-only fixture generator. All codec work uses pinned official encoders.
#[path = "../tests/support/fixtures.rs"]
mod fixtures;
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dir = PathBuf::from(
        std::env::args()
            .nth(1)
            .ok_or("pass an existing output directory inside the raster run")?,
    )
    .canonicalize()?;
    let normalized = dir.to_string_lossy().replace('\\', "/");
    if !normalized.contains("/tmp/reviews/codex/runs/20260908-raster-wave2/") {
        return Err("fixture output must be inside the new raster run".into());
    }
    let outputs = [
        (
            "synthetic-rgba.png",
            fixtures::png_rgba(&fixtures::RGBA, 3, 2, None, true),
            "png=0.18.1 RGBA8 + sRGB, no EXIF",
        ),
        (
            "synthetic-rgba.webp",
            fixtures::webp_rgba(&fixtures::RGBA, 3, 2, None, None),
            "image=0.25.10 / image-webp=0.2.4 VP8L lossless RGBA8",
        ),
        (
            "synthetic-rgb.jpg",
            fixtures::jpeg_rgb(&fixtures::jpeg_grid(), 16, 8, None, None),
            "image=0.25.10 JPEG RGB8 quality=100",
        ),
        (
            "synthetic-exif6.jpg",
            fixtures::jpeg_rgb(&fixtures::jpeg_grid(), 16, 8, Some(fixtures::exif(6)), None),
            "same JPEG + synthetic EXIF IFD0 orientation=6",
        ),
    ];
    let mut manifest = Vec::new();
    for (name, bytes, recipe) in outputs {
        let path = dir.join(name);
        if path
            .symlink_metadata()
            .is_ok_and(|m| m.file_type().is_symlink())
        {
            return Err("refusing linked output".into());
        }
        fs::write(path, &bytes)?;
        manifest.push(serde_json::json!({"path":name,"bytes":bytes.len(),"sha256":format!("{:x}",Sha256::digest(&bytes)),"recipe":recipe,
            "source":"self-created numeric pixel data in tests/support/fixtures.rs; no third-party image artwork","license":"project LICENSE"}));
    }
    fs::write(
        dir.join("synthetic-manifest.json"),
        serde_json::to_string_pretty(&manifest)? + "\n",
    )?;
    println!(
        "Wrote {} synthetic codec fixtures and manifest inside {}",
        manifest.len(),
        dir.display()
    );
    Ok(())
}
