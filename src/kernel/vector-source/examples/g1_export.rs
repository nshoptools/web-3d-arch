use arch_vector_source::{parse_svg, ParseOptions};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let fixture = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "rectangle-hole".into());
    let source = match fixture.as_str() {
        "rectangle-hole" => include_str!("../tests/fixtures/corpus-v1/rectangle-hole.svg"),
        "shared-seam" => include_str!("../tests/fixtures/corpus-v1/shared-seam.svg"),
        _ => return Err("choose rectangle-hole or shared-seam".into()),
    };
    let document = parse_svg(source, ParseOptions::default())?;
    println!("{}", serde_json::to_string_pretty(&document)?);
    Ok(())
}
