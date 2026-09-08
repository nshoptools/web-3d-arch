import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const specs = path.join(root, 'docs/specs');
const json = async p => JSON.parse((await readFile(path.join(root, p), 'utf8')).replace(/^\uFEFF/, ''));
const sha = b => createHash('sha256').update(b).digest('hex');
const reqs = (await json('docs/specs/requirements.json')).requirements;
const cases = (await json('tests/acceptance/cases.json')).cases;
const trace = (await json('docs/specs/traceability.json')).entries;
const manifest = (await json('docs/specs/source-manifest.json')).files;
const specFiles = (await readdir(specs)).filter(p => p.endsWith('.md'));
const texts = await Promise.all(specFiles.map(async name => ({ name, text: await readFile(path.join(specs, name), 'utf8') })));
const reviewDir = 'docs/reviews/20260907-specification';
const permanentPrefixes = ['docs/', 'tests/', 'tools/', 'src/'];
const isWithin = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
const durablePath = async relative => {
  assert.ok(permanentPrefixes.some(p => relative.startsWith(p)), `Not a permanent input: ${relative}`);
  const target = path.resolve(root, relative);
  assert.ok(isWithin(root, target), `Path escapes repository: ${relative}`);
  const resolved = await realpath(target);
  assert.equal(resolved.toLowerCase(), target.toLowerCase(), `Input follows a symlink or junction: ${relative}`);
  return resolved;
};
async function filesIn(relative) {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const lists = await Promise.all(entries.map(e => {
    assert.ok(!e.isSymbolicLink(), `Unexpected link: ${relative}/${e.name}`);
    return e.isDirectory() ? filesIn(`${relative}/${e.name}`) : [`${relative}/${e.name}`];
  }));
  return lists.flat();
}

test('Every declared requirement has a unique clause and a substantive planned acceptance case', () => {
  const clauses = texts.flatMap(({ name, text }) => [...text.matchAll(/^### ([A-Z]+-\d+) — (.+)$/gm)].map(m => ({ id: m[1], document: `docs/specs/${name}`, title: m[2] })));
  assert.equal(new Set(clauses.map(c => c.id)).size, clauses.length, 'Duplicate clause ID');
  assert.equal(new Set(reqs.map(c => c.id)).size, reqs.length, 'Duplicate matrix ID');
  assert.deepEqual(reqs.map(q => q.id).sort(), clauses.map(q => q.id).sort());
  const byCase = new Map(cases.map(c => [c.id, c]));
  const checks = cases.flatMap(c => c.checks);
  const byCheck = new Map(checks.map(c => [c.id, c]));
  assert.equal(byCase.size, cases.length);
  assert.equal(byCheck.size, checks.length, 'Duplicate check ID');
  for (const q of reqs) {
    const clause = clauses.find(c => c.id === q.id);
    assert.equal(q.document, clause.document);
    assert.equal(q.title, clause.title);
    assert.ok(q.testCases.length, `${q.id}: no acceptance`);
    for (const id of q.testCases) assert.ok(byCase.get(id)?.requirements.includes(q.id), `${q.id}: bad reverse case edge ${id}`);
    assert.ok(q.testChecks.length, `${q.id}: no individual check`);
    for (const id of q.testChecks) assert.ok(byCheck.get(id)?.requirements.includes(q.id), `${q.id}: bad reverse check edge ${id}`);
  }
  for (const c of cases) {
    assert.ok(c.prerequisites.length > 15 && c.steps.length && c.checks.length, `${c.id}: not a usable campaign`);
    for (const id of c.requirements) assert.ok(reqs.some(q => q.id === id && q.testCases.includes(c.id)), `${c.id}: unknown requirement ${id}`);
    assert.equal(c.status, 'unverified', 'Planned product cases cannot claim execution by this document test');
    assert.deepEqual(c.evidence, []);
    for (const check of c.checks) {
      assert.ok(check.id.startsWith(c.id + '.') && check.action.length > 20 && check.expected.length > 20);
      for (const field of ['tool', 'method', 'threshold', 'independence']) assert.ok(check.oracle[field].length > 20, `${check.id}: missing oracle ${field}`);
      assert.equal(check.oracle.readiness, 'unverified');
      assert.equal(check.status, 'unverified');
      assert.deepEqual(check.evidence, []);
      for (const id of check.requirements) assert.ok(reqs.some(q => q.id === id && q.testChecks.includes(check.id)), `${check.id}: unknown check mapping ${id}`);
    }
  }
  assert.equal(new Set(checks.map(c => c.oracle.method)).size, checks.length, 'Copied generic oracle methods');
});

test('Analytic geometry expectations and known bad sample qualifications remain explicit', async () => {
  const geometry = cases.find(c => c.id === 'AT-020');
  for (const f of geometry.fixtures) assert.equal(sha(await readFile(path.join(root, f.path))), f.sha256);
  assert.equal(geometry.fixtures.find(f => f.path.endsWith('rectangle-hole.svg')).expected.area_mm2, 184);
  assert.equal(geometry.fixtures.find(f => f.path.endsWith('shared-seam.svg')).expected.shared_seam_mm, 10);
  const qualification = await json('docs/reviews/20260907-specification/sample-qualification.json');
  const u1 = qualification.samples.find(s => s.id === 'u1-project-invalid-slots-v1');
  assert.equal(u1.sha256, manifest.find(f => f.id === u1.id).sha256);
  assert.equal(u1.path, manifest.find(f => f.id === u1.id).path);
  assert.equal(u1.slotMapping, 'invalid');
  assert.ok(u1.forbiddenUses.includes('golden-u1'));
  assert.ok(cases.find(c => c.id === 'AT-013').inputPolicy.forbiddenGoldenSha256.includes(u1.sha256));
  assert.equal(qualification.approvedSlicerGoldens.length, 0, 'No clean slicer golden has been verified in this specification effort');
});

test('Every current requirement traces to existing decisions and the same individual acceptance checks', () => {
  const decisions = new Set([...texts.find(t => t.name === '05-quyet-dinh-va-truy-vet.md').text.matchAll(/^\| (D-\d+) \|/gm)].map(m => m[1]));
  assert.equal(new Set(trace.map(t => t.requirementId)).size, trace.length);
  assert.deepEqual(trace.map(t => t.requirementId).sort(), reqs.map(q => q.id).sort());
  for (const t of trace) {
    const q = reqs.find(q => q.id === t.requirementId);
    assert.equal(t.document, q.document);
    assert.equal(t.title, q.title);
    assert.deepEqual([...t.testChecks].sort(), [...q.testChecks].sort(), q.id);
    assert.ok(t.decisionIds.length > 0, `${q.id}: missing decision`);
    for (const d of t.decisionIds) assert.ok(decisions.has(d), `${q.id}: unknown decision ${d}`);
  }
  assert.deepEqual([...new Set(trace.flatMap(t => t.decisionIds))].sort(), [...decisions].sort(), 'Decision omitted from traceability');
});

test('Local links in the official package and fixture guides resolve to permanent repository files', async () => {
  const files = ['tests/README.md', ...(await filesIn('docs/specs')), ...(await filesIn(reviewDir)), ...(await filesIn('tests/fixtures'))].filter(f => f.endsWith('.md'));
  for (const f of files) {
    const text = await readFile(path.join(root, f), 'utf8');
    for (const m of text.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(m[1])) continue;
      const target = path.resolve(root, path.dirname(f), decodeURIComponent(m[1].split('#')[0]));
      const relative = path.relative(root, target).split(path.sep).join('/');
      assert.ok(isWithin(root, target), `Link escapes repo: ${f}: ${m[1]}`);
      assert.ok(!/^(tmp|report|\.toolchain)\//i.test(relative), `Non-durable link: ${f}: ${m[1]}`);
      const resolved = await realpath(target);
      assert.equal(resolved.toLowerCase(), target.toLowerCase(), `Link traverses a junction: ${f}: ${m[1]}`);
      const info = await stat(resolved);
      assert.ok(info.isFile() || info.isDirectory(), `${f}: missing ${m[1]}`);
    }
  }
});

test('Every packaged input is mandatory, durable, and matches its byte manifest', async () => {
  assert.ok(manifest.length > 0);
  assert.equal(new Set(manifest.map(f => f.id)).size, manifest.length);
  assert.equal(new Set(manifest.map(f => f.path)).size, manifest.length);
  for (const f of manifest) {
    const bytes = await readFile(await durablePath(f.path));
    assert.equal(bytes.length, f.bytes, `${f.id}: size changed`);
    assert.equal(sha(bytes), f.sha256, `${f.id}: hash changed`);
  }
  const fixture = await json('tests/fixtures/printing-reference/v1/manifest.json');
  for (const f of fixture.files) {
    const entry = manifest.find(m => m.id === f.id);
    assert.ok(entry, `Unlisted printing fixture ${f.id}`);
    assert.equal(entry.path, `tests/fixtures/printing-reference/v1/${f.path}`);
    assert.equal(entry.sha256, f.sha256);
    assert.equal(entry.bytes, f.bytes);
  }
});

test('Published specifications and review evidence have no dependency on ephemeral authoring inputs', async () => {
  const files = [...await filesIn('docs/specs'), ...await filesIn(reviewDir), ...await filesIn('tests/fixtures'), 'tests/acceptance/cases.json'];
  const forbidden = /(?:docs[\\/]ideas|tmp[\\/](?:data|ideas))(?:[\\/\s`"')]|$)|(?:cau-hinh-mau|3mf-mau)[\\/]|mac-dinh-tung-loai\.json/i;
  for (const f of files.filter(f => /\.(md|json|js|tap)$/.test(f))) {
    const text = (await readFile(path.join(root, f), 'utf8')).replace(/%2f/ig, '/').replace(/%5c/ig, '\\');
    assert.ok(!forbidden.test(text), `${f}: ephemeral input reference`);
  }
});

test('The complete parameter catalog and its included mode defaults are internally consistent', async () => {
  const p = await json('docs/specs/parameters-reference.json');
  assert.equal(p.status, 'audited-catalog-pending-semantic-validation');
  assert.equal(p.catalogId, 'parameters-core-v1');
  assert.equal(p.fields.length, 126);
  assert.equal(new Set(p.fields.map(f => f.id)).size, p.fields.length);
  const count = kind => p.fields.filter(f => f.kieu === kind).length;
  assert.deepEqual([count('r'), count('c'), count('s')], [94, 22, 10]);
  assert.equal(manifest.find(f => f.id === p.catalogId).path, 'docs/specs/parameters-reference.json');
  assert.ok(p.fieldSchema && p.productIds && p.audit.scope);
  for (const f of p.fields) {
    if (f.kieu === 'c') assert.equal(typeof f.macDinh, 'boolean');
    if (f.kieu === 's') assert.ok(f.mien.includes(f.macDinh), f.id);
    if (f.kieu === 'r') {
      assert.ok(Number.isFinite(f.macDinh) && f.macDinh >= f.mien[0] && f.macDinh <= f.mien[1] && f.buoc > 0, f.id);
      const steps = (f.macDinh - f.mien[0]) / f.buoc;
      assert.ok(Math.abs(steps - Math.round(steps)) < 1e-8, `${f.id}: off-step`);
    }
  }
  assert.deepEqual(p.modeDefaults.map(m => m.mode).sort(), Object.keys(p.productIds).sort());
  for (const mode of p.modeDefaults) for (const [id, v] of Object.entries(mode.preset)) {
    const f = p.fields.find(f => f.id === id);
    assert.ok(f, `${mode.mode}: unknown preset field ${id}`);
    if (f.kieu === 'c') assert.equal(typeof v, 'boolean', id);
    if (f.kieu === 's') assert.ok(f.mien.includes(v), id);
    if (f.kieu === 'r') {
      assert.ok(Number.isFinite(v) && v >= f.mien[0] && v <= f.mien[1], id);
      const steps = (v - f.mien[0]) / f.buoc;
      assert.ok(Math.abs(steps - Math.round(steps)) < 1e-8, `${mode.mode}/${id}: off-step`);
    }
  }
  assert.ok(p.requiredCorrections.impVox && p.requiredCorrections.strapSeg && p.implementationGate.includes('O-02'));
});

test('Permanent slicer fixtures preserve source bytes and parse as JSON without running code', async () => {
  const fixture = await json('tests/fixtures/slicer-profiles/v1/manifest.json');
  const files = fixture.files ?? fixture.fixtures;
  assert.ok(Array.isArray(files) && files.length === 2, 'Fixture manifest must identify both profile files');
  for (const f of files) {
    const bytes = await readFile(path.join(root, 'tests/fixtures/slicer-profiles/v1', f.path));
    assert.equal(sha(bytes), f.sha256);
    const match = bytes.toString('utf8').match(/(?:const|let|var)\s+(\w+)\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    assert.ok(match, 'Expected a single JSON literal declaration');
    const profile = JSON.parse(match[2]);
    assert.equal(Object.keys(profile).length, f.keyCount);
    assert.equal(f.verification.slicerRoundtrip, 'unverified');
    assert.equal(f.verification.physicalPrint, 'unverified');
  }
});
