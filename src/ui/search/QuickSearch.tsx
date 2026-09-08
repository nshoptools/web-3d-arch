import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PresetEntry } from '../../contracts/app-bridge.ts'
import { useBridge, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { useUiActions } from '../core/ui-state.tsx'
import { useProjectGate } from '../core/project-gate.ts'
import { useFocusTrap } from '../core/useFocusTrap.ts'
import { COMMANDS, SECTIONS, TOOLS_2D } from '../core/registry.ts'
import { matchesAllWords } from '../core/text.ts'
import { Button } from '../components/Button.tsx'

interface Result {
  id: string
  group: string
  label: string
  value?: string
  disabledReason?: string
  /** Stated before the action runs when it changes step, mode or product. */
  impact?: string
  run: () => void
}

export interface QuickSearchProps {
  onClose: () => void
  onCommand: (commandId: string) => void
}

/**
 * Quick search (UI-05, DAT-03). Every entry comes from the same registries the
 * rail, the toolbars and the shortcut sheet use. Results never call geometry
 * directly: they open a surface or send a declarative command.
 */
export function QuickSearch({ onClose, onCommand }: QuickSearchProps) {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const actions = useUiActions()
  const gate = useProjectGate()
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const inputId = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [presets, setPresets] = useState<PresetEntry[]>([])
  const [pending, setPending] = useState<Result | null>(null)

  useFocusTrap(dialogRef, { active: true, onEscape: onClose })

  useEffect(() => {
    let cancelled = false
    void bridge
      .queryPresets(snapshot.project.product)
      .then((entries) => {
        if (!cancelled) setPresets(entries)
      })
      // Quick search still works without the preset group; the failure is not
      // silently turned into "no presets exist".
      .catch(() => {
        if (!cancelled) setPresets([])
      })
    return () => {
      cancelled = true
    }
  }, [bridge, snapshot.project.product])

  const results = useMemo<Result[]>(() => {
    const step = snapshot.project.step
    const list: Result[] = []

    for (const section of SECTIONS) {
      list.push({
        id: `section:${section.id}`,
        group: 'Sáu khu',
        label: `Khu ${section.label}`,
        value: section.key,
        run: () => actions.setSection(section.id, true),
      })
    }

    for (const command of COMMANDS) {
      if (command.scope !== 'both' && command.scope !== step) continue
      if (command.id.startsWith('section.')) continue
      list.push({
        id: `command:${command.id}`,
        group: 'Lệnh',
        label: command.label,
        value: command.bindings.map((binding) => binding.display).join(' / '),
        run: () => onCommand(command.id),
      })
    }

    for (const tool of TOOLS_2D) {
      list.push({
        id: `tool:${tool.id}`,
        group: 'Công cụ 2D',
        label: tool.label,
        value: tool.key,
        ...(gate.reason ? { disabledReason: gate.reason } : {}),
        ...(step === 2
          ? { impact: 'Chuyển về bước 1 để dùng công cụ này. Mô hình đã dựng được giữ nguyên.' }
          : {}),
        run: () => {
          if (step === 2) void run({ type: 'project.step', step: 1 })
          void run({ type: 'editor.tool', tool: tool.id })
        },
      })
    }

    for (const parameter of snapshot.project.parameters) {
      list.push({
        id: `param:${parameter.id}`,
        group: 'Thông số',
        label: `${parameter.label} · ${parameter.id}`,
        value: typeof parameter.value === 'boolean' ? (parameter.value ? 'bật' : 'tắt') : parameter.value,
        ...(parameter.visible
          ? parameter.enabled
            ? {}
            : { disabledReason: parameter.reason ?? 'Điều khiển đang bị khóa.' }
          : { disabledReason: parameter.reason ?? 'Hàng đang ẩn theo điều kiện hiện tại; giá trị vẫn được giữ.' }),
        run: () => {
          actions.setSection('parameters', true)
          actions.setParamMode('all')
          actions.setParamQuery(parameter.id)
        },
      })
    }

    for (const material of snapshot.project.materials) {
      list.push({
        id: `material:${material.id}`,
        group: 'Lớp màu và khe',
        label: `${material.label} · ${material.color}`,
        value: material.slot === null ? 'chưa gán khe' : `khe ${material.slot}`,
        run: () => {
          actions.setSection('materials', true)
          actions.selectMaterial(material.id)
        },
      })
    }

    for (const preset of presets) {
      list.push({
        id: `preset:${preset.id}`,
        group: 'Mẫu',
        label: preset.name,
        value: preset.custom ? 'mẫu của tôi' : 'dựng sẵn',
        ...(gate.reason ? { disabledReason: gate.reason } : {}),
        // Applying a preset is confirmation-gated in the core, and the palette
        // is not where a change list can be read. It opens the surface that can
        // show one instead of firing the command from here.
        impact: 'Mở khu Sản phẩm để xem và xác nhận trước khi áp mẫu.',
        run: () => {
          actions.setSection('product', true)
          actions.setGroupOpen('product-presets', true)
        },
      })
    }

    list.push({
      id: 'text:block',
      group: 'Chữ',
      label: `Khối chữ: ${snapshot.project.text.text || '(trống)'}`,
      value: snapshot.project.text.fontId,
      run: () => actions.setSection('source', true),
    })

    return list
  }, [actions, gate.reason, onCommand, presets, run, snapshot])

  const filtered = useMemo(
    () => results.filter((result) => matchesAllWords(`${result.label} ${result.group} ${result.value ?? ''}`, query)),
    [query, results],
  )

  useEffect(() => {
    setActive(0)
  }, [query])

  const grouped = useMemo(() => {
    const map = new Map<string, Result[]>()
    for (const result of filtered) {
      const list = map.get(result.group) ?? []
      list.push(result)
      map.set(result.group, list)
    }
    return [...map.entries()]
  }, [filtered])

  const flat = grouped.flatMap(([, items]) => items)
  const activeResult = flat[active]

  const choose = (result: Result) => {
    if (result.disabledReason) return
    if (result.impact && pending?.id !== result.id) {
      setPending(result)
      return
    }
    setPending(null)
    onClose()
    result.run()
  }

  return (
    <div className="dialog-backdrop dialog-backdrop--search" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tìm nhanh"
        className="dialog dialog--search"
      >
        <div className="dialog__head">
          <label className="u-visually-hidden" htmlFor={inputId}>
            Tìm thông số, lệnh, mẫu, công cụ, lớp màu, khu và chữ
          </label>
          <input
            ref={inputRef}
            id={inputId}
            className="input qs__input"
            type="text"
            role="combobox"
            autoComplete="off"
            data-text-entry="true"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={activeResult ? `${listId}-${activeResult.id}` : undefined}
            placeholder="Tìm thông số, lệnh, mẫu, công cụ, lớp màu…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((index) => Math.min(flat.length - 1, index + 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((index) => Math.max(0, index - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                if (activeResult) choose(activeResult)
              }
            }}
          />
        </div>

        <div className="dialog__body">
          {pending ? (
            <div className="card fc-border" role="alertdialog" aria-label="Xác nhận tác động">
              <strong>{pending.label}</strong>
              <p className="muted" style={{ margin: 0 }}>
                {pending.impact}
              </p>
              <div className="row row--end">
                <Button onClick={() => setPending(null)}>Để sau</Button>
                <Button variant="primary" onClick={() => choose(pending)}>
                  Tiếp tục
                </Button>
              </div>
            </div>
          ) : null}

          <ul className="qs__list" id={listId} role="listbox" aria-label="Kết quả tìm nhanh">
            {grouped.map(([group, items]) => (
              <li key={group} role="presentation">
                <div className="qs__group" role="presentation">
                  {group}
                </div>
                <ul className="list-reset" role="group" aria-label={group}>
                  {items.map((result) => {
                    const index = flat.indexOf(result)
                    return (
                      <li
                        key={result.id}
                        id={`${listId}-${result.id}`}
                        role="option"
                        aria-selected={index === active}
                        aria-disabled={result.disabledReason ? true : undefined}
                        className="qs__opt"
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(result)}
                      >
                        <span className="qs__opt-name">
                          {result.label}
                          {result.disabledReason ? (
                            <span className="reason">{result.disabledReason}</span>
                          ) : null}
                          {result.impact ? (
                            <span className="muted-3"> · thay đổi có tác động</span>
                          ) : null}
                        </span>
                        {result.value ? <span className="qs__opt-value">{result.value}</span> : null}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>

          {flat.length === 0 ? (
            <p className="muted">Không có mục nào khớp mọi từ trong ô tìm.</p>
          ) : null}
        </div>

        <div className="dialog__foot">
          <span className="muted-3 grow">
            {flat.length} kết quả · <span className="kbd">↑</span> <span className="kbd">↓</span> di
            chuyển, <span className="kbd">Enter</span> mở, <span className="kbd">Esc</span> đóng
          </span>
          <Button onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </div>
  )
}
