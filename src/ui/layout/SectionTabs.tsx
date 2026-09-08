import { useRef, type KeyboardEvent } from 'react'
import type { WorkspaceSection } from '../../contracts/app-bridge.ts'
import { useSnapshot } from '../core/bridge.tsx'
import { useUi, useUiActions } from '../core/ui-state.tsx'
import { Icon } from '../components/Icon.tsx'
import { sectionNavItems, type SectionNavItem } from './section-nav.ts'

export const WORKSPACE_PANEL_ID = 'w3a-workspace-panel'

function useTabRoving(
  items: SectionNavItem[],
  orientation: 'vertical' | 'horizontal',
  onSelect: (id: WorkspaceSection) => void,
) {
  const listRef = useRef<HTMLDivElement>(null)

  const focusAt = (index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    const wrapped = ((index % items.length) + items.length) % items.length
    buttons?.[wrapped]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight'
    const prev = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft'
    if (event.key === next) {
      event.preventDefault()
      focusAt(index + 1)
    } else if (event.key === prev) {
      event.preventDefault()
      focusAt(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusAt(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusAt(items.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const item = items[index]
      if (item && !item.disabledReason) onSelect(item.section.id)
    }
  }

  return { listRef, onKeyDown }
}

interface TabsProps {
  variant: 'rail' | 'mobile'
  inert?: boolean
}

export function SectionTabs({ variant, inert = false }: TabsProps) {
  const snapshot = useSnapshot()
  const { state } = useUi()
  const actions = useUiActions()
  const items = sectionNavItems(snapshot)
  const orientation = variant === 'rail' ? 'vertical' : 'horizontal'
  const select = (id: WorkspaceSection) => actions.setSection(id, true)
  const { listRef, onKeyDown } = useTabRoving(items, orientation, select)

  const rootClass = variant === 'rail' ? 'rail app__rail' : 'mobiletabs app__tabs'
  const itemClass = variant === 'rail' ? 'rail__item' : 'mobiletabs__item'

  return (
    <div
      ref={listRef}
      className={rootClass}
      role="tablist"
      aria-orientation={orientation}
      aria-label="Sáu khu vực thiết kế"
      inert={inert}
    >
      {items.map((item, index) => {
        const selected = state.section === item.section.id
        const disabled = Boolean(item.disabledReason)
        return (
          <button
            key={item.section.id}
            type="button"
            role="tab"
            id={`w3a-tab-${variant}-${item.section.id}`}
            className={itemClass}
            style={{ ['--section-color' as string]: item.section.color } as never}
            aria-selected={selected}
            aria-controls={WORKSPACE_PANEL_ID}
            aria-disabled={disabled || undefined}
            aria-keyshortcuts={item.section.key}
            title={item.disabledReason ?? item.section.sub}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={() => {
              if (disabled) {
                actions.announce(item.disabledReason ?? '')
                actions.toast('warning', item.disabledReason ?? '')
                return
              }
              select(item.section.id)
            }}
          >
            <span className={variant === 'rail' ? 'rail__icon' : ''} aria-hidden="true">
              <Icon name={item.section.icon} size={variant === 'rail' ? 19 : 17} />
            </span>
            <span className={variant === 'rail' ? 'rail__label' : ''}>{item.section.label}</span>
            {item.badge ? (
              <span className="rail__badge" aria-hidden="true">
                {item.badge}
              </span>
            ) : null}
            <span className="u-visually-hidden">
              {item.badgeLabel ? ` — ${item.badgeLabel}` : ''}
              {item.disabledReason ? ` — không dùng được: ${item.disabledReason}` : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}
