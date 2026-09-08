# Integration API

Import `materializeSourceLibrary` from `src/integration/source-library.mjs`.
The host loads the checked configuration JSON and chooses its deployment origin
and base path explicitly:

```js
import {materializeSourceLibrary} from './src/integration/source-library.mjs';
import {createSourceCatalog} from './src/integration/source-catalog.mjs';

// Host-loaded deployment/source-library/{catalog,deployment}.json:
const sourceLibrary = materializeSourceLibrary({
  catalog,
  manifest: deployment,
  origin: location.origin,
  basePath: '/arch/',
});
const catalogService = createSourceCatalog(sourceLibrary);

// Supply sourceLibrary to the existing application composition.
// The existing Engine owns its one Module and root runtime.
// This function does not fetch, instantiate or reset any runtime.
```

The return value is exactly `{catalog,assetURLs,origin}`. Its catalog is an owned
structured clone. The existing `createSourceCatalog` performs the font/collection
contract validation and supplies queries, font and emoji lookup. Current main
`createApplication` accepts this object through its `sourceLibrary` option.
The host still supplies its existing context, source adoption, compositor and
engine configuration. No fixture, controller, client, root or renderer file is replaced.

`origin` is an exact HTTP(S) origin without credentials, path, query or fragment.
`basePath` is `/` or an explicit safe path with leading/trailing slash.
A record URL such as `source-assets/<sha256>.png` becomes
`https://host/arch/source-assets/<sha256>.png`. The deployment directory must be
served at that chosen base. Do not use a development filesystem path as a URL.

`arch-source-deployment/1` records are:

```ts
{
  sha256: string; bytes: number; mediaType: string;
  file: string;               // checked repository-relative original/derived path
  url: string;                // safe relative deployed path
  originalFiles: string[];    // every source file sharing these exact bytes
  roles: string[];
}
```

Only source-assets/<exact SHA-256>.<media extension> URLs are accepted; the config/ready namespace is reserved.

The top level records `totalUniqueBytes` and `sourceFileCount`. Validation rejects
unsafe paths, percent-encoded traversal/separators, Windows device names, conflicting
source paths, duplicate digest/URL mappings, missing or wrong-media references,
incorrect sizes and missing preview coverage. Caps: 65,536 resources/source paths,
16,000,000 encoded bytes per asset, 512 MiB total unique asset bytes, 256 fonts,
16 collections and 32,768 combined picker/component entries. These are build-config
bounds; the decoder and manufacturing runtime retain their own stricter limits.

`file` and `originalFiles` are build metadata, not user-visible filesystem paths.
Original font records preserve family, style, variation axes/defaults, measured
coverage, source revision and license. Each font adds `library.file`,
`library.licenseFile` and a verified `license.asset` digest/length reference.

Collection defaults come from `src/assets/emoji/collections.json`: color selects
`noto-colrv1` as `COLRv1`, mono selects `notoemoji` as `outline`.
Every color font is retained in `fonts` and `selectionOptions`. To offer an optional
variant, the host must check the referenced `font-coverage.json` binding for the
chosen item before changing that collection's explicit selection and revalidating.
A no-flags or flags-only font is not a complete fallback. Unsupported IDs and reasons
stay recorded. An original preview does not prove that another geometry selection
will reproduce it pixel-for-pixel.

Preview references have `collectionId,itemId,sha256,bytes,sourceKind,width,height`.
Original color records include their original path. Mono records identify the source
font/variation/outline hashes; full shaping and raster evidence is in
`mono-thumbnails.json`. All glyph outlines, including holes and disconnected ink,
come from the original font at wght 400. The thumbnail setting does not restrict the
source font's original 300–700 variation range.

Search labels preserve exact Vietnamese CLDR TTS and keyword strings, with per-row
source file/key and measured coverage. FE0F removal is used only as an annotation
lookup for a known canonical catalog token. It never rewrites user input. Existing
catalog search handles accent-insensitive lookup while returning proper Vietnamese.

`artwork.json` is an `arch-source-artwork-library/1` object; all items explicitly
declare `separate-artwork-adapter-required`. It preserves gradients, clipping,
embedded raster and foreignObject metadata. It does not feed arbitrary artwork
through emoji selection or silently rasterize unsupported source features.

The deployment tool copies every verified asset under its content-addressed URL,
then copies four config files and writes `source-library/ready.json` last. That
marker records hashes for all 21,395 deployed files. An interrupted/mismatched build
has no ready marker and must not be published. The host owns atomic publication.
A ready directory is immutable to the copier; use a fresh directory for another
version. The full deployment is 306,260,612 unique asset bytes plus config JSON.
Consumers fetch only selected resources; the manifest does not preload all fonts.

Public types also cover the deployment, artwork, CLDR lock/labels, mono preview,
font coverage and build receipt. There are no pointers, mesh JSON or ephemeral
runtime handles in this library configuration.
