const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) =>
      !element.hasAttribute('inert') &&
      element.offsetParent !== null &&
      element.getAttribute('aria-hidden') !== 'true',
  )
}

/**
 * True when the event target is a place where the user is typing. Single-letter
 * shortcuts must never fire here, and must never fire mid-IME composition
 * (UI-05).
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    return type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'range'
  }
  return target.closest('[data-text-entry="true"]') !== null
}

/**
 * True when focus sits inside a surface that owns its own keys (an open menu,
 * the block popup). Global single-letter shortcuts stand down there.
 */
export function isLocalShortcutScope(): boolean {
  if (typeof document === 'undefined') return false
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  return active.closest('[data-shortcut-scope="local"]') !== null
}

export function isComposing(event: KeyboardEvent): boolean {
  // `keyCode === 229` covers browsers that do not set isComposing on keydown.
  return event.isComposing || event.keyCode === 229
}
