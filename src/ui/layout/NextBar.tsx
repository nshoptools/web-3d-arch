import { useAsyncAction, useBridge, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { useUiActions } from '../core/ui-state.tsx'
import { useStepNavigation } from '../core/step-nav.ts'
import { exportReasonText, findSourceSvgExport } from '../core/project-state.ts'
import { Button } from '../components/Button.tsx'
import { StageHints } from '../stage/StageHints.tsx'

/**
 * The next-action bar (UI-03). Step 1 offers the colour SVG and the one action
 * that moves the work on; step 2 offers going back and opening the export
 * choices that are actually valid. The primary button never silently picks a
 * machine profile, and it never claims step 2 is reachable when the core has no
 * built model to show there.
 */
export function NextBar({ inert = false }: { inert?: boolean }) {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const actions = useUiActions()
  const nav = useStepNavigation()
  const { exports } = snapshot

  // Picked out of the published list by meaning; a section SVG is a different
  // artefact and is never substituted for the source SVG.
  const svgSource = findSourceSvgExport(exports)
  const enabledExports = exports.filter((option) => option.enabled)

  const exportSvg = useAsyncAction(
    async () => (svgSource ? bridge.exportFile(svgSource.id) : undefined),
    { announce: 'Đã gửi yêu cầu xuất SVG màu.' },
  )

  const advance = useAsyncAction(async () => {
    nav.advance()
  })

  return (
    <div className="nextbar app__next fc-border" inert={inert}>
      <div className="nextbar__hint">
        <StageHints />
      </div>

      {nav.step === 1 ? (
        <>
          <Button
            icon="download"
            disabled={exportSvg.pending}
            disabledReason={
              svgSource
                ? svgSource.enabled
                  ? null
                  : exportReasonText(svgSource, 'Đường xuất SVG màu đang bị chặn.')
                : 'Snapshot hiện tại không công bố đường xuất SVG của nguồn.'
            }
            reasonHidden
            onClick={() => void exportSvg.run()}
          >
            SVG màu
          </Button>
          <Button
            variant="primary"
            icon={nav.advanceKind === 'open-step2' ? 'chevronRight' : 'cube'}
            keyHint="Ctrl ⏎"
            aria-keyshortcuts="Control+Enter"
            data-advance={nav.advanceKind}
            disabled={advance.pending}
            disabledReason={nav.advanceReason}
            reasonHidden
            onClick={() => void advance.run()}
          >
            {nav.advanceLabel}
          </Button>
          {/* Why the step is or is not reachable, in words, next to the button
              that acts on it — not only inside a tooltip. */}
          {nav.modelNote ? <span className="reason">{nav.modelNote}</span> : null}
        </>
      ) : (
        <>
          <Button icon="chevronLeft" onClick={() => nav.goToStep(1)}>
            Quay lại
          </Button>
          <Button
            variant="done"
            icon="download"
            disabledReason={
              enabledExports.length === 0
                ? 'Chưa có đường xuất nào hợp lệ. Mở khu Xuất file để xem cửa chặn đang áp.'
                : null
            }
            reasonHidden
            onClick={() => actions.openDialog({ kind: 'export-choice' })}
          >
            Xuất ({enabledExports.length} lựa chọn)
          </Button>
          {nav.modelStale ? (
            <Button
              icon="cube"
              disabledReason={nav.busy ? 'Nhân đang chạy một việc.' : null}
              onClick={() =>
                void run({ type: 'geometry.build' }, { announce: 'Đã gửi lệnh dựng lại 3D.' })
              }
            >
              Dựng lại 3D
            </Button>
          ) : null}
          {nav.modelStale ? <span className="reason">{nav.modelNote}</span> : null}
        </>
      )}
    </div>
  )
}
