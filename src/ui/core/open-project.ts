/**
 * Rebuilding after a project is opened.
 *
 * A saved project holds its source and settings; the built model is not stored
 * with it, so opening one lands on step 1 with "not built yet" and the model the
 * person last exported is nowhere on screen (Grok F-02). Opening — from the
 * list or from a package — therefore rebuilds right away from the saved state,
 * with the same command the "Dựng 3D" button sends and the same consent dialogs
 * if the core asks. A source that still needs its raster or its colour regions
 * is left alone: the build would only be refused, and the stage names the step.
 */
import { useCallback } from 'react'
import { useBridge, useCapability, useRunCommand } from './bridge.tsx'
import { CAP } from './registry.ts'
import { hasProject, hasVisibleModel, sourceNextStep } from './project-state.ts'

export function useRebuildAfterOpen(): (expectedId?: string) => Promise<void> {
  const bridge = useBridge()
  const run = useRunCommand()
  const build = useCapability(CAP.geometryBuild)
  return useCallback(
    async (expectedId?: string) => {
      const { project } = bridge.getSnapshot()
      if (!hasProject(project)) return
      if (expectedId !== undefined && project.id !== expectedId) return
      if (project.source === null || !build.available || hasVisibleModel(project)) return
      if (sourceNextStep(project) !== null) return
      await run({ type: 'geometry.build' }, { announce: 'Đang dựng lại mô hình từ bản đã lưu.' })
    },
    [bridge, build.available, run],
  )
}
