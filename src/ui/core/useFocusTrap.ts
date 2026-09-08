import { useEffect, useRef, type RefObject } from 'react'
import { focusableIn } from './dom.ts'

/**
 * Stack of the traps that are currently mounted. Only the last one enforces
 * focus containment: with two dialogs open, both would otherwise pull focus
 * back into themselves and fight for it.
 */
const trapStack: HTMLElement[] = []

/**
 * Focus an element the interface moved the caret to, and make that focus
 * visible. Engines disagree about whether a programmatic `focus()` counts as
 * focus-visible — Firefox says no for a button — so the ring is asked for
 * explicitly and dropped again as soon as focus leaves.
 */
function focusVisibly(element: HTMLElement): void {
  element.setAttribute('data-focus-ring', 'true')
  const clear = () => {
    element.removeAttribute('data-focus-ring')
    element.removeEventListener('blur', clear)
    element.removeEventListener('pointerdown', clear)
  }
  element.addEventListener('blur', clear)
  element.addEventListener('pointerdown', clear)
  element.focus({ preventScroll: true })
}

/**
 * Modal focus behaviour (UI-05): trap Tab inside the dialog, keep focus visible
 * even when the dialog has a single field, and return focus to the element that
 * opened it when the dialog closes.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  options: { active: boolean; onEscape?: () => void },
): void {
  const { active, onEscape } = options
  // Held in a ref so a new inline handler does not re-arm the trap and yank
  // focus out of the field the user is typing in.
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return

    const opener = document.activeElement as HTMLElement | null
    trapStack.push(node)

    const initial = focusableIn(node)[0] ?? node
    if (initial === node && !node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1')
    focusVisibly(initial)

    /**
     * Escape is answered from the window, not from this node.
     *
     * React attaches its delegated handlers at the root container, which is an
     * ancestor of this dialog: a listener on the dialog node therefore runs
     * *before* the handler of the field the person is typing in, and a dialog
     * that closed here would take the draft with it before the field could say
     * the key was its own. On the window it runs last, and a field that has
     * consumed the key has already stopped the event from arriving. One layer
     * per Escape (UI-05).
     *
     * Only the topmost trap answers, so stacked dialogs close one at a time,
     * and the key is answered wherever focus happens to be — including when it
     * has escaped the dialog, which is what the node listener could not do.
     */
    const onEscapeKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (trapStack[trapStack.length - 1] !== node) return
      event.preventDefault()
      onEscapeRef.current?.()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusableIn(node)
      if (items.length === 0) {
        event.preventDefault()
        node.focus({ preventScroll: true })
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      const current = document.activeElement
      if (event.shiftKey && (current === first || !node.contains(current))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }

    // A focus that escapes the dialog (browser chrome, programmatic move) is
    // pulled back rather than silently left outside the modal — but only by the
    // topmost trap, so stacked dialogs do not tug at each other.
    const onFocusIn = (event: FocusEvent) => {
      if (trapStack[trapStack.length - 1] !== node) return
      if (!node.contains(event.target as Node)) {
        const items = focusableIn(node)
        ;(items[0] ?? node).focus({ preventScroll: true })
      }
    }

    /**
     * Focus that leaves the modal for nothing at all — WebKit blurs to `<body>`
     * rather than focusing a clicked button — never fires `focusin`, so the
     * pull-back above cannot see it. Without this the modal stays on screen with
     * focus behind it, and Escape (handled on this node) stops reaching it.
     */
    const onFocusOut = (event: FocusEvent) => {
      if (trapStack[trapStack.length - 1] !== node) return
      const next = event.relatedTarget as Node | null
      if (next && node.contains(next)) return
      queueMicrotask(() => {
        if (trapStack[trapStack.length - 1] !== node) return
        if (node.contains(document.activeElement)) return
        ;(focusableIn(node)[0] ?? node).focus({ preventScroll: true })
      })
    }

    node.addEventListener('keydown', onKeyDown)
    node.addEventListener('focusout', onFocusOut)
    document.addEventListener('focusin', onFocusIn)
    window.addEventListener('keydown', onEscapeKey)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      node.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('keydown', onEscapeKey)
      const index = trapStack.lastIndexOf(node)
      if (index !== -1) trapStack.splice(index, 1)
      /**
       * Focus goes back to whatever opened this layer — but never outside the
       * layer that is now on top.
       *
       * WebKit does not focus a `<button>` on click, so the remembered opener
       * can be `<body>`. Restoring that after a dialog stacked over another one
       * closes would leave a modal on screen with focus outside it, and the
       * Escape handler lives on the dialog node: the modal would become
       * un-closable by keyboard.
       */
      const topmost = trapStack[trapStack.length - 1]
      const restorable =
        opener !== null &&
        opener !== document.body &&
        document.contains(opener) &&
        (topmost === undefined || topmost.contains(opener))
      if (restorable) opener.focus({ preventScroll: true })
      else if (topmost) (focusableIn(topmost)[0] ?? topmost).focus({ preventScroll: true })
    }
  }, [active, ref])
}

/**
 * Moves focus into a non-modal surface when it opens and gives it back when it
 * closes. Unlike the trap it never constrains Tab, so the user can walk out.
 */
export function useFocusOnOpen(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return
    const opener = document.activeElement as HTMLElement | null
    const target = focusableIn(node)[0] ?? node
    if (target === node && !node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1')
    focusVisibly(target)
    return () => {
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [active, ref])
}
