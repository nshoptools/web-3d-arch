import pathlib,os,json,zipfile,re,hashlib
from lxml import etree as ET
r=pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve();records=[]
executions=json.loads((r/'evidence/bambu-dryslice-records.json').read_text())
assert len(executions)==2 and {x['shape'] for x in executions}=={'adjacent','cube'}
for execution in executions:
 assert execution['verdict']=='pass' and execution['exitCode']==0
 assert pathlib.Path(execution['outputDirectory']).resolve().is_relative_to(r)
 assert pathlib.Path(execution['outputFile']).resolve().is_relative_to(r)
 assert hashlib.sha256(pathlib.Path(execution['outputFile']).read_bytes()).hexdigest()==execution['outputSha256']
for shape,first in [('adjacent',0.16),('cube',0.25)]:
 execution=next(x for x in executions if x['shape']==shape)
 out=pathlib.Path(execution['outputDirectory']);result=json.loads((out/'result.json').read_text())
 assert result['return_code']==0 and len(result['sliced_plates'])==1
 artifact=pathlib.Path(execution['outputFile']);source=pathlib.Path(execution['inputFile'])
 assert hashlib.sha256(source.read_bytes()).hexdigest()==execution['inputSha256']
 with zipfile.ZipFile(artifact) as z:
  assert len(z.infolist())<=256 and sum(f.file_size for f in z.infolist())<=128*1024*1024
  assert z.testzip() is None
  settings=json.loads(z.read('Metadata/project_settings.config'))
  assert settings['version']=='02.08.02.60' and settings['printer_model']=='Bambu Lab P1S'
  assert settings['printer_settings_id']=='Bambu Lab P1S 0.4 nozzle'
  assert settings['print_settings_id']=='0.20mm Standard @BBL X1C'
  assert settings['nozzle_diameter']==['0.4']
  assert float(settings['initial_layer_print_height'])==first and float(settings['layer_height'])==0.2
  original=json.loads((r/'inputs/printing/bambu-profile.json').read_text())['payload']['settings']
  assert settings['filament_colour']==original['filament_colour']
  config=ET.fromstring(z.read('Metadata/model_settings.config'),ET.XMLParser(resolve_entities=False,no_network=True))
  part_slots=[int((p.xpath('metadata[@key="extruder"]/@value') or p.getparent().xpath('metadata[@key="extruder"]/@value'))[0]) for p in config.xpath('.//part')]
  assert sorted(part_slots)==([1,2] if shape=='adjacent' else [1]),part_slots
  gcode=z.read('Metadata/plate_1.gcode').decode('utf-8')
  # Parse comments as measurements. Never execute JS, G-code or macros.
  zs=[float(x) for x in re.findall(r'^; Z_HEIGHT:\s*([0-9.]+)\s*$',gcode,re.M)]
  assert len(zs)>=12
  assert abs(zs[0]-first)<1e-6 and abs(zs[1]-(first+.2))<1e-6 and abs(zs[11]-(first+2.2))<1e-6
  objects=result['sliced_plates'][0]['objects'];assert len(objects)==1
  box=objects[0]['bbox'];assert box=={'depth':10.0,'height':10.0,'width':20.0 if shape=='adjacent' else 10.0,'x':100.0,'y':100.0,'z':0.0}
  records.append({'shape':shape,'verdict':'pass','scope':'Bambu CLI dry slice/readback only','invocation':execution['invocation'],'outputFile':str(artifact),'version':settings['version'],
    'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(artifact.read_bytes()).hexdigest(),
    'partSlots':part_slots,'physicalExtruders':[1]*len(part_slots),'colours':settings['filament_colour'],'nozzleMm':0.4,
    'processProfile':settings['print_settings_id'],'firstLayerMm':zs[0],'secondLayerMm':zs[1],'twelfthLayerMm':zs[11],
    'lastLayerZMm':zs[-1],'layerCount':len(zs),'objectBounds':box,
    'originalManifestPreserved':'Metadata/printing-manifest.json' in z.namelist(),
    'thumbnailPresent':'Metadata/plate_1.png' in z.namelist(),'manualLayerPreview':'unverified','physicalFit':'unverified'})
  for name in ['Metadata/plate_1.png','Metadata/top_1.png']:
   if name in z.namelist():(out/pathlib.PurePosixPath(name).name).write_bytes(z.read(name))
(r/'evidence/bambu-readback.json').write_text(json.dumps(records,indent=2));print(json.dumps(records,indent=2))
