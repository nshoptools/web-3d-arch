"""Format usvg/arch-vector-source records into bounded numeric Clipper test input.
No SVG parsing. Python round implements nearest/ties-even for the existing
binary64 value multiplied by 1e6, matching the root source quantizer.
"""
import json,sys
from pathlib import Path
doc=json.loads(Path(sys.argv[1]).read_text('utf-8-sig'))
rows=[]
def paths(ps):
 rows.append(str(len(ps)))
 for p in ps:
  rows.append(str(len(p)))
  rows.extend(f'{round(v[0]*1e6)} {round(v[1]*1e6)}' for v in p)
assert not doc.get('clips')
paths([doc['viewport_clip']])
rows.append(str(len(doc['shapes'])))
for s in doc['shapes']:
 assert not s['clip_stack']
 rows.append(str(int(s['fill_rule']=='evenodd')))
 paths(s['contours'])
Path(sys.argv[2]).write_text('\n'.join(rows)+'\n',encoding='ascii')
