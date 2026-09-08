import { useEffect, useState } from 'react'
import { useAsyncAction, useBridge, useSnapshot } from '../core/bridge.tsx'
import { useUiActions, type SignInMode } from '../core/ui-state.tsx'
import { Button } from '../components/Button.tsx'
import { Dialog } from '../components/Dialog.tsx'
import { CheckField, TextField } from '../components/Fields.tsx'
import { formatBytes, formatDateTime } from '../core/text.ts'

/**
 * The one authentication surface (ACC-01, UI-C12).
 *
 * There is no website password: `signIn` hands the browser to the identity
 * provider in the same tab and the controller owns that redirect. This dialog
 * collects nothing but an optional invite token, states what is about to happen
 * and then gets out of the way — it never reports "signed in" itself, because
 * the answer only arrives back through the snapshot after the round trip.
 */

const MODE_TITLE: Record<SignInMode, string> = {
  'sign-in': 'Đăng nhập',
  invite: 'Nhận lời mời',
  reauth: 'Xác thực lại',
}

const MODE_DESCRIPTION: Record<SignInMode, string> = {
  'sign-in':
    'Nhóm nội bộ, không có đăng ký công khai và không có mật khẩu của website. Đăng nhập đi qua nhà cung cấp định danh, ngay trên tab này.',
  invite:
    'Liên kết mời dùng một lần và hết hạn sau 7 ngày. Mở liên kết không tự tạo phiên: bạn vẫn xác minh ở nhà cung cấp định danh như mọi lần đăng nhập.',
  reauth:
    'Thao tác vừa rồi cần một lần xác thực mới ở nhà cung cấp định danh. Phiên hiện tại được giữ nguyên cho tới khi bạn quay lại.',
}

const MODE_ACTION: Record<SignInMode, string> = {
  'sign-in': 'Tới trang đăng nhập',
  invite: 'Nhận lời mời và đăng nhập',
  reauth: 'Xác thực lại ngay',
}

/** Accepts the raw token or the whole invite link and keeps only the token. */
export function readInviteToken(raw: string): string {
  const value = raw.trim()
  if (value === '') return ''
  const marker = value.match(/[#?&](?:invite|inviteToken)=([^&\s#]+)/)
  if (marker?.[1]) {
    try {
      return decodeURIComponent(marker[1])
    } catch {
      return marker[1]
    }
  }
  // A bare link with the token as its last path segment.
  if (/^https?:\/\//i.test(value)) {
    const tail = value.split(/[?#]/)[0]?.split('/').filter(Boolean).pop()
    return tail ?? ''
  }
  return value
}

export function SignInDialog({ mode, onClose }: { mode: SignInMode; onClose: () => void }) {
  const bridge = useBridge()
  const snapshot = useSnapshot()
  const actions = useUiActions()
  const [token, setToken] = useState('')
  const [fromLink, setFromLink] = useState(false)

  // An invite link carries its token in the fragment (docs/backend/API.md), so
  // arriving through one pre-fills the field. The fragment is read, never
  // written and never logged; clearing the address bar belongs to the
  // controller that owns routing.
  useEffect(() => {
    if (mode !== 'invite') return
    if (typeof window === 'undefined') return
    const found = readInviteToken(window.location.hash)
    if (found) {
      setToken(found)
      setFromLink(true)
    }
  }, [mode])

  const start = useAsyncAction(
    async () => {
      const clean = readInviteToken(token)
      try {
        if (mode === 'invite') return await bridge.signIn({ inviteToken: clean })
        if (mode === 'reauth') return await bridge.signIn({ reauthenticate: true })
        return await bridge.signIn()
      } finally {
        // The token leaves the form as soon as the call settles, on every path.
        setToken('')
      }
    },
    { announce: 'Đang chuyển sang nhà cung cấp định danh.' },
  )

  const blocked =
    mode === 'invite' && readInviteToken(token) === ''
      ? 'Dán mã mời hoặc liên kết mời trước khi tiếp tục.'
      : snapshot.online
        ? null
        : 'Đang ngoại tuyến. Đăng nhập cần mạng; dữ liệu cục bộ vẫn cứu và xuất được.'

  return (
    <Dialog
      title={MODE_TITLE[mode]}
      onClose={() => {
        setToken('')
        onClose()
      }}
      description={MODE_DESCRIPTION[mode]}
      footer={
        <>
          {mode === 'sign-in' ? (
            <Button
              icon="user"
              onClick={() => actions.openDialog({ kind: 'sign-in', mode: 'invite' })}
            >
              Tôi có liên kết mời
            </Button>
          ) : (
            <Button onClick={onClose}>Để sau</Button>
          )}
          <Button
            variant="primary"
            icon="chevronRight"
            disabled={start.pending}
            disabledReason={blocked}
            onClick={() => void start.run()}
          >
            {start.pending ? 'Đang chuyển…' : MODE_ACTION[mode]}
          </Button>
        </>
      }
    >
      {mode === 'invite' ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault()
            if (!blocked) void start.run()
          }}
        >
          <TextField
            label="Mã mời hoặc liên kết mời"
            value={token}
            autoComplete="off"
            onChange={(value) => {
              setToken(value)
              setFromLink(false)
            }}
            hint="Chỉ nằm trong ô này cho tới khi gửi, không được ghi vào nhật ký hay cài đặt. Chủ nhóm chuyển liên kết cho bạn; ứng dụng không tự gửi email."
          />
          {fromLink ? (
            <span className="muted-3">Mã đã được lấy từ liên kết bạn vừa mở.</span>
          ) : null}
          <button type="submit" className="u-visually-hidden">
            {MODE_ACTION.invite}
          </button>
        </form>
      ) : null}

      <div className="card fc-border">
        <strong>Điều gì xảy ra khi bạn bấm</strong>
        <ul style={{ margin: 0, paddingInlineStart: 18 }} className="muted">
          <li>Tab này chuyển sang trang của nhà cung cấp định danh; không có cửa sổ bật lên.</li>
          <li>
            Đích điều hướng do backend cùng origin trả về và do controller kiểm rồi mở. Giao diện
            không lấy địa chỉ đăng nhập từ tệp dự án, cài đặt, query hay thông điệp lỗi.
          </li>
          <li>Website không nhận và không lưu mật khẩu của bạn.</li>
          <li>
            Định danh bền là cặp <code>issuer</code> + <code>subject</code> do nhà cung cấp cấp;
            email chỉ để hiển thị.
          </li>
          {mode === 'reauth' ? (
            <li>Thao tác bị từ chối trước đó không tự chạy lại; bạn thực hiện lại sau khi quay về.</li>
          ) : null}
        </ul>
      </div>
    </Dialog>
  )
}

/**
 * Sign-out (ACC-04, UI-C11). On a device the user marked as shared, erasing
 * local bytes needs an explicit two-step confirmation, and the list of what
 * would be lost is built from the backup information the snapshot publishes —
 * not from an assumption that a local commit is a backup.
 */
export function SignOutDialog({ onClose }: { onClose: () => void }) {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const [erase, setErase] = useState(false)
  const [armed, setArmed] = useState(false)
  const shared = snapshot.session.deviceMode === 'shared'
  const { storage } = snapshot
  const withoutBackup = snapshot.library.filter((entry) => !entry.backup)

  const signOut = useAsyncAction(
    async (eraseLocal: boolean) => bridge.signOut({ eraseLocal, confirmed: true }),
    { success: 'Đã đăng xuất và thu hồi phiên.' },
  )

  return (
    <Dialog
      title="Đăng xuất"
      onClose={onClose}
      description={
        shared
          ? 'Thiết bị này được đánh dấu là dùng chung.'
          : 'Thiết bị riêng: đăng xuất giữ lại byte cục bộ và đóng đường truy cập trong giao diện.'
      }
      footer={
        <>
          <Button onClick={onClose}>Ở lại</Button>
          <Button
            variant={erase ? 'danger' : 'primary'}
            icon="lock"
            disabled={signOut.pending}
            disabledReason={erase && !armed ? 'Xác nhận hai bước trước khi xóa vĩnh viễn.' : null}
            onClick={() => {
              void signOut.run(erase)
              onClose()
            }}
          >
            {erase ? 'Đăng xuất và xóa vĩnh viễn' : 'Đăng xuất'}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        Đăng xuất đóng Worker và job đang hiển thị, hủy handle và xóa bộ nhớ giao diện của bạn khỏi
        phiên. Phản hồi đến muộn sẽ không được gắn cho người dùng kế tiếp.
      </p>

      <div className="row">
        <span className="chip chip--muted fc-border">
          Kho cục bộ đang dùng {formatBytes(storage.usedBytes)}
          {storage.quotaBytes === null ? '' : ` / ${formatBytes(storage.quotaBytes)}`}
        </span>
        <span className="chip chip--muted fc-border">số ước lượng của trình duyệt</span>
      </div>
      {storage.warning ? <span className="reason">{storage.warning}</span> : null}

      <CheckField
        label="Xóa dữ liệu cục bộ của tôi trên thiết bị này"
        checked={erase}
        hint="Chỉ chọn khi bạn đã có bản sao. Commit cục bộ không phải là bản sao lưu."
        onChange={(value) => {
          setErase(value)
          setArmed(false)
        }}
      />

      {erase ? (
        <div className="card fc-border">
          <strong style={{ color: 'var(--err)' }}>
            {snapshot.library.length} dự án sẽ bị xóa khỏi thiết bị này
          </strong>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {snapshot.library.map((entry) => (
              <li key={entry.id}>
                {entry.name}{' '}
                {entry.backup ? (
                  <span className="muted-3">
                    · đã có bản sao bản sửa {entry.backup.revision} lúc{' '}
                    {formatDateTime(entry.backup.at)} · sha256 {entry.backup.sha256.slice(0, 12)}…
                  </span>
                ) : (
                  <span className="reason">chưa có bản sao được xác nhận</span>
                )}
              </li>
            ))}
          </ul>
          <p className="muted" style={{ margin: 0 }}>
            {withoutBackup.length === 0
              ? 'Mọi dự án trong danh sách đều có bản sao được xác nhận theo bản sửa và hash.'
              : `${withoutBackup.length} dự án chưa có bản sao được xác nhận theo bản sửa và hash. Xuất gói dự án trước nếu bạn chưa chắc.`}
          </p>
          <CheckField
            label="Tôi đã kiểm và xác nhận xóa vĩnh viễn danh sách trên"
            checked={armed}
            onChange={setArmed}
          />
        </div>
      ) : null}
    </Dialog>
  )
}
