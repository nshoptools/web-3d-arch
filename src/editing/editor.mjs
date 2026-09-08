import {VERSION, LIMITS, Work, fail, copyImage, copySource, hashImage, token, sameToken, normalizeCommand, keys, number, choice, identifier} from './contract.mjs';
import {editPixels} from './raster.mjs';
import {makeUndo, validateUndo, replayPixels, undoByteLength} from './history.mjs';

const PRIVATE = Symbol('editor-construction');
export class RasterEditor {
  #source; #original; #working; #originalHash; #hash; #revision; #running = null; #prepared = null;
  constructor(key, source, image, revision) {
    if (key !== PRIVATE) fail('INVALID_INPUT', 'Use RasterEditor.create');
    this.#source = source; this.#original = image; this.#working = copyImage(image); this.#revision = revision;
  }
  static async create(input) {
    keys(input, ['source', 'image', 'revision'], 'editor input');
    const source = copySource(input.source), image = copyImage(input.image);
    const revision = number(input.revision ?? 0, 0, Number.MAX_SAFE_INTEGER - 2, 'revision', true);
    const estimate = image.width * image.height * 64 + LIMITS.maxBoundaryColors * 96 + LIMITS.maxMetadataBytes;
    if (estimate > LIMITS.maxMemoryBytes) fail('RESOURCE_LIMIT', 'Editor allocation estimate exceeds memory limit');
    const e = new RasterEditor(PRIVATE, source, image, revision);
    e.#originalHash = e.#hash = await hashImage(image);
    return e;
  }
  token() {
    return Object.freeze({sourceId: this.#source.id, sourceHash: this.#source.hash, originalHash: this.#originalHash,
      revision: this.#revision, hash: this.#hash});
  }
  snapshot() { return {version: VERSION, source: {...this.#source}, token: this.token(), image: copyImage(this.#working)}; }
  original() { return {version: VERSION, source: {...this.#source}, hash: this.#originalHash, image: copyImage(this.#original)}; }
  get busy() { return this.#running !== null; }
  #assert(expected) {
    if (!sameToken(expected, this.token())) fail('REVISION_CONFLICT', 'Source or working revision changed');
  }
  #start(id, options) {
    if (this.#running) fail('BUSY', 'One running operation per editor');
    const running = {id, cancelled: false}, work = new Work(options, () => running.cancelled);
    work.check(); this.#running = running;
    return work;
  }
  async prepare(command, options = {}) {
    const c = normalizeCommand(command);
    this.#assert(c.expected);
    if (this.#prepared) fail('BUSY', 'Commit or cancel the prepared gesture first');
    const work = this.#start(c.id, options);
    try {
      await work.step(0, 'start', 0, 1, true);
      const data = await editPixels(this.#working, c, work), next = {...this.#working, data};
      await work.step(data.length / 4, 'hash', 0, 1, true);
      const hash = await hashImage(next);
      work.check();
      const undo = await makeUndo(this.#working, next, c, hash, work);
      await work.step(0, 'prepared', 1, 1, true);
      this.#assert(c.expected); work.check();
      const preview = {version: VERSION, status: 'prepared', id: c.id, expected: {...c.expected}, hash,
        image: copyImage(next), changedBounds: undo ? {...undo.changedBounds} : null, changedPixels: undo?.changedPixels ?? 0, undoBytes: undo ? undoByteLength(undo) : 0};
      this.#prepared = {id: c.id, expected: c.expected, image: next, hash, undo, work};
      return preview;
    } finally { this.#running = null; }
  }
  commit(id, currentToken) {
    identifier(id, 'gesture id');
    const p = this.#prepared;
    if (!p || p.id !== id) fail('NO_TRANSACTION', 'No matching prepared gesture');
    if (this.#running) fail('BUSY', 'Cannot commit while an operation is running');
    p.work.check(); this.#assert(token(currentToken));
    if (!sameToken(p.expected, currentToken)) fail('REVISION_CONFLICT', 'Prepared gesture has a stale source/revision');
    this.#assert(p.expected);
    if (this.#revision >= Number.MAX_SAFE_INTEGER - 2) fail('RESOURCE_LIMIT', 'Revision counter exhausted');
    // No user callback/await between the final checks and state assignment.
    // Allocate the public image BEFORE assignment, so even allocation failure is atomic.
    const image = copyImage(p.image);
    this.#prepared = null;
    if (p.undo) { this.#working = p.image; this.#hash = p.hash; this.#revision++; }
    return {version: VERSION, status: p.undo ? 'committed' : 'unchanged', id, token: this.token(),
      image, changedBounds: p.undo ? {...p.undo.changedBounds} : null, changedPixels: p.undo?.changedPixels ?? 0, undo: p.undo};
  }
  async apply(command, options = {}) {
    const prepared = await this.prepare(command, options);
    try { return this.commit(prepared.id, prepared.expected); }
    catch (error) { this.cancel(prepared.id); throw error; }
  }
  cancel(id) {
    identifier(id, 'gesture id'); let found = false;
    if (this.#running?.id === id) { this.#running.cancelled = true; found = true; }
    if (this.#prepared?.id === id) { this.#prepared = null; found = true; }
    return found;
  }
  async replay(payload, direction, expected, options = {}) {
    choice(direction, ['undo', 'redo'], 'replay direction');
    const current = token(expected); this.#assert(current);
    if (this.#running) fail('BUSY', 'One running operation per editor');
    const p = validateUndo(payload);
    if (p.width !== this.#working.width || p.height !== this.#working.height ||
        p.base.sourceId !== current.sourceId || p.base.sourceHash !== current.sourceHash || p.base.originalHash !== current.originalHash)
      fail('REVISION_CONFLICT', 'Undo belongs to a different source');
    const fromHash = direction === 'undo' ? p.afterHash : p.base.hash, toHash = direction === 'undo' ? p.base.hash : p.afterHash;
    if (fromHash !== this.#hash) fail('REVISION_CONFLICT', 'Undo/redo content is out of order');
    const work = this.#start(p.id, options);
    try {
      await work.step(0, 'start-replay', 0, 1, true);
      const next = await replayPixels(this.#working, p, direction, work);
      await work.step(next.data.length / 4, 'hash', 0, 1, true);
      if (await hashImage(next) !== toHash) fail('PAYLOAD_MISMATCH', 'Undo target hash failed verification');
      await work.step(0, 'replay-ready', 1, 1, true);
      work.check(); this.#assert(current);
      if (this.#revision >= Number.MAX_SAFE_INTEGER - 2) fail('RESOURCE_LIMIT', 'Revision counter exhausted');
      const image = copyImage(next);
      this.#working = next; this.#hash = toHash; this.#revision++;
      return {version: VERSION, status: 'committed', id: p.id, direction, token: this.token(), image,
        changedBounds: {...p.changedBounds}, changedPixels: p.changedPixels, undo: null};
    } finally { this.#running = null; }
  }
}
export const createEditor = input => RasterEditor.create(input);
