import { useId, type ComponentPropsWithRef, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon.tsx'

export type ButtonVariant = 'default' | 'primary' | 'done' | 'danger' | 'ghost'

export interface ButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  children?: ReactNode
  variant?: ButtonVariant
  size?: 'default' | 'small'
  icon?: IconName
  iconOnly?: boolean
  block?: boolean
  /** Shortcut shown on the button face and read as part of its description. */
  keyHint?: string
  /**
   * When set the control stays focusable and announces itself as disabled, and
   * the reason is rendered as visible text tied by aria-describedby (UI-04).
   * A button is never dimmed without saying why.
   */
  disabledReason?: string | null
  /** Hides the printed reason but keeps it on the accessible description. */
  reasonHidden?: boolean
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: '',
  primary: 'btn--primary',
  done: 'btn--done',
  danger: 'btn--danger',
  ghost: 'btn--ghost',
}

export function Button({
  children,
  variant = 'default',
  size = 'default',
  icon,
  iconOnly = false,
  block = false,
  keyHint,
  disabledReason,
  reasonHidden = false,
  className = '',
  onClick,
  type = 'button',
  disabled,
  ref,
  ...rest
}: ButtonProps) {
  const reasonId = useId()
  const soft = Boolean(disabledReason)
  const classes = [
    'btn',
    VARIANT_CLASS[variant],
    size === 'small' ? 'btn--small' : '',
    iconOnly ? 'btn--icon' : '',
    block ? 'btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const describedBy = [rest['aria-describedby'], soft ? reasonId : null].filter(Boolean).join(' ')

  return (
    <>
      <button
        {...rest}
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled}
        aria-disabled={soft ? true : undefined}
        aria-describedby={describedBy || undefined}
        onClick={(event) => {
          if (soft) {
            event.preventDefault()
            return
          }
          onClick?.(event)
        }}
      >
        {icon ? <Icon name={icon} size={size === 'small' ? 15 : 17} /> : null}
        {iconOnly ? null : children}
        {keyHint ? (
          <span className="btn__key" aria-hidden="true">
            {keyHint}
          </span>
        ) : null}
      </button>
      {soft ? (
        <span className={reasonHidden ? 'u-visually-hidden' : 'reason'} id={reasonId}>
          {disabledReason}
        </span>
      ) : null}
    </>
  )
}
