# Independent trimesh reader and analytic bounds/volume/area/hole oracle.
import pathlib,os,sys,json,io,zipfile,hashlib
run=pathlib.Path(os.environ['PROJECT_REVIEW_RUN']);sys.path.insert(0,str(run/'work/deps/python'))
import trimesh,numpy as np
records=[]
for name in sys.argv[1:]:
 path=pathlib.Path(name);data=path.read_bytes()
 with zipfile.ZipFile(io.BytesIO(data)) as z:assert z.testzip() is None
 scene=trimesh.load(io.BytesIO(data),file_type='3mf',process=False);meshes=list(scene.geometry.values())
 shape='hole' if 'hole' in path.name else 't-junction' if 't-junction' in path.name else 'seam' if 'seam' in path.name else 'cube'
 ev,ea,np_expected={'hole':(368,520,1),'seam':(400,560,2),'t-junction':(400,600,3),'cube':(1000,600,1)}[shape]
 assert len(meshes)==np_expected
 volume=sum(m.volume for m in meshes);area=sum(m.area for m in meshes)
 assert abs(volume-ev)<1e-7 and abs(area-ea)<1e-7,(path,volume,area)
 assert np.allclose(scene.bounds,[[0,0,0],[10,10,10]] if shape=='cube' else [[0,0,0],[20,10,2]],atol=1e-7)
 for m in meshes:
  assert m.is_watertight and m.is_winding_consistent and m.volume>0
  assert m.euler_number==(0 if shape=='hole' else 2)
 if shape=='hole':
  for tri in meshes[0].triangles:
   if not np.allclose(tri[:,2],tri[0,2]):continue
   a,b,c=tri[:,:2];pt=np.array([10,5]);edges=[(a,b),(b,c),(c,a)]
   signs=[((q[0]-p[0])*(pt[1]-p[1])-(q[1]-p[1])*(pt[0]-p[0])) for p,q in edges]
   assert not(all(x>=-1e-12 for x in signs) or all(x<=1e-12 for x in signs)),'HOLE_FILLED'
 records.append({'file':str(path),'sha256':hashlib.sha256(data).hexdigest(),'shape':shape,'parts':len(meshes),
  'volumeMm3':volume,'areaMm2':area,'boundsMm':scene.bounds.tolist(),'reader':'trimesh '+trimesh.__version__,'verdict':'pass'})
print(json.dumps(records,indent=2))
