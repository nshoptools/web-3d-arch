use crate::*;
use roxmltree::{Document, Node, NodeType};
use std::collections::{HashMap, HashSet};
use std::str::FromStr;

const SVG_NS: &str = "http://www.w3.org/2000/svg";
const XLINK_NS: &str = "http://www.w3.org/1999/xlink";
const XML_NS: &str = "http://www.w3.org/XML/1998/namespace";
pub(crate) struct Checked {
    pub normalized_svg: String,
    pub graph: Vec<SourceNode>,
    pub paths: Vec<SourcePath>,
    pub diagnostics: Vec<Diagnostic>,
    pub status: ManufacturingStatus,
    pub ids: HashMap<String, usize>,
    pub active_geometry: Vec<(String, usize)>,
    pub has_rounded_shapes: bool,
}
impl Checked {
    fn block(&mut self, node: Node<'_, '_>, code: &str, message: &str, raster: bool) {
        if !raster || self.status == ManufacturingStatus::Unsupported {
            self.status = ManufacturingStatus::Unsupported;
        } else {
            self.status = ManufacturingStatus::RequiresConfirmedRaster;
        }
        self.diagnostics.push(Diagnostic {
            code: code.into(),
            message: message.into(),
            severity: Severity::ManufacturingBlocked,
            source_node: Some(node.id().get() as usize),
            source_span: Some(span(node)),
        });
    }
}
fn span(node: Node<'_, '_>) -> SourceSpan {
    let range = node.range();
    let pos = node.document().text_pos_at(range.start);
    SourceSpan {
        byte_start: range.start,
        byte_end: range.end,
        line: pos.row,
        column: pos.col,
    }
}
fn err(code: ErrorCode, message: impl Into<String>) -> VectorError {
    VectorError::new(code, message)
}
fn is_shape(tag: &str) -> bool {
    matches!(
        tag,
        "path" | "rect" | "circle" | "ellipse" | "line" | "polyline" | "polygon"
    )
}
fn numeric(v: f64, options: &ParseOptions) -> Result<(), VectorError> {
    if !v.is_finite() || v.abs() > options.limits.max_source_number {
        return Err(err(
            ErrorCode::CoordinateLimit,
            "Source number exceeds conservative finite user-unit domain",
        ));
    }
    Ok(())
}
fn numbers(value: &str, options: &ParseOptions) -> Result<Vec<f64>, VectorError> {
    let mut values = vec![];
    for v in svgtypes::NumberListParser::from(value) {
        let v = v.map_err(|_| err(ErrorCode::InvalidValue, "Invalid SVG number list"))?;
        numeric(v, options)?;
        values.push(v);
        if values.len() > options.limits.max_source_segments * 8 {
            return Err(err(ErrorCode::ResourceLimit, "Number list budget exceeded"));
        }
    }
    if values.is_empty() {
        return Err(err(ErrorCode::InvalidValue, "Empty SVG number list"));
    }
    Ok(values)
}
fn length(value: &str, options: &ParseOptions) -> Result<svgtypes::Length, VectorError> {
    let l = svgtypes::Length::from_str(value.trim())
        .map_err(|_| err(ErrorCode::InvalidValue, "Invalid SVG length"))?;
    numeric(l.number, options)?;
    Ok(l)
}
fn absolute_mm(l: svgtypes::Length) -> Option<f64> {
    use svgtypes::LengthUnit::*;
    Some(
        l.number
            * match l.unit {
                None | Px => MM_PER_PX,
                Mm => 1.0,
                Cm => 10.0,
                In => 25.4,
                Pt => 25.4 / 72.0,
                Pc => 25.4 / 6.0,
                _ => return std::option::Option::None,
            },
    )
}
fn check_css_safety(value: &str) -> Result<(), VectorError> {
    let lower = value.to_ascii_lowercase();
    if lower.contains('@')
        || lower.contains('\\')
        || lower.contains("/*")
        || lower.contains('{')
        || lower.contains('}')
        || lower.contains("javascript:")
        || lower.contains("expression(")
        || lower.contains("-moz-binding")
        || lower.contains("behavior:")
    {
        return Err(err(
            ErrorCode::UnsafeSource,
            "CSS imports, escapes, comments, rules and executable constructs are disallowed",
        ));
    }
    // Every URL is rejected unless it is a simple same-document fragment.
    // This scan is a restrictive security gate; SVG/CSS values are parsed by svgtypes below.
    let mut tail = lower.as_str();
    while let Some(at) = tail.find("url") {
        tail = tail[at + 3..].trim_start();
        if !tail.starts_with('(') {
            return Err(err(ErrorCode::UnsafeSource, "Ambiguous CSS URL syntax"));
        }
        let end = tail
            .find(')')
            .ok_or_else(|| err(ErrorCode::InvalidValue, "Unterminated CSS URL"))?;
        let iri = tail[1..end].trim().trim_matches(['\'', '"']);
        if !iri.starts_with('#')
            || iri.len() == 1
            || iri.chars().any(|c| {
                c.is_whitespace() || matches!(c, ':' | '/' | '\\' | '(' | ')' | '\'' | '"')
            })
        {
            return Err(err(
                ErrorCode::UnsafeSource,
                "External or ambiguous CSS URL is forbidden",
            ));
        }
        tail = &tail[end + 1..];
    }
    Ok(())
}
fn fragment_url(value: &str) -> Result<String, VectorError> {
    // Paint parses url() through svgtypes' IRI grammar, including quotes.
    match svgtypes::Paint::from_str(value)
        .map_err(|_| err(ErrorCode::InvalidValue, "Invalid local URL"))?
    {
        svgtypes::Paint::FuncIRI(id, None) if !id.is_empty() => Ok(id.to_string()),
        _ => Err(err(
            ErrorCode::InvalidValue,
            "Expected one local url(#id) without fallback",
        )),
    }
}
fn validate_property(
    name: &str,
    value: &str,
    node: Node<'_, '_>,
    c: &mut Checked,
    options: &ParseOptions,
    refs: &mut Vec<(usize, String)>,
) -> Result<(), VectorError> {
    check_css_safety(value)?;
    let v = value.trim();
    if v.is_empty() {
        return Err(err(ErrorCode::InvalidValue, "Empty presentation property"));
    }
    if v == "inherit" {
        if matches!(
            name,
            "fill"
                | "stroke"
                | "color"
                | "fill-rule"
                | "clip-rule"
                | "stroke-width"
                | "stroke-linecap"
                | "stroke-linejoin"
                | "stroke-miterlimit"
                | "visibility"
                | "fill-opacity"
                | "stroke-opacity"
        ) {
            return Ok(());
        }
        c.block(
            node,
            "unsupported_inheritance",
            "Inheritance for this property is not audited",
            false,
        );
        return Ok(());
    }
    match name {
        "fill" | "stroke" => {
            let paint = svgtypes::Paint::from_str(v).map_err(|_| {
                err(
                    ErrorCode::InvalidValue,
                    "Malformed paint; refusing usvg fallback",
                )
            })?;
            match paint {
                svgtypes::Paint::None | svgtypes::Paint::CurrentColor => {}
                svgtypes::Paint::Color(col) if col.alpha == 255 => {}
                svgtypes::Paint::Color(_) => c.block(
                    node,
                    "alpha_paint",
                    "Alpha paint requires a confirmed appearance conversion",
                    true,
                ),
                svgtypes::Paint::FuncIRI(_, _) => c.block(
                    node,
                    "complex_paint",
                    "Paint server must be resolved by a confirmed appearance/raster conversion",
                    true,
                ),
                _ => c.block(
                    node,
                    "context_paint",
                    "Context paint is not supported in manufacturing",
                    false,
                ),
            }
        }
        "color" => {
            let color = svgtypes::Color::from_str(v)
                .map_err(|_| err(ErrorCode::InvalidValue, "Malformed color"))?;
            if color.alpha != 255 {
                c.block(
                    node,
                    "alpha_color",
                    "Alpha currentColor requires appearance conversion",
                    true,
                );
            }
        }
        "fill-rule" | "clip-rule" => {
            if !matches!(v, "nonzero" | "evenodd") {
                return Err(err(ErrorCode::InvalidValue, "Unknown fill/clip rule"));
            }
        }
        "stroke-width" => {
            let l = length(v, options)?;
            if l.number < 0.0 {
                return Err(err(ErrorCode::InvalidValue, "Negative stroke width"));
            }
            if matches!(
                l.unit,
                svgtypes::LengthUnit::Em | svgtypes::LengthUnit::Ex | svgtypes::LengthUnit::Percent
            ) {
                c.block(
                    node,
                    "relative_stroke_width",
                    "Font/viewport-relative stroke width is not audited",
                    false,
                );
            }
        }
        "stroke-miterlimit" => {
            let n = svgtypes::Number::from_str(v)
                .map_err(|_| err(ErrorCode::InvalidValue, "Invalid miter limit"))?
                .0;
            if !n.is_finite() || !(1.0..=100.0).contains(&n) {
                return Err(err(
                    ErrorCode::InvalidValue,
                    "Miter limit must be in [1,100]",
                ));
            }
        }
        "stroke-linecap" if matches!(v, "butt" | "round" | "square") => {}
        "stroke-linejoin" if matches!(v, "miter" | "miter-clip" | "round" | "bevel") => {}
        "stroke-linecap" | "stroke-linejoin" => {
            return Err(err(
                ErrorCode::InvalidValue,
                "Unsupported stroke cap/join value",
            ))
        }
        "stroke-dasharray" | "stroke-dashoffset" => {
            c.block(
                node,
                "dashed_stroke",
                "Dash expansion is not resource-audited; source retained",
                false,
            );
        }
        "opacity" | "fill-opacity" | "stroke-opacity" => {
            let n = svgtypes::Number::from_str(v)
                .map_err(|_| err(ErrorCode::InvalidValue, "Invalid opacity"))?
                .0;
            if !n.is_finite() || !(0.0..=1.0).contains(&n) {
                return Err(err(ErrorCode::InvalidValue, "Opacity must be in [0,1]"));
            }
            if n != 1.0 {
                c.block(
                    node,
                    "opacity",
                    "Opacity/compositing requires confirmed appearance conversion",
                    true,
                );
            }
        }
        "clip-path" => {
            if v != "none" {
                refs.push((node.id().get() as usize, fragment_url(v)?));
            }
        }
        "display" if matches!(v, "inline" | "none") => {}
        "visibility" if matches!(v, "visible" | "hidden" | "collapse") => {}
        "display" | "visibility" => {
            return Err(err(
                ErrorCode::InvalidValue,
                "Unsupported display/visibility value",
            ))
        }
        "paint-order" => {
            let tokens: Vec<_> = v.split_ascii_whitespace().collect();
            if v != "normal"
                && (tokens.is_empty()
                    || tokens.len() > 3
                    || tokens
                        .iter()
                        .any(|t| !matches!(*t, "fill" | "stroke" | "markers"))
                    || tokens.iter().collect::<HashSet<_>>().len() != tokens.len())
            {
                return Err(err(ErrorCode::InvalidValue, "Invalid paint-order"));
            }
        }
        "mask" | "filter" | "mix-blend-mode" | "isolation" => c.block(
            node,
            "appearance_effect",
            "Mask/filter/composite requires a confirmed appearance conversion",
            true,
        ),
        "shape-rendering" => c.block(
            node,
            "rendering_hint",
            "Raster rendering hint is preserved but not part of manufacturing semantics",
            false,
        ),
        _ => c.block(
            node,
            "unknown_style_property",
            &format!("Unsupported presentation property: {name}"),
            false,
        ),
    }
    Ok(())
}
fn presentation(name: &str) -> bool {
    matches!(
        name,
        "fill"
            | "stroke"
            | "color"
            | "fill-rule"
            | "clip-rule"
            | "stroke-width"
            | "stroke-linecap"
            | "stroke-linejoin"
            | "stroke-miterlimit"
            | "stroke-dasharray"
            | "stroke-dashoffset"
            | "opacity"
            | "fill-opacity"
            | "stroke-opacity"
            | "clip-path"
            | "display"
            | "visibility"
            | "paint-order"
            | "mask"
            | "filter"
            | "mix-blend-mode"
            | "isolation"
            | "shape-rendering"
    )
}
fn validate_path(
    d: &str,
    node: Node<'_, '_>,
    c: &mut Checked,
    options: &ParseOptions,
    segment_count: &mut usize,
) -> Result<usize, VectorError> {
    use svgtypes::PathSegment::*;
    let mut arcs = false;
    let mut local = 0;
    for seg in svgtypes::PathParser::from(d) {
        let seg = seg.map_err(|_| {
            err(
                ErrorCode::InvalidValue,
                "Malformed SVG path; no partial path accepted",
            )
        })?;
        local += 1;
        *segment_count += 1;
        if *segment_count > options.limits.max_source_segments {
            return Err(err(
                ErrorCode::ResourceLimit,
                "Source path segment budget exceeded",
            ));
        }
        let values = match seg {
            MoveTo { x, y, .. } | LineTo { x, y, .. } | SmoothQuadratic { x, y, .. } => vec![x, y],
            HorizontalLineTo { x, .. } => vec![x],
            VerticalLineTo { y, .. } => vec![y],
            CurveTo {
                x1,
                y1,
                x2,
                y2,
                x,
                y,
                ..
            } => vec![x1, y1, x2, y2, x, y],
            SmoothCurveTo { x2, y2, x, y, .. } => vec![x2, y2, x, y],
            Quadratic { x1, y1, x, y, .. } => vec![x1, y1, x, y],
            EllipticalArc {
                rx,
                ry,
                x_axis_rotation,
                x,
                y,
                ..
            } => {
                arcs = true;
                vec![rx, ry, x_axis_rotation, x, y]
            }
            ClosePath { .. } => vec![],
        };
        for v in values {
            numeric(v, options)?;
        }
    }
    c.paths.push(SourcePath {
        source_node: node.id().get() as usize,
        syntax_version: 1,
        svg_d: d.into(),
        has_arcs: arcs,
    });
    Ok(local)
}
fn validate_transform(v: &str, options: &ParseOptions) -> Result<(), VectorError> {
    if v.trim().is_empty() {
        return Err(err(ErrorCode::InvalidValue, "Empty transform"));
    }
    // Parse list tokens too: a composed result must not hide malformed operands or overflow.
    for t in svgtypes::TransformListParser::from(v) {
        use svgtypes::TransformListToken::*;
        let vals = match t.map_err(|_| err(ErrorCode::InvalidValue, "Malformed transform"))? {
            Matrix { a, b, c, d, e, f } => vec![a, b, c, d, e, f],
            Translate { tx, ty } => vec![tx, ty],
            Scale { sx, sy } => vec![sx, sy],
            Rotate { angle } | SkewX { angle } | SkewY { angle } => vec![angle],
        };
        for x in vals {
            numeric(x, options)?;
        }
    }
    let t = svgtypes::Transform::from_str(v)
        .map_err(|_| err(ErrorCode::InvalidValue, "Malformed transform"))?;
    for x in [t.a, t.b, t.c, t.d, t.e, t.f] {
        numeric(x, options)?;
    }
    let det = (t.a as f32) * (t.d as f32) - (t.b as f32) * (t.c as f32);
    if !det.is_finite() || det == 0.0 {
        return Err(err(
            ErrorCode::UnsupportedGeometry,
            "Singular or f32-collapsed transform",
        ));
    }
    Ok(())
}

pub(crate) fn check(svg: &str, options: &ParseOptions) -> Result<Checked, VectorError> {
    if svg.contains("<!DOCTYPE") || svg.contains("<!ENTITY") {
        return Err(err(
            ErrorCode::UnsafeSource,
            "DTD/entity declarations are forbidden",
        ));
    }
    let xml = Document::parse_with_options(
        svg,
        roxmltree::ParsingOptions {
            allow_dtd: false,
            nodes_limit: options.limits.max_xml_nodes,
            ..Default::default()
        },
    )
    .map_err(|e| {
        let code = if matches!(e, roxmltree::Error::NodesLimitReached) {
            ErrorCode::ResourceLimit
        } else {
            ErrorCode::InvalidXml
        };
        err(code, format!("XML parser: {e}"))
    })?;
    let root = xml.root_element();
    if root.tag_name().name() != "svg" || root.tag_name().namespace() != Some(SVG_NS) {
        return Err(err(
            ErrorCode::InvalidXml,
            "Root must be SVG in the SVG namespace",
        ));
    }
    let mut c = Checked {
        normalized_svg: String::new(),
        graph: vec![],
        paths: vec![],
        diagnostics: vec![],
        status: ManufacturingStatus::Contours,
        ids: HashMap::new(),
        active_geometry: vec![],
        has_rounded_shapes: false,
    };

    let mut original_ids = HashSet::new();
    for n in xml.descendants() {
        if n.ancestors().count() > options.limits.max_depth {
            return Err(err(ErrorCode::ResourceLimit, "XML nesting limit exceeded"));
        }
        if n.is_pi() {
            return Err(err(
                ErrorCode::UnsafeSource,
                "XML processing instructions are forbidden",
            ));
        }
        if let Some(id) = n.attribute("id") {
            if id.is_empty()
                || id.chars().any(char::is_whitespace)
                || !original_ids.insert(id.to_string())
            {
                return Err(err(
                    ErrorCode::InvalidReference,
                    "Empty/ambiguous/duplicate source id",
                ));
            }
        }
        c.graph.push(SourceNode {
            index: n.id().get() as usize,
            parent: n.parent().map(|p| p.id().get() as usize),
            kind: match n.node_type() {
                NodeType::Root => "document",
                NodeType::Element => "element",
                NodeType::Text => "text",
                NodeType::Comment => "comment",
                NodeType::PI => "pi",
            }
            .into(),
            name: n.is_element().then(|| n.tag_name().name().into()),
            namespace: n.tag_name().namespace().map(str::to_string),
            attributes: n
                .attributes()
                .map(|a| SourceAttribute {
                    name: a.name().into(),
                    namespace: a.namespace().map(str::to_string),
                    value: a.value().into(),
                })
                .collect(),
            text: if n.is_text() || n.is_comment() {
                n.text().map(str::to_string)
            } else {
                None
            },
            span: span(n),
        });
    }
    let mut insertions = vec![];
    let mut refs = vec![];
    let mut segment_count = 0;
    let mut geometry_count = 0;
    let mut has_stroke = false;
    for n in xml.descendants().filter(Node::is_element) {
        let index = n.id().get() as usize;
        let id = if let Some(id) = n.attribute("id") {
            id.to_string()
        } else {
            let mut id = format!("__arch_source_{index}");
            while original_ids.contains(&id) {
                id.push('_');
            }
            let start = n.range().start + 1;
            let end = svg[start..]
                .find(|ch: char| ch.is_ascii_whitespace() || ch == '/' || ch == '>')
                .map(|end| start + end)
                .ok_or_else(|| err(ErrorCode::InvalidXml, "Missing XML tag delimiter"))?;
            insertions.push((end, format!(" id=\"{id}\"")));
            id
        };

        c.ids.insert(id.clone(), index);
        let tag = n.tag_name().name();
        let result = (|| {
            if n.tag_name().namespace() != Some(SVG_NS) {
                c.block(
                    n,
                    "foreign_namespace",
                    "Non-SVG element retained only in inert source graph",
                    false,
                );
            }
            match tag {
                "script" => return Err(err(ErrorCode::UnsafeSource, "SVG scripts are forbidden")),
                "svg" if n != root => c.block(
                    n,
                    "nested_viewport",
                    "Nested SVG viewport is not audited",
                    false,
                ),
                "svg" | "g" | "defs" | "clipPath" | "path" | "rect" | "circle" | "ellipse"
                | "line" | "polyline" | "polygon" | "title" | "desc" | "metadata" => {}
                "linearGradient" | "radialGradient" | "stop" | "pattern" | "mask" | "filter"
                | "foreignObject" | "image" => c.block(
                    n,
                    "complex_render_element",
                    "Appearance feature requires confirmed conversion; original source retained",
                    true,
                ),
                "style" => {
                    check_css_safety(n.text().unwrap_or(""))?;
                    c.block(n, "stylesheet", "CSS stylesheets are not supported; inline static declarations are supported", false);
                }
                "text" | "tspan" | "textPath" => c.block(
                    n,
                    "text_requires_shaping",
                    "Use the project's validated text shaping/outlining contract",
                    false,
                ),
                "use" | "symbol" => c.block(
                    n,
                    "reuse_graph",
                    "use/symbol expansion is not audited; source references retained",
                    false,
                ),
                _ => c.block(
                    n,
                    "unknown_element",
                    &format!("Unsupported rendering element: {tag}"),
                    false,
                ),
            }
            if let Some(parent) = n.parent_element() {
                if parent.has_tag_name((SVG_NS, "clipPath"))
                    && !matches!(
                        tag,
                        "path"
                            | "rect"
                            | "circle"
                            | "ellipse"
                            | "polygon"
                            | "polyline"
                            | "title"
                            | "desc"
                    )
                {
                    c.block(
                        n,
                        "clip_child",
                        "Only geometric clip children are audited",
                        false,
                    );
                }
            }
            for a in n.attributes() {
                let name = a.name();
                let value = a.value();
                if name.to_ascii_lowercase().starts_with("on") {
                    return Err(err(
                        ErrorCode::UnsafeSource,
                        "Event handler attributes are forbidden",
                    ));
                }
                if name == "href" {
                    if !value.starts_with('#')
                        || value.len() < 2
                        || value.chars().any(char::is_whitespace)
                    {
                        return Err(err(
                            ErrorCode::UnsafeSource,
                            "External, embedded or malformed resource href is forbidden",
                        ));
                    }
                    c.block(
                        n,
                        "href_reference",
                        "href expansion is unsupported; reference retained in source graph",
                        false,
                    );
                    continue;
                }
                if a.namespace() == Some(XML_NS) {
                    if name == "base" {
                        return Err(err(ErrorCode::UnsafeSource, "xml:base is forbidden"));
                    }
                    if matches!(name, "space" | "lang") {
                        continue;
                    }
                }
                if a.namespace().is_some() && a.namespace() != Some(XLINK_NS) {
                    c.block(
                        n,
                        "namespaced_attribute",
                        "Unknown namespaced attribute retained but not interpreted",
                        false,
                    );
                    continue;
                }
                if presentation(name) {
                    if name == "stroke" && value != "none" {
                        has_stroke = true;
                    }
                    validate_property(name, value, n, &mut c, options, &mut refs)?;
                    continue;
                }
                match name {
                    "id" | "class" | "version" | "role" => {}
                    _ if name.starts_with("data-") || name.starts_with("aria-") => {}
                    "style" => {
                        check_css_safety(value)?;
                        for declaration in value.split(';').filter(|p| !p.trim().is_empty()) {
                            let (name, value) = declaration.split_once(':').ok_or_else(|| {
                                err(
                                    ErrorCode::InvalidValue,
                                    "Malformed inline style declaration",
                                )
                            })?;
                            let name = name.trim();
                            if name == "stroke" && value.trim() != "none" {
                                has_stroke = true;
                            }
                            if value.contains('!') {
                                c.block(n, "css_important", "!important is not supported in this conservative inline-style subset", false);
                            } else {
                                validate_property(name, value, n, &mut c, options, &mut refs)?;
                            }
                        }
                    }
                    "transform" => validate_transform(value, options)?,
                    "d" if tag == "path" => {
                        validate_path(value, n, &mut c, options, &mut segment_count)?;
                    }
                    "points" if matches!(tag, "polyline" | "polygon") => {
                        let values = numbers(value, options)?;
                        if values.len() % 2 != 0 {
                            return Err(err(
                                ErrorCode::InvalidValue,
                                "Unpaired polygon coordinate",
                            ));
                        }
                        segment_count += values.len() / 2;
                    }
                    "viewBox" if tag == "svg" => {
                        let values = numbers(value, options)?;
                        if values.len() != 4 || values[2] <= 0.0 || values[3] <= 0.0 {
                            return Err(err(
                                ErrorCode::InvalidValue,
                                "viewBox requires exactly four numbers and positive size",
                            ));
                        }
                    }
                    "preserveAspectRatio" if tag == "svg" => {
                        let mut tokens: Vec<_> = value.split_ascii_whitespace().collect();
                        if tokens.first() == Some(&"defer") {
                            tokens.remove(0);
                        }
                        if tokens.is_empty()
                            || tokens.len() > 2
                            || (tokens.len() == 2 && !matches!(tokens[1], "meet" | "slice"))
                        {
                            return Err(err(
                                ErrorCode::InvalidValue,
                                "Trailing/malformed preserveAspectRatio tokens",
                            ));
                        }
                        svgtypes::AspectRatio::from_str(value).map_err(|_| {
                            err(ErrorCode::InvalidValue, "Invalid preserveAspectRatio")
                        })?;
                    }
                    "clipPathUnits" if tag == "clipPath" => {
                        if !matches!(value, "userSpaceOnUse" | "objectBoundingBox") {
                            return Err(err(ErrorCode::InvalidValue, "Invalid clipPathUnits"));
                        }
                    }
                    "x" | "y" | "width" | "height" | "rx" | "ry" | "r" | "cx" | "cy" | "x1"
                    | "y1" | "x2" | "y2" => {
                        // An attribute on the wrong element must not be accepted as geometry.
                        let applies = match tag {
                            "svg" => matches!(name, "width" | "height"),
                            "rect" => matches!(name, "x" | "y" | "width" | "height" | "rx" | "ry"),
                            "circle" => matches!(name, "cx" | "cy" | "r"),
                            "ellipse" => matches!(name, "cx" | "cy" | "rx" | "ry"),
                            "line" => matches!(name, "x1" | "y1" | "x2" | "y2"),
                            _ => false,
                        };
                        if !applies {
                            c.block(
                                n,
                                "misplaced_geometry_attribute",
                                "Geometry attribute is not audited on this element",
                                false,
                            );
                        }
                        let l = length(value, options)?;
                        if matches!(name, "width" | "height" | "r" | "rx" | "ry") && l.number < 0.0
                        {
                            return Err(err(
                                ErrorCode::InvalidValue,
                                "Negative geometry size/radius",
                            ));
                        }
                        if absolute_mm(l).is_none() {
                            c.block(
                                n,
                                "relative_length",
                                "Percent/em/ex lengths require explicit contextual sizing",
                                false,
                            );
                        }
                        if n == root && matches!(name, "width" | "height") {
                            if let Some(mm) = absolute_mm(l) {
                                if mm <= 0.0 || mm > options.limits.max_coordinate_mm {
                                    return Err(err(
                                        ErrorCode::CoordinateLimit,
                                        "Root viewport is outside the positive mm domain",
                                    ));
                                }
                            }
                        }
                    }
                    _ => {
                        check_css_safety(value)?;
                        c.block(
                            n,
                            "unknown_attribute",
                            &format!("Unsupported attribute: {name}"),
                            false,
                        );
                    }
                }
            }
            if is_shape(tag) {
                geometry_count += 1;
                if geometry_count > options.limits.max_shapes {
                    return Err(err(
                        ErrorCode::ResourceLimit,
                        "Source shape budget exceeded",
                    ));
                }
                if !n
                    .ancestors()
                    .skip(1)
                    .any(|p| matches!(p.tag_name().name(), "defs" | "clipPath"))
                {
                    c.active_geometry.push((id.clone(), index));
                }
                if tag == "path" && n.attribute("d").is_none() {
                    return Err(err(ErrorCode::InvalidValue, "Path lacks d"));
                }
                if matches!(tag, "polygon" | "polyline") && n.attribute("points").is_none() {
                    return Err(err(
                        ErrorCode::InvalidValue,
                        "Polygon/polyline lacks points",
                    ));
                }
                if tag == "rect"
                    && (n.attribute("width").is_none() || n.attribute("height").is_none())
                {
                    return Err(err(
                        ErrorCode::InvalidValue,
                        "Rectangle requires width and height",
                    ));
                }
                if tag == "circle" && n.attribute("r").is_none() {
                    return Err(err(ErrorCode::InvalidValue, "Circle requires radius"));
                }
                if tag == "ellipse" && (n.attribute("rx").is_none() || n.attribute("ry").is_none())
                {
                    return Err(err(ErrorCode::InvalidValue, "Ellipse requires both radii"));
                }
                if matches!(tag, "circle" | "ellipse")
                    || (tag == "rect" && (n.has_attribute("rx") || n.has_attribute("ry")))
                {
                    c.has_rounded_shapes = true;
                }
            }
            Ok(())
        })();
        result.map_err(|mut e: VectorError| {
            e.source_span = Some(span(n));
            e
        })?;
    }
    if segment_count > options.limits.max_source_segments {
        return Err(err(
            ErrorCode::ResourceLimit,
            "Source segment budget exceeded",
        ));
    }
    if has_stroke && segment_count > options.limits.max_stroke_input_segments {
        return Err(err(
            ErrorCode::ResourceLimit,
            "Conservative input budget for dependency stroking exceeded",
        ));
    }
    if !root.has_attribute("viewBox")
        && (!root.has_attribute("width") || !root.has_attribute("height"))
    {
        c.block(
            root,
            "unresolved_viewport",
            "Declare absolute width/height or a viewBox; no ambient viewport is guessed",
            false,
        );
    }
    // Validate clip references and expansion/cycle limits before invoking usvg.
    let mut clip_edges: HashMap<usize, Vec<usize>> = HashMap::new();
    let mut required_clips = HashSet::new();
    let mut clip_targets = vec![];
    for (from, id) in refs {
        let &target = c
            .ids
            .get(&id)
            .ok_or_else(|| err(ErrorCode::InvalidReference, "Missing clip target"))?;
        let target_node = xml
            .get_node(roxmltree::NodeId::new(target as u32))
            .ok_or_else(|| err(ErrorCode::InvalidReference, "Missing clip XML node"))?;
        if !target_node.has_tag_name((SVG_NS, "clipPath")) {
            return Err(err(
                ErrorCode::InvalidReference,
                "clip-path must reference a clipPath",
            ));
        }
        required_clips.insert(target);
        clip_targets.push(target);
        let from_node = xml.get_node(roxmltree::NodeId::new(from as u32)).unwrap();
        if let Some(owner) = from_node
            .ancestors()
            .find(|a| a.has_tag_name((SVG_NS, "clipPath")))
        {
            clip_edges
                .entry(owner.id().get() as usize)
                .or_default()
                .push(target);
        }
    }
    fn visit(
        id: usize,
        edges: &HashMap<usize, Vec<usize>>,
        active: &mut HashSet<usize>,
        memo: &mut HashMap<usize, (usize, usize)>,
        depth: usize,
        options: &ParseOptions,
    ) -> Result<(usize, usize), VectorError> {
        let limits = &options.limits;
        if active.contains(&id) {
            return Err(err(ErrorCode::InvalidReference, "Cyclic clip reference"));
        }
        if depth > limits.max_depth {
            return Err(err(
                ErrorCode::ResourceLimit,
                "Clip reference nesting limit exceeded",
            ));
        }
        if let Some(&(height, cost)) = memo.get(&id) {
            if depth + height > limits.max_depth {
                return Err(err(
                    ErrorCode::ResourceLimit,
                    "Clip reference nesting limit exceeded",
                ));
            }
            return Ok((height, cost));
        }
        active.insert(id);
        let mut height = 0;
        let mut cost = 1usize;
        if let Some(next) = edges.get(&id) {
            for &v in next {
                let (child_height, child_cost) = visit(v, edges, active, memo, depth + 1, options)?;
                height = height.max(child_height + 1);
                cost = cost.saturating_add(child_cost);
                if cost > limits.max_clip_instances {
                    return Err(err(
                        ErrorCode::ResourceLimit,
                        "Clip expansion budget exceeded before usvg",
                    ));
                }
            }
        }
        if depth + height > limits.max_depth {
            return Err(err(
                ErrorCode::ResourceLimit,
                "Clip reference nesting limit exceeded",
            ));
        }
        active.remove(&id);
        memo.insert(id, (height, cost));
        Ok((height, cost))
    }
    let mut memo = HashMap::new();
    let mut expansion = 0usize;
    for target in clip_targets {
        let (_, cost) = visit(
            target,
            &clip_edges,
            &mut HashSet::new(),
            &mut memo,
            0,
            options,
        )?;
        expansion = expansion.saturating_add(cost);
        if expansion > options.limits.max_clip_instances {
            return Err(err(
                ErrorCode::ResourceLimit,
                "Aggregate clip expansion budget exceeded before usvg",
            ));
        }
    }
    // All referenced clip geometry must survive conversion too. A partially dropped
    // clip can enlarge manufacturing regions just as badly as ignoring an entire clip.
    for n in xml
        .descendants()
        .filter(Node::is_element)
        .filter(|n| is_shape(n.tag_name().name()))
    {
        if n.ancestors()
            .skip(1)
            .any(|a| required_clips.contains(&(a.id().get() as usize)))
        {
            let index = n.id().get() as usize;
            if let Some((id, _)) = c.ids.iter().find(|(_, i)| **i == index) {
                c.active_geometry.push((id.clone(), index));
            }
        }
    }
    let mut end = 0;
    for (at, insertion) in insertions {
        c.normalized_svg.push_str(&svg[end..at]);
        c.normalized_svg.push_str(&insertion);
        end = at;
    }
    c.normalized_svg.push_str(&svg[end..]);
    Ok(c)
}
