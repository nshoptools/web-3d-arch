/** Integration contract v0.3; UI consumes snapshots and commands, never geometry internals. */
export type ProductId = 'keychain' | 'clicky' | 'strap' | 'lego' | 'charm';
export type WorkspaceSection = 'source' | 'product' | 'materials' | 'parameters' | 'export' | 'library';
export type ToolId = 'paint' | 'line' | 'curve' | 'erase' | 'cut' | 'crop' | 'heal';
export type Verdict = 'pass' | 'fail' | 'unverified' | 'unsupported';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
/** `sequence` is the entry's place in the session, monotonic; the list is bounded and rolls over, so a reader marks what it has seen by sequence, never by index or length. */
export interface Diagnostic { code: string; message: string; severity: 'info' | 'warning' | 'error'; detail?: string; requirementId?: string; sequence?: number; }
export type CapabilityId = 'project.write' | 'viewport.webgl' | 'viewport.center-bed' | 'ai.generate' | 'printer.list' | 'storage.mirror' | 'source.emoji' | 'source.font-import' | 'source.clipboard' | 'account.member-admin' | 'account.system-policy' | 'mesh.import';
export interface Capability { id: CapabilityId | (string & {}); available: boolean; reason?: string; }
export interface SettingView { key: string; scope: 'system' | 'user' | 'device' | 'project'; value: Json; effectiveFrom: 'default' | 'system' | 'user' | 'device' | 'project'; policyBlocked?: boolean; reason?: string; }
export interface EditorView { tool: ToolId; colorMaterialId: string | null; cutMode: 'merge' | 'hole'; strokeWidthPx: string; healAuto: boolean; healAllGaps: boolean; healThresholdMm: string; }
export interface SourceCanvasView {
  revision: number; widthPx: number; heightPx: number; pixelSizeMm: number;
  currentUrl: string; originalUrl: string; editable: boolean; reason?: string;
}
/** Capture both revisions at pointer start. Project revision includes editor settings and material edits. */
export interface EditorGesture {
  id: string; projectRevision: number; sourceRevision: number; tool: ToolId;
  points: { x: number; y: number; pressure?: number }[];
  snap: 'none' | '45'; cropShape?: 'rectangle' | 'ellipse'; cropKeep?: 'inside' | 'outside'; square?: boolean;
}
export interface ParameterView {
  id: string; label: string; group: string; kind: 'number' | 'boolean' | 'select';
  value: string | boolean; unit: string | null; min?: string; max?: string; step?: string;
  options?: { value: string; label: string }[]; advanced: boolean; visible: boolean;
  enabled: boolean; reason?: string; overridden: boolean; derivedLabel?: string;
}
export interface MaterialView {
  product?: import('./product-material.mjs').ProductMaterialExtension;
  id: string; label: string; color: string; slot: number | null; areaPercent?: number;
  role: 'region' | 'body' | 'text' | 'textBase' | 'stem' | 'tray' | 'other';
  overridden: boolean; backgroundEligible: boolean; excluded: boolean; heightLayers?: number;
  excludedReason?: string; excludedCause?: 'background' | 'below-min-detail' | 'merged' | 'other';
}
export interface TextView {
  text: string; fontId: string; sizeMm: string; heightLayers: string; baseWidthMm: string;
  baseThicknessLayers: string; baseRadiusMm: string; bend: string; letterSpacing: string;
  lineSpacing: string; baseEnabled: boolean; bevelEnabled: boolean; asSource: boolean;
  xMm: string; yMm: string; placement: 'on-model' | 'beside'; sizeUnit: 'mm' | 'pt'; sizeDisplay: string;
}
export interface ProjectView {
  id: string; name: string; revision: number; savedRevision: number | null; product: ProductId;
  /** Domain revision of the retained displayed model; null before build/open. Never transport generation. */
  visibleModelRevision: number | null; visibleModelStale: boolean;
  /** `conversion`: the source-conversion step this source still needs before a
   * model can be built ('raster' = render to an editable raster, 'segment' =
   * separate the raster into colour regions), from its own product bindings;
   * null once it has canonical regions. */
  step: 1 | 2; source: null | { id: string; name: string; kind: 'raster' | 'svg' | 'text' | 'emoji'; conversion?: 'raster' | 'segment' | null; previewUrl?: string; widthMm?: number; heightMm?: number; };
  parameters: ParameterView[]; materials: MaterialView[]; text: TextView;
  canUndo: boolean; canRedo: boolean; sourceCanvas: SourceCanvasView | null;
  history: { undoCount: number; redoCount: number; payloadBytes: number; truncated: boolean };
  importedMesh: { present: boolean; targets?: {id:string;label:string;mainBody:boolean}[]; unappliedFields: string[]; triangles?: number; boundsMm?: [number, number, number] };
  selection: { blockId: string; label: string; kind: 'body' | 'text' | 'region' | 'other' } | null;
  blocks: { id: string; label: string; kind: 'body' | 'text' | 'region' | 'other'; materialId: string | null }[];
  stats: { widthMm?: number; depthMm?: number; heightMm?: number; triangles?: number; materialCount: number; verdict: Verdict; };
}
export interface UserView { id: string; name: string; email: string; role: 'owner' | 'member'; issuer?: string; subject?: string; }
export interface SessionView {
  status: 'checking' | 'signed-out' | 'signed-in' | 'offline-lease' | 'expired'; user: UserView | null;
  csrfToken?: string; deviceMode: 'private' | 'shared';
}
export interface AIProviderView {
  id: string; label: string; connected: boolean; models: { id: string; label: string; supportsReference: boolean; qualities: { id: string; label: string }[]; sizes: { id: string; label: string }[]; }[];
  currency: string; spent: string | null; reserved: string; budget: string | null; available: boolean; reason?: string;
  credential: { label: string; masked: string; status: string; lastChecked: number | null } | null;
}
export interface AIBudgetView { revision: number; limits: { currency: string; perOperation: string; perDay: string; perMonth: string }[]; }
/** Personal profile records are validated by Codex; no imported qualification claim is trusted. */
export interface PrinterProfileView {
 key:string; id:string|null; label:string; machine:string; slicer:string; slicerVersion:string;
 nozzleDiametersMm:number[]; slotExtruders:number[]; filamentTypes:string[]; filamentColors:string[];
 profileHash:string|null; sourceHash:string|null; valid:boolean; reason?:string;
 importedFileAvailable:boolean; qualified:false;
}
export interface PrinterProfileLibraryView {
 settingsRevision:number; enabled:boolean; reason?:string; items:PrinterProfileView[];
}
export interface PrinterView { id: string; label: string; filamentSlots: number; qualified: boolean; }
export interface PolicyView { version: number; document: { [key: string]: Json }; }
export interface LibraryEntry { id: string; name: string; product: ProductId; updatedAt: string; previewUrl?: string; sizeBytes?: number; backup?: { at: string; revision: number; sha256: string } | null; }
export interface AIImageRequest { providerId: string; modelId: string; prompt: string; reference?: File; operationId: string; quality?: string; size?: string; }
export interface AIQuoteView { jobId: string; quoteHash: string; providerLabel: string; credentialLabel: string; recipient: string; dataToSend: string[]; currency: string; maximumCost: string; expiresAt: number; unknowns: string[]; }
export interface AIJobView {
  id: string; operationId: string; providerId: string; modelId: string; createdAt: string;
  state: 'prepared' | 'reserved' | 'submitted' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  currency: string; estimated: string | null; actual: string | null; reserved: string;
  accountingBasis: 'none' | 'pending' | 'estimated' | 'actual'; periodUtc: string; unresolved: boolean;
  artifacts: { id: string; label: string; previewUrl?: string; canApply: boolean; reason?: string }[];
}
export type ExportPrerequisite = 'committed-source' | 'renderer' | 'matching-model' | 'project-bytes' | 'account-settings';
/** Optional additive export controls. Raw numeric text is validated by the controller. */
export interface ExportFieldView {
  id: string; label: string; kind: 'text' | 'number' | 'boolean' | 'select'; value: string | boolean;
  unit?: string; min?: string; max?: string; step?: string; options?: {value: string; label: string}[];
  enabled: boolean; reason?: string; hint?: string;
}
export interface ExportReceiptView {
  id: string; formatId: string; filename: string; byteLength: number; sha256: string;
  projectRevision: number; createdAt: string; verdict: Verdict; inspection: boolean;
  warnings: string[]; metadataAvailable: boolean;
}
export interface ExportOption {
  id: string; label: string; extension: string; enabled: boolean; reason?: string; reasonCode?: string; verdict: Verdict; prerequisite?: ExportPrerequisite;
  /** Saved project flags; this exact project revision fences an edit. */
  /** `warning`: the values are kept but the path will refuse them as they stand (for example a section sequence off its step grid). */
  configuration?: {projectRevision: number; warning?: string; fields: ExportFieldView[]};
}
export interface AppSnapshot {
  contractVersion: '0.3'; environment: 'prototype' | 'application'; version: string;
  online: boolean; capabilities: Capability[]; session: SessionView; project: ProjectView;
  job: null | { id: string; state: 'queued' | 'running' | 'cancelling'; stage: string; progress: number | null; cancellable: boolean; };
  diagnostics: Diagnostic[]; library: LibraryEntry[]; exports: ExportOption[]; aiProviders: AIProviderView[];
  /** Receipts belong to the current access/project session; download metadata to retain it. */
  exportReceipts?: ExportReceiptView[];
  printer: { id: string | null; label: string; filamentSlots: number; qualified: boolean; };
  /** Absent in older bridges; no UI fallback profiles may be fabricated. */
  printerProfiles?: PrinterProfileLibraryView;
  settings: SettingView[]; editor: EditorView; aiJobs: AIJobView[]; aiBudget: AIBudgetView; printers: PrinterView[]; policy: PolicyView | null;
  storage: { usedBytes: number; quotaBytes: number | null; estimate: true; warning?: string };
}
export type AppCommand =
  | { type: 'export.configure'; id: string; projectRevision: number; field: string; value: string | boolean }
  | { type: 'export.receipt'; id: string }
  | { type: 'project.create'; product: ProductId }
  | { type: 'project.rename'; name: string }
  | { type: 'project.product'; product: ProductId; confirmed?: boolean }
  | { type: 'project.step'; step: 1 | 2 }
  | { type: 'project.save' }
  | { type: 'project.open'; id: string }
  | { type: 'project.delete'; id: string; confirmed: boolean }
  | { type: 'history.undo' | 'history.redo' | 'source.remove' }
  | { type: 'source.convert'; target: 'raster' }
  | { type: 'proposal.accept'; id: string; confirmed: true }
  | { type: 'proposal.discard'; id: string }
  | { type: 'parameter.set'; id: string; value: string | boolean }
  | { type: 'parameter.reset'; id: string }
  | { type: 'text.update'; values: Partial<TextView> }
  | { type: 'text.remove' }
  | { type: 'material.update'; id: string; color?: string; slot?: number | null; excluded?: boolean; heightLayers?: string }
  | { type: 'material.reset'; id: string }
  /** Presentation state: changes what the next gesture does, never the revision or the history. */
  | { type: 'editor.tool'; tool: ToolId }
  | { type: 'editor.settings'; values: { [key: string]: Json } }
  | { type: 'selection.set'; blockId: string | null }
  | { type: 'geometry.build' }
  | { type: 'mesh.apply'; unit?: string; targetId?: string; materialId?: string }
  | { type: 'job.cancel'; id: string }
  | { type: 'viewport.action'; action: 'fit' | 'center' | 'top' | 'front' | 'perspective' | 'explode' | 'toggle-grid' | 'toggle-measure' }
  | { type: 'printer.select'; id: string }
  | { type: 'printer.profile-accept'; id: string; confirmed: true }
  | { type: 'printer.profile-delete'; key: string; settingsRevision: number; confirmed: boolean }
  | { type: 'printer.profile-export'; key: string; settingsRevision: number; original: boolean }
  | { type: 'settings.update'; values: { [key: string]: Json } }
  | { type: 'settings.import'; mode: 'merge' | 'replace'; document: string; confirmed: boolean }
  | { type: 'settings.reset'; confirmed: boolean }
  | { type: 'policy.update'; version: number; document: { [key: string]: Json }; confirmed: boolean }
  | { type: 'emoji.favorite'; id: string; collectionId: string; favorite: boolean }
  | { type: 'ai.apply-result'; artifactId: string; confirmed: boolean }
  | { type: 'ai.cancel'; jobId: string }
  | { type: 'ai.close-unknown'; jobId: string; reason: string; confirmed: boolean }
  | { type: 'ai.budget'; currency: string; perOperation: string; perDay: string; perMonth: string }
  | { type: 'preset.apply'; id: string; confirmed?: boolean }
  | { type: 'preset.save'; name: string }
  | { type: 'preset.delete'; id: string; confirmed: boolean };
export type CommandResult = { ok: true } | { ok: false; diagnostic: Diagnostic; confirmation?: { title: string; changes: string[]; retry: AppCommand } };
export interface EmojiEntry { id: string; text: string; label: string; collectionId: string; previewUrl: string; verdict: Verdict; }
export interface FontEntry { id: string; label: string; style: string; family: string; }
export interface PresetEntry { id: string; name: string; product: ProductId; custom: boolean; }
export interface AppBridge {
  getSnapshot(): AppSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(command: AppCommand): Promise<CommandResult>;
  importFile(file: File, purpose?: 'source' | 'mesh' | 'project' | 'font' | 'preset' | 'settings' | 'printer-profile'): Promise<CommandResult>;
  exportFile(id: string): Promise<CommandResult>;
  attachViewport(element: HTMLElement): () => void;
  /** UI captures one complete gesture in source-image pixels; controller owns processing/history. */
  editSource(gesture: EditorGesture): Promise<CommandResult>;
  /** Called directly from a user gesture, before any await that loses activation. */
  pickMirrorDirectory(): Promise<CommandResult>;
  queryEmoji(query: string, collectionId?: string, offset?: number): Promise<{ entries: EmojiEntry[]; total: number; collections: { id: string; label: string }[] }>;
  selectEmoji(id: string, collectionId: string): Promise<CommandResult>;
  queryFonts(query: string): Promise<FontEntry[]>;
  queryPresets(product: ProductId): Promise<PresetEntry[]>;
  /** Same-tab OIDC redirect owned by the controller; no website password fields. */
  signIn(options?: { inviteToken?: string; reauthenticate?: boolean }): Promise<CommandResult>;
  signOut(options?: { eraseLocal?: boolean; confirmed?: boolean }): Promise<CommandResult>;
  connectAI(providerId: string, secret: string): Promise<CommandResult>;
  disconnectAI(providerId: string): Promise<CommandResult>;
  /** Prepare is non-billable. Submit only after displaying the returned quote and explicit consent. */
  prepareImage(request: AIImageRequest): Promise<CommandResult & { quote?: AIQuoteView }>;
  submitImage(request: { jobId: string; quoteHash: string; consent: true }): Promise<CommandResult>;
  queryAIJobs(filter?: { from?: string; to?: string; providerId?: string; jobId?: string; after?: string }): Promise<{ jobs: AIJobView[]; nextCursor: string | null; unresolved: AIJobView[] }>;
  listUsers(): Promise<(UserView & { active: boolean })[]>;
  inviteUser(identity: { issuer: string; subject: string }): Promise<CommandResult & { inviteUrl?: string }>;
  updateUser(id: string, values: { active?: boolean; role?: 'owner' | 'member'; delete?: boolean; revokeSessions?: boolean; confirmed: boolean }): Promise<CommandResult>;
}
