"""Public prepared-source ABI regression; synthetic inputs, no app reachability claim.

Default expectations reject unsafe geometry. --expect baseline preserves the
known-negative witness on an explicitly selected pre-fix binary; it is not a
manufacturing success result. All output is under PROJECT_REVIEW_RUN.
"""
import argparse, hashlib, importlib.util, json, os, pathlib, re, subprocess, time
from fractions import Fraction as F

HERE = pathlib.Path(__file__).resolve().parent
RUN = pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve()
ROOT = pathlib.Path(os.environ['PROJECT_ROOT']).resolve()
assert RUN.is_relative_to(ROOT) and RUN != ROOT
p = argparse.ArgumentParser()
p.add_argument('target', choices=['native', 'wasm'])
p.add_argument('--expect', choices=['baseline', 'fixed'], default='fixed')
p.add_argument('--tag', required=True)
p.add_argument('--binary', required=True)
args = p.parse_args()
assert re.fullmatch(r'[A-Za-z0-9-]{1,80}', args.tag)
out = RUN / ('evidence/guard-' + args.tag + '-' + args.target)
out.mkdir(parents=True, exist_ok=False)
binary = pathlib.Path(args.binary).resolve()
assert binary.is_relative_to(RUN), 'Use a copied or own-built binary in this run'
spec = importlib.util.spec_from_file_location('guard_mesh_audit', HERE/'mesh-audit.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
cases = {
 'roof-oblique-slit-2nm': 'f6530a24b75cc18c8fafccd9a41346786227eb93a7b3c74d52027d7f0d0fbeaa',
 'roof-oblique-slit-4nm': '2ba098f4b47fe0964edc031aa47e9cb03d02812af2eb8c4b0822bd4208481c03',
 'roof-oblique-slit-8nm': '75b84c5f3054560de12e98351966975d913687b662659e60073e44780b9ec99f',
 'roof-oblique-slit-40nm': '254d3edd21bd1473d6efe4968f29eb23c02d7b3d41d9a9d61cfa35eda20df0a8',
 'lego-roof-oblique-slit-2nm': 'b86eb3113088dd908216776f8bf628302fb79f806bd3bf6b157a99c71cecdbf5',
 'lego-roof-oblique-slit-8nm': '1213c42096ec3669b7671ede19fcec60bd3da29ff3e14f699a1708cc3a24085a',
 'strap-notch-1': 'dab1b2ea3650d6f2dec74b02d95a72d7afd084ae098019e44c61142bc852ad5e',
}
baseline_refusals = {'roof-oblique-slit-8nm', 'roof-oblique-slit-40nm', 'lego-roof-oblique-slit-8nm'}
result = {'version': 'arch-curved-guard-regression/1', 'target': args.target,
          'expectation': args.expect, 'binarySha256': sha(binary),
          'wasmSha256': sha(binary.with_suffix('.wasm')) if args.target == 'wasm' else None,
          'scope': 'Actual public prepared-source child ABI; no root/app producer reachability claim.', 'cases': []}
for name, digest in cases.items():
    request = HERE/'fixtures'/(name+'.txt')
    assert sha(request) == digest, name+' original fixture hash'
    command = ([str(binary)] if args.target == 'native' else ['node', str(binary)]) + [str(request), str(out/name)]
    start = time.monotonic()
    executed = subprocess.run(command, cwd=RUN, capture_output=True, timeout=100)
    (out/(name+'.log')).write_bytes(executed.stdout+executed.stderr)
    assert executed.returncode == 0, (name, executed.stderr.decode(errors='replace'))
    m = json.loads((out/(name+'.json')).read_text())
    vs, fs, parts = audit.mesh(out/(name+'.arch'))
    assert sha(request) == digest and m['inputUnchanged']
    assert m['parameters'] == m['returnedParameters']
    row = {'id': name, 'inputSha256': digest, 'command': command, 'exit': executed.returncode,
           'elapsedMs': (time.monotonic()-start)*1000, 'verdict': m['mechanicsVerdict'],
           'exportBlocked': m['exportBlocked'], 'diagnostics': m['diagnostics'],
           'meshSha256': sha(out/(name+'.arch')), 'inputUnchanged': True}
    refusing = args.expect == 'fixed' or name in baseline_refusals
    if refusing:
        assert m['mechanicsVerdict'] == 1 and m['exportBlocked'] and not vs and not fs and not parts, (name, m['diagnostics'])
        if args.expect == 'fixed' and name in {'roof-oblique-slit-2nm','roof-oblique-slit-4nm','lego-roof-oblique-slit-2nm'}:
            assert any('FINAL_GUARD_SOURCE_BELOW_RESOLUTION' in d for d in m['diagnostics']), (name, m['diagnostics'])
        if args.expect == 'fixed' and name == 'strap-notch-1':
            assert any('STRAP_CHAMFER_LATERAL_BREAKOUT' in d for d in m['diagnostics']), m['diagnostics']
        row['result'] = 'unsafe source rejected without published mesh'
    else:
        assert m['mechanicsVerdict'] == 0 and not m['exportBlocked'], (name, m['diagnostics'])
        row['mesh'] = audit.inspect(vs, fs, parts)
        if name == 'strap-notch-1':
            hits = audit.exact_ray(vs, fs, 1, F(5), F(123, 1000))
            intact = audit.exact_ray(vs, fs, 1, F(5), F(10123, 1000))
            assert hits == [F(-15), F(-2)] and intact == [F(-15), F(-2), F(2), F(15)]
            row['result'] = 'F2 reproduced: mm-scale lateral wall missing at interior notch'
        else:
            shift = 4 if name == 'roof-oblique-slit-4nm' else 2
            hits = audit.exact_z_hits(vs, fs, F(68,100)+F(shift,2000000), F(17,1000))
            intact = audit.exact_z_hits(vs, fs, F(681,1000), F(17,1000))
            if name.startswith('lego'):
                guard = next(x['dimensions'] for x in m['features'] if x['id'] == 'guard:wall-roof:mech:lego:bore:0:0')
                assert hits == [] and intact == [F(3), F(6)] and guard[2] > 0
            else:
                guard = next(x['dimensions'] for x in m['features'] if x['id'] == 'guard:strap:roof-floor')
                assert hits == [F(0), F(1)] and intact == [F(0), F(1), F(5), F(6)] and guard[1] > 0
            row['reportedGuard'] = guard
            row['result'] = 'F1 reproduced: positive guard over a real through-roof void'
        row['exactRayHits'] = [str(x) for x in hits]
        row['adjacentControlHits'] = [str(x) for x in intact]
    row['pass'] = True
    result['cases'].append(row)
    (out/'summary.json').write_text(json.dumps(result, indent=2)+'\n')
    print(name+': '+row['result'], flush=True)
print(str(len(result['cases']))+'/'+str(len(cases))+' expectation checks passed', flush=True)
