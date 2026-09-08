import {parentPort,workerData} from 'node:worker_threads';
import {analyzeImage} from './image-codec.mjs';
try{parentPort.postMessage({value:analyzeImage(Buffer.from(workerData.bytes),workerData.mediaType,workerData.limits)});}
catch(e){parentPort.postMessage({error:/^IMAGE_[A-Z_]+$/.test(e?.code)?e.code:'IMAGE_INVALID'});}
