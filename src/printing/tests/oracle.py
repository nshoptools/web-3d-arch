# Independent reader: trimesh/lxml, not lib3mf writer data structures or flags.
import sys,pathlib,os,io,json,zipfile,hashlib
r=pathlib.Path(os.environ['PROJECT_REVIEW_RUN'])
sys.path.insert(0,str(r/'work/deps/python'))
import numpy as np,trimesh,lxml.etree as ET
schema_dir=r/'work/deps/lib3mf-src/Tests/TestFiles/Schema'
class Resolver(ET.Resolver):
 def resolve(self,url,pubid,context):
  if url=='http://www.w3.org/2001/xml.xsd':return self.resolve_filename(str(r/'inputs/xml.xsd'),context)
parser=ET.XMLParser(resolve_entities=False,no_network=True);parser.resolvers.add(Resolver())
# XSD is verified by .NET System.Xml in verify-schema.ps1; lxml 6/libxml2 rejects upstream maxOccurs=2147483647.
records=[]
for arg in sys.argv[1:]:
 path=pathlib.Path(arg);data=path.read_bytes()
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  assert z.testzip() is None
  for name in z.namelist():
   if name.endswith('.model'):
    doc=ET.fromstring(z.read(name),parser);assert doc.tag=='{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}model'
 scene=trimesh.load(io.BytesIO(data),file_type='3mf',process=False)
 meshes=list(scene.geometry.values());assert meshes
 volume=sum(m.volume for m in meshes);area=sum(m.area for m in meshes)
 shape='ring' if 'ring' in path.name else 'adjacent' if 'adjacent' in path.name else 'cube'
 ev,ea,ee={'ring':(672,896,0),'adjacent':(2000,1200,2),'cube':(1000,600,2)}[shape]
 assert abs(volume-ev)<1e-7,(path,volume)
 assert abs(area-ea)<1e-7,(path,area)
 for mesh in meshes:
  assert mesh.is_watertight and mesh.is_winding_consistent and mesh.volume>0
  assert mesh.euler_number==ee
 if shape=='ring':
  # Independent analytic ray through the central 8x8 hole must cross no horizontal triangle.
  for tri in meshes[0].triangles:
   if not np.allclose(tri[:,2],tri[0,2]):continue
   a,b,c=tri[:,:2];pt=np.array([10,10]);edges=[(a,b),(b,c),(c,a)]
   signs=[((q[0]-p[0])*(pt[1]-p[1])-(q[1]-p[1])*(pt[0]-p[0])) for p,q in edges]
   assert not(all(x>=-1e-12 for x in signs) or all(x<=1e-12 for x in signs)),'HOLE_FILLED'
 bounds=scene.bounds.tolist()
 expected_bounds=[[0,0,0],[20,20,2]] if shape=='ring' else [[0,0,0],[20 if shape=='adjacent' else 10,10,10]]
 assert np.allclose(bounds,expected_bounds,atol=1e-7)
 records.append({'file':str(path),'sha256':hashlib.sha256(data).hexdigest(),'reader':'trimesh '+trimesh.__version__,
 'xmlReader':'lxml '+ET.LXML_VERSION.__str__(),'schemaValidation':'see separate System.Xml record','shape':shape,
 'partCount':len(meshes),'volumeMm3':volume,'areaMm2':area,'boundsMm':bounds,'verdict':'pass',
 'limits':'Analytic fixtures only; no general intersection or slicer/physical verdict.'})
print(json.dumps(records,indent=2))
