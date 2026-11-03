'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Copy, KeyRound, Pencil, UserPlus } from 'lucide-react'
import { Alert, Badge, Button, Field, Input, Select, StatusBadge, Table, td, th, RelTime } from '@/components/ui'
import { Modal } from '@/components/modal'
import { useForm } from '@/components/use-form'
import { useToast } from '@/components/toast'
import { api } from '@/lib/api'
import { cn } from '@/lib/format'

type AdminRow = { id: string; email: string; firstName: string; lastName: string; role: string; status: string; permissions: string[]; totpEnabled: boolean; lastLoginAt: string | null }
type Perms = Record<string, string>

function PermissionPicker({ value, onChange, perms, disabled }: { value: string[]; onChange: (v: string[]) => void; perms: Perms; disabled?: boolean }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {Object.entries(perms).filter(([k]) => k !== 'admins:manage').map(([k, desc]) => (
        <label key={k} className={cn('flex cursor-pointer items-start gap-2.5 rounded-md border p-3 text-xs', value.includes(k) ? 'border-fg/25 bg-fg/[0.04]' : 'border-fg/[0.06]', disabled && 'pointer-events-none opacity-50')}>
          <input type="checkbox" className="mt-0.5 accent-[var(--color-accent)]" checked={disabled || value.includes(k)} disabled={disabled} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((p) => p !== k))} />
          <span><span className="num block text-fg-2">{k}</span><span className="text-faint">{desc}</span></span>
        </label>
      ))}
    </div>
  )
}

function TempPassword({ value, onClose }: { value: string; onClose: () => void }) {
  const toast = useToast()
  return (
    <div className="space-y-4">
      <Alert tone="warn" title="Shown once">Share this temporary password through a secure channel. Ask the administrator to change it and enable 2FA at first sign-in.</Alert>
      <div className="flex items-center gap-2 rounded-md border border-fg/10 bg-canvas p-3">
        <code className="num flex-1 text-sm break-all">{value}</code>
        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(value); toast({ tone: 'success', title: 'Copied' }) }}><Copy className="size-3.5" /></Button>
      </div>
      <Button className="w-full" variant="light" onClick={onClose}>Done</Button>
    </div>
  )
}

export function AdminsManager({ rows, perms, roleDefaults, selfId }: { rows: AdminRow[]; perms: Perms; roleDefaults: Record<string, string[]>; selfId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AdminRow | null>(null)
  const [temp, setTemp] = useState<string | null>(null)
  const create = useForm({ email: '', firstName: '', lastName: '', role: 'ADMIN', permissions: roleDefaults.ADMIN })
  const edit = useForm({ role: 'ADMIN', permissions: [] as string[], status: 'ACTIVE' })

  return (
    <>
      <div className="flex justify-end p-5"><Button onClick={() => setCreating(true)}><UserPlus className="size-4" /> Add administrator</Button></div>
      <Table>
        <thead className="border-b border-fg/[0.06]"><tr><th className={th}>Administrator</th><th className={th}>Role</th><th className={th}>Status</th><th className={th}>2FA</th><th className={th}>Permissions</th><th className={th}>Last login</th><th className={th} /></tr></thead>
        <tbody className="divide-y divide-fg/[0.04]">
          {rows.map((a) => (
            <tr key={a.id} className="hover:bg-fg/[0.02]">
              <td className={td}><p className="text-sm font-medium">{a.firstName} {a.lastName} {a.id === selfId && <Badge className="ml-1">You</Badge>}</p><p className="text-[11px] text-faint">{a.email}</p></td>
              <td className={td}><Badge tone={a.role === 'SUPER_ADMIN' ? 'accent' : 'neutral'}>{a.role.replace('_', ' ')}</Badge></td>
              <td className={td}><StatusBadge status={a.status} /></td>
              <td className={td}>{a.totpEnabled ? <Badge tone="gain">On</Badge> : <Badge tone="warn">Off</Badge>}</td>
              <td className={cn(td, 'text-xs text-muted')}>{a.role === 'SUPER_ADMIN' ? 'All' : `${a.permissions.length} granted`}</td>
              <td className={cn(td, 'text-xs text-muted')}>{a.lastLoginAt ? <RelTime date={a.lastLoginAt} /> : 'Never'}</td>
              <td className={cn(td, 'text-right')}>
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(a); edit.setValues({ role: a.role, permissions: a.permissions, status: a.status }) }}><Pencil className="size-3.5" /> Edit</Button>
                  {a.id !== selfId && (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      if (!window.confirm(`Reset password for ${a.email}? They will be signed out.`)) return
                      const r = await api<{ tempPassword: string }>(`/api/admin/admins/${a.id}/reset-password`, { method: 'POST' })
                      if (r.ok) setTemp(r.data.tempPassword)
                      else toast({ tone: 'error', title: r.error })
                    }}><KeyRound className="size-3.5" /> Reset</Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal open={creating} onClose={() => !create.loading && setCreating(false)} title="Add administrator" wide>
        <form className="space-y-4" noValidate onSubmit={async (e) => {
          e.preventDefault()
          const r = await create.submit<{ tempPassword: string }>('/api/admin/admins', create.values)
          if (r) {
            setCreating(false)
            setTemp(r.tempPassword)
            create.setValues({ email: '', firstName: '', lastName: '', role: 'ADMIN', permissions: roleDefaults.ADMIN })
            router.refresh()
          }
        }}>
          {create.error && <Alert tone="loss">{create.error}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" error={create.errors.firstName} htmlFor="na-fn"><Input id="na-fn" value={create.values.firstName} onChange={(e) => create.set('firstName', e.target.value)} /></Field>
            <Field label="Last name" error={create.errors.lastName} htmlFor="na-ln"><Input id="na-ln" value={create.values.lastName} onChange={(e) => create.set('lastName', e.target.value)} /></Field>
            <Field label="Email" error={create.errors.email} htmlFor="na-em"><Input id="na-em" type="email" value={create.values.email} onChange={(e) => create.set('email', e.target.value)} /></Field>
            <Field label="Role" htmlFor="na-role">
              <Select id="na-role" value={create.values.role} onChange={(e) => { create.set('role', e.target.value); create.set('permissions', roleDefaults[e.target.value] ?? []) }}>
                <option value="SUPPORT">Support (read-mostly)</option><option value="ADMIN">Admin</option><option value="SUPER_ADMIN">Super admin (full control)</option>
              </Select>
            </Field>
          </div>
          <div><p className="mb-2 text-xs font-medium text-fg-2">Permissions</p><PermissionPicker perms={perms} value={create.values.permissions} disabled={create.values.role === 'SUPER_ADMIN'} onChange={(v) => create.set('permissions', v)} /></div>
          <Button type="submit" variant="light" className="w-full" loading={create.loading}>Create & generate temporary password</Button>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => !edit.loading && setEditing(null)} title={`Edit ${editing?.email ?? ''}`} wide>
        {editing && (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault()
            if (await edit.submit(`/api/admin/admins/${editing.id}`, edit.values, 'PATCH')) {
              toast({ tone: 'success', title: 'Administrator updated' })
              setEditing(null)
              router.refresh()
            }
          }}>
            {edit.error && <Alert tone="loss">{edit.error}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Role" htmlFor="ea-role"><Select id="ea-role" value={edit.values.role} onChange={(e) => edit.set('role', e.target.value)}><option value="SUPPORT">Support</option><option value="ADMIN">Admin</option><option value="SUPER_ADMIN">Super admin</option></Select></Field>
              <Field label="Status" htmlFor="ea-st"><Select id="ea-st" value={edit.values.status} onChange={(e) => edit.set('status', e.target.value)}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></Select></Field>
            </div>
            <div><p className="mb-2 text-xs font-medium text-fg-2">Permissions</p><PermissionPicker perms={perms} value={edit.values.permissions} disabled={edit.values.role === 'SUPER_ADMIN'} onChange={(v) => edit.set('permissions', v)} /></div>
            <Button type="submit" variant="light" className="w-full" loading={edit.loading}>Save changes</Button>
          </form>
        )}
      </Modal>

      <Modal open={!!temp} onClose={() => setTemp(null)} title="Temporary password">{temp && <TempPassword value={temp} onClose={() => setTemp(null)} />}</Modal>
    </>
  )
}
