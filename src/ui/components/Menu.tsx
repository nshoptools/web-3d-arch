import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button, type ButtonProps } from './Button.tsx'
import { Icon, type IconName } from './Icon.tsx'

export interface MenuItem {
  id: string
  label: string
  icon?: IconName
  onSelect?: () => void
  disabledReason?: string | null
  /** Renders a labelled separator above the item. */
  sectionLabel?: string
}

export interface MenuProps {
  label: string
  items: MenuItem[]
  trigger?: Partial<ButtonProps>
  children?: ReactNode
  align?: 'start' | 'end'
}

/**
 * A non-modal menu: it does not trap focus, Escape closes it and focus returns
 * to the trigger (UI-05). Arrow keys move between items; disabled items keep
 * their reason instead of vanishing.
 */
export function Menu({ label, items, trigger, children, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onDocPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointer)
    return () => document.removeEventListener('pointerdown', onDocPointer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[active]
    node?.focus({ preventScroll: true })
  }, [active, open])

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  const move = (delta: number) => {
    setActive((current) => {
      const next = current + delta
      if (next < 0) return items.length - 1
      if (next >= items.length) return 0
      return next
    })
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <Button
        {...trigger}
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setActive(0)
          setOpen((value) => !value)
        }}
      >
        {children ?? label}
      </Button>
      {open ? (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          data-shortcut-scope="local"
          className="card fc-border"
          style={{
            position: 'absolute',
            insetBlockStart: 'calc(100% + 6px)',
            insetInlineEnd: align === 'end' ? 0 : 'auto',
            insetInlineStart: align === 'start' ? 0 : 'auto',
            zIndex: 'var(--z-popup)',
            inlineSize: 'max-content',
            minInlineSize: '220px',
            maxInlineSize: 'min(320px, 90vw)',
            padding: '6px',
            gap: '2px',
            background: 'var(--b3)',
            boxShadow: '0 16px 36px rgb(0 0 0 / 0.5)',
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              close(true)
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              move(1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              move(-1)
            } else if (event.key === 'Home') {
              event.preventDefault()
              setActive(0)
            } else if (event.key === 'End') {
              event.preventDefault()
              setActive(items.length - 1)
            } else if (event.key === 'Tab') {
              close(false)
            }
          }}
        >
          {items.map((item, index) => (
            <div key={item.id}>
              {item.sectionLabel ? (
                <div className="muted-3" style={{ padding: '6px 8px 2px' }} role="presentation">
                  {item.sectionLabel}
                </div>
              ) : null}
              <button
                type="button"
                role="menuitem"
                tabIndex={index === active ? 0 : -1}
                aria-disabled={item.disabledReason ? true : undefined}
                className="btn btn--ghost"
                style={{ inlineSize: '100%', justifyContent: 'flex-start' }}
                onFocus={() => setActive(index)}
                onClick={() => {
                  if (item.disabledReason) return
                  close(true)
                  item.onSelect?.()
                }}
              >
                {item.icon ? <Icon name={item.icon} size={16} /> : null}
                <span style={{ flex: '1 1 auto', textAlign: 'start' }}>{item.label}</span>
              </button>
              {item.disabledReason ? <span className="reason">{item.disabledReason}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
