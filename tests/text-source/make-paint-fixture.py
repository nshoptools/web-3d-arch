"""Original analytic COLRv1 fixture. No upstream font/artwork is modified.
Run only with tools/project-env.ps1 for this run. FontTools is read-only.
"""
import os,json,hashlib,pathlib
from fontTools import __version__
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.colorLib.builder import buildCOLR,buildCPAL
from fontTools.ttLib.tables.otTables import PaintFormat as P, CompositeMode as C

room=pathlib.Path(os.environ["PROJECT_REVIEW_RUN"]).resolve()
out=room/"work/text-source/tests/text-source/fixtures"
assert out.resolve().is_relative_to(room)
for part in [out,*out.parents]:
    if part==room: break
    assert not part.is_symlink() and not part.is_junction()
out.mkdir(parents=True,exist_ok=True)
names=[".notdef","linear","radial","sweep","group","reflect","alpha","tied","shape"]
fb=FontBuilder(1000,isTTF=True)
fb.setupGlyphOrder(names)
fb.setupCharacterMap({0xe000+i:name for i,name in enumerate(names[1:-1])})
def box(empty=False):
    pen=TTGlyphPen(None)
    if not empty:
        pen.moveTo((0,0));pen.lineTo((1000,0));pen.lineTo((1000,1000));pen.lineTo((0,1000));pen.closePath()
    return pen.glyph()
fb.setupGlyf({name:box(name!="shape") for name in names})
fb.setupHorizontalMetrics({name:(1000,0) for name in names})
fb.setupHorizontalHeader(ascent=1000,descent=0)
fb.setupNameTable({"familyName":"Arch Analytic COLR","styleName":"Regular","uniqueFontIdentifier":"ArchAnalyticCOLR1","fullName":"Arch Analytic COLR","psName":"ArchAnalyticCOLR","version":"Version 1.000"})
fb.setupOS2(sTypoAscender=1000,sTypoDescender=0,usWinAscent=1000,usWinDescent=0)
fb.setupPost()
def line(extend=0,alpha=1,tied=False):
    stops=[{"StopOffset":0,"PaletteIndex":0,"Alpha":alpha},{"StopOffset":1,"PaletteIndex":1,"Alpha":1}]
    if tied: stops=[stops[0],{"StopOffset":.5,"PaletteIndex":0,"Alpha":1},{"StopOffset":.5,"PaletteIndex":1,"Alpha":1},stops[1]]
    return {"Extend":extend,"ColorStop":stops}
def linear(**kw):
    return {"Format":P.PaintLinearGradient,"ColorLine":line(**kw),"x0":0,"y0":0,"x1":1000,"y1":0,"x2":0,"y2":1000}
def clip(paint):
    return {"Format":P.PaintGlyph,"Glyph":"shape","Paint":paint}
paints={
 "linear":clip(linear()),
 "radial":clip({"Format":P.PaintRadialGradient,"ColorLine":line(),"x0":500,"y0":500,"r0":0,"x1":500,"y1":500,"r1":500}),
 "sweep":clip({"Format":P.PaintSweepGradient,"ColorLine":line(),"centerX":500,"centerY":500,"startAngle":0,"endAngle":360}),
 "group":{"Format":P.PaintComposite,"SourcePaint":{"Format":P.PaintTranslate,"dx":200,"dy":0,"Paint":clip({"Format":P.PaintSolid,"PaletteIndex":0,"Alpha":1})},"CompositeMode":C.SRC_IN,"BackdropPaint":clip({"Format":P.PaintSolid,"PaletteIndex":1,"Alpha":.5})},
 "reflect":clip({"Format":P.PaintScale,"scaleX":.25,"scaleY":1,"Paint":linear(extend=2)}),
 "alpha":clip(linear(alpha=0)),
 "tied":clip(linear(tied=True)),
}
fb.font["COLR"]=buildCOLR(paints,version=1,glyphMap=fb.font.getReverseGlyphMap(),clipBoxes={name:(100,100,900,900) for name in paints})
fb.font["CPAL"]=buildCPAL([[(1,0,0,1),(0,0,1,1)]])
fb.font["head"].created=fb.font["head"].modified=2082844800
fb.font.recalcTimestamp=False
target=out/"analytic-colr.ttf";fb.save(target)
data=target.read_bytes()
entry={"id":"analytic-colr","path":"fixture/analytic-colr.ttf","bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),"unitsPerEm":1000,"glyphCount":len(names),"color":True,"colorFormat":"COLRv1","axes":{},"source":{"kind":"original-analytic-fixture","generator":"make-paint-fixture.py","fontTools":__version__}}
(out/"analytic-colr.json").write_text(json.dumps(entry,indent=2)+"\n",encoding="utf-8")
print(json.dumps(entry))
