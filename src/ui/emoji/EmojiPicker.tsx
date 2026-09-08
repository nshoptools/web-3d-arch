/**
 * Emoji chooser (SRC-02, UI-04).
 *
 * Artwork is always the bridge's own preview URL rendered through <img>. The
 * interface never injects SVG markup from a file and never substitutes a system
 * emoji font or a placeholder for catalog artwork.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { EmojiEntry, Verdict } from '../../contracts/app-bridge.ts'
import { useAsyncAction, useBridge, useRunCommand } from '../core/bridge.tsx'
import { useUi, useUiActions } from '../core/ui-state.tsx'
import { useProjectGate } from '../core/project-gate.ts'
import { Button } from '../components/Button.tsx'
import { CheckField, TextField } from '../components/Fields.tsx'

/** SRC-02 print ratings, mapped onto the contract's four verdicts. */
const PRINT_LABEL: Record<Verdict, string> = {
  pass: 'in tốt',
  unsupported: 'cần chỉnh',
  fail: 'không nên in',
  unverified: 'chưa đo',
}

const EXAMPLES = ['trái tim', 'la co', 'mặt cười', '1F600', 'ngôi sao']

interface Collection {
  id: string
  label: string
}

/** The two virtual groups required by SRC-02, addressed as collection ids. */
const VIRTUAL: Collection[] = [
  { id: 'recent', label: 'Gần đây' },
  { id: 'favorite', label: 'Yêu thích' },
]

function useColumnCount(): number {
  const [cols, setCols] = useState(9)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const queries: [string, number][] = [
      ['(width <= 420px)', 5],
      ['(width <= 1023px)', 6],
      ['(width <= 1400px)', 7],
    ]
    const lists = queries.map(([query]) => window.matchMedia(query))
    const update = () => {
      const index = lists.findIndex((list) => list.matches)
      setCols(index === -1 ? 9 : (queries[index]?.[1] ?? 9))
    }
    update()
    for (const list of lists) list.addEventListener('change', update)
    return () => {
      for (const list of lists) list.removeEventListener('change', update)
    }
  }, [])
  return cols
}

export function EmojiPicker() {
  const bridge = useBridge()
  const run = useRunCommand()
  const uiActions = useUiActions()
  const { state } = useUi()
  const gate = useProjectGate()
  const listId = useId()
  const cols = useColumnCount()

  const [request, setRequest] = useState({ query: '', collectionId: '', offset: 0 })
  const { query, collectionId, offset } = request
  const setQuery = (value: string) => setRequest({ query: value, collectionId, offset: 0 })
  const setCollectionId = (value: string) => setRequest({ query, collectionId: value, offset: 0 })
  const [entries, setEntries] = useState<EmojiEntry[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  // Which entries are already favourites is read back from the "favorite"
  // virtual collection, so the toggle sends the state the core does not have —
  // the interface never keeps its own idea of the favourite list (UI-C07).
  const [favourites, setFavourites] = useState<Set<string> | null>(null)
  const [favouriteEpoch, setFavouriteEpoch] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void bridge
      .queryEmoji(query, collectionId || undefined, offset)
      .then((result) => {
        if (cancelled) return
        setEntries((previous) => (offset === 0 ? result.entries : [...previous, ...result.entries]))
        setTotal(result.total)
        setCollections(result.collections)
        setError(null)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Không đọc được bộ emoji.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bridge, collectionId, offset, query])

  useEffect(() => {
    let cancelled = false
    void bridge
      .queryEmoji('', 'favorite', 0)
      .then((result) => {
        if (!cancelled) setFavourites(new Set(result.entries.map((entry) => entry.id)))
      })
      .catch(() => {
        // Unknown is not "not a favourite": the toggle says so rather than
        // guessing a direction.
        if (!cancelled) setFavourites(null)
      })
    return () => {
      cancelled = true
    }
  }, [bridge, favouriteEpoch])

  // The filter only hides items measured as "không nên in". Items that were
  // never measured are never hidden (SRC-02).
  const hidden = useMemo(
    () => (state.emojiHardPrintFilter ? entries.filter((entry) => entry.verdict === 'fail') : []),
    [entries, state.emojiHardPrintFilter],
  )
  const shown = useMemo(
    () => (state.emojiHardPrintFilter ? entries.filter((entry) => entry.verdict !== 'fail') : entries),
    [entries, state.emojiHardPrintFilter],
  )

  useEffect(() => {
    if (activeIndex >= shown.length) setActiveIndex(Math.max(0, shown.length - 1))
  }, [activeIndex, shown.length])

  const active = shown[activeIndex]

  const select = useAsyncAction(
    async (entry: EmojiEntry) => bridge.selectEmoji(entry.id, entry.collectionId),
    { success: 'Đã chọn emoji làm nguồn thiết kế.' },
  )

  const favourite = useAsyncAction(async (entry: EmojiEntry, next: boolean) => {
    const result = await run(
      {
        type: 'emoji.favorite',
        id: entry.id,
        collectionId: entry.collectionId,
        favorite: next,
      },
      {
        success: next
          ? `Đã thêm ${entry.label} vào Yêu thích.`
          : `Đã bỏ ${entry.label} khỏi Yêu thích.`,
      },
    )
    // Re-read the virtual collection rather than patching a local set.
    if (result.ok) setFavouriteEpoch((value) => value + 1)
  })

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = (delta: number) => {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, Math.min(shown.length - 1, index + delta)))
    }
    if (event.key === 'ArrowRight') move(1)
    else if (event.key === 'ArrowLeft') move(-1)
    else if (event.key === 'ArrowDown') move(cols)
    else if (event.key === 'ArrowUp') move(-cols)
    else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(Math.max(0, shown.length - 1))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (gate.reason) {
        uiActions.announce(gate.reason)
        uiActions.toast('warning', gate.reason)
        return
      }
      if (active) void select.run(active)
    }
  }

  const allCollections = [{ id: '', label: 'Tất cả bộ nguồn' }, ...VIRTUAL, ...collections]

  return (
    <div className="stack">
      <TextField
        label="Tìm emoji"
        type="search"
        value={query}
        placeholder="Ví dụ: trái tim, la co, 1F600"
        hint="Tìm được cả khi bỏ dấu; mọi từ trong ô tìm đều phải khớp."
        onChange={setQuery}
      />

      <div className="row" role="group" aria-label="Ví dụ tìm">
        <span className="muted-3">Ví dụ:</span>
        {EXAMPLES.map((example) => (
          <Button key={example} size="small" variant="ghost" onClick={() => setQuery(example)}>
            {example}
          </Button>
        ))}
      </div>

      <div className="row" role="group" aria-label="Bộ nguồn emoji">
        {allCollections.map((collection) => (
          <Button
            key={collection.id || 'all'}
            size="small"
            variant={collectionId === collection.id ? 'primary' : 'default'}
            aria-pressed={collectionId === collection.id}
            onClick={() => setCollectionId(collection.id)}
          >
            {collection.label}
          </Button>
        ))}
      </div>

      <CheckField
        label="Lọc bớt mục đã đo là không nên in"
        checked={state.emojiHardPrintFilter}
        hint="Mục chưa đo không bao giờ bị lọc."
        onChange={(checked) => uiActions.setEmojiHardPrintFilter(checked)}
      />

      {error ? (
        <div className="diag diag--error fc-border">
          <div className="diag__msg">{error}</div>
          <div className="diag__detail">
            Bộ nguồn thiếu mã sẽ báo thiếu; giao diện không thay bằng bộ khác hay hình tạm.
          </div>
        </div>
      ) : null}

      <div
        ref={gridRef}
        id={listId}
        className="emoji-grid fc-border"
        style={{ ['--emoji-cols' as string]: cols } as never}
        role="listbox"
        tabIndex={0}
        aria-label="Lưới emoji"
        aria-activedescendant={
          active ? `${listId}-${active.collectionId}-${active.id}` : undefined
        }
        onKeyDown={onGridKeyDown}
      >
        {shown.map((entry, index) => (
          <div
            key={`${entry.collectionId}:${entry.id}`}
            id={`${listId}-${entry.collectionId}-${entry.id}`}
            role="option"
            aria-selected={index === activeIndex}
            aria-label={`${entry.label} — ${PRINT_LABEL[entry.verdict]}`}
            className="emoji-cell fc-border"
            data-hardprint={entry.verdict === 'fail' ? 'true' : 'false'}
            onClick={() => {
              setActiveIndex(index)
              // Picking a cell always highlights it; only adopting it as the
              // project source needs a project, and that is said, not silently
              // sent and refused.
              if (gate.reason) {
                uiActions.announce(gate.reason)
                uiActions.toast('warning', gate.reason)
                return
              }
              void select.run(entry)
            }}
          >
            <img src={entry.previewUrl} alt="" loading="lazy" decoding="async" width={32} height={32} />
          </div>
        ))}
        {shown.length === 0 && !loading ? (
          <p className="emoji-grid__group" style={{ position: 'static' }}>
            Không có mục nào khớp. Thử bỏ bớt từ khóa hoặc đổi bộ nguồn.
          </p>
        ) : null}
      </div>

      <div className="row" aria-live="polite">
        <span className="muted">
          {loading ? 'Đang tải…' : `Hiện ${shown.length} / ${total} mục`}
          {hidden.length > 0 ? ` · đang lọc ${hidden.length} mục khó in trong trang này` : ''}
        </span>
      </div>

      {/* Favourite is a separate control so the option itself stays a plain
          selectable option (UI-06). */}
      {/* Not a live region: the listbox already announces the active option, so
          announcing the detail card again would repeat on every arrow key. */}
      {active ? (
        <div className="card fc-border">
          <div className="row">
            <img src={active.previewUrl} alt="" width={28} height={28} />
            <strong className="grow">{active.label}</strong>
            <span className={`chip ${active.verdict === 'fail' ? 'chip--warn' : 'chip--muted'} fc-border`}>
              {PRINT_LABEL[active.verdict]}
            </span>
          </div>
          <p className="muted-3" style={{ margin: 0 }}>
            Mã: <code>{active.text}</code> · bộ: {active.collectionId}. Hạng in gắn với phép kiểm
            của nguồn; “chưa đo” không phải “in tốt”.
          </p>
          <div className="row">
            <Button
              icon="check"
              variant="primary"
              disabled={select.pending}
              // Browsing the catalogue needs no project; adopting one as the
              // source does. The grid stays usable and only this says no.
              disabledReason={gate.reason}
              onClick={() => void select.run(active)}
            >
              Dùng làm nguồn
            </Button>
            <Button
              icon="star"
              aria-pressed={favourites ? favourites.has(active.id) : undefined}
              disabled={favourite.pending}
              disabledReason={
                favourites
                  ? null
                  : 'Chưa đọc được bộ Yêu thích, nên chưa biết mục này đang ở trạng thái nào.'
              }
              onClick={() => {
                if (!favourites) return
                void favourite.run(active, !favourites.has(active.id))
              }}
            >
              {favourites?.has(active.id) ? 'Bỏ khỏi Yêu thích' : 'Thêm vào Yêu thích'}
            </Button>
          </div>
        </div>
      ) : null}

      {entries.length < total ? (
        <Button
          block
          icon="plus"
          disabled={loading}
          onClick={() => setRequest({ query, collectionId, offset: entries.length })}
        >
          Tải thêm ({entries.length}/{total})
        </Button>
      ) : null}
    </div>
  )
}
