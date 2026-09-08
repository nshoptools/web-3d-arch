// Optional small Dedicated Worker adapter. CPU implementation has no hidden file/network I/O.
import {VERSION, LIMITS, createEditor, EditError} from './index.mjs';
import {keys, identifier, choice, fail} from './contract.mjs';
let editor = null, initializing = false;
function transfers(result) {
  const set = new Set();
  if (result?.image?.data) set.add(result.image.data.buffer);
  if (result?.undo) { set.add(result.undo.before.buffer); set.add(result.undo.after.buffer); }
  return [...set];
}
self.onmessage = async ({data: request}) => {
  let requestId = null;
  try {
    keys(request, ['type', 'requestId', 'input', 'command', 'gestureId', 'expected', 'payload', 'direction', 'original', 'control'], 'worker request');
    requestId = identifier(request.requestId, 'requestId');
    const type = choice(request.type, ['init', 'snapshot', 'prepare', 'commit', 'apply', 'cancel', 'replay'], 'worker operation');
    let result;
    if (type === 'init') {
      if (editor || initializing) fail('ALREADY_INITIALIZED', 'Use a new Worker for another source');
      initializing = true;
      try { editor = await createEditor(request.input); } finally { initializing = false; }
      result = {version: VERSION, limits: LIMITS, token: editor.token()};
    } else {
      if (!editor) fail('NOT_INITIALIZED', 'Initialize the raster Worker first');
      keys(request.control ?? {}, ['maxWork', 'checkpointWork'], 'worker control');
      const control = {...request.control, onProgress: progress => self.postMessage({type: 'progress', requestId, progress})};
      if (type === 'snapshot') result = request.original ? editor.original() : editor.snapshot();
      else if (type === 'prepare') result = await editor.prepare(request.command, control);
      else if (type === 'commit') result = editor.commit(request.gestureId, request.expected);
      else if (type === 'apply') result = await editor.apply(request.command, control);
      else if (type === 'cancel') result = {cancelled: editor.cancel(request.gestureId)};
      else result = await editor.replay(request.payload, request.direction, request.expected, control);
    }
    self.postMessage({type: 'result', requestId, result}, transfers(result));
  } catch (error) {
    self.postMessage({type: 'error', requestId, error: {code: error instanceof EditError ? error.code : 'INTERNAL_ERROR',
      message: error instanceof EditError ? error.message : 'Raster operation failed without a result',
      details: error instanceof EditError ? error.details : {}}});
  }
};
