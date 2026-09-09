import { useCapability, useSnapshot } from '../core/bridge.tsx'
import { useUiActions } from '../core/ui-state.tsx'
import { CAP } from '../core/registry.ts'
import { Button } from '../components/Button.tsx'
import { Menu, type MenuItem } from '../components/Menu.tsx'
import { userLabel } from '../core/text.ts'

const STATUS_LABEL = {
  checking: 'Đang kiểm tra phiên',
  'signed-out': 'Chưa đăng nhập',
  'signed-in': 'Đã đăng nhập',
  'offline-lease': 'Ngoại tuyến có hạn',
  expired: 'Phiên đã hết hạn',
} as const

/**
 * Account menu on the header (AI-04). Owner-only entries stay visible with a
 * reason for a member rather than disappearing, so the shape of the product is
 * the same for everyone and nothing looks broken.
 */
export function AccountMenu() {
  const snapshot = useSnapshot()
  const actions = useUiActions()
  const memberAdmin = useCapability(CAP.memberAdmin)
  const systemPolicy = useCapability(CAP.systemPolicy)
  const { session } = snapshot
  const user = session.user
  const isOwner = user?.role === 'owner'

  if (session.status === 'signed-out' || session.status === 'expired') {
    const expired = session.status === 'expired'
    return (
      <div className="row">
        <span className={`chip ${expired ? 'chip--warn' : 'chip--muted'} fc-border`}>
          {STATUS_LABEL[session.status]}
        </span>
        <Button
          size="small"
          variant="primary"
          icon="user"
          onClick={() =>
            // An expired session already knows who you are, so it goes straight
            // to the re-authentication path (ACC-01).
            actions.openDialog({ kind: 'sign-in', mode: expired ? 'reauth' : 'sign-in' })
          }
        >
          {expired ? 'Đăng nhập lại' : 'Đăng nhập'}
        </Button>
      </div>
    )
  }

  if (session.status === 'checking') {
    return (
      <span className="chip chip--muted fc-border" role="status">
        {STATUS_LABEL.checking}
      </span>
    )
  }

  const items: MenuItem[] = [
    {
      id: 'settings',
      label: 'Cài đặt cá nhân',
      icon: 'gear',
      onSelect: () => actions.openDialog({ kind: 'settings' }),
    },
    {
      id: 'ai',
      label: 'Kết nối AI',
      icon: 'key',
      onSelect: () => actions.openDialog({ kind: 'ai-connections' }),
    },
    {
      id: 'costs',
      label: 'Chi phí của tôi',
      icon: 'coin',
      onSelect: () => actions.openDialog({ kind: 'costs' }),
    },
    {
      id: 'members',
      label: 'Quản lý thành viên',
      icon: 'users',
      sectionLabel: 'Quản trị nhóm',
      ...(isOwner && memberAdmin.available
        ? { onSelect: () => actions.openDialog({ kind: 'members' }) }
        : {
            disabledReason: isOwner
              ? memberAdmin.reason
              : 'Chỉ chủ nhóm quản lý thành viên. Không gian và dữ liệu của bạn không đổi.',
          }),
    },
    {
      id: 'policy',
      label: 'Chính sách hệ thống',
      icon: 'shield',
      ...(isOwner && systemPolicy.available
        ? { onSelect: () => actions.openDialog({ kind: 'policy' }) }
        : {
            disabledReason: isOwner
              ? systemPolicy.reason
              : 'Chỉ chủ nhóm đặt chính sách hệ thống.',
          }),
    },
    {
      id: 'reauth',
      label: 'Xác thực lại',
      icon: 'shield',
      sectionLabel: 'Phiên làm việc',
      ...(session.status === 'offline-lease'
        ? { disabledReason: 'Đang dùng phiên ngoại tuyến. Xác thực lại cần mạng.' }
        : { onSelect: () => actions.openDialog({ kind: 'sign-in', mode: 'reauth' }) }),
    },
    {
      id: 'signout',
      label: 'Đăng xuất',
      icon: 'lock',
      onSelect: () => actions.openDialog({ kind: 'sign-out' }),
    },
  ]

  return (
    <Menu
      label="Menu tài khoản"
      items={items}
      trigger={{ size: 'small', icon: 'user', 'aria-label': `Menu tài khoản của ${userLabel(user)}` }}
    >
      <span style={{ maxInlineSize: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {userLabel(user)}
      </span>
      {session.status === 'offline-lease' ? (
        <span className="chip chip--warn fc-border" style={{ marginInlineStart: 4 }}>
          ngoại tuyến
        </span>
      ) : null}
    </Menu>
  )
}
