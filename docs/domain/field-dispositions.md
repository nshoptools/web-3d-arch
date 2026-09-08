# Field-level disposition — 126 catalog fields + 2 replacements

Sinh từ schema.mjs; source/default/provenance, bounds và metadata đầy đủ nằm trong field-dispositions.json. keep-value dùng cho enum/boolean/count không có đơn vị mm; bốn disposition trong spec dành cho chuyển đổi vật lý. Không field nào suy layers từ bamLopIn. Các field Z giữ mm, có API to-layers(datum,rounding) sau chấp nhận.

| ID | Group / scope | Disposition / target | Default | Domain / grid | UI increment | Dependencies | Meaning / blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| k | color / common | keep-value → k | 4 | 2…16; q=1 | 1 | [] | Target material/color count; segmentation and profile slot capacity are separate. [O-02/segmentation-palette] |
| res | color / common | keep-value → res | "520" | 360, 520, 720, 960, 1280 | — | [] | Raster processing resolution in pixels; never mechanical precision. |
| smooth | color / common | keep-value → smooth | 3 | 0…6; q=1 | 1 | [] | Raster region smoothing candidate strength index. [O-02/smoothing-definition] |
| minA | color / common | keep-value → minA | 5 | 0…100; q=1 | 1 | [] | Small raster region merge candidate threshold; area unit not established. [O-02/area-threshold-unit] |
| denoise | color / common | keep-value → denoise | 1 | 0…3; q=1 | 1 | [] | Raster denoise candidate strength index. [O-02/denoise-definition] |
| eps | color / common | keep-value → eps | 35 | 0…100; q=1 | 1 | [] | Contour simplification candidate index; not a physical tolerance. [O-02/contour-tolerance-map] |
| tension | color / common | keep-value → tension | 65 | 0…100; q=1 | 1 | [] | Curve smoothing candidate index; not a curvature guarantee. [O-02/curve-tension-map] |
| size | shape / common | keep-mm → size | 45 | 12…160; q=0.000001 | 1 | [] | Long edge of source-derived design in mm, before required fit adjustments. [O-02/source-bounds] |
| outline | shape / common | keep-value → outline | "silhouette" | silhouette, round, circle, square | — | [] | Base footprint construction family. [O-02/footprint-geometry] |
| cornerR | shape / common | keep-mm → cornerR | 3 | 0…14; q=0.000001 | 0.5 | [{"id":"outline","oneOf":["round"]}] | Rounded-frame XY corner radius in mm. [O-02/corner-bounds] |
| offset | shape / common | keep-mm → offset | 1.5 | 0…8; q=0.000001 | 0.1 | [] | Outward footprint offset distance in mm. [O-02/offset-topology] |
| weld | shape / common | keep-mm → weld | 0.8 | 0…5; q=0.000001 | 0.1 | [] | Candidate bridging distance for disconnected features in mm. [O-02/bridge-definition] |
| minFeature | shape / common | keep-mm → minFeature | 0.6 | 0.2…4; q=0.000001 | 0.1 | [] | Minimum retained source feature width in mm. [O-02/feature-measure] |
| fillHoles | shape / common | keep-value → fillHoles | true | {"kind":"boolean"} | — | [] | Fill base interior holes; does not discard original source holes. [O-02/base-hole-scope] |
| topBevel | shape / common | keep-value → topBevel | false | {"kind":"boolean"} | — | [] | Enable top bevel default on generated blocks. [O-02/bevel-geometry] |
| topBevelR | shape / common | keep-mm → topBevelR | 0.6 | 0.2…3; q=0.000001 | 0.1 | [{"id":"topBevel","equals":true}] | Physical top edge radius/chamfer size; not layer count. [O-02/bevel-shape-metric] |
| topBevelShape | shape / common | keep-value → topBevelShape | "tron" | tron, vat, bac | — | [{"id":"topBevel","equals":true}] | Round/chamfer45/stepped bevel family. [O-02/bevel-shape-contract] |
| bevelGop | shape / common | keep-value → bevelGop | false | {"kind":"boolean"} | — | [{"id":"topBevel","equals":true}] | Union eligible disconnected regions before bevel. [O-02/bevel-union-scope] |
| bevelChu | shape / common | keep-value → bevelChu | false | {"kind":"boolean"} | — | [{"id":"topBevel","equals":true}] | Apply bevel to text strokes and text base. [O-02/text-bevel-support] |
| topBevelSeg | shape / common | keep-value → topBevelSeg | 3 | 1…12; q=1 | 1 | [{"id":"topBevel","equals":true},{"id":"topBevelShape","oneOf":["bac"]}] | Integer number of visible bevel steps, not mesh precision. [O-02/step-datum] |
| layerH | height / schedule | keep-mm → layerH | 0.2 | 0.08…0.3; q=0.000001 | — | [] | Regular layer height alias into the authoritative project schedule. |
| layerStep | height / common | keep-value → layerStep | 3 | 1…10; q=1 | 1 | [] | Quick increment in layer counts; UI preference without geometric effect. |
| baseH | height / product | keep-mm → baseH | {"heightMode":"mm","mm":2.4} | 0.6…24; q=0.000001 | 0.2 | [] ; constraints=connector-positive-roof | Body/base nominal thickness; layer conversion requires an explicit lower surface datum. [O-02/body-datum] |
| plateT | height / product | keep-mm → plateT | {"heightMode":"mm","mm":1.6} | 0.8…5; q=0.000001 | 0.2 | [] | Keycap top plate thickness measured from its lower surface. [O-02/cap-plate-datum] |
| artMode | height / common | keep-value → artMode | "noi" | noi, chim, phang, phang2 | — | [] | Raised/recessed/flat1/flat2 artwork composition family. [O-02/art-mode-formulas] |
| flatTop | height / common | keep-mm → flatTop | {"heightMode":"mm","mm":1} | 0.2…6; q=0.000001 | 0.1 | [{"id":"artMode","oneOf":["phang","phang2"]}] | Upper color thickness in flat artwork modes. [O-02/flat-color-datum] |
| artH | height / common | keep-mm → artH | {"heightMode":"mm","mm":0.8} | 0.2…6; q=0.000001 | 0.1 | [{"id":"artMode","oneOf":["noi","chim"]}] | Artwork relief height or recess depth; mode selects sign and reference surface. [O-02/art-relief-datum] |
| rimOn | height / product | keep-value → rimOn | false | {"kind":"boolean"} | — | [] | Enable distinct colored support under artwork. [O-02/rim-scope] |
| rimH | height / product | keep-mm → rimH | {"heightMode":"mm","mm":0.6} | 0.2…6; q=0.000001 | 0.1 | [{"id":"rimOn","equals":true}] | Colored artwork support thickness, separate from body thickness. [O-02/rim-datum] |
| splitObj | height / common | keep-value → splitObj | true | {"kind":"boolean"} | — | [{"id":"artMode","oneOf":["noi"]}] | Enable individual artwork object heights in raised mode. [O-02/object-height-schema] |
| layerBand | height / common | keep-value → layerBand | false | {"kind":"boolean"} | — | [] | Use height bands for material allocation. [O-02/band-region-mapping] |
| bandCore | height / common | keep-value → bandCore | false | {"kind":"boolean"} | — | [{"id":"layerBand","equals":true}] | Use base material for eligible inner core volume. [O-02/core-material-partition] |
| bandCap | height / common | keep-mm → bandCap | {"heightMode":"mm","mm":0.6} | 0.2…3; q=0.000001 | 0.1 | [{"id":"layerBand","equals":true},{"id":"bandCore","equals":true}] | Thickness of upper color over a base-material core. [O-02/core-cap-datum] |
| ringOn | keyring / product | keep-value → ringOn | true | {"kind":"boolean"} | — | [] | Enable the keychain eyelet. |
| ringOuterD | keyring / product | keep-mm → ringOuterD | 8 | 4…18; q=0.000001 | 0.5 | [{"id":"ringOn","equals":true}] ; constraints=eyelet-positive-wall | Nominal eyelet outside diameter; must exceed bore diameter. [O-02/eyelet-strength] |
| ringInnerD | keyring / product | keep-mm → ringInnerD | 4 | 1.5…10; q=0.000001 | 0.1 | [{"id":"ringOn","equals":true}] ; constraints=eyelet-positive-wall | Nominal eyelet bore diameter. [O-02/eyelet-fit] |
| ringTren | keyring / product | keep-value → ringTren | "hinh" | hinh, chu | — | [{"id":"ringOn","equals":true}] | Attach eyelet to image or text semantic host. [O-02/eyelet-host-resolution] |
| ringAngle | keyring / product | keep-value → ringAngle | 90 | 0…360; q=0.000001 | 1 | [{"id":"ringOn","equals":true}] | Eyelet position angle in degrees around chosen host. [O-02/eyelet-angle-frame] |
| ringOverlap | keyring / product | keep-mm → ringOverlap | 1.5 | 0…10; q=0.000001 | 0.1 | [{"id":"ringOn","equals":true}] | Eyelet/body overlap distance in mm. [O-02/eyelet-contact] |
| ringH | keyring / product | keep-mm → ringH | {"heightMode":"auto","mode":"body-height"} | 0…24; q=0.000001 | 0.2 | [{"id":"ringOn","equals":true}] | Eyelet thickness; explicit auto body-height enum replaces legacy numeric zero. [O-02/eyelet-datum] |
| legoOn | brick / product | keep-value → legoOn | true | {"kind":"boolean"} | — | [] | Enable bottom connector bores. |
| legoPitch | brick / product | keep-mm → legoPitch | 8 | 4…32; q=0.000001 | 0.1 | [{"id":"legoOn","equals":true}] | Nominal center-to-center connector grid pitch. [O-02/hardware-fit] |
| legoHoleD | brick / product | keep-mm → legoHoleD | 4.9 | 1…12; q=0.000001 | 0.1 | [{"id":"legoOn","equals":true}] | Nominal bore diameter before separately specified clearance. [O-02/hardware-fit] |
| legoHoleH | brick / product | keep-mm → legoHoleH | {"heightMode":"mm","mm":1.8} | 0.4…6; q=0.000001 | 0.1 | [{"id":"legoOn","equals":true}] ; constraints=connector-positive-roof | Nominal bore depth from bore opening face; not implicitly nine layers. [O-02/bore-datum] |
| legoThua | brick / product | keep-value → legoThua | "du" | du, nua, tu | — | [{"id":"legoOn","equals":true}] | Full/checkerboard/quarter grid mask. [O-02/grid-mask-phase] |
| legoHoDu | brick / product | keep-mm → legoHoDu | 0.3 | 0…1.5; q=0.000001 | 0.05 | [{"id":"legoOn","equals":true},{"id":"legoThua","oneOf":["nua","tu"]}] | Positive extra clearance in sparse-grid mode; side/diameter convention pending. [O-02/clearance-convention] |
| legoWall | brick / product | keep-mm → legoWall | 0.8 | 0.4…4; q=0.000001 | 0.1 | [{"id":"legoOn","equals":true}] | Nominal lateral wall thickness around bores. [O-02/bore-wall-topology] |
| legoRong | brick / product | keep-value → legoRong | false | {"kind":"boolean"} | — | [{"id":"legoOn","equals":true}] | Hollow base while retaining walls around bores. [O-02/hollow-roof] |
| legoOffX | brick / product | keep-mm → legoOffX | 0 | -20…20; q=0.000001 | 0.1 | [{"id":"legoOn","equals":true}] | Grid translation on design X in mm. [O-02/grid-frame] |
| legoOffY | brick / product | keep-mm → legoOffY | 0 | -20…20; q=0.000001 | 0.1 | [{"id":"legoOn","equals":true}] | Grid translation on design Y in mm. [O-02/grid-frame] |
| legoXeOn | brick / product | keep-value → legoXeOn | false | {"kind":"boolean"} | — | [{"id":"legoOn","equals":true}] | Enable cross-shaped flexure cuts around bores. [O-02/flexure-fatigue] |
| legoXeW | brick / product | keep-mm → legoXeW | 0.6 | 0.2…2; q=0.000001 | 0.1 | [{"id":"legoOn","equals":true},{"id":"legoXeOn","equals":true}] | Cross-cut width in mm. [O-02/flexure-fatigue] |
| legoTaiOn | brick / product | keep-value → legoTaiOn | false | {"kind":"boolean"} | — | [{"id":"legoOn","equals":true}] | Enable breakaway alignment tabs. [O-02/tab-strength] |
| legoTaiW | brick / product | keep-mm → legoTaiW | 2.4 | 0.6…6; q=0.000001 | 0.1 | [{"id":"legoOn","equals":true},{"id":"legoTaiOn","equals":true}] ; constraints=tab-neck-within-width | Tab width in mm. |
| legoTaiL | brick / product | keep-mm → legoTaiL | 12 | 3…30; q=0.000001 | 0.5 | [{"id":"legoOn","equals":true},{"id":"legoTaiOn","equals":true}] | Tab length in mm. |
| legoTaiCo | brick / product | keep-mm → legoTaiCo | 1.2 | 0.4…3; q=0.000001 | 0.1 | [{"id":"legoOn","equals":true},{"id":"legoTaiOn","equals":true}] ; constraints=tab-neck-within-width | Breakaway neck width; must not exceed tab width. [O-02/tab-strength] |
| legoRanhOn | brick / product | keep-value → legoRanhOn | true | {"kind":"boolean"} | — | [{"id":"legoOn","equals":true}] | Enable semicircular perimeter groove. [O-02/groove-geometry] |
| legoRanhR | brick / product | keep-mm → legoRanhR | 0.8 | 0.2…3; q=0.000001 | 0.1 | [{"id":"legoOn","equals":true},{"id":"legoRanhOn","equals":true}] | Groove circle radius in mm. [O-02/groove-clearance] |
| legoRanhZ | brick / product | keep-mm → legoRanhZ | 0 | 0…20; q=0.000001 | 0.1 | [{"id":"legoOn","equals":true},{"id":"legoRanhOn","equals":true}] | Groove center coordinate; legacy zero has no proven auto meaning. [O-02/groove-datum-zero] |
| charmGan | charm / product | keep-value → charmGan | "roi" | roi, lien | — | [] | Separate or integral retaining button assembly. [O-02/charm-assembly] |
| charmCoD | charm / product | keep-mm → charmCoD | 12.5 | 4…24; q=0.000001 | 0.1 | [] ; constraints=charm-retaining-flange | Nominal neck diameter through sandal hole. [O-02/hardware-fit] |
| charmCoH | charm / product | keep-mm → charmCoH | {"heightMode":"mm","mm":3} | 0.6…12; q=0.000001 | 0.1 | [] | Nominal neck height matching strap thickness; retain mm. [O-02/charm-neck-datum] |
| charmVanhD | charm / product | keep-mm → charmVanhD | 14.5 | 5…28; q=0.000001 | 0.1 | [] ; constraints=charm-retaining-flange | Nominal retaining flange diameter; exceeds neck diameter. [O-02/hardware-fit] |
| charmVanhH | charm / product | keep-mm → charmVanhH | {"heightMode":"mm","mm":1.6} | 0.4…6; q=0.000001 | 0.1 | [] | Nominal retaining flange thickness; retain mm. [O-02/charm-flange-datum] |
| charmVat | charm / product | keep-mm → charmVat | 0.8 | 0…3; q=0.000001 | 0.1 | [] | Lead-in bevel distance at retaining flange. [O-02/charm-bevel-metric] |
| charmChotD | charm / product | keep-mm → charmChotD | 6 | 2…20; q=0.000001 | 0.1 | [{"id":"charmGan","oneOf":["roi"]}] | Nominal separate-button mating pin diameter. [O-02/hardware-fit] |
| charmChotH | charm / product | keep-mm → charmChotH | {"heightMode":"mm","mm":2} | 0.6…8; q=0.000001 | 0.1 | [{"id":"charmGan","oneOf":["roi"]}] | Nominal insertion depth of separate pin/socket pair. [O-02/charm-pin-datum] |
| charmClr | charm / product | keep-mm → charmClr | 0.2 | 0…0.8; q=0.000001 | 0.05 | [{"id":"charmGan","oneOf":["roi"]}] | Positive socket-pin clearance; radial/diametral convention pending. [O-02/clearance-convention] |
| charmRap | charm / product | keep-value → charmRap | false | {"kind":"boolean"} | — | [{"id":"charmGan","oneOf":["roi"]}] | Assembly view preference; does not change manufacturing geometry. |
| charmOffX | charm / product | keep-mm → charmOffX | 0 | -60…60; q=0.000001 | 0.5 | [] | Button displacement in design X in mm. [O-02/button-frame] |
| charmOffY | charm / product | keep-mm → charmOffY | 0 | -60…60; q=0.000001 | 0.5 | [] | Button displacement in design Y in mm. [O-02/button-frame] |
| strapD | strap / product | keep-mm → strapD | 4 | 2…12; q=0.000001 | 0.1 | [] | Nominal circular hole diameter, used in explicit tessellation-bound migration. [O-02/hardware-fit] |
| strapAngle | strap / product | keep-value → strapAngle | 0 | 0…180; q=0.000001 | 5 | [] | Tube direction angle in degrees; frame must be resolved. [O-02/tube-angle-frame] |
| strapZ | strap / product | keep-mm → strapZ | 5 | 1…20; q=0.000001 | 0.2 | [] | Tube center coordinate in mm; never layer-snapped. [O-02/tube-center-datum] |
| strapOff | strap / product | keep-mm → strapOff | 0 | -30…30; q=0.000001 | 0.5 | [] | Signed displacement of hole from design center. [O-02/tube-offset-axis] |
| strapSlot | strap / product | keep-mm → strapSlot | 0 | 0…24; q=0.000001 | 0.5 | [] | Additional slot extension; zero means circular, never auto. [O-02/slot-length-convention] |
| strapSlotDir | strap / product | keep-value → strapSlotDir | "ngang" | ngang, doc | — | [{"id":"strapSlot","greaterThan":0}] | Slot extension direction on design axes. [O-02/slot-frame] |
| strapCham | strap / product | keep-mm → strapCham | 0.6 | 0…2; q=0.000001 | 0.1 | [] | Hole entry chamfer distance; zero disables bevel. [O-02/tube-bevel-metric] |
| strapSeg | strap / product | replace-capability → strapTolerance | 18 | 6…40; q=2 | 2 | [] | Legacy segment count retained as provenance; migrate only with declared circular tessellation convention. [O-02/tessellation-convention] |
| rotObj | strap / product | keep-value → rotObj | 0 | 0…355; q=0.000001 | 5 | [] | Whole design rotation in degrees. [O-02/object-rotation-frame] |
| skirtH | cap / product | keep-mm → skirtH | {"heightMode":"mm","mm":0} | 0…16; q=0.000001 | 0.5 | [] | Nominal cap skirt height; zero meaning unresolved, preserved without claiming auto. [O-02/skirt-zero-semantics] |
| wallT | cap / product | keep-mm → wallT | 1.6 | 0.6…4; q=0.000001 | 0.1 | [] | Nominal keycap side-wall thickness. [O-02/wall-topology] |
| rib | cap / product | keep-mm → rib | 1.2 | 0…4; q=0.000001 | 0.1 | [] | Nominal reinforcement rib thickness; zero disables ribs. [O-02/rib-topology] |
| crossL | stem / product | keep-mm → crossL | 4.1 | 3…6; q=0.000001 | 0.05 | [] ; constraints=mx-cross-aspect | Nominal MX cross branch length. [O-02/hardware-fit] |
| crossW | stem / product | keep-mm → crossW | 1.35 | 0.8…2; q=0.000001 | 0.01 | [] ; constraints=mx-cross-aspect | Nominal MX cross branch width. [O-02/hardware-fit] |
| clr | stem / product | keep-mm → clr | 0.05 | 0…0.4; q=0.000001 | 0.02 | [] | Positive MX cavity enlargement; one-sided versus total-width convention pending. [O-02/clearance-convention] |
| socketD | stem / product | keep-mm → socketD | {"heightMode":"mm","mm":5.5} | 2…9; q=0.000001 | 0.1 | [] | Nominal MX socket depth 5.50 mm; no implicit layer conversion. [O-02/socket-datum] |
| postH | stem / product | keep-mm → postH | {"heightMode":"mm","mm":7} | 3…12; q=0.000001 | 0.1 | [] | Nominal MX post height 7.00 mm. [O-02/post-datum] |
| postD1 | stem / product | keep-mm → postD1 | 5.7 | 4…10; q=0.000001 | 0.05 | [] | Nominal main post diameter. [O-02/hardware-fit] |
| postD2 | stem / product | keep-mm → postD2 | 6 | 4…11; q=0.000001 | 0.05 | [] | Nominal collar diameter at cap. |
| collarH | stem / product | keep-mm → collarH | {"heightMode":"mm","mm":1.85} | 0…5; q=0.000001 | 0.05 | [] | Nominal collar height 1.85 mm; retain fractional layer amount. [O-02/collar-datum] |
| stemH | stem / product | keep-mm → stemH | {"heightMode":"mm","mm":3.6} | 1…12; q=0.000001 | 0.05 | [] | Nominal switch stem projection above switch top plane. [O-02/switch-top-datum] |
| linkBody | tray / product | keep-value → linkBody | true | {"kind":"boolean"} | — | [] | Auto material sharing for body/skirt/post/ribs; preserve user role overrides. [O-02/role-material-schema] |
| housing | tray / product | keep-value → housing | true | {"kind":"boolean"} | — | [] | Include a separately printable switch tray. |
| autoSize | tray / product | keep-value → autoSize | true | {"kind":"boolean"} | — | [{"id":"housing","equals":true}] | Permit a proposed atomic fit adjustment; not an automatic scalar setter. [O-02/fit-adjustment-command] |
| plateHole | tray / product | keep-mm → plateHole | 14.05 | 13.2…15.5; q=0.000001 | 0.05 | [{"id":"housing","equals":true}] ; constraints=tray-mouth-cavity | Nominal switch-body cavity width 14.05 mm. [O-02/hardware-fit] |
| hSocketD | tray / product | keep-mm → hSocketD | {"heightMode":"mm","mm":5.15} | 3…9; q=0.000001 | 0.05 | [{"id":"housing","equals":true}] | Nominal body-cavity depth measured from opening. [O-02/tray-socket-datum] |
| hMouth | tray / product | keep-mm → hMouth | 15.4 | 14.5…20; q=0.000001 | 0.1 | [{"id":"housing","equals":true}] ; constraints=tray-mouth-cavity | Tray cavity mouth width supporting switch shoulder. [O-02/hardware-fit] |
| hRecess | tray / product | keep-mm → hRecess | {"heightMode":"mm","mm":2} | 1.5…10; q=0.000001 | 0.1 | [{"id":"housing","equals":true}] | Nominal switch recess depth from tray reference plane. [O-02/tray-recess-datum] |
| pinW | tray / product | keep-mm → pinW | 11.5 | 8…14; q=0.000001 | 0.1 | [{"id":"housing","equals":true}] | Nominal switch-pin cavity width. [O-02/hardware-fit] |
| pinD | tray / product | keep-mm → pinD | {"heightMode":"mm","mm":1.7} | 0.5…6; q=0.000001 | 0.1 | [{"id":"housing","equals":true}] | Nominal switch-pin cavity depth 1.7 mm, retained exactly. [O-02/tray-pin-datum] |
| hFloor | tray / product | keep-mm → hFloor | {"heightMode":"mm","mm":1.5} | 0.8…6; q=0.000001 | 0.1 | [{"id":"housing","equals":true}] | Nominal closed tray floor thickness. [O-02/tray-floor-datum] |
| hWall | tray / product | keep-mm → hWall | 2 | 1…6; q=0.000001 | 0.1 | [{"id":"housing","equals":true}] | Nominal outer tray wall thickness. |
| hBossW | tray / product | keep-mm → hBossW | 2 | 1…6; q=0.000001 | 0.1 | [{"id":"housing","equals":true}] | Nominal wall thickness around switch cavity. |
| gap | tray / product | keep-mm → gap | 0.25 | 0.05…0.8; q=0.000001 | 0.05 | [{"id":"housing","equals":true}] | Positive cap-to-tray wall gap; side/total convention pending. [O-02/clearance-convention] |
| rimOver | tray / product | keep-mm → rimOver | 0 | -10…6; q=0.000001 | 0.1 | [{"id":"housing","equals":true}] | Signed wall-top difference relative to cap top in mm; zero is coplanar. [O-02/wall-top-datum] |
| travel | tray / product | keep-mm → travel | 4.2 | 2…8; q=0.000001 | 0.1 | [{"id":"housing","equals":true}] | Nominal physical switch travel, never quantized to print layers. [O-02/hardware-fit] |
| hStopOn | tray / product | keep-value → hStopOn | true | {"kind":"boolean"} | — | [{"id":"housing","equals":true}] | Enable end-of-travel anti-tilt ledge. [O-02/travel-stop-interaction] |
| hStopW | tray / product | keep-mm → hStopW | 1.5 | 0.4…4; q=0.000001 | 0.1 | [{"id":"housing","equals":true},{"id":"hStopOn","equals":true}] | Stop ledge width in mm. [O-02/travel-stop-interaction] |
| hRingOn | tray / product | keep-value → hRingOn | false | {"kind":"boolean"} | — | [{"id":"housing","equals":true}] | Enable hanging eyelet on tray. |
| hRingH | tray / product | keep-mm → hRingH | {"heightMode":"mm","mm":6} | 1…30; q=0.000001 | 0.5 | [{"id":"housing","equals":true},{"id":"hRingOn","equals":true}] | Nominal tray eyelet height; explicit datum pending. [O-02/tray-eyelet-datum] |
| hRingOuterD | tray / product | keep-mm → hRingOuterD | 8 | 4…18; q=0.000001 | 0.5 | [{"id":"housing","equals":true},{"id":"hRingOn","equals":true}] ; constraints=tray-eyelet-positive-wall | Tray eyelet outside diameter; must exceed bore. |
| hRingInnerD | tray / product | keep-mm → hRingInnerD | 4 | 1.5…10; q=0.000001 | 0.1 | [{"id":"housing","equals":true},{"id":"hRingOn","equals":true}] ; constraints=tray-eyelet-positive-wall | Tray eyelet bore diameter. [O-02/eyelet-fit] |
| hRingAngle | tray / product | keep-value → hRingAngle | 90 | 0…360; q=0.000001 | 1 | [{"id":"housing","equals":true},{"id":"hRingOn","equals":true}] | Tray eyelet angle around tray host. [O-02/tray-eyelet-frame] |
| hRingOverlap | tray / product | keep-mm → hRingOverlap | 1.5 | 0…10; q=0.000001 | 0.1 | [{"id":"housing","equals":true},{"id":"hRingOn","equals":true}] | Tray eyelet overlap distance into rim. [O-02/tray-eyelet-contact] |
| assemble | tray / product | keep-value → assemble | false | {"kind":"boolean"} | — | [{"id":"housing","equals":true}] | Keycap/tray assembly view preference; no manufacturing transform. |
| impOn | imported_mesh / common | keep-value → impOn | false | {"kind":"boolean"} | — | [] | Enable imported STL/OBJ feature on all five products. [O-02/mesh-input-oracle] |
| impOp | imported_mesh / common | keep-value → impOp | "them" | them, han, tru | — | [{"id":"impOn","equals":true}] | Separate part / union / subtract feature on mesh-scene branch. [O-02/mesh-csg] |
| impScale | imported_mesh / common | keep-value → impScale | 100 | 1…400; q=0.000001 | 0.5 | [{"id":"impOn","equals":true}] | Uniform scale percentage applied to declared source units. [O-02/mesh-transform-units] |
| impX | imported_mesh / common | keep-mm → impX | 0 | -80…80; q=0.000001 | 0.1 | [{"id":"impOn","equals":true}] | Imported part X translation in mm; preserve original bytes. [O-02/mesh-transform-bounds] |
| impY | imported_mesh / common | keep-mm → impY | 0 | -80…80; q=0.000001 | 0.1 | [{"id":"impOn","equals":true}] | Imported part Y translation in mm; preserve original bytes. [O-02/mesh-transform-bounds] |
| impZ | imported_mesh / common | keep-mm → impZ | 0 | -60…60; q=0.000001 | 0.1 | [{"id":"impOn","equals":true}] | Imported mesh Z translation in mm; never snap vertices to layers. [O-02/mesh-transform-bounds] |
| impRX | imported_mesh / common | keep-value → impRX | 0 | 0…355; q=0.000001 | 1 | [{"id":"impOn","equals":true}] | Imported mesh rotation around X, in degrees. [O-02/mesh-transform-order] |
| impRY | imported_mesh / common | keep-value → impRY | 0 | 0…355; q=0.000001 | 1 | [{"id":"impOn","equals":true}] | Imported mesh rotation around Y, in degrees. [O-02/mesh-transform-order] |
| impRZ | imported_mesh / common | keep-value → impRZ | 0 | 0…355; q=0.000001 | 1 | [{"id":"impOn","equals":true}] | Imported mesh rotation around Z, in degrees. [O-02/mesh-transform-order] |
| impVox | imported_mesh / common | replace-capability → meshJoinTolerance | 0.25 | 0.1…1; q=0.000001 | 0.05 | [] | Retired voxel cell size, replaced by a separately selected mesh error-bound capability. [O-02/mesh-tolerance-definition] |
| meshJoinTolerance | imported_mesh / common | replace-capability → meshJoinTolerance | {"mode":"unselected"} | {"kind":"tagged-union","modes":["unselected","selected"],"minExclusive":0,"quantum":0.000001} | 0.000001 | [{"id":"impOn","equals":true},{"id":"impOp","oneOf":["han","tru"]}] | Requested upper bound on mesh surface deviation; requires a versioned kernel capability and ledger. [O-01/mesh-tolerance-definition] |
| strapTolerance | strap / product | replace-capability → strapTolerance | {"mode":"unselected"} | {"kind":"tagged-union","modes":["unselected","selected"],"minExclusive":0,"quantum":0.000001} | 0.000001 | [] | Maximum radial inward deviation for a declared circular tessellation convention. [O-02/tessellation-convention] |

Mọi giá trị fit/hardware là unverified. geometry.generate/CSG unsupported trong module này. Applicability từng nguồn/sản phẩm, enum auto và datum policy được công bố trong JSON.
