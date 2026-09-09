import { useUiActions } from '../core/ui-state.tsx'
import { Menu, type MenuItem } from '../components/Menu.tsx'

/**
 * Help lives in one place, reachable by pointer and keyboard from every state
 * of the interface (start screen and workspace alike). It opens the same
 * dialogs the quick-search commands open, so nothing here is a second table.
 */
export function HelpMenu() {
  const actions = useUiActions()
  const items: MenuItem[] = [
    {
      id: 'shortcuts',
      label: 'Bảng phím tắt',
      icon: 'help',
      onSelect: () => actions.openDialog({ kind: 'shortcuts' }),
    },
    {
      id: 'diagnostics',
      label: 'Nhật ký và chẩn đoán',
      icon: 'dots',
      onSelect: () => actions.openDialog({ kind: 'diagnostics' }),
    },
    {
      id: 'about',
      label: 'Giới thiệu, bản dựng và giấy phép',
      icon: 'info',
      onSelect: () => actions.openDialog({ kind: 'about' }),
    },
  ]
  return (
    <Menu label="Trợ giúp" items={items} trigger={{ size: 'small', icon: 'help', 'aria-label': 'Trợ giúp' }}>
      <span className="topbar__help-label">Trợ giúp</span>
    </Menu>
  )
}
