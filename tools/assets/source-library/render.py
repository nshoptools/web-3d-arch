"""Offline original-font thumbnails: native HarfBuzz draw API -> resvg -> PNG.
No font fallback, browser, extra WASM, external SVG resources or hand-written codec.
"""
import argparse, hashlib, io, json, math, os, pathlib, sys
from importlib.metadata import distribution, version
import uharfbuzz as hb
import resvg_py
from PIL import Image


def digest(b): return hashlib.sha256(b).hexdigest()
def jbytes(v): return (json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':'))+'\n').encode()
def checked(root, value):
    root=pathlib.Path(root).resolve();p=pathlib.Path(value).absolute()
    assert p.is_relative_to(root), 'Path escapes root'
    for ancestor in [p,*p.parents]:
        assert not ancestor.is_symlink() and not getattr(ancestor,'is_junction',lambda:False)(), 'Reparse path'
        if ancestor==root: break
    assert p.resolve().is_relative_to(root), 'Resolved escape'
    return p

def tools():
    records=[]
    for name in ['uharfbuzz','resvg-py','pillow']:
        d=distribution(name);files=[]
        for f in sorted(d.files,key=str):
            if '__pycache__' in str(f) or str(f).endswith('.pyc'):continue
            p=checked(os.environ['PROJECT_ROOT'],d.locate_file(f));b=p.read_bytes()
            files.append({'path':str(f).replace('\\','/'),'bytes':len(b),'sha256':digest(b)})
        records.append({'package':name,'version':d.version,'files':files})
    return {'version':'arch-native-preview-tools/1','harfbuzz':hb.version_string(),'packages':records}

def inspect_png(data, *, expected=None):
    assert len(data)<=16000000
    with Image.open(io.BytesIO(data)) as image:
        assert image.format=='PNG' and image.width*image.height<=16777216
        image.load();rgba=image.convert('RGBA');a=rgba.getchannel('A');bounds=a.getbbox()
        assert bounds is not None, 'Blank preview'
        if expected: assert rgba.size==expected, 'PNG dimensions'
        raw=rgba.tobytes();visible=sum(1 for v in a.tobytes() if v)
        return {'width':rgba.width,'height':rgba.height,'alphaBounds':list(bounds),'visiblePixels':visible,'rgbaSha256':digest(raw)}

def original_font(root,base,entry):
    data=checked(root,root/base/entry['path']).read_bytes()
    assert len(data)==entry['bytes'] and digest(data)==entry['sha256'], 'Font integrity'
    face=hb.Face(data);assert face.upem==entry['unitsPerEm'] and face.glyph_count==entry['glyphCount']
    font=hb.Font(face);font.scale=(face.upem,face.upem);font.set_variations(entry.get('defaultVariation',{}))
    return font

def shape(font,text):
    buffer=hb.Buffer();buffer.add_str(text);buffer.direction='ltr';buffer.script='Zyyy';buffer.language='und';hb.shape(font,buffer)
    assert len(buffer.glyph_infos)<=16
    return list(zip(buffer.glyph_infos,buffer.glyph_positions))

def render(root,output,work,expected_tools):
    measured=tools();assert measured==expected_tools, 'Pinned native renderer files changed'
    entry=json.loads((root/'src/assets/emoji/fonts-cat.json').read_bytes())[0]
    mono=json.loads((root/'src/assets/emoji/emoji-cat.json').read_bytes())
    assert mono['fontSha256']==entry['sha256'] and entry['defaultVariation']=={'wght':400}
    font=original_font(root,pathlib.Path('src/assets/emoji'),entry);rows=[]
    component_source=json.loads((root/'src/assets/emoji/color/components-cat.json').read_bytes())['items'];mono_components=[]
    for component in component_source:
        run=shape(font,component['emoji']);assert len(run)==1 and run[0][0].codepoint!=0, 'Mono component missing'
        mono_components.append({k:v for k,v in component.items() if k not in ['glyphs','rasters','vectors','preferredRasterPath','preferredVectorPath','preferredGeometrySource']})
        mono_components[-1]['glyphId']=run[0][0].codepoint
        mono_components[-1]['sourceCatalog']='src/assets/emoji/color/components-cat.json'
    all_mono=mono['items']+mono_components
    target=checked(os.environ['PROJECT_REVIEW_RUN'],output/'derived/mono');target.mkdir(parents=True,exist_ok=True)
    funcs=hb.DrawFuncs();commands=[];opened=False
    def add(kind,args):
        nonlocal opened
        assert all(isinstance(x,(float,int)) and math.isfinite(x) and abs(x)<=10000000 for x in args)
        if kind=='M': assert not opened;opened=True
        else: assert opened
        if kind=='Z':opened=False
        commands.append([kind,*args]);assert len(commands)<=100000
    for method,kind in [('move_to','M'),('line_to','L'),('quadratic_to','Q'),('cubic_to','C'),('close_path','Z')]:
        getattr(funcs,'set_'+method+'_func')(lambda *args,kind=kind:add(kind,args[:-1]))
    for index,item in enumerate(all_mono):
        assert all(c in '0123456789abcdef-' for c in item['id']) and len(item['id'])<=160
        run=shape(font,item['emoji']);ink=[];shape_rows=[];x=y=0
        for info,p in run:
            assert info.codepoint!=0, 'Missing mono glyph'
            commands.clear();font.draw_glyph(info.codepoint,funcs,None);assert not opened
            shape_rows.append({'glyphId':info.codepoint,'clusterCodepoints':info.cluster,'xAdvance':p.x_advance,'yAdvance':p.y_advance,'xOffset':p.x_offset,'yOffset':p.y_offset})
            if commands:ink.append((info.codepoint,x+p.x_offset,y+p.y_offset,[list(c) for c in commands]))
            else:assert p.x_advance==0 and p.y_advance==0, 'Unexpected advancing empty glyph'
            x+=p.x_advance;y+=p.y_advance
        assert len(ink)==1 and ink[0][0]==item['glyphId'], 'Catalog glyph/shaping mismatch'
        gid,ox,oy,outline=ink[0];coords=[]
        for c in outline:
            coords.extend((c[i]+ox,c[i+1]+oy) for i in range(1,len(c),2))
        xmin=min(v[0] for v in coords);ymin=min(v[1] for v in coords);xmax=max(v[0] for v in coords);ymax=max(v[1] for v in coords)
        assert xmax>xmin and ymax>ymin
        scale=min(120/(xmax-xmin),120/(ymax-ymin));dx=(128-(xmax-xmin)*scale)/2-xmin*scale;dy=(128-(ymax-ymin)*scale)/2+ymax*scale
        fmt=lambda v:format(float(v),'.17g')
        pathdata=' '.join(c[0]+(' '.join(fmt(v) for v in c[1:])) for c in outline)
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><g transform="matrix({fmt(scale)} 0 0 {fmt(-scale)} {fmt(dx+ox*scale)} {fmt(dy-oy*scale)})"><path fill="#000000" fill-rule="nonzero" d="{pathdata}"/></g></svg>'
        encoded=resvg_py.svg_to_bytes(svg_string=svg,width=128,height=128,dpi=96,skip_system_fonts=True,font_files=[],font_dirs=[],resources_dir=str(work),shape_rendering='geometric_precision')
        proof=inspect_png(encoded,expected=(128,128));assert proof['alphaBounds'][0]>=3 and proof['alphaBounds'][1]>=3 and proof['alphaBounds'][2]<=125 and proof['alphaBounds'][3]<=125
        png_hash=digest(encoded);file=f'derived/mono/{png_hash}.png';dest=output/file
        if dest.exists():assert dest.read_bytes()==encoded
        else:dest.write_bytes(encoded)
        rows.append({'itemId':item['id'],'emoji':item['emoji'],'glyphId':gid,'fontId':entry['id'],'fontSha256':entry['sha256'],'variations':entry['defaultVariation'],'shape':shape_rows,'outlineSha256':digest(jbytes(outline)),'svgSha256':digest(svg.encode()),'commands':len(outline),'contours':sum(c[0]=='M' for c in outline),'controlBounds':[xmin,ymin,xmax,ymax],'fontToPixel':[scale,0,0,-scale,dx,dy],'file':file,'sha256':png_hash,'bytes':len(encoded),**proof})
        if (index+1)%500==0:print(f'Mono outlines/PNG verified {index+1}/{len(all_mono)}',flush=True)
    assert len(rows)==mono['count']+len(mono_components)
    result={'version':'arch-mono-previews/1','font':entry,'pickerCount':mono['count'],'componentCount':len(mono_components),'components':mono_components,'recipe':{'version':'native-hb-resvg-mono/1','harfbuzz':hb.version_string(),'toolsHash':digest(jbytes(measured)),'width':128,'height':128,'paddingPx':4,'fit':'isotropic conservative control hull','color':[0,0,0,255],'fillRule':'nonzero','dpi':96,'systemFonts':False,'externalResources':False,'clusters':'Unicode codepoint indices (hb_buffer_add_utf32) in original catalog token','geometryQualification':'source-font-preview-only'},'items':rows}
    (output/'mono-thumbnails.json').write_bytes(jbytes(result))
    # Preserve every color font and record actual coverage for optional selections.
    color=json.loads((root/'src/assets/emoji/color/emoji-cat.json').read_bytes());components=json.loads((root/'src/assets/emoji/color/components-cat.json').read_bytes())['items'];bindings=[]
    for f in json.loads((root/'src/assets/emoji/color/fonts-cat.json').read_bytes()):
        font=original_font(root,pathlib.Path('src/assets/emoji/color'),f);supported={};unsupported=[]
        for item in color['items']+components:
            run=shape(font,item['emoji']);ids=[i.codepoint for i,p in run]
            if len(ids)==1 and ids[0]!=0:supported[item['id']]=ids[0]
            else:unsupported.append({'itemId':item['id'],'reason':'missing-glyph' if 0 in ids else 'not-one-glyph','glyphCount':len(ids)})
            if f['id'] in item.get('glyphs',{}):assert supported.get(item['id'])==item['glyphs'][f['id']], 'Existing verified color glyph differs'
        bindings.append({'fontId':f['id'],'fontSha256':f['sha256'],'glyphs':supported,'unsupported':unsupported,'supportedCount':len(supported),'unsupportedCount':len(unsupported)})
        print(f'Original color variant {f["id"]}: {len(supported)} supported / {len(unsupported)} unavailable tokens retained',flush=True)
    (output/'font-coverage.json').write_bytes(jbytes({'version':'arch-library-font-coverage/1','harfbuzz':hb.version_string(),'direction':'ltr','script':'Zyyy','language':'und','bindings':bindings}))
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--repo',required=True);p.add_argument('--output',required=True);p.add_argument('--work',required=True);p.add_argument('--tools-lock',required=True);a=p.parse_args()
    root=pathlib.Path(a.repo).resolve();output=checked(os.environ['PROJECT_REVIEW_RUN'],a.output);work=checked(os.environ['PROJECT_REVIEW_RUN'],a.work);work.mkdir(parents=True,exist_ok=True)
    render(root,output,work,json.loads(pathlib.Path(a.tools_lock).read_bytes()))