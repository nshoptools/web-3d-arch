"""Independent decode/ink checks and FontTools outline oracle; no new artifacts outside own run."""
import argparse, hashlib, io, json, os, pathlib
from PIL import Image, ImageChops, ImageFilter, ImageDraw
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
import resvg_py

def sha(data):return hashlib.sha256(data).hexdigest()
def checked(root,value):
    root=pathlib.Path(root).resolve();p=pathlib.Path(value).absolute()
    assert p.is_relative_to(root)
    for a in [p,*p.parents]:
        assert not a.is_symlink() and not getattr(a,'is_junction',lambda:False)()
        if a==root:break
    assert p.resolve().is_relative_to(root)
    return p
def run(library,output):
    root=pathlib.Path(os.environ['PROJECT_ROOT']).resolve();output=checked(os.environ['PROJECT_REVIEW_RUN'],output);output.mkdir(parents=True,exist_ok=True)
    folder=checked(root,library)/'src/assets/source-library'
    mono=json.loads((folder/'mono-thumbnails.json').read_bytes());manifest=json.loads((folder/'deployment.json').read_bytes())
    decoded={};original_count=0
    for r in manifest['records']:
        if r['mediaType']!='image/png':continue
        local=folder.parents[2]/r['file'];file=local if local.exists() else root/r['file'];encoded=checked(root,file).read_bytes()
        assert len(encoded)==r['bytes'] and sha(encoded)==r['sha256']
        with Image.open(io.BytesIO(encoded)) as image:
            assert image.format=='PNG' and image.width*image.height<=20000000, (r['file'], image.format, image.size)
            image.load();rgba=image.convert('RGBA');alpha=rgba.getchannel('A');bbox=alpha.getbbox()
            assert bbox is not None, 'Blank original/derived PNG '+r['file']
            proof={'width':rgba.width,'height':rgba.height,'alphaBounds':list(bbox),'visiblePixels':sum(v>0 for v in alpha.tobytes()),'rgbaSha256':sha(rgba.tobytes())}
            decoded[r['sha256']]=proof
            if 'derived-mono-preview' in r['roles']:
                assert rgba.size==(128,128)
                assert all((a==0 or (r==0 and g==0 and b==0)) for r,g,b,a in rgba.get_flattened_data()), 'Not monochrome native outline'
        if any(f.startswith('src/assets/emoji/color/') for f in r['originalFiles']):original_count+=len([f for f in r['originalFiles'] if f.startswith('src/assets/emoji/color/')])
        if len(decoded)%2000==0:print('Decoded PNG ink checks',len(decoded),flush=True)
    for p in mono['items']:
        for k,v in decoded[p['sha256']].items():assert p[k]==v,(p['itemId'],k)
        assert p['alphaBounds'][0]>=3 and p['alphaBounds'][1]>=3 and p['alphaBounds'][2]<=125 and p['alphaBounds'][3]<=125
    color=json.loads((root/'src/assets/emoji/color/emoji-cat.json').read_bytes())['items']+json.loads((root/'src/assets/emoji/color/components-cat.json').read_bytes())['items']
    for i in color:
        for r in i['rasters']:assert decoded[r['sha256']]['width']==r['width'] and decoded[r['sha256']]['height']==r['height']
    # Independent parser + variation math. Permit only one antialias pixel silhouette band,
    # not differing filled interiors. Exact deltas are recorded; this is not mechanical tolerance.
    font=mono['font'];tt=TTFont(root/'src/assets/emoji'/font['path'],lazy=False)
    glyphset=tt.getGlyphSet(location=font['defaultVariation']);selected=[]
    wanted=['1f600','1f642','2764-fe0f','1f1fb-1f1f3','1f3fb','1f9b0','0031-fe0f-20e3','1f469-200d-1f4bb','1f468-200d-1f469-200d-1f467','1f3f3-fe0f-200d-1f308']
    for key in wanted:
        p=next((r for r in mono['items'] if r['itemId']==key),None)
        if p:selected.append(p)
    selected.extend(p for index,p in enumerate(mono['items']) if index%137==0 and p not in selected)
    oracle=[];sheet=Image.new('RGB',(8*144,((len(selected)+7)//8)*158),(236,239,244));draw=ImageDraw.Draw(sheet)
    for index,p in enumerate(selected):
        name=tt.getGlyphName(p['glyphId']);pen=SVGPathPen(glyphset);glyphset[name].draw(pen);commands=pen.getCommands();assert commands
        ox=oy=x=y=0
        for s in p['shape']:
            if s['glyphId']==p['glyphId']:ox=x+s['xOffset'];oy=y+s['yOffset'];break
            x+=s['xAdvance'];y+=s['yAdvance']
        a,b,c,d,e,f=p['fontToPixel'];e+=ox*a;f+=oy*d
        matrix=' '.join(format(v,'.17g') for v in [a,b,c,d,e,f])
        svg='<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><path fill="black" fill-rule="nonzero" transform="matrix('+matrix+')" d="'+commands+'"/></svg>'
        encoded=resvg_py.svg_to_bytes(svg_string=svg,width=128,height=128,dpi=96,skip_system_fonts=True,font_files=[],font_dirs=[],resources_dir=str(output),shape_rendering='geometric_precision')
        actual=Image.open(folder/p['file']).convert('RGBA');ref=Image.open(io.BytesIO(encoded)).convert('RGBA')
        alpha=actual.getchannel('A');other=ref.getchannel('A');delta=ImageChops.difference(alpha,other)
        aa=alpha.point(lambda v:255 if v>=128 else 0);bb=other.point(lambda v:255 if v>=128 else 0)
        assert not ImageChops.subtract(aa,bb.filter(ImageFilter.MaxFilter(3))).getbbox(),p['itemId']
        assert not ImageChops.subtract(bb,aa.filter(ImageFilter.MaxFilter(3))).getbbox(),p['itemId']
        absolute=sum(v*n for v,n in enumerate(delta.histogram()));mass=sum(alpha.tobytes());relative=absolute/max(1,mass)
        assert relative<=0.01,(p['itemId'],relative)
        oracle.append({'itemId':p['itemId'],'glyphId':p['glyphId'],'fontToolsRGBA':sha(ref.tobytes()),'nativeRGBA':p['rgbaSha256'],'alphaDifferenceSum':absolute,'relativeAlphaMassDifference':relative,'silhouetteBandPx':1})
        left=(index%8)*144+8;top=(index//8)*158;sheet.paste(actual,(left,top),actual);draw.text((left,top+130),p['itemId'][:22],fill=(0,0,0))
    sheet.save(output/'mono-contact-sheet.png')
    report={'version':'arch-source-library-native-tests/1','status':'pass','offlineDecodePixelCap':20000000,'decodedUniquePNGs':len(decoded),'originalColorFiles':original_count,'monoRecords':len(mono['items']),'uniqueMonoPNGs':len(set(p['sha256'] for p in mono['items'])),'fontToolsVersion':__import__('fontTools').version,'outlineOracle':oracle,'limits':'Original-font preview validation, not geometry qualification; independent outline raster comparison permits one pixel AA boundary band and <=1% alpha-mass difference.'}
    (output/'native.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k!='outlineOracle'}),flush=True)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--library',required=True);p.add_argument('--output',required=True);a=p.parse_args();run(a.library,a.output)
