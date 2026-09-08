import type {SourceFrameClient,SourceFrameRequest,RasterFrameMetadata} from '../../src/core/source-frame.mjs';
import {encodeSourceFrame} from '../../src/core/source-frame.mjs';
declare const client:SourceFrameClient;
declare const source:Parameters<SourceFrameClient['sourceFrame']>[0];
const options:SourceFrameRequest={version:'arch-source-frame/1',sourceHash:'0'.repeat(64),matrix:[1,0,0,-1,-12.25,3.5]};
const output=await client.sourceFrame(source,options,{generation:1});
const pitch:1000000=output.metadata.sourceFrame.gridScalePerMm;
const bytes:Uint8Array=output.bytes();void bytes;void pitch;output.release();
const wire:Uint8Array=encodeSourceFrame(1,1,options);void wire;
declare const raster:RasterFrameMetadata;const axis:'x-right-y-down'=raster.axis;void axis;
// @ts-expect-error version is fixed
client.sourceFrame(source,{...options,version:'affine/2'},{generation:2});
// @ts-expect-error matrix has exactly6 entries
encodeSourceFrame(1,1,{...options,matrix:[1,0,0,1]});
// @ts-expect-error framed result has no STL bytes field
output.stl;
// @ts-expect-error source reference is owned reader shape, not numeric offset
client.sourceFrame(128,options,{generation:3});
