import { useEffect, useRef } from 'react'
import { SECTION_BY_ID } from '../core/registry.ts'
import { useUi, useUiActions } from '../core/ui-state.tsx'
import { MQ_COMPACT, useMediaQuery } from '../core/useMediaQuery.ts'
import { Button } from '../components/Button.tsx'
import { WORKSPACE_PANEL_ID } from './SectionTabs.tsx'
import { SourceSection } from '../sections/SourceSection.tsx'
import { ProductSection } from '../sections/ProductSection.tsx'
import { MaterialsSection } from '../sections/MaterialsSection.tsx'
import { ParametersSection } from '../sections/ParametersSection.tsx'
import { ExportSection } from '../sections/ExportSection.tsx'
import { LibrarySection } from '../sections/LibrarySection.tsx'

/**
 * Give the keyboard back when the drawer closes.
 *
 * The panel becomes `inert` on close, so whatever was focused inside it is
 * dropped and the caret lands on `<body>` — the end of the document for anyone
 * moving by Tab, and nothing at all for anyone reading by control. Focus goes
 * back to the control that opened the drawer, or to the section tab that owns
 * it when that control is gone or has itself become unreachable.
 *
 * Nothing is taken from a control that already has it: closing the drawer by
 * activating something outside it must not pull the keyboard away.
 */
/**
 * Can this element actually take the keyboard right now?
 *
 * `tabStop` asks the stronger question — is it somewhere the user could have
 * tabbed to — which is what a returning focus target should normally be. The
 * last resort in the list is the work surface, which is deliberately outside the
 * tab order and exists to be focused programmatically, so it is asked the
 * weaker one.
 */
function usable(node: Element | null, tabStop: boolean): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false
  if (!node.isConnected || node.closest('[inert]')) return false
  if (tabStop && node.tabIndex < 0) return false
  // A control that is not drawn cannot take the keyboard: focus() on a
  // display:none element is a no-op and leaves the caret on <body>. The section
  // rail and the mobile tab bar swap places by media query, so which of the two
  // is on screen depends on the width the drawer happens to close at.
  if (node.getClientRects().length === 0) return false
  return getComputedStyle(node).visibility !== 'hidden'
}

function returnFocus(panel: HTMLElement | null, opener: HTMLElement | null, section: string) {
  const active = document.activeElement
  if (active && active !== document.body && !panel?.contains(active)) return
  const candidates: [Element | null, boolean][] = [
    [opener, true],
    // The tab for this same section, whichever of the two is on screen …
    [document.getElementById(`w3a-tab-rail-${section}`), true],
    [document.getElementById(`w3a-tab-mobile-${section}`), true],
    // … and if neither is, the work surface itself — the skip link's own
    // destination. Anything is better than the end of the document.
    [document.getElementById('w3a-main'), false],
  ]
  for (const [candidate, tabStop] of candidates) {
    if (usable(candidate, tabStop)) {
      candidate.focus()
      return
    }
  }
}

export function Panel() {
  const { state } = useUi()
  const actions = useUiActions()
  const compact = useMediaQuery(MQ_COMPACT)
  const section = SECTION_BY_ID.get(state.section)
  const ref = useRef<HTMLElement>(null)
  const open = compact ? state.drawerOpen : !state.panelCollapsed

  // On a compact layout the drawer takes focus when it opens and gives it back
  // to the control that opened it when it closes.
  //
  // Escape is deliberately not handled here. A listener added to this element
  // runs before React's delegated handlers, which are attached at the root
  // container, so a drawer that dismissed itself here would close before the
  // focused field could say the key was its own. One layer per Escape (UI-05):
  // a field cancels its draft and stops the event, and anything that reaches
  // the window closes the drawer through the single listener in AppShell.
  const wasOpen = useRef(open)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (compact && open && !wasOpen.current) {
      const active = document.activeElement
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null
      ref.current?.querySelector<HTMLElement>('h2, [tabindex="-1"]')?.focus?.()
    } else if (compact && !open && wasOpen.current) {
      returnFocus(ref.current, opener.current, state.section)
      opener.current = null
    }
    wasOpen.current = open
  }, [compact, open, state.section])

  if (!section) return null

  return (
    <aside
      ref={ref}
      id={WORKSPACE_PANEL_ID}
      className="panel app__panel fc-border"
      role="tabpanel"
      aria-label={`Khu ${section.label}`}
      data-open={open ? 'true' : 'false'}
      data-section={section.id}
      style={{ ['--section-color' as string]: section.color } as never}
      inert={!open}
    >
      <div className="panel__head">
        <div className="panel__titles">
          <h2 className="panel__title" tabIndex={-1}>
            {section.label}
          </h2>
          <p className="panel__sub">{section.sub}</p>
        </div>
        <div className="panel__widgets">
          {compact ? (
            <Button size="small" icon="close" onClick={() => actions.openDrawer(false)}>
              Đóng
            </Button>
          ) : (
            <Button
              size="small"
              icon="chevronLeft"
              keyHint="\"
              aria-keyshortcuts="Backslash"
              onClick={() => actions.setPanelCollapsed(true)}
            >
              Gập bảng
            </Button>
          )}
        </div>
      </div>

      <div className="panel__body">
        {section.id === 'source' ? <SourceSection /> : null}
        {section.id === 'product' ? <ProductSection /> : null}
        {section.id === 'materials' ? <MaterialsSection /> : null}
        {section.id === 'parameters' ? <ParametersSection /> : null}
        {section.id === 'export' ? <ExportSection /> : null}
        {section.id === 'library' ? <LibrarySection /> : null}
      </div>
    </aside>
  )
}

export function PanelTab() {
  const { state } = useUi()
  const actions = useUiActions()
  const compact = useMediaQuery(MQ_COMPACT)
  if (compact) return null
  return (
    <button
      type="button"
      className="panel-tab fc-border"
      aria-expanded={!state.panelCollapsed}
      aria-controls={WORKSPACE_PANEL_ID}
      aria-keyshortcuts="Backslash"
      title={state.panelCollapsed ? 'Mở bảng thiết lập (\\)' : 'Gập bảng thiết lập (\\)'}
      onClick={() => actions.setPanelCollapsed(!state.panelCollapsed)}
    >
      <span className="panel-tab__glyph" aria-hidden="true">
        {state.panelCollapsed ? '›' : '‹'}
      </span>
      <span className="u-visually-hidden">
        {state.panelCollapsed ? 'Mở bảng thiết lập' : 'Gập bảng thiết lập'}
      </span>
    </button>
  )
}
