import { useId, type ReactNode } from 'react'
import { Icon } from './Icon.tsx'

export interface CollapsibleGroupProps {
  title: ReactNode
  children: ReactNode
  open: boolean
  onToggle: () => void
  /** Colour stripe and title colour for a parameter group (UI-04). */
  color?: string
  count?: ReactNode
  extra?: ReactNode
  /** Rendered above the body, inside the group, when open. */
  note?: ReactNode
}

export function CollapsibleGroup({
  title,
  children,
  open,
  onToggle,
  color,
  count,
  extra,
  note,
}: CollapsibleGroupProps) {
  const bodyId = useId()
  return (
    <section
      className="group fc-border"
      style={color ? ({ ['--group-color' as string]: color } as never) : undefined}
    >
      <h3 style={{ margin: 0 }}>
        <button
          type="button"
          className="group__head"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={15} />
          <span className="group__name">{title}</span>
          {count !== undefined ? <span className="group__count">{count}</span> : null}
        </button>
      </h3>
      <div id={bodyId} className="group__body" hidden={!open}>
        {note}
        {extra}
        {children}
      </div>
    </section>
  )
}
