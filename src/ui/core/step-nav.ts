/**
 * The one place that decides what "go on to the next step" means.
 *
 * Contract 0.3 makes step 2 a property of the *model*, not of the source:
 * `project.step` is navigation state that the core only accepts for step 2 while
 * it is holding a built model, and switching steps changes neither the revision
 * nor the history. A successful build is what puts the workspace on step 2; the
 * interface follows that state instead of guessing from `project.source`.
 *
 * The top bar, the next-action bar and the keyboard command all read this hook,
 * so the three can never disagree about whether the step is reachable or about
 * why it is not.
 */
import { useCallback, useMemo } from 'react'
import { useCapability, useRunCommand, useSnapshot } from './bridge.tsx'
import { useUiActions } from './ui-state.tsx'
import { CAP } from './registry.ts'
import {
  hasProject,
  hasVisibleModel,
  modelIsStale,
  NO_PROJECT_REASON,
  visibleModelNote,
} from './project-state.ts'

/** What the primary "go on" control will do when it is pressed. */
export type AdvanceKind = 'create-project' | 'build' | 'rebuild' | 'open-step2' | 'export'

export interface StepNavigation {
  step: 1 | 2
  hasProject: boolean
  hasSource: boolean
  hasModel: boolean
  /** `ProjectView.visibleModelStale`: the retained model is behind the project. */
  modelStale: boolean
  busy: boolean
  advanceKind: AdvanceKind
  advanceLabel: string
  /** Non-null when the primary control cannot act, with the reason to show. */
  advanceReason: string | null
  /** Why step `target` cannot be opened right now, or null when it can. */
  stepReason: (target: 1 | 2) => string | null
  /** One word for the state of a step, so colour is never the only carrier. */
  stepStatus: (target: 1 | 2) => string
  /** Extra sentence about the model behind step 2; null when there is nothing to add. */
  modelNote: string | null
  /** What going back costs, stated because the answer is "nothing". */
  backNote: string
  goToStep: (target: 1 | 2) => void
  advance: () => void
}

export const BACK_NOTE =
  'Quay lại bước 1 chỉ đổi khung đang xem. Mô hình đã dựng được giữ nguyên và mở lại được ngay, ' +
  'không phải dựng lại; số bản sửa và lịch sử hoàn tác cũng không đổi.'

const CREATE_PROJECT_ANCHOR = 'w3a-create-project'

/**
 * Stated from `visibleModelStale`, which is what the controller publishes about
 * the lease it is holding — not from an export refusal. Only the formats that
 * declare `matching-model` are shut by this; a source SVG or a renderer capture
 * can still be enabled, so the sentence says what is stale rather than claiming
 * every export is blocked.
 */
export const REBUILD_REASON =
  'Mô hình đang hiển thị thuộc một bản dựng cũ so với bản sửa hiện tại. Bạn vẫn mở được bước 2 để ' +
  'xem bản cũ, và các đường xuất không cần lưới vẫn dùng được; dựng lại để đường xuất cần mô hình ' +
  'khớp bản sửa mở lại.'

export const NO_MODEL_REASON =
  'Chưa có mô hình đã dựng. Bấm “Dựng 3D” ở bước 1; nhân tự chuyển sang bước 2 khi dựng xong.'

export function useStepNavigation(): StepNavigation {
  const snapshot = useSnapshot()
  const run = useRunCommand()
  const actions = useUiActions()
  const write = useCapability(CAP.projectWrite)

  const { project, job } = snapshot
  const projectOpen = hasProject(project)
  const hasSource = project.source !== null
  const hasModel = hasVisibleModel(project)
  const stale = modelIsStale(project)
  const busy = job !== null
  const step = project.step
  // `project.step` runs the same write guard as an edit, in both directions.
  const writeBlocked = write.available ? null : write.reason

  const stepReason = useCallback(
    (target: 1 | 2): string | null => {
      if (!projectOpen) return NO_PROJECT_REASON
      if (writeBlocked) return writeBlocked
      if (target === 1) return null
      if (!hasModel) return NO_MODEL_REASON
      return null
    },
    [hasModel, projectOpen, writeBlocked],
  )

  const stepStatus = useCallback(
    (target: 1 | 2): string => {
      if (step === target) return 'đang mở'
      if (!projectOpen) return 'chưa có dự án'
      if (target === 1) return 'quay lại được'
      if (!hasSource) return 'chưa có nguồn'
      if (!hasModel) return 'chưa dựng'
      return stale ? 'cần dựng lại' : 'đã dựng'
    },
    [hasModel, hasSource, projectOpen, stale, step],
  )

  const goToStep = useCallback(
    (target: 1 | 2) => {
      const blocked = stepReason(target)
      if (blocked) {
        actions.announce(blocked)
        actions.toast('warning', blocked)
        return
      }
      if (target === step) return
      void run(
        { type: 'project.step', step: target },
        { announce: `Đã chuyển sang bước ${target}.` },
      )
    },
    [actions, run, step, stepReason],
  )

  const advanceKind: AdvanceKind = !projectOpen
    ? 'create-project'
    : step === 2
      ? 'export'
      : !hasModel
        ? 'build'
        : stale
          ? 'rebuild'
          : 'open-step2'

  const advanceLabel =
    advanceKind === 'create-project'
      ? 'Tạo dự án'
      : advanceKind === 'export'
        ? 'Xuất file'
        : advanceKind === 'build'
          ? 'Dựng 3D'
          : advanceKind === 'rebuild'
            ? 'Dựng lại 3D'
            : 'Xem mô hình đã dựng'

  const advanceReason =
    advanceKind === 'create-project'
      ? null
      : busy
        ? 'Nhân đang chạy một việc. Chờ xong hoặc bấm Hủy trong khung xem.'
        : advanceKind === 'build' && !hasSource
          ? 'Chưa có nguồn thiết kế để dựng.'
          : null

  // Independent of the step: at step 2 the same staleness has to be stated next
  // to the export controls, where it decides whether the file will match.
  // The revisions come from the two fields that publish them, so the sentence
  // names the lease and the document separately instead of implying one number.
  const modelNote = stale
    ? `${visibleModelNote(project) ?? ''} ${REBUILD_REASON}`.trim()
    : projectOpen && step === 1 && hasSource && !hasModel
      ? 'Chưa dựng lần nào cho bản sửa này, nên bước 2 chưa mở được.'
      : null

  const advance = useCallback(() => {
    if (!projectOpen) {
      actions.setSection('source', true)
      requestAnimationFrame(() => {
        const node = document.getElementById(CREATE_PROJECT_ANCHOR)
        node?.scrollIntoView({ block: 'nearest' })
        node?.querySelector<HTMLElement>('button, input, select')?.focus()
      })
      return
    }
    if (step === 2) {
      actions.openDialog({ kind: 'export-choice' })
      return
    }
    if (advanceKind === 'open-step2') {
      goToStep(2)
      return
    }
    void run({ type: 'geometry.build' }, { announce: 'Đã gửi lệnh dựng 3D.' })
  }, [actions, advanceKind, goToStep, projectOpen, run, step])

  return useMemo(
    () => ({
      step,
      hasProject: projectOpen,
      hasSource,
      hasModel,
      modelStale: stale,
      busy,
      advanceKind,
      advanceLabel,
      advanceReason,
      stepReason,
      stepStatus,
      modelNote,
      backNote: BACK_NOTE,
      goToStep,
      advance,
    }),
    [
      advance,
      advanceKind,
      advanceLabel,
      advanceReason,
      busy,
      goToStep,
      hasModel,
      hasSource,
      modelNote,
      projectOpen,
      stale,
      step,
      stepReason,
      stepStatus,
    ],
  )
}
