# Dependency provenance

Cargo.lock pins the complete crates.io resolution and package archive SHA-256.
No crate source is modified. Direct pins are usvg 0.48.1 (default features off),
roxmltree 0.21.1, svgtypes 0.16.1, serde 1.0.228 and sha2 0.10.9.
serde_json 1.0.149 is a development/example dependency.

The generated dependency-inventory.json records each resolved package, version,
license expression, source and archive checksum. licenses/ contains unmodified
license/notice files collected from those exact downloaded package sources.
These remain separate from the repository's internal LICENSE.

Exact API/behavior inspection used the official downloaded crate source, and the
corresponding resvg clipping implementation at Git revision
68b14c4c3bccdb60344c777406486b54c36ec1a4 (from usvg's .cargo_vcs_info.json):

- [usvg options and resource resolvers](https://github.com/linebender/resvg/blob/68b14c4c3bccdb60344c777406486b54c36ec1a4/crates/usvg/src/parser/options.rs)
- [usvg default image resolver](https://github.com/linebender/resvg/blob/68b14c4c3bccdb60344c777406486b54c36ec1a4/crates/usvg/src/parser/image.rs)
- [usvg tree, paths, stroke conversion and clip API](https://github.com/linebender/resvg/blob/68b14c4c3bccdb60344c777406486b54c36ec1a4/crates/usvg/src/tree/mod.rs)
- [usvg path and primitive conversion](https://github.com/linebender/resvg/blob/68b14c4c3bccdb60344c777406486b54c36ec1a4/crates/usvg/src/parser/shapes.rs)
- [usvg clip conversion](https://github.com/linebender/resvg/blob/68b14c4c3bccdb60344c777406486b54c36ec1a4/crates/usvg/src/parser/clippath.rs)
- [resvg linked clip and child clipping coordinate basis](https://github.com/linebender/resvg/blob/68b14c4c3bccdb60344c777406486b54c36ec1a4/crates/resvg/src/clip.rs)
- [svgtypes 0.16.1 path parser source](https://docs.rs/svgtypes/0.16.1/src/svgtypes/path.rs.html)
- [tiny-skia-path 0.12.0 stroker source](https://docs.rs/tiny-skia-path/0.12.0/src/tiny_skia_path/stroker.rs.html)
- [roxmltree 0.21.1 parsing options](https://docs.rs/roxmltree/0.21.1/roxmltree/struct.ParsingOptions.html)

The usvg parser can truncate a malformed path and ignore invalid/unsupported
features. The importer therefore validates original XML/path/value syntax and
tracks omitted source geometry. The standard usvg image string resolver can
read local files; this crate overrides both image callbacks to return None.
The native source inspection and feature tree are recorded in the run's evidence.

Formatting used an isolated rustfmt component in this run, not installation into
shared rustup. Its official distribution manifest URL is
https://static.rust-lang.org/dist/2026-09-03/rustfmt-1.98.1-x86_64-pc-windows-msvc.tar.xz
and SHA-256 is 6606ee64b80c1ce758ad64633aef869b2ce72188568d39a53a4f792c62299769.
This tool is not a runtime dependency or a file to copy into the kernel crate.

