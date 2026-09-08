import { cloneElement, useId, useState, type ReactElement, type ReactNode } from 'react'

type Describable = ReactElement<{ 'aria-describedby'?: string }>

export interface TooltipProps {
  text: ReactNode
  children: Describable
}

/**
 * Appears on hover and on keyboard focus, dismisses on Escape and never sits
 * over the control it describes (UI-05). It is a description, not a label: the
 * wrapped control keeps its own accessible name.
 */
export function Tooltip({ text, children }: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const visible = open && !dismissed
  const describedBy = children.props['aria-describedby']
  const trigger = cloneElement(children, {
    'aria-describedby': describedBy ? `${describedBy} ${id}-sr` : `${id}-sr`,
  })

  return (
    <span
      className="tip-wrap"
      onPointerEnter={() => {
        setDismissed(false)
        setOpen(true)
      }}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => {
        setDismissed(false)
        setOpen(true)
      }}
      onBlurCapture={() => setOpen(false)}
      onKeyDown={(event) => {
        // Only while the bubble is actually up. `open` stays true for as long as
        // the control keeps focus, so consuming on that would swallow every
        // Escape after the first one and leave the person unable to close the
        // drawer or the dialog underneath: one layer per Escape (UI-05).
        if (event.key === 'Escape' && visible) {
          event.preventDefault()
          event.stopPropagation()
          setDismissed(true)
        }
      }}
    >
      {visible ? (
        <span role="tooltip" className="tip fc-border">
          {text}
        </span>
      ) : null}
      {/* The description stays attached even while the bubble is hidden, so a
          screen reader user gets the same text without a hover event. */}
      <span className="u-visually-hidden" id={`${id}-sr`}>
        {text}
      </span>
      {trigger}
    </span>
  )
}
