// Stable domain feature IDs for source datum extension 1. Parent's validated domain
// adapter maps these strings to C tags; no context pointer is persisted in JSON.
export const SOURCE_DATUM_EXTENSION_VERSION=1;
export const SOURCE_DATUMS=Object.freeze({
  'source:art.bottom':128,
  'source:rim.bottom':129,
  'source:flat.bottom':130,
  'source:recess.top':131,
  'source:core-cap.top':132,
  'source:text.bottom':133,
  'source:text-base.bottom':134,
});
export const SOURCE_HEIGHT_DATUMS=Object.freeze({
  artH:Object.freeze({noi:128,chim:131}),rimH:129,flatTop:130,bandCap:132,
  textHeight:133,textBaseHeight:134,
});

// Height/interval interpretation, independent of the frozen tag/layout extension.
export const SOURCE_HEIGHT_SEMANTICS_VERSION=2;
