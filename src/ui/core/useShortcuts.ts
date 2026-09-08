import { useEffect } from 'react'
import { COMMANDS, type CommandDef, type KeyBinding } from './registry.ts'
import { isComposing, isLocalShortcutScope, isTextEntryTarget } from './dom.ts'

export interface ShortcutOptions {
  step: 1 | 2
  /** False while a modal layer owns the keyboard. */
  enabled: boolean
  onCommand: (commandId: string) => void
}

function normalise(key: string): string {
  if (key.length === 1) return key.toLowerCase()
  return key.toLowerCase()
}

function matches(binding: KeyBinding, event: KeyboardEvent): boolean {
  if (normalise(event.key) !== binding.key) return false

  const ctrl = event.ctrlKey || event.metaKey
  if (binding.single) {
    // Single-character keys never fire with a modifier, inside text entry or
    // during IME composition (UI-05). Shift is refused for letters and digits
    // so Shift+Z is not undo; punctuation keys such as / are produced with
    // Shift on some layouts, so there the modifier is part of the character.
    if (ctrl || event.altKey) return false
    if (event.shiftKey && /^[a-z0-9]$/.test(binding.key)) return false
    if (isComposing(event)) return false
    if (isTextEntryTarget(event.target)) return false
    // A menu or a popup that owns its own keys keeps them (UI-05: Escape and
    // local keys peel one layer at a time).
    if (isLocalShortcutScope()) return false
    return true
  }

  if (ctrl !== (binding.ctrl ?? false)) return false
  if (event.shiftKey !== (binding.shift ?? false)) return false
  if (event.altKey) return false
  // Undo and redo belong to the caret while the caret owns a text field.
  if (binding.blockInTextEntry && isTextEntryTarget(event.target)) return false
  return true
}

function inScope(command: CommandDef, step: 1 | 2): boolean {
  return command.scope === 'both' || command.scope === step
}

export function useShortcuts({ step, enabled, onCommand }: ShortcutOptions): void {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      for (const command of COMMANDS) {
        if (!inScope(command, step)) continue
        for (const binding of command.bindings) {
          if (!matches(binding, event)) continue
          event.preventDefault()
          onCommand(command.id)
          return
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, onCommand, step])
}
