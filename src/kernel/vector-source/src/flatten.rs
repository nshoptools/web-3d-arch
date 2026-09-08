use crate::*;

pub(crate) struct Budget<'a> {
    pub options: &'a ParseOptions,
    pub vertices: usize,
    pub segments: usize,
    pub max_flatness: f64,
}
impl<'a> Budget<'a> {
    pub fn new(options: &'a ParseOptions) -> Self {
        Self {
            options,
            vertices: 0,
            segments: 0,
            max_flatness: 0.0,
        }
    }
    pub fn point(&self, p: Point) -> Result<Point, VectorError> {
        if p.iter()
            .any(|v| !v.is_finite() || v.abs() > self.options.limits.max_coordinate_mm)
        {
            return Err(VectorError::new(
                ErrorCode::CoordinateLimit,
                "Resolved/control coordinate exceeds finite mm domain",
            ));
        }
        Ok(p)
    }
    fn push(&mut self, contour: &mut Contour, p: Point) -> Result<(), VectorError> {
        self.point(p)?;
        if contour.last() == Some(&p) {
            return Ok(());
        }
        if self.vertices >= self.options.limits.max_vertices {
            return Err(VectorError::new(
                ErrorCode::ResourceLimit,
                "Global vertex budget exceeded",
            ));
        }
        self.vertices += 1;
        contour.push(p);
        Ok(())
    }
    pub fn count_segments(&mut self, count: usize) -> Result<(), VectorError> {
        self.segments = self
            .segments
            .checked_add(count)
            .ok_or_else(|| VectorError::new(ErrorCode::ResourceLimit, "Segment count overflow"))?;
        if self.segments > self.options.limits.max_resolved_segments {
            return Err(VectorError::new(
                ErrorCode::ResourceLimit,
                "Resolved segment budget exceeded",
            ));
        }
        Ok(())
    }
}

/// Distance to the FINITE segment, including collinear overshoot and zero-length chords.
fn distance(p: Point, a: Point, b: Point) -> f64 {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    let len2 = dx * dx + dy * dy;
    if len2 == 0.0 {
        return (p[0] - a[0]).hypot(p[1] - a[1]);
    }
    let t = (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2).clamp(0.0, 1.0);
    (p[0] - (a[0] + t * dx)).hypot(p[1] - (a[1] + t * dy))
}
fn mid(a: Point, b: Point) -> Point {
    [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5]
}

fn bezier(
    points: &[Point],
    depth: u32,
    out: &mut Contour,
    b: &mut Budget<'_>,
) -> Result<(), VectorError> {
    let last = points[points.len() - 1];
    let flat = points[1..points.len() - 1]
        .iter()
        .map(|&p| distance(p, points[0], last))
        .fold(0.0, f64::max);
    if flat <= b.options.flatten_tolerance_mm {
        b.max_flatness = b.max_flatness.max(flat);
        return b.push(out, last);
    }
    if depth >= b.options.limits.max_recursion {
        return Err(VectorError::new(
            ErrorCode::FlattenLimit,
            "Subdivision limit reached before requested mm tolerance",
        ));
    }
    if points.len() == 3 {
        let a = mid(points[0], points[1]);
        let c = mid(points[1], points[2]);
        let m = mid(a, c);
        bezier(&[points[0], a, m], depth + 1, out, b)?;
        bezier(&[m, c, points[2]], depth + 1, out, b)
    } else {
        let a = mid(points[0], points[1]);
        let c = mid(points[1], points[2]);
        let d = mid(points[2], points[3]);
        let e = mid(a, c);
        let f = mid(c, d);
        let m = mid(e, f);
        bezier(&[points[0], a, e, m], depth + 1, out, b)?;
        bezier(&[m, f, d, points[3]], depth + 1, out, b)
    }
}
fn finish(
    current: &mut Contour,
    contours: &mut Vec<Contour>,
    b: &mut Budget<'_>,
) -> Result<(), VectorError> {
    if current.is_empty() {
        return Ok(());
    }
    if current.len() > 1 {
        b.push(current, current[0])?;
    }
    // Preserve degenerate and zero signed-area/self-intersecting contours too.
    // The downstream boolean kernel owns topology decisions; never discard accents by area.
    contours.push(std::mem::take(current));
    Ok(())
}

pub(crate) fn contours(
    commands: &[CurveCommand],
    b: &mut Budget<'_>,
) -> Result<Vec<Contour>, VectorError> {
    let mut contours = vec![];
    let mut current = vec![];
    let mut cursor = [0.0, 0.0];
    let mut start = cursor;
    for cmd in commands {
        match *cmd {
            CurveCommand::M { to } => {
                finish(&mut current, &mut contours, b)?;
                b.push(&mut current, to)?;
                cursor = to;
                start = to;
            }
            CurveCommand::L { to } => {
                b.push(&mut current, to)?;
                cursor = to;
            }
            CurveCommand::Q { control, to } => {
                b.point(control)?;
                b.point(to)?;
                bezier(&[cursor, control, to], 0, &mut current, b)?;
                cursor = to;
            }
            CurveCommand::C {
                control1,
                control2,
                to,
            } => {
                b.point(control1)?;
                b.point(control2)?;
                b.point(to)?;
                bezier(&[cursor, control1, control2, to], 0, &mut current, b)?;
                cursor = to;
            }
            CurveCommand::Z => {
                finish(&mut current, &mut contours, b)?;
                cursor = start;
            }
        }
    }
    finish(&mut current, &mut contours, b)?;
    Ok(contours)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finite_segment_distance_catches_collinear_overshoot() {
        assert_eq!(distance([3.0, 0.0], [0.0, 0.0], [1.0, 0.0]), 2.0);
        assert_eq!(distance([3.0, 4.0], [0.0, 0.0], [0.0, 0.0]), 5.0);
    }
}
