// Analytic, synthetic fixtures authored for this candidate. No external artwork.
export const palette = {
  '.': [0, 0, 0, 0], R: [255, 0, 0, 255], G: [0, 255, 0, 255], B: [0, 0, 255, 255],
  W: [255, 255, 255, 255], K: [0, 0, 0, 255], r: [255, 0, 0, 128],
};
export function bitmap(rows, colors = palette) {
  if (!rows.length || rows.some(row => row.length !== rows[0].length)) throw Error('Invalid fixture rows');
  return {width: rows[0].length, height: rows.length, data: new Uint8Array(rows.flatMap(row => [...row].flatMap(c => colors[c]))),
    colorSpace: 'srgb', alphaMode: 'straight'};
}
const p = (x, y, pressure) => pressure === undefined ? {x, y} : {x, y, pressure};
const pixel = p(2.5, 2.5), red = palette.R;
export const fixtures = [
  {name: 'paint isolated region retains hole and one-pixel accent', before: ['RRR.R','R.R..','RRR..'], command: {tool:'paint',seeds:[p(0,0)],color:palette.B}, after:['BBB.R','B.B..','BBB..']},
  {name: 'paint transparent background leaves enclosed hole', before:['.....','.RRR.','.R.R.','.RRR.','.....'], command:{tool:'paint',seeds:[p(0,0)],color:palette.G},after:['GGGGG','GRRRG','GR.RG','GRRRG','GGGGG']},
  {name: 'paint four-connectivity does not join diagonal islands',before:['R.','.R'],command:{tool:'paint',seeds:[p(0,0)],color:palette.B},after:['B.','.R']},
  {name: 'paint explicit eight-connectivity',before:['R.','.R'],command:{tool:'paint',seeds:[p(0,0)],color:palette.B,connectivity:8},after:['B.','.B']},
  {name: 'paint multiple seeds is one gesture',before:['R.R'],command:{tool:'paint',seeds:[p(0,0),p(2,0)],color:palette.G},after:['G.G']},
  {name: 'paint outside seed is no-op without edge clamp',before:['RR'],command:{tool:'paint',seeds:[p(-1,0)],color:palette.G},after:['RR']},
  {name: 'line clipped through both sides',before:['.....','.....','.....'],command:{tool:'line',points:[p(-40,1.5),p(40,1.5)],color:red},after:['.....','RRRRR','.....']},
  {name: 'line diagonal pixel centers',before:['.....','.....','.....','.....','.....'],command:{tool:'line',points:[p(.5,.5),p(4.5,4.5)],color:red},after:['R....','.R...','..R..','...R.','....R']},
  {name: 'line single round dab width 2 inclusive circle boundary',before:['.....','.....','.....','.....','.....'],command:{tool:'line',points:[pixel],width:2,color:red},after:['.....','..R..','.RRR.','..R..','.....']},
  {name: 'line square brush width 2',before:['.....','.....','.....','.....','.....'],command:{tool:'line',points:[pixel],width:2,brush:'square',color:red},after:['.....','.RRR.','.RRR.','.RRR.','.....']},
  {name: 'line no pressure uses one times width',before:['.....','.....','.....','.....','.....'],command:{tool:'line',points:[pixel],width:2,color:red},after:['.....','..R..','.RRR.','..R..','.....']},
  {name: 'line pressure zero is 0.4 times width',before:['.....','.....','.....','.....','.....'],command:{tool:'line',points:[p(2.5,2.5,0)],width:2,color:red},after:['.....','.....','..R..','.....','.....']},
  {name: 'line pressure one is 1.6 times width',before:['.....','.....','.....','.....','.....'],command:{tool:'line',points:[p(2.5,2.5,1)],width:2,color:red},after:['.....','.RRR.','.RRR.','.RRR.','.....']},
  {name: 'line Shift horizontal projection',before:['.....','.....','.....'],command:{tool:'line',points:[p(.5,.5),p(4.5,1.5)],snap:'45',color:red},after:['RRRRR','.....','.....']},
  {name: 'line self crossing union composites once',before:['.....','.....','.....','.....','.....'],command:{tool:'line',points:[p(.5,.5),p(4.5,4.5),p(4.5,.5),p(.5,4.5)],color:palette.r},after:['r...r','.r.rr','..r.r','.r.rr','r...r']},
  {name: 'line duplicate points do not accumulate opacity',before:['...'],command:{tool:'line',points:[p(.5,.5),p(.5,.5),p(2.5,.5),p(2.5,.5)],color:palette.r},after:['rrr']},
  {name: 'curve default collinear interpolation',before:['.....','.....','.....'],command:{tool:'curve',points:[p(.5,1.5),p(2.5,1.5),p(4.5,1.5)],color:red},after:['.....','RRRRR','.....']},
  {name: 'curve one point is a dab',before:['...'],command:{tool:'curve',points:[p(1.5,.5)],color:red},after:['.R.']},
  {name: 'curve two points are a line',before:['...'],command:{tool:'curve',points:[p(.5,.5),p(2.5,.5)],color:red},after:['RRR']},
  {name: 'curve all duplicate points',before:['...'],command:{tool:'curve',points:[p(1.5,.5),p(1.5,.5),p(1.5,.5)],color:palette.r},after:['.r.']},
  {name: 'erase default hole mode',before:['RRR','RRR','RRR'],command:{tool:'erase',points:[p(1.5,1.5)]},after:['RRR','R.R','RRR']},
  {name: 'erase explicit merge preserves transparent holes',before:['RRR','R.R','RRR'],command:{tool:'erase',points:[p(1.5,1.5)],width:2,mode:'merge',color:palette.B},after:['RBR','B.B','RBR']},
  {name: 'erase auto boundary tie uses lexicographic RGBA',before:['.R.','BGB','.R.'],command:{tool:'erase',points:[p(1.5,1.5)],mode:'merge'},after:['.R.','BBB','.R.']},
  {name: 'cut default line separates two islands',before:['RRRRR','RRRRR','RRRRR'],command:{tool:'cut',points:[p(2.5,-1),p(2.5,4)]},after:['RR.RR','RR.RR','RR.RR']},
  {name: 'cut merge mode recolors only stripe',before:['RRRRR','RRRRR','RRRRR'],command:{tool:'cut',points:[p(2.5,-1),p(2.5,4)],mode:'merge',color:palette.G},after:['RRGRR','RRGRR','RRGRR']},
  {name: 'crop rectangle keep inside',before:['RRRR','RRRR','RRRR','RRRR'],command:{tool:'crop',from:p(1,1),to:p(3,3)},after:['....','.RR.','.RR.','....']},
  {name: 'crop rectangle keep outside with reversed corners',before:['RRRR','RRRR','RRRR','RRRR'],command:{tool:'crop',from:p(3,3),to:p(1,1),keep:'outside'},after:['RRRR','R..R','R..R','RRRR']},
  {name: 'crop ellipse inclusive boundary',before:['RRRRR','RRRRR','RRRRR','RRRRR','RRRRR'],command:{tool:'crop',from:p(.5,.5),to:p(4.5,4.5),shape:'ellipse'},after:['..R..','.RRR.','RRRRR','.RRR.','..R..']},
  {name: 'crop ellipse keep outside',before:['RRRRR','RRRRR','RRRRR','RRRRR','RRRRR'],command:{tool:'crop',from:p(.5,.5),to:p(4.5,4.5),shape:'ellipse',keep:'outside'},after:['RR.RR','R...R','.....','R...R','RR.RR']},
  {name: 'crop Shift square anchored to drag start',before:['RRRR','RRRR','RRRR','RRRR'],command:{tool:'crop',from:p(1,1),to:p(3,2),square:true},after:['....','.RR.','.RR.','....']},
  {name: 'crop fractional bounds and clipping',before:['RRR','RRR','RRR'],command:{tool:'crop',from:p(-10,-10),to:p(1.5,1.5)},after:['R..','...','...']},
  {name: 'crop zero area no-op',before:['RRR'],command:{tool:'crop',from:p(1,0),to:p(1,1)},after:['RRR']},
  {name: 'crop merge keeps canvas and alpha',before:['RRR','RRR','RRR'],command:{tool:'crop',from:p(1,1),to:p(2,2),mode:'merge',color:palette.G},after:['GGG','GRG','GGG']},
  {name: 'heal enclosed one-pixel hole auto',before:['RRR','R.R','RRR'],command:{tool:'heal',seeds:[p(1,1)]},after:['RRR','RRR','RRR']},
  {name: 'heal explicit color leaves other hole and tiny accent',before:['RRR.R','R.R..','RRR..','.....','..R..'],command:{tool:'heal',seeds:[p(1,1)],color:palette.G},after:['RRR.R','RGR..','RRR..','.....','..R..']},
  {name: 'heal two holes choose each enclosing color',before:['RRR.BBB','R.R.B.B','RRR.BBB'],command:{tool:'heal',seeds:[p(1,1),p(5,1)]},after:['RRR.BBB','RRR.BBB','RRR.BBB']},
  {name: 'heal boundary tie',before:['.R.','B.B','.R.'],command:{tool:'heal',seeds:[p(1,1)]},after:['.R.','BBB','.R.']},
  {name: 'heal brush targets only transparency',before:['R.R','...'],command:{tool:'heal',method:'brush',points:[p(1.5,.5)],color:palette.G},after:['RGR','...']},
  {name: 'heal exterior only when explicitly allowed',before:['R..'],command:{tool:'heal',seeds:[p(2,0)],allowExterior:true,color:palette.G},after:['RGG']},
  {name: 'heal all narrow gaps nearest endpoint and ties',before:['R..B.R...B'],command:{tool:'heal',method:'all-gaps',maxGapPx:3,pixelSizeMm:.1},after:['RRBBBRRBBB']},
  {name: 'heal all gaps threshold skips wider runs',before:['R.B.R..B'],command:{tool:'heal',method:'all-gaps',maxGapPx:1,pixelSizeMm:.1},after:['RBBBR..B']},
  {name: 'heal all gaps vertical pass',before:['R','.','.','B'],command:{tool:'heal',method:'all-gaps',maxGapPx:2,pixelSizeMm:.2},after:['R','R','B','B']},
  {name: 'heal all gaps explicit color',before:['R.B'],command:{tool:'heal',method:'all-gaps',maxGapPx:1,pixelSizeMm:.1,color:palette.G},after:['RGB']},
  {name: 'heal all gaps never deletes an opaque accent',before:['.....','..R..','.....'],command:{tool:'heal',method:'all-gaps',maxGapPx:4,pixelSizeMm:.1},after:['.....','..R..','.....']},
];
