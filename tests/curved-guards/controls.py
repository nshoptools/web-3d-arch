"""Analytic positive and nearby-negative controls, derived in a fresh output folder.
All source changes are explicit synthetic test definitions, never production repairs.
"""
import argparse, hashlib, importlib.util, json, os, pathlib, re, subprocess, time
from fractions import Fraction as F
HERE=pathlib.Path(__file__).resolve().parent
RUN=pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve()
assert RUN.is_relative_to(pathlib.Path(os.environ['PROJECT_ROOT']).resolve())
p=argparse.ArgumentParser();p.add_argument('target',choices=['native','wasm']);p.add_argument('--tag',required=True);p.add_argument('--binary',required=True);p.add_argument('--expect',choices=['baseline','fixed'],default='fixed');a=p.parse_args()
assert re.fullmatch(r'[a-zA-Z0-9-]{1,80}',a.tag)
out=RUN/('evidence/guard-controls-'+a.tag+'-'+a.target);out.mkdir(parents=True,exist_ok=False)
binary=pathlib.Path(a.binary).resolve();assert binary.is_relative_to(RUN)
spec=importlib.util.spec_from_file_location('guard_audit',HERE/'mesh-audit.py');audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
sha=lambda b:hashlib.sha256(b).hexdigest()
strap=(HERE/'fixtures/roof-oblique-slit-2nm.txt').read_text()
lego=(HERE/'fixtures/lego-roof-oblique-slit-2nm.txt').read_text()
notch=(HERE/'fixtures/strap-notch-1.txt').read_text()
cases=[]
def case(name,text,accept,axis,point,hits,reason):cases.append(dict(id=name,text=text,accept=accept,axis=axis,point=point,hits=hits,reason=reason))
for product,text,old,start,clear in [('strap',strap,'4.9','5.01','0.01'),('lego',lego,'3.0','3.01','0.01')]:
    modified=text.replace('0 '+old,'0 '+start).replace(old+' 6',start+' 6')
    hits=['0','1','5',start] if product=='strap' else ['3',start]
    case(product+'-slit-positive-roof',modified,True,2,['680001/1000000','17/1000'],hits,'Same narrow slit starts '+clear+' mm above the cutter envelope; continuous positive roof must remain supported.')
    # Keep the exact source rings; the declared upper slab uses the outer ring only.
    solid=text.replace('slab 0 2 1','slab 0 1 1')
    case(product+'-solid-split',solid,True,2,['680001/1000000','17/1000'],['0','1','5','6'] if product=='strap' else ['3','6'],'Two abutting prepared slabs with identical footprints; no void.')
safe=notch.replace('5000000 1000000 -5000000 1000000','5000000 3000000 -5000000 3000000')
case('notch-positive-side-wall',safe,True,1,['5','123/1000'],['-15','-2','2','3'],'The notch wall at y=3 stays outside the r+c=2.6 mm lead-in envelope.')
case('notch-no-chamfer-breakout',notch.replace('strapCham 0.6','strapCham 0'),False,1,['5','123/1000'],['-15','-2'],'The same mm-scale lateral breakout exists without chamfer.')
case('notch-no-chamfer-positive',safe.replace('strapCham 0.6','strapCham 0'),True,1,['5','123/1000'],['-15','-2','2','3'],'Positive side wall also supported without chamfer.')
near=notch.replace('5000000 1000000 -5000000 1000000','5000000 1000001 -5000000 1000000')
case('notch-near-parallel-breakout',near,False,1,['5','123/1000'],['-15','-2'],'One endpoint raised 1nm; finite active span below old skip threshold still exposes the bore.')
cases[-1]['baselineAccept']=False # Existing exterior-domain guard already refuses this nearby negative.
def rotate90(text):
    lines=[]
    for line in text.splitlines():
        values=line.split()
        if values and values[0]=='ring':
            xy=list(map(int,values[2:]));rot=[]
            for x,y in zip(xy[::2],xy[1::2]):rot += [-y,x]
            line='ring '+values[1]+' '+' '.join(map(str,rot))
        lines.append(line)
    return '\n'.join(lines)+'\nparam strapAngle 90\n'
case('notch-quarter-turn-breakout',rotate90(notch),False,0,['123/1000','5'],['2','15'],'Exact source quarter-turn plus 90-degree bore tests floating projection of an axis-parallel wall.')
case('notch-quarter-turn-positive',rotate90(safe),True,0,['123/1000','5'],['-3','-2','2','15'],'Same quarter-turn with intact local side wall.')
report={'version':'arch-curved-guard-controls/1','target':a.target,'expectation':a.expect,'binarySha256':sha(binary.read_bytes()),'cases':[]}
failed=[]
for c in cases:
    request=out/(c['id']+'.txt');data=c['text'].encode();request.write_bytes(data)
    command=([str(binary)] if a.target=='native' else ['node',str(binary)])+[str(request),str(out/c['id'])]
    t=time.monotonic();ex=subprocess.run(command,cwd=RUN,capture_output=True,timeout=100);(out/(c['id']+'.log')).write_bytes(ex.stdout+ex.stderr)
    row={k:v for k,v in c.items() if k!='text'};row.update(inputSha256=sha(data),command=command,exit=ex.returncode,elapsedMs=(time.monotonic()-t)*1000)
    try:
        assert ex.returncode==0, ex.stderr.decode(errors='replace')
        m=json.loads((out/(c['id']+'.json')).read_text());vs,fs,parts=audit.mesh(out/(c['id']+'.arch'))
        assert request.read_bytes()==data and m['inputUnchanged'] and m['parameters']==m['returnedParameters']
        row.update(verdict=m['mechanicsVerdict'],exportBlocked=m['exportBlocked'],diagnostics=m['diagnostics'],meshSha256=sha((out/(c['id']+'.arch')).read_bytes()))
        if c['accept'] or (a.expect=='baseline' and c.get('baselineAccept',True)):
            assert m['mechanicsVerdict']==0 and not m['exportBlocked'],m['diagnostics']
            row['mesh']=audit.inspect(vs,fs,parts)
            hits=audit.exact_ray(vs,fs,c['axis'],*(F(x) for x in c['point']))
            row['exactRayHits']=[str(x) for x in hits]
            # Fixed, unrotated analytic levels use exact binary fractions. A
            # decimal input such as 5.01 is represented by its actual IEEE value.
            expected=[F(float(x)) if '.' in x else F(x) for x in c['hits']]
            assert len(hits)==len(expected),(row['exactRayHits'],c['hits'])
            assert all(abs(float(x-y))<=1e-12 for x,y in zip(hits,expected)),(row['exactRayHits'],c['hits'])
        else:
            assert m['mechanicsVerdict']==1 and m['exportBlocked'] and not vs and not fs and not parts,m['diagnostics']
        row['pass']=True
    except AssertionError as err:
        row.update(pass_=False,error=str(err));failed.append(c['id'])
    report['cases'].append(row);(out/'summary.json').write_text(json.dumps(report,indent=2)+'\n')
    print(c['id']+': '+('PASS' if row.get('pass') else 'FAIL '+row['error']),flush=True)
assert not failed,failed
print(str(len(cases))+'/'+str(len(cases))+' controls pass',flush=True)
