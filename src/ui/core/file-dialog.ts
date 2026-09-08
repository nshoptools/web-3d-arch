/**
 * Opens the platform file chooser. The interface only collects the File and
 * hands it to AppBridge.importFile; it never reads, sniffs or decodes bytes.
 */
export function chooseFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null)
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.position = 'fixed'
    input.style.inlineSize = '1px'
    input.style.blockSize = '1px'
    input.style.opacity = '0'
    input.style.pointerEvents = 'none'

    let settled = false
    const finish = (file: File | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(file)
    }

    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true })
    // Chromium fires `cancel` on dismiss; other engines simply never change.
    input.addEventListener('cancel', () => finish(null), { once: true })
    document.body.append(input)
    input.click()
  })
}

export const ACCEPT_SOURCE = 'image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg'
export const ACCEPT_MESH = '.stl,.obj,model/stl,model/obj'
export const ACCEPT_PROJECT = '.zip,application/zip'
export const ACCEPT_FONT = '.ttf,.otf,font/ttf,font/otf'
export const ACCEPT_PRESET = '.json,application/json'
/**
 * A personal printer profile (UI-C11). Same media type as a preset and kept as
 * its own constant so the two entry points can never be renamed into each
 * other: they go to different readers behind different purposes.
 */
export const ACCEPT_PRINTER_PROFILE = '.json,application/json'
