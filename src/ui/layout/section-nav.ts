import type { AppSnapshot } from '../../contracts/app-bridge.ts'
import { SECTIONS, type SectionDef } from '../core/registry.ts'
import { hasVisibleModel } from '../core/project-state.ts'
import { VERDICT_LABEL } from '../core/text.ts'

export interface SectionNavItem {
  section: SectionDef
  badge: string | null
  /** Spoken form of the badge; never a bare tick standing in for a verdict. */
  badgeLabel: string | null
  disabledReason: string | null
}

const VERDICT_BADGE = {
  pass: 'đạt',
  fail: 'lỗi',
  unverified: '?',
  unsupported: '–',
} as const

/**
 * One source for the desktop rail and the mobile tab bar (UI-01): same order,
 * same badges, same disabled reasons.
 *
 * A missing source does not lock a section — each section shows an empty state
 * with a way forward instead. Only a session that cannot own design work gates
 * the design sections, and the library stays open so local data can be rescued
 * (FND-02).
 */
export function sectionNavItems(snapshot: AppSnapshot): SectionNavItem[] {
  const { project, library, session } = snapshot

  const sessionGate =
    session.status === 'signed-out'
      ? 'Cần đăng nhập để mở không gian thiết kế của bạn.'
      : session.status === 'expired'
        ? 'Phiên đã hết hạn. Đăng nhập lại để tiếp tục thiết kế; thư viện vẫn mở để cứu dữ liệu.'
        : session.status === 'checking'
          ? 'Đang kiểm tra phiên đăng nhập.'
          : null

  return SECTIONS.map((section) => {
    let badge: string | null = null
    let badgeLabel: string | null = null

    if (section.id === 'materials') {
      badge = String(project.stats.materialCount)
      badgeLabel = `${project.stats.materialCount} vật liệu trong bảng màu`
    }

    if (section.id === 'library') {
      badge = String(library.length)
      badgeLabel = `${library.length} dự án trong thư viện`
    }

    if (section.id === 'export') {
      // Text, not a tick: a verdict is a measured result, not a decoration —
      // and with no model there is no result at all, only the fallback the
      // controller puts in its place. What the badge must not say is that the
      // whole section is unusable without a model: the formats that read a
      // committed source or the renderer do not need one.
      if (!hasVisibleModel(project)) {
        badge = '–'
        badgeLabel =
          'Chưa dựng lần nào, nên chưa có kết quả kiểm. Các đường xuất không cần lưới vẫn mở.'
      } else {
        badge = VERDICT_BADGE[project.stats.verdict]
        // The verdict was measured on the retained lease. When that lease is
        // behind the document, saying so is the difference between a result and
        // a result about something else.
        badgeLabel = project.visibleModelStale
          ? `Kết quả dựng của bản sửa ${project.visibleModelRevision} (mô hình cũ): ` +
            `${VERDICT_LABEL[project.stats.verdict]}`
          : `Kết quả dựng: ${VERDICT_LABEL[project.stats.verdict]}`
      }
    }

    const disabledReason = section.id === 'library' ? null : sessionGate

    return { section, badge, badgeLabel, disabledReason }
  })
}
