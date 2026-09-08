use std::{env, path::Path};
fn main() {
    println!("cargo:rerun-if-env-changed=ARCH_NATIVE_BUILD");
    let build = env::var("ARCH_NATIVE_BUILD").expect("Build pinned C++ dependencies first; set ARCH_NATIVE_BUILD");
    let root = Path::new(&build);
    let target = env::var("TARGET").unwrap();
    let directories: &[&str] = if target.ends_with("msvc") {
        &["Release", "mesh-import/Release", "final-scene-export/Release", "source-assembly/Release", "mechanics/Release", "manifold/lib/Release", "_deps/clipper2-build/Release", "harfbuzz/Release"]
    } else { &["", "mesh-import", "final-scene-export", "source-assembly", "mechanics", "manifold/src", "_deps/clipper2-build", "harfbuzz"] };
    for dir in directories { println!("cargo:rustc-link-search=native={}", root.join(dir).display()); }
    for lib in ["arch_mesh_root_static", "arch_imported_csg_static", "arch_mesh_import_static", "arch_final_scene_export", "arch_geometry", "arch_source_assembly", "arch_mechanics", "manifold", "Clipper2", "harfbuzz"] {
        let file=if target.ends_with("msvc"){format!("{lib}.lib")}else{format!("lib{lib}.a")};
        let archive=directories.iter().map(|dir|root.join(dir).join(&file)).find(|p|p.is_file())
            .unwrap_or_else(||panic!("Missing pinned native archive: {file}"));
        // External CMake outputs are not part of Cargo's default source graph.
        // Track the actual archive so a C++-only change also relinks Rust/WASM.
        println!("cargo:rerun-if-changed={}",archive.display());
        println!("cargo:rustc-link-lib=static={lib}");
    }
    println!("cargo:rerun-if-env-changed=ARCH_PRINTING_ENABLED");
    if env::var("ARCH_PRINTING_ENABLED").as_deref()==Ok("1") {
        let dirs=if target.ends_with("msvc"){vec!["printing/Release","printing/lib3mf/Release"]}
                 else {vec!["printing","printing/lib3mf"]};
        for dir in &dirs { println!("cargo:rustc-link-search=native={}",root.join(dir).display()); }
        for lib in ["arch3mf_static","lib3mf"] {
            let file=if target.ends_with("msvc"){format!("{lib}.lib")}else if lib=="lib3mf"{"lib3mf.a".into()}else{format!("lib{lib}.a")};
            let archive=dirs.iter().map(|d|root.join(d).join(&file)).find(|p|p.is_file()).unwrap_or_else(||panic!("Missing printing archive: {file}"));
            println!("cargo:rerun-if-changed={}",archive.display());
            if lib=="lib3mf" && !target.ends_with("msvc") {println!("cargo:rustc-link-lib=static:+verbatim=lib3mf.a");}
            else {println!("cargo:rustc-link-lib=static={lib}");}
        }
        if target.ends_with("msvc") {for lib in ["advapi32","ole32","uuid"] {println!("cargo:rustc-link-lib={lib}");}}
    }
    if !target.ends_with("msvc") { println!("cargo:rustc-link-lib=c++"); }
}
