"""Audit referenced bytes, JSON literals and 3MF structure without executing them.

Run after tools/project-env.ps1. This is a source audit, not a mesh/slicer oracle.
Only Python's standard library is used; ZIP contents stay in memory.
"""
from collections import Counter
from decimal import Decimal
from hashlib import sha256
from pathlib import Path, PurePosixPath
import json
import math
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


def confined(path, root):
    resolved = path.resolve()
    if not resolved.is_relative_to(root):
        raise ValueError(f"Path escapes project: {path}")
    return resolved


def parse_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result
    def invalid(value):
        raise ValueError(f"Non-finite JSON value: {value}")
    def number(value):
        parsed = float(value)
        if not math.isfinite(parsed):
            invalid(value)
        return parsed
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid, parse_float=number)


def xml(raw):
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError("DTD/entities not supported by this audit")
    return ET.fromstring(raw)


def local_tag(node):
    return node.tag.rsplit('}', 1)[-1]


def audit_parameters(value):
    fields = value['fields']
    by_id = {field['id']: field for field in fields}
    if len(by_id) != len(fields):
        raise ValueError('Duplicate parameter ID')
    def valid(field, v):
        domain, kind = field['mien'], field['kieu']
        if kind == 'r' and type(v) in (int, float):
            step = Decimal(str(field['buoc']))
            return domain[0] <= v <= domain[1] and step > 0 and (Decimal(str(v)) - Decimal(str(domain[0]))) % step == 0
        if kind == 'c':
            return type(v) is bool
        return kind == 's' and v in domain
    defaults = [f['id'] for f in fields if not valid(f, f['macDinh'])]
    modes = value['modeDefaults']
    if sorted(m['mode'] for m in modes) != sorted(value['productIds']):
        raise ValueError('Missing or duplicate product mode defaults')
    preset_issues = [f"{m['mode']}/{key}" for m in modes for key, v in m['preset'].items()
                     if key not in by_id or not valid(by_id[key], v)]
    if defaults or preset_issues:
        raise ValueError('Invalid catalog defaults: ' + ', '.join(defaults + preset_issues))
    return {'count': len(fields), 'types': dict(Counter(f['kieu'] for f in fields)),
            'groups': dict(Counter(f['nhom'] for f in fields)),
            'defaultTypeDomainStepIssues': defaults, 'modeDefaultIssues': preset_issues,
            'modeCount': len(modes), 'geometrySemantics': 'unverified'}


def audit_package(path):
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        names = [e.filename for e in entries]
        expanded = sum(e.file_size for e in entries)
        if len(entries) > 10000 or expanded > 512 * 1024**2 or any(e.file_size > 128 * 1024**2 for e in entries):
            raise ValueError("ZIP audit size limit exceeded")
        if len(set(names)) != len(names):
            raise ValueError("Duplicate ZIP entry")
        for name in names:
            if name.startswith(('/', '\\')) or ':' in name or '\\' in name or '..' in PurePosixPath(name).parts:
                raise ValueError("Unsafe ZIP entry path")
        result = {'expandedBytes': expanded, 'entryCount': len(entries),
                  'crcBadEntry': archive.testzip(), 'models': [], 'metadataExtruders': {}}
        if result['crcBadEntry'] is not None:
            raise ValueError('ZIP CRC mismatch')
        for name in names:
            if name.endswith('.model'):
                raw = archive.read(name)
                model = xml(raw)
                objects = []
                for obj in model.iter():
                    if local_tag(obj) != 'object':
                        continue
                    vertices, triangles = [], []
                    for node in obj.iter():
                        if local_tag(node) == 'vertex':
                            vertices.append(tuple(float(node.get(k)) for k in ('x', 'y', 'z')))
                        elif local_tag(node) == 'triangle':
                            triangles.append(tuple(int(node.get(k)) for k in ('v1', 'v2', 'v3')))
                    if not vertices:
                        continue
                    if not all(math.isfinite(v) for point in vertices for v in point):
                        raise ValueError('Non-finite model coordinate')
                    edges = Counter(tuple(sorted(pair)) for a, b, c in triangles for pair in ((a, b), (b, c), (c, a)))
                    objects.append({'id': obj.get('id'), 'vertices': len(vertices), 'triangles': len(triangles),
                                    'invalidIndices': sum(any(i < 0 or i >= len(vertices) for i in tri) for tri in triangles),
                                    'indexedEdgeIncidenceNotTwo': sum(n != 2 for n in edges.values()),
                                    'bounds': [[min(v[i] for v in vertices), max(v[i] for v in vertices)] for i in range(3)]})
                result['models'].append({'path': name, 'sha256': sha256(raw).hexdigest(),
                                         'unit': model.get('unit', 'millimeter'), 'objects': objects})
            elif name == 'Metadata/project_settings.config':
                config = parse_json(archive.read(name))
                result['projectSettings'] = {key: config.get(key) for key in
                    ('version', 'printer_model', 'nozzle_diameter', 'filament_colour',
                     'layer_height', 'initial_layer_print_height')}
            elif name in ('Metadata/model_settings.config', 'Metadata/Slic3r_PE_model.config'):
                metadata = xml(archive.read(name))
                result['metadataExtruders'][name] = [n.get('value') for n in metadata.iter()
                    if local_tag(n) == 'metadata' and n.get('key') == 'extruder']
        refs = sorted({int(v) for values in result['metadataExtruders'].values()
                       for v in values if v is not None and v.isdigit() and int(v) > 0})
        filaments = result.get('projectSettings', {}).get('filament_colour')
        if isinstance(filaments, list):
            result['slotReferenceAudit'] = {
                'positiveExtruderReferences': refs, 'configuredFilaments': len(filaments),
                'referencesWithoutFilament': [v for v in refs if v > len(filaments)],
                'method': 'Positive one-based extruder IDs against the included filament_colour table; no nozzle-count inference',
                'targetSlicerCompatibility': 'unverified'}
        result['meshOracle'] = 'unverified: index/edge checks do not prove manifold vertices, intersections or fit'
        result['slicerRoundtrip'] = 'unverified'
        return result


def main():
    root = Path(__file__).resolve().parents[2]
    if Path(os.environ.get('PROJECT_ROOT', '')).resolve() != root or not os.environ.get('PROJECT_REVIEW_RUN'):
        raise ValueError('Dot-source tools/project-env.ps1 with your seat/run first')
    run = confined(Path(os.environ['PROJECT_REVIEW_RUN']), root)
    output = confined(run / 'evidence/source-audit-rechecked.json', root)
    manifest = parse_json((root / 'docs/specs/source-manifest.json').read_bytes())
    report = {'schemaVersion': 2, 'method': 'Hash/JSON/ZIP/XML/index checks; no JS or G-code execution; no extraction',
              'scope': 'Mandatory permanent inputs named by source-manifest.json; structural audit, not product certification', 'files': []}
    if not manifest['files'] or len({f['id'] for f in manifest['files']}) != len(manifest['files']):
        raise ValueError('Empty manifest or duplicate input ID')
    for expected in manifest['files']:
        item = {'id': expected['id'], 'path': expected['path']}
        try:
            relative = PurePosixPath(expected['path'])
            if relative.is_absolute() or relative.parts[0] not in ('docs', 'tests', 'src', 'tools') or '..' in relative.parts or '\\' in expected['path']:
                raise ValueError('Input must use a permanent repository path')
            lexical = root / expected['path']
            path = confined(lexical, root)
            if path != lexical:
                raise ValueError('Input must not traverse a symlink or junction')
            raw = path.read_bytes()
            item.update(bytes=len(raw), sha256=sha256(raw).hexdigest())
            if item['sha256'] != expected['sha256'] or item['bytes'] != expected['bytes']:
                raise ValueError('Source bytes differ from the reviewed manifest')
            if path.suffix == '.json':
                value = parse_json(raw)
                item['jsonType'] = type(value).__name__
                if isinstance(value, dict) and isinstance(value.get('may'), list):
                    item['bedRecords'] = len(value['may'])
                    item['claimedSource'] = value.get('nguon')
                if expected['kind'] == 'parameter-catalog':
                    item['parameters'] = audit_parameters(value)
            elif path.suffix == '.js':
                match = re.search(r'(?:const|let|var)\s+(\w+)\s*=\s*(\{.*\})\s*;?\s*$', raw.decode('utf-8-sig'), re.S)
                if not match:
                    raise ValueError('Expected one JSON object declaration')
                config = parse_json(match.group(2))
                item.update(variable=match.group(1), keyCount=len(config),
                            arrayLengths=dict(Counter(len(v) for v in config.values() if isinstance(v, list))))
                item['profileSummary'] = {key: config.get(key) for key in
                    ('version', 'printer_model', 'nozzle_diameter', 'filament_colour',
                     'layer_height', 'initial_layer_print_height', 'print_settings_id')}
            elif path.suffix == '.3mf':
                item['package'] = audit_package(path)
                if expected['id'] == 'u1-project-invalid-slots-v1':
                    observed = item['package'].get('slotReferenceAudit', {})
                    if observed.get('referencesWithoutFilament') != [5, 6]:
                        raise ValueError('Negative fixture no longer exhibits the documented missing slots 5/6')
                    item['expectedNegativeObservation'] = 'confirmed; invalid slot mapping is not a valid slicer golden'
            item['auditStatus'] = 'pass'
        except FileNotFoundError:
            item.update(auditStatus='fail', reason='Mandatory packaged input unavailable')
        except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile, ET.ParseError) as error:
            item.update(auditStatus='fail', reason=str(error))
        report['files'].append(item)
    statuses = Counter(item['auditStatus'] for item in report['files'])
    report['summary'] = dict(statuses)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'summary': report['summary'], 'output': output.relative_to(root).as_posix()}))
    return 1 if statuses['fail'] else 0


if __name__ == '__main__':
    sys.exit(main())
