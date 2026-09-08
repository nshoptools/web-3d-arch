import { useId, useRef, type MouseEvent, type ReactNode } from 'react'
import { useFocusTrap } from '../core/useFocusTrap.ts'
import { Button } from './Button.tsx'

export interface DialogProps {
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  /** 'search' places the box near the top of the viewport (UI-05). */
  layout?: 'center' | 'search'
  wide?: boolean
  description?: ReactNode
  /** Set for a dialog whose own content owns the initial focus target. */
  className?: string
}

export function Dialog({
  title,
  children,
  footer,
  onClose,
  layout = 'center',
  wide = false,
  description,
  className = '',
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  useFocusTrap(ref, { active: true, onEscape: onClose })

  const onBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div
      className={`dialog-backdrop dialog-backdrop--${layout}`}
      onMouseDown={onBackdropMouseDown}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={[
          'dialog',
          wide ? 'dialog--wide' : '',
          layout === 'search' ? 'dialog--search' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="dialog__head">
          <h2 className="dialog__title" id={titleId}>
            {title}
          </h2>
          <Button variant="ghost" icon="close" iconOnly aria-label="Đóng hộp thoại" onClick={onClose} />
        </div>
        {description ? (
          <p className="muted" id={descId} style={{ margin: 0, padding: '0 14px' }}>
            {description}
          </p>
        ) : null}
        <div className="dialog__body">{children}</div>
        {footer ? <div className="dialog__foot">{footer}</div> : null}
      </div>
    </div>
  )
}
