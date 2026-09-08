"""Independent stdlib ZIP/XML/STL reader for the authored 20x10x2 two-box fixture.
No production triangulator, slicer, geometry repair or physical-fit inference."""
import json,math,os,pathlib,struct,sys,zipfile,io,hashlib,xml.etree.ElementTree as ET
NS='{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}'
def need(ok,code):
    if not ok: raise AssertionError(code)
def metrics(vertices,faces):
    need(0<len(vertices)<=100000 and 0<len(faces)<=200000,'bounded analytic mesh')
    need(all(math.isfinite(x) and abs(x)<=10000 for v in vertices for x in v),'finite')
    volume=area=0.;edges={}
    for f in faces:
        need(len(set(f))==3 and all(0<=i<len(vertices) for i in f),'indices')
        a,b,c=[vertices[i] for i in f]
        ab=[b[i]-a[i] for i in range(3)];ac=[c[i]-a[i] for i in range(3)]
        cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]]
        ar=math.sqrt(sum(x*x for x in cross))/2;need(ar>0,'degenerate');area+=ar
        volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
        for x,y in [(f[0],f[1]),(f[1],f[2]),(f[2],f[0])]:edges.setdefault(tuple(sorted((x,y))),[]).append(x<y)
    need(all(len(v)==2 and v[0]!=v[1] for v in edges.values()),'edge incidence/orientation')
    need(volume>0,'positive volume')
    return volume,area,[[min(v[k] for v in vertices) for k in range(3)],[max(v[k] for v in vertices) for k in range(3)]]
def model_meshes(data):
    need(len(data)<=64*1024*1024,'archive bound')
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        need(len(z.infolist())<=256 and sum(f.file_size for f in z.infolist())<=128*1024*1024,'inflated bound')
        need(z.testzip() is None,'CRC')
        models=[n for n in z.namelist() if n.endswith('.model')];need(models==['3D/3dmodel.model'],'declared Core model')
        raw=z.read(models[0]);need(b'<!DOCTYPE' not in raw and b'<!ENTITY' not in raw,'DTD/entity')
        doc=ET.fromstring(raw);need(doc.tag==NS+'model' and doc.attrib.get('unit','millimeter')=='millimeter','model unit')
        resources=doc.find(NS+'resources');objects={o.attrib['id']:o for o in resources.findall(NS+'object')};meshes=[]
        for o in objects.values():
            mesh=o.find(NS+'mesh')
            if mesh is None:continue
            v=[[float(x.attrib[k]) for k in ['x','y','z']] for x in mesh.find(NS+'vertices')]
            faces=[[int(x.attrib[k]) for k in ['v1','v2','v3']] for x in mesh.find(NS+'triangles')]
            meshes.append((o.attrib['id'],metrics(v,faces)))
        need(len(meshes)==2,'two material parts')
        for components in doc.iter(NS+'components'):
            for x in components:
                need(x.attrib['objectid'] in objects and x.attrib.get('transform','1 0 0 0 1 0 0 0 1 0 0 0')=='1 0 0 0 1 0 0 0 1 0 0 0','component transform/reference')
        build=doc.find(NS+'build');need(len(build)==1 and build[0].attrib['objectid'] in objects,'build reference')
        need(build[0].attrib.get('transform','1 0 0 0 1 0 0 0 1 0 0 0')=='1 0 0 0 1 0 0 0 1 0 0 0','build transform')
        settings=json.loads(z.read('Metadata/project_settings.config'))
        need(float(settings['initial_layer_print_height'])==.25 and float(settings['layer_height'])==.2,'layer override')
        manifest=json.loads(z.read('Metadata/printing-manifest.json')) if 'Metadata/printing-manifest.json' in z.namelist() else json.loads(z.read('Metadata/printing-manifest.json'.replace('Metadata/','')))
        need(manifest['materialAliases']['material:đỏ']!=manifest['materialAliases']['material:xanh'],'material identities')
        need([m['slot'] for m in manifest['materials']]==[1,2],'explicit slots')
        return meshes
def inspect(path):
    data=path.read_bytes()
    if path.suffix=='.3mf':
        rows=model_meshes(data);v=sum(m[0] for _,m in rows);a=sum(m[1] for _,m in rows)
        need(abs(v-400)<1e-6 and abs(a-560)<1e-6,'two boxes analytic V/A')
        need(all(abs(m[0]-200)<1e-6 for _,m in rows),'individual material volume')
        bounds=[[min(m[2][0][k] for _,m in rows) for k in range(3)],[max(m[2][1][k] for _,m in rows) for k in range(3)]]
    else:
        n=struct.unpack_from('<I',data,80)[0];need(len(data)==84+n*50,'STL length')
        vertices=[];indices={};faces=[]
        for i in range(n):
            row=struct.unpack_from('<12fH',data,84+i*50);f=[]
            for k in [3,6,9]:
                xyz=tuple(row[k:k+3])
                if xyz not in indices:indices[xyz]=len(vertices);vertices.append(xyz)
                f.append(indices[xyz])
            faces.append(f)
        v,a,bounds=metrics(vertices,faces);need(abs(v-400)<1e-6 and abs(a-520)<1e-6,'neutral union V/A')
    need(bounds==[[0.,0.,0.],[20.,10.,2.]],'analytic bounds')
    return {'path':str(path),'sha256':hashlib.sha256(data).hexdigest(),'volumeMm3':v,'areaMm2':a,'boundsMm':bounds,'status':'passed'}
records=[inspect(pathlib.Path(p)) for p in sys.argv[1:]]
need(len(records)>0,'files required')
# Negative control: own in-memory bad unit must fail this reader, no file rewrite.
original=next((pathlib.Path(p).read_bytes() for p in sys.argv[1:] if p.endswith('.3mf')),None)
need(original is not None,'3MF negative control')
bad=io.BytesIO()
with zipfile.ZipFile(io.BytesIO(original)) as src,zipfile.ZipFile(bad,'w') as out:
    for name in src.namelist():
        data=src.read(name)
        if name.endswith('.model'):data=data.replace(b'unit="millimeter"',b'unit="inch"')
        out.writestr(name,data)
try:model_meshes(bad.getvalue())
except AssertionError as e:need(str(e)=='model unit','negative control error')
else:raise AssertionError('wrong unit was accepted')
print(json.dumps({'reader':'Python '+sys.version.split()[0]+' stdlib zipfile/ElementTree/struct','records':records,'negativeControls':1,'status':'passed','scope':'authored analytic fixture only; no slicer/fit/general mesh qualification'},ensure_ascii=False,indent=2))
