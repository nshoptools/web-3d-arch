/**
 * Public entry point of the interface layer.
 *
 * The host owns the element and the bridge; this module owns everything drawn
 * inside that element and nothing outside it. Call the returned function to
 * take the whole interface back down again.
 *
 *   const dispose = mountApp(document.getElementById('app')!, bridge)
 *   // …
 *   dispose()
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { AppBridge } from '../contracts/app-bridge.ts'
import { BridgeProvider } from './core/bridge.tsx'
import { UiStateProvider } from './core/ui-state.tsx'
import { AppShell } from './AppShell.tsx'

import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'

export function mountApp(element: HTMLElement, bridge: AppBridge): () => void {
  const root = createRoot(element)
  root.render(
    <StrictMode>
      <BridgeProvider bridge={bridge}>
        <UiStateProvider>
          <AppShell />
        </UiStateProvider>
      </BridgeProvider>
    </StrictMode>,
  )
  return () => {
    root.unmount()
  }
}

export { AppShell } from './AppShell.tsx'
export { BridgeProvider, useBridge, useSnapshot } from './core/bridge.tsx'
export { UiStateProvider } from './core/ui-state.tsx'
export { COMMANDS, SECTIONS, TOOLS_2D, VIEW_ACTIONS, CAP } from './core/registry.ts'
