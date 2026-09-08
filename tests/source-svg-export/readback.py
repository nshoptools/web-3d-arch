"""Independent stdlib SVG artifact readback; no production parser or geometry code.
Checks XML, finite numeric data, affine frames and analytic point winding only.
Not a mesh/slicer/physical qualification or an independent review.
"""
import argparse, hashlib, json, math, re, xml.etree.ElementTree as ET
from pathlib import Path
P=argparse.ArgumentParser()
P.add_argument('--run',type=Path,required=True)
P.add_argument('--label',required=True)
P.add_argument('--output',type=Path,required=True)
P.add_argument('--browser-label')
a=P.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_-]{1,70}',a.label) or (a.browser_label and not re.fullmatch(r'[A-Za-z0-9_-]{1,70}',a.browser_label)):raise ValueError('label')
run=a.run.resolve();out=a.output.resolve()
if not out.is_relative_to(run/'evidence') or out.exists():raise ValueError('output scope/exists')
NS='{http://www.w3.org/2000/svg}'
NUMBER=r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?'
def linear(node):
 d=node.attrib['d'];tokens=re.findall('[MLZ]|'+NUMBER,d)
 if re.sub('[MLZ]|'+NUMBER+'|[ ,\t\r\n]','',d):raise ValueError('nonlinear oracle input')
 matrix=[float(v) for v in re.findall(NUMBER,node.attrib.get('transform','matrix(1 0 0 1 0 0)'))]
 if len(matrix)!=6 or not all(math.isfinite(v) for v in matrix):raise ValueError('matrix')
 rings=[];ring=[];i=0
 while i<len(tokens):
  kind=tokens[i];i+=1
  if kind=='Z':rings.append(ring);ring=[];continue
  if kind not in ['M','L']:raise ValueError('command')
  x,y=map(float,tokens[i:i+2]);i+=2
  aa,b,c,d,e,f=matrix;ring.append((aa*x+c*y+e,b*x+d*y+f))
 if ring:raise ValueError('unclosed')
 return rings
def winding(rings,p):
 x,y=p;w=0
 for ring in rings:
  for a,b in zip(ring,ring[1:]+ring[:1]):
   cross=(b[0]-a[0])*(y-a[1])-(x-a[0])*(b[1]-a[1])
   if a[1]<=y<b[1] and cross>0:w+=1
   if b[1]<=y<a[1] and cross<0:w-=1
 return w
checks=[];errors=[]
def check(ok,name):
 checks.append({'name':name,'pass':bool(ok)})
 if not ok:errors.append(name)
def read(p):
 b=p.read_bytes();check(len(b)<=16*1024*1024,p.name+' byte budget')
 r=ET.fromstring(b);check(r.tag==NS+'svg',p.name+' root')
 check(all(n.tag.rsplit('}',1)[-1] not in ['script','foreignObject','image','text'] for n in r.iter()),p.name+' inert')
 for n in r.iter():
  if n.tag==NS+'path':
   vals=[float(v) for v in re.findall(NUMBER,n.get('d',''))]
   check(all(math.isfinite(v) for v in vals),p.name+' finite path')
 return r
initial=run/'evidence'/('source-initial-'+a.label)
cases=run/'evidence'/('source-cases-'+a.label)
try:
 raw=read(initial/'svg.svg');check(any('C' in n.get('d','') and 'Q' in n.get('d','') for n in raw.iter(NS+'path')),'original cubic/quadratic retained')
 check(any(n.get('fill-rule')=='evenodd' and n.get('d','').count('M')==2 for n in raw.iter(NS+'path')),'original hole retained')
 colored=read(cases/'recolored-excluded.svg');paths=list(colored.iter(NS+'path'))
 check(len(paths)==1 and paths[0].get('fill')=='#00FF00','recolor and exclusion current')
 rings=linear(paths[0]);check(len(rings)==2,'recolored hole rings')
 check(winding(rings,(3,4))!=0 and winding(rings,(7,8))==0,'recolored analytic inside/hole original position')
 check(abs(sum(abs(sum(x0*y1-x1*y0 for (x0,y0),(x1,y1) in zip(r,r[1:]+r[:1]))/2)*(1 if i==0 else -1) for i,r in enumerate(rings))-488)<.001,'recolored analytic area 18x28 minus 4x4')
 raster=read(initial/'raster.svg');paths=list(raster.iter(NS+'path'));r=next(n for n in paths if n.get('fill').lower()=='#e04444');rings=linear(r)
 scale=45/16
 check(winding(rings,(4.5*scale,3.5*scale))==0,'raster asymmetric top hole stays top')
 check(winding(rings,(4.5*scale,8*scale))!=0,'raster bottom fill stays bottom')
 check(winding(rings,(.5*scale,11*scale))==0,'raster bottom-left transparent exterior stays bottom-left')
 read(initial/'text.svg')
 for kind in ['emoji']:check(any(re.search('[CQ]',n.get('d','')) for n in read(initial/(kind+'.svg')).iter(NS+'path')),kind+' actual curves')
 edited=json.loads((cases/'edited-raster-result.json').read_text())
 check(edited['noMaterialFallback'] and edited['originalHash']==edited['retainedOriginalHash'],'edited original retained without material fallback')
 if edited['status']=='blocked-upstream':
  check(edited['code']=='PRODUCT_MATERIAL_ID_CONFLICT' and edited['noExportPublished'] and not (cases/'edited-raster.svg').exists(),'upstream blocker does not publish stale SVG')
  check(edited['changedPixels']>0 and edited['beforeRGBAHash']!=edited['afterRGBAHash'],'actual erase changed working pixels')
 else:
  read(cases/'edited-raster.svg');check((cases/'edited-raster.svg').read_bytes()!=(initial/'raster.svg').read_bytes(),'default edited graph output differs')
 for name in ['svg-text-overlay','variable-latin-multiline-bend']:read(cases/(name+'.svg'))
 for engine in ['chromium','firefox','webkit']:
  folder=run/'evidence'/('browser-'+(a.browser_label or a.label))/engine
  if folder.exists():
   report=json.loads((folder/'result.json').read_text())
   for row in report['rows']:
    p=folder/(row['kind']+'.svg');read(p);check(hashlib.sha256(p.read_bytes()).hexdigest()==row['outputSha256'],engine+' '+row['kind']+' hash')
except Exception as e:errors.append(type(e).__name__+': '+str(e))
result={'version':'arch-source-svg-readback/1','reader':'Python stdlib XML + independent affine/winding arithmetic','checks':checks,'errors':errors,'status':'failed' if errors else 'passed','qualification':'source artifact only; no review/mesh/slicer/fit claim'}
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'status':result['status'],'checks':len(checks),'errors':errors}))
raise SystemExit(1 if errors else 0)
