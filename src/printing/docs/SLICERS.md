# Slicer qualification, 2026-09-08

## Bambu Studio 02.08.02.60, P1S 0.4

Official portable:
[Windows ZIP](https://github.com/bambulab/BambuStudio/releases/download/v02.08.02.60/Bambu_Studio_win-v02.08.02.60-20260814163036.zip),
473014652 bytes, SHA-256
`85844d64a927ab36e3fd9bbef16da22adde1d25b3dcba4e8f58cef89db0c1291`.
Release-provided digest matched downloaded bytes. PE FileVersion 02.08.02.60.
License: [AGPL source](https://github.com/bambulab/BambuStudio/blob/v02.08.02.60/LICENSE).

Flags verified from [official CLI documentation](https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage)
and [exact-version source](https://github.com/bambulab/BambuStudio/blob/v02.08.02.60/src/BambuStudio.cpp).
Use --datadir and --outputdir absolute ownrun directories, --slice 0,
--export-3mf **basename**. Source concatenates outputdir and export filename;
passing absolute filename produced -13 despite having sliced successfully.
Logs retain that failed attempt separately. GUI wrapper reopens console handles,
so redirected stdout can be empty; result.json, output 3MF and G-code are evidence.

A model at the origin hit P1S bed exclusion and returned -64. We did not bypass
validation. An explicit analytic test translation (100,100,0) moved it into a
clear region; machine settings remained unchanged. Final two dry slices exited 0:
- adjacent 10 mm cubes, 20×10×10 total, slots 1/2, physical nozzle 1; cyan/black;
  first layer .16, regular .20, twelfth Z=2.36 mm;
- single 10 mm cube, slot 1, explicit user first-layer .25 despite profile .16;
  regular .20, twelfth Z=2.45 mm.

Independent readback checks exact version, P1S printer ID/nozzle, original X1C
process preset, colors, part slot inheritance, bounds and G-code Z comments.
G-code is parsed as text, never sent/executed on a printer. Generated thumbnail
shows the two adjacent colors; this is not manual layer-preview/physical evidence.

Bambu saves its own metadata conventions and drops printing-manifest.json.
Keep original artifact + external input/output SHA-256 custody record; do not
claim arbitrary attachment/source provenance survives slicer roundtrip.

## Snapmaker Orca 2.2.1, U1

Official portable:
[Windows ZIP](https://github.com/Snapmaker/OrcaSlicer/releases/download/v2.2.1/Snapmaker_Orca_Windows_V2.2.1_portable.zip),
143722568 bytes, SHA-256
`0a42a043d4e974e528b129e97121e84ee31009753cd5edfb7bd21ac7eba91752`.
Release digest matched; PE FileVersion 2.2.1.
License: [AGPL source](https://github.com/Snapmaker/OrcaSlicer/blob/v2.2.1/LICENSE.txt).

**CLI unverified, not launched.** [Windows entry](https://github.com/Snapmaker/OrcaSlicer/blob/v2.2.1/src/Snapmaker_Orca_app_msvc.cpp)
calls initSentry before CLI parsing; [Sentry implementation](https://github.com/Snapmaker/OrcaSlicer/blob/v2.2.1/src/sentry_wrapper/SentryWrapper.cpp)
uses SHGetFolderPathW(CSIDL_LOCAL_APPDATA) and a Snapmaker_Orca directory.
--datadir does not redirect that pre-CLI path. No verified build switch or runtime
option disabled it for this binary. Setting TEMP/APPDATA alone is not proof of
isolation, so the worker did not run it.

U1 adapter package generation, 4-slot/head mapping, .25/.20 schedule, XSD and
independent geometry readback did run in Node/native/three browser engines.
Negative u1-inconsistent-slots.3mf is rejected for refs 1–6 with only four slots;
it is never a golden. Two reference files share one geometry payload.

## Gates

Candidate Bambu evidence covers the two named analytic jobs. U1 target-slicer
slice/preview, manual layer inspection, broad profile remapping, general mesh/bed
validation and physical coupon/fit remain unverified. Full G5/G6 stay closed.
No printer connection, LAN scan, upload or physical print was performed.
