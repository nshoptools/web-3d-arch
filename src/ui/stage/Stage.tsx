import { useEffect, useRef, useState } from 'react'
import { useAsyncAction, useBridge, useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import {
  hasProject,
  hasVisibleModel,
  modelIsStale,
  NO_PROJECT_REASON,
  visibleModelNote,
} from '../core/project-state.ts'
import { CAP } from '../core/registry.ts'
import { isTextEntryTarget } from '../core/dom.ts'
import { MQ_MOBILE, useMediaQuery } from '../core/useMediaQuery.ts'
import { ACCEPT_SOURCE, acceptedSourceFile, chooseFile } from '../core/file-dialog.ts'
import { Button } from '../components/Button.tsx'
import { Icon } from '../components/Icon.tsx'
import { ProgressBar } from '../components/Feedback.tsx'
import { PanelTab } from '../layout/Panel.tsx'
import { CanvasControls, Tools2D } from './Tools2D.tsx'
import { View3D } from './View3D.tsx'
import { StageHints } from './StageHints.tsx'
import { SourceCanvas, SourceImageRecovery } from './SourceCanvas.tsx'
import { SourceCanvasProvider } from './source-canvas-state.tsx'
import { diagnosticText, formatNumber, jobStageText, jobStateText, VERDICT_SHORT } from '../core/text.ts'

/**
 * The overlay bands of the stage float over the drawing surface. At 320 CSS px
 * with 200% text they can take most of it, so each band is a disclosure region
 * with a control in a bar that is itself never collapsible and never inert. The
 * bar is the promise that nothing folded away is unreachable.
 */
interface BandDef {
  id: string
  label: string
  group: string
  defaultOpen: boolean
  open: boolean
}

const SOURCE_KIND_LABEL: Record<string, string> = {
  raster: 'ảnh',
  svg: 'SVG',
  text: 'chữ',
  emoji: 'emoji',
}

/** Job stages in which the core is waiting for the person, not working. */
const WAITING_STAGES = new Set(['source confirmation', 'geometry confirmation', 'Source and datum confirmation'])

export function Stage({ inert = false }: { inert?: boolean }) {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const actions = useUiActions()
  const { state } = useUi()
  const mobile = useMediaQuery(MQ_MOBILE)
  const ai = useCapability(CAP.aiGenerate)
  const [host3d, setHost3d] = useState<HTMLDivElement | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const { project, job, diagnostics } = snapshot
  const step = project.step
  const projectOpen = hasProject(project)
  const hasSource = project.source !== null
  const hasModel = hasVisibleModel(project)
  const modelStale = modelIsStale(project)
  const busy = job !== null
  // The core keeps the job open while it waits for an answer in the consent
  // dialog. That is the person's turn, not the machine's: the card says so
  // instead of "running", and offers no cancel next to a dialog that already
  // has "Bỏ qua" (Grok F-07).
  const waiting = job !== null && WAITING_STAGES.has(job.stage)

  /**
   * `attachViewport` is the bridge's own 3D renderer host and nothing else: the
   * 2D source canvas of step 1 is interface work and is drawn by SourceCanvas.
   * The host only exists while step 2 is on screen, so the renderer is attached
   * and detached with the step rather than living behind the 2D view.
   */
  useEffect(() => {
    if (!host3d) return
    const detach = bridge.attachViewport(host3d)
    return () => detach()
  }, [bridge, host3d])

  /** Nothing is imported without a project: the core would only refuse it. */
  const refuseWithoutProject = (): boolean => {
    if (projectOpen) return false
    actions.announce(NO_PROJECT_REASON)
    actions.toast('warning', NO_PROJECT_REASON)
    return true
  }

  const importDropped = useAsyncAction(
    async (file: File) => bridge.importFile(file, 'source'),
    { success: 'Đã nhận tệp thả vào khung xem.' },
  )

  // Ctrl+V yields to a focused text field (SRC-01). The handler identity
  // changes every render, so the listener is registered once and reads the
  // current action from a ref.
  const importRef = useRef(importDropped.run)
  importRef.current = importDropped.run
  const guardRef = useRef(refuseWithoutProject)
  guardRef.current = refuseWithoutProject
  /** A file of a kind the app does not read is refused in words before any job starts. */
  const refuseFileType = (file: File) => {
    const sentence = diagnosticText('SOURCE_FILE_TYPE', 'SOURCE_FILE_TYPE')
    actions.toast('warning', sentence, file.name)
    actions.announce(sentence)
  }
  const refuseRef = useRef(refuseFileType)
  refuseRef.current = refuseFileType
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return
      if (isTextEntryTarget(event.target)) return
      // A modal layer owns the keyboard: the workspace is inert while a dialog
      // is open (AppShell), and a paste aimed at that dialog must not start a
      // background import that would cancel the job or proposal on screen.
      const main = document.getElementById('w3a-main')
      if (!main || main.closest('[inert]') || document.querySelector('[role="dialog"]')) return
      const file = event.clipboardData?.files?.[0]
      if (!file) return
      event.preventDefault()
      if (guardRef.current()) return
      if (!acceptedSourceFile(file)) {
        refuseRef.current(file)
        return
      }
      void importRef.current(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const pickSource = useAsyncAction(async () => {
    const file = await chooseFile(ACCEPT_SOURCE)
    if (!file) return
    return bridge.importFile(file, 'source')
  }, { success: 'Đã nhận tệp nguồn.' })

  // Opens the source section with the requested group unfolded and brings its
  // first control into view. The starting paths must do different things.
  const goToSourceBlock = (anchorId: string, groupId: string) => {
    actions.setSection('source', true)
    actions.setGroupOpen(groupId, true)
    requestAnimationFrame(() => {
      const node = document.getElementById(anchorId)
      node?.scrollIntoView({ block: 'nearest' })
      const focusable =
        node instanceof HTMLButtonElement
          ? node
          : (node?.querySelector<HTMLElement>('input, textarea, select, button:not(.group__head)') ?? null)
      focusable?.focus()
    })
  }

  const cancelJob = useAsyncAction(async (id: string) => {
    await run({ type: 'job.cancel', id }, { announce: 'Đã gửi yêu cầu hủy.' })
  })

  // The strip is for what happened since the person last looked; the log keeps
  // everything. Opening the log or pressing “Đã xem” marks the newest entry by
  // its sequence number: the list is bounded and rolls over, so its length
  // cannot say which entries are new (audit F-06).
  const latestSequence = diagnostics.reduce((max, item) => Math.max(max, item.sequence ?? 0), 0)
  const problems = diagnostics.filter(
    (item) => item.severity !== 'info' && (item.sequence ?? 0) > state.diagnosticsSeen,
  )
  // The newest one is the one about what the person just did.
  const firstProblem = problems.at(-1) ?? null

  /**
   * One sentence for one fact: with no model the controller publishes no
   * measured stats at all, so every field of the strip says the same thing.
   */
  const NOT_BUILT = 'chưa dựng'
  const readouts =
    step === 1
      ? [
          { label: 'Vùng màu', value: String(project.stats.materialCount) },
          {
            label: 'Cỡ nguồn',
            value:
              project.source?.widthMm !== undefined && project.source.heightMm !== undefined
                ? `${formatNumber(project.source.widthMm)} × ${formatNumber(project.source.heightMm)} mm`
                : 'chưa có',
          },
          {
            label: 'Nguồn',
            value: project.source ? (SOURCE_KIND_LABEL[project.source.kind] ?? project.source.kind) : 'chưa có',
          },
          ...(project.sourceCanvas !== null && project.sourceCanvas.revision > 0
            ? [{ label: 'Ảnh sửa', value: `bản ${project.sourceCanvas.revision}` }]
            : []),
        ]
      : [
          {
            label: 'Kích thước',
            value: hasModel
              ? `${formatNumber(project.stats.widthMm ?? 0)} × ${formatNumber(project.stats.depthMm ?? 0)} × ${formatNumber(project.stats.heightMm ?? 0)} mm`
              : NOT_BUILT,
          },
          { label: 'Bộ phận', value: String(project.stats.materialCount) },
          {
            label: 'Tam giác',
            value: hasModel ? formatNumber(project.stats.triangles ?? 0, 0) : NOT_BUILT,
          },
          { label: 'Kiểm mesh', value: hasModel ? VERDICT_SHORT[project.stats.verdict] : NOT_BUILT },
        ]

  // Every band folds; on a narrow viewport the two that carry the most text
  // start folded so the drawing frame is usable on first paint.
  const bands: BandDef[] = [
    {
      id: 'w3a-stage-readouts',
      label: 'Chỉ số',
      group: 'stage-readouts',
      defaultOpen: !mobile,
      open: isGroupOpen(state, 'stage-readouts', !mobile),
    },
    {
      id: 'w3a-stage-tools',
      label: step === 1 ? 'Công cụ' : 'Khung xem',
      group: 'stage-tools',
      defaultOpen: true,
      open: isGroupOpen(state, 'stage-tools', true),
    },
    {
      id: 'w3a-stage-hints',
      label: 'Gợi ý',
      group: 'stage-hints',
      defaultOpen: !mobile,
      open: isGroupOpen(state, 'stage-hints', !mobile),
    },
  ]
  const bandOpen = (group: string) => bands.find((band) => band.group === group)?.open ?? true
  const allCollapsed = bands.every((band) => !band.open)

  // Before the first source there is nothing to measure, nothing to paint on
  // and nothing to hint at: the frame carries the ways in and nothing else, so
  // the person is not looking at a wall of dimmed controls (UI-03).
  const frameEmpty = step === 1 && !hasSource
  const toolsInert = step === 1 ? !hasSource : !hasModel

  return (
    <main
      className="stage-wrap app__stage"
      id="w3a-main"
      aria-label="Khung thiết kế"
      // Focusable only as the skip link's destination; never in the Tab order.
      tabIndex={-1}
      inert={inert}
      onDragOver={(event) => {
        event.preventDefault()
        setDropActive(true)
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDropActive(false)
        const file = event.dataTransfer.files[0]
        if (!file) return
        // The same gate as paste: a drop while a dialog owns the screen must
        // not start a background import under the question being asked.
        if (inert || document.querySelector('[role="dialog"]')) return
        if (refuseWithoutProject()) return
        if (!acceptedSourceFile(file)) {
          refuseFileType(file)
          return
        }
        void importDropped.run(file)
      }}
    >
      <PanelTab />
      <SourceCanvasProvider>
        <div className="stage fc-border" data-drop={dropActive ? 'true' : 'false'} data-frame={frameEmpty ? 'empty' : 'source'}>
          {step === 1 ? (
            <SourceCanvas />
          ) : (
            <div
              ref={setHost3d}
              className="stage__viewport"
              data-mode="3d"
              role="img"
              aria-label="Khung xem mô hình 3D do nhân vẽ"
            />
          )}

          {!frameEmpty ? (
            <div className="stage__layer" data-bands={allCollapsed ? 'collapsed' : 'open'}>
              {/* Always visible, never inert: the way back to anything folded. */}
              <div
                className="stage__bar"
                role="group"
                aria-label="Thu gọn hoặc mở các dải thông tin của khung xem"
              >
                {bands.map((band) => (
                  <button
                    key={band.id}
                    type="button"
                    className="btn btn--small btn--ghost fc-border"
                    aria-expanded={band.open}
                    aria-controls={band.id}
                    aria-label={band.label}
                    title={band.label}
                    data-band={band.group}
                    onClick={() => actions.setGroupOpen(band.group, !band.open)}
                  >
                    <Icon name={band.open ? 'chevronDown' : 'chevronRight'} size={14} />
                    {/* The label folds away on a narrow viewport; the accessible
                        name stays on the button either way. */}
                    <span className="stage__bar-label">{band.label}</span>
                  </button>
                ))}
              </div>

              <div className="stage__top">
                <div className="stage__top-left">
                  <div
                    id="w3a-stage-readouts"
                    className="readouts"
                    role="group"
                    aria-label="Chỉ số khung xem"
                    hidden={!bandOpen('stage-readouts')}
                  >
                    {readouts.map((item) => (
                      <span key={item.label} className="chip chip--glass fc-border">
                        <span className="muted-3">{item.label}</span>
                        {item.value}
                      </span>
                    ))}
                  </div>
                  {/* Job state is never foldable: it is the one thing that explains
                      why the picture on screen is not the current one. */}
                  {busy ? (
                    <span className="chip chip--warn fc-border">Kết quả cũ · đang cập nhật</span>
                  ) : null}
                  {/* The other reason the picture is not the current one, and the
                      one that survives after the job ends: the numbers above were
                      measured on the retained lease, and contract 0.3 publishes
                      which revision that is. Not foldable either — a size and a
                      mesh verdict read as facts about the design on screen. */}
                  {step === 2 && modelStale ? (
                    <span
                      className="chip chip--warn fc-border"
                      data-readout-stale="true"
                      title={visibleModelNote(project) ?? undefined}
                    >
                      Chỉ số của mô hình cũ · bản sửa {project.visibleModelRevision}
                    </span>
                  ) : null}
                </div>
                {/* UI-03: when the stage is empty the toolbars mean nothing, so
                    they are inert rather than merely covered. Step 2 depends on a
                    model, not on a source. */}
                <div id="w3a-stage-tools" className="stage-tools" inert={toolsInert} hidden={!bandOpen('stage-tools')}>
                  {step === 1 ? <Tools2D /> : <View3D />}
                </div>
              </div>

              <div className="stage__spacer" aria-hidden="true" />

              <div className="stage__bottom">
                <div className="stage__bottom-left">
                  {problems.length > 0 && firstProblem ? (
                    <div className="stage-warnings card card--glass fc-border" style={{ padding: 8, maxInlineSize: 'min(460px, 100%)' }} role="status">
                      <div className="row">
                        <strong style={{ color: firstProblem.severity === 'error' ? 'var(--err)' : 'var(--warn)' }}>
                          {problems.length === 1 ? 'Một vấn đề cần xem' : `${problems.length} vấn đề cần xem`}
                        </strong>
                        <Button
                          size="small"
                          onClick={() => {
                            actions.markDiagnosticsSeen(latestSequence)
                            actions.openDialog({ kind: 'diagnostics' })
                          }}
                        >
                          Mở nhật ký
                        </Button>
                        <Button
                          size="small"
                          variant="ghost"
                          icon="check"
                          aria-label="Đánh dấu các vấn đề này là đã xem"
                          onClick={() => actions.markDiagnosticsSeen(latestSequence)}
                        >
                          Đã xem
                        </Button>
                      </div>
                      {/* The count and the way in stay; only the wording folds.
                          The sentence is the one the person can act on; the
                          code stays in the log. */}
                      {bandOpen('stage-hints') ? (
                        <p className="muted" style={{ margin: 0 }} data-problem-code={firstProblem.code}>
                          {diagnosticText(firstProblem.code, firstProblem.message)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div
                    className="stage-hints"
                    id="w3a-stage-hints"
                    hidden={!bandOpen('stage-hints')}
                  >
                    <StageHints />
                  </div>
                </div>

                {/* Folds with the tool band: it is a tool, and at 320 px every
                    row it keeps is a row the drawing surface loses. */}
                <div
                  className="stage-corner"
                  hidden={!bandOpen('stage-tools')}
                  inert={toolsInert}
                >
                  {step === 1 ? (
                    <CanvasControls />
                  ) : (
                    <Button
                      size="small"
                      icon="explode"
                      onClick={() => void run({ type: 'viewport.action', action: 'explode' })}
                    >
                      Tách tầng
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* The frame is empty until the project has a source. The card names
              every way in, in the order most people take them; the workspace
              itself only exists once a project is open (AppShell). */}
          {!hasSource && !busy ? (
            <div className="stage-empty">
              <div className="card fc-border" style={{ maxInlineSize: 500 }}>
                <strong className="card__title">Thêm nguồn để bắt đầu thiết kế</strong>
                <p className="muted" style={{ margin: 0 }}>
                  Kéo thả tệp vào khung này, dán bằng Ctrl+V, hoặc chọn một cách bên dưới. Ảnh, SVG,
                  chữ hay emoji đều dùng được.
                </p>
                <div className="row">
                  <Button
                    variant="primary"
                    icon="upload"
                    disabled={pickSource.pending}
                    onClick={() => void pickSource.run()}
                  >
                    {pickSource.pending ? 'Đang nhận…' : 'Tải ảnh hoặc SVG'}
                  </Button>
                  <Button icon="text" onClick={() => goToSourceBlock('w3a-source-text', 'source-text')}>
                    Gõ chữ
                  </Button>
                  <Button icon="sparkle" onClick={() => goToSourceBlock('w3a-source-emoji', 'source-emoji')}>
                    Chọn emoji
                  </Button>
                  {ai.available ? (
                    <Button icon="sparkle" onClick={() => actions.openDialog({ kind: 'ai-generate' })}>
                      Tạo bằng AI
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* The third blocking condition of the frame, told the same way as
              the other two: the project and the source are both there, but the
              picture the seven tools act on never arrived. */}
          {step === 1 && !busy ? <SourceImageRecovery /> : null}

          {busy ? (
            <div
              className={`stage-busy${step === 1 ? ' stage-busy--pill' : ''}`}
              role="group"
              aria-label="Tiến độ xử lý"
            >
              <div
                className="stage-busy__card card card--glass fc-border"
                style={{ maxInlineSize: 420, minInlineSize: 0 }}
              >
                <div className="row">
                  <strong className="grow">{jobStageText(job.stage)}</strong>
                  <span
                    className={`chip fc-border ${waiting ? 'chip--warn' : 'chip--muted'}`}
                    data-job-waiting={waiting ? 'true' : 'false'}
                  >
                    {waiting ? 'chờ bạn trả lời' : jobStateText(job.state)}
                  </span>
                </div>
                <ProgressBar value={job.progress} label={`Tiến độ: ${jobStageText(job.stage)}`} />
                {/* The job id is for the log and a bug report, not for the person
                    waiting: it stays reachable, folded away. */}
                <details className="details">
                  <summary>Chi tiết kỹ thuật</summary>
                  <div className="muted-3">
                    Mã việc <code className="diag__code">{job.id}</code> · công đoạn{' '}
                    <code className="diag__code">{job.stage}</code>
                  </div>
                </details>
                <div className="row">
                  {waiting ? (
                    <span className="muted-3">Trả lời trong hộp xác nhận: Áp dụng hoặc Bỏ qua.</span>
                  ) : (
                    <Button
                      variant="danger"
                      icon="cancel"
                      disabled={cancelJob.pending}
                      disabledReason={
                        job.cancellable ? null : 'Công đoạn này đã qua mốc hủy được của nhân.'
                      }
                      onClick={() => void cancelJob.run(job.id)}
                    >
                      {job.state === 'cancelling' ? 'Đang hủy…' : 'Hủy'}
                    </Button>
                  )}
                  <Button
                    icon="save"
                    onClick={() => void run({ type: 'project.save' }, { success: 'Đã lưu dự án.' })}
                  >
                    Lưu dự án
                  </Button>
                </div>
                <p className="muted-3" style={{ margin: 0 }}>
                  Lưu và xuất gói dự án vẫn dùng được trong khi đang xử lý.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </SourceCanvasProvider>
    </main>
  )
}
