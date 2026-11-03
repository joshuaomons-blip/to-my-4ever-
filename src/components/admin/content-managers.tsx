'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Eye, EyeOff, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { Alert, Badge, Button, EmptyState, Field, Input, Select, Textarea } from '@/components/ui'
import { Modal } from '@/components/modal'
import { useForm } from '@/components/use-form'
import { useToast } from '@/components/toast'
import { Toggle } from './settings-form'
import { api } from '@/lib/api'
import { relTime } from '@/lib/format'

type Announcement = { id: string; title: string; body: string; level: string; active: boolean; createdAt: string }
type Faq = { id: string; question: string; answer: string; sortOrder: number; published: boolean }

function useMutate() {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  async function run(key: string, path: string, method: string, body: unknown, success: string) {
    setBusy(key)
    const r = await api(path, { method, body })
    setBusy(null)
    if (r.ok) {
      toast({ tone: 'success', title: success })
      router.refresh()
    } else toast({ tone: 'error', title: r.error })
    return r.ok
  }
  return { busy, run }
}

export function AnnouncementsManager({ items }: { items: Announcement[] }) {
  const router = useRouter()
  const toast = useToast()
  const { busy, run } = useMutate()
  const f = useForm({ title: '', body: '', level: 'info', active: true })
  return (
    <div className="space-y-6">
      <form
        className="grid gap-3 rounded-2xl border border-white/[0.08] p-4 sm:grid-cols-[1fr_140px]"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          if (await f.submit('/api/admin/announcements', f.values)) {
            toast({ tone: 'success', title: 'Announcement published' })
            f.setValues({ title: '', body: '', level: 'info', active: true })
            router.refresh()
          }
        }}
      >
        {f.error && <Alert tone="loss" className="sm:col-span-2">{f.error}</Alert>}
        <Field label="Title" error={f.errors.title} htmlFor="an-title"><Input id="an-title" maxLength={100} value={f.values.title} onChange={(e) => f.set('title', e.target.value)} /></Field>
        <Field label="Style" htmlFor="an-level"><Select id="an-level" value={f.values.level} onChange={(e) => f.set('level', e.target.value)}><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option></Select></Field>
        <Field label="Message" error={f.errors.body} htmlFor="an-body" className="sm:col-span-2"><Textarea id="an-body" maxLength={500} className="min-h-20" value={f.values.body} onChange={(e) => f.set('body', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Button type="submit" size="sm" loading={f.loading}><Plus className="size-3.5" /> Publish announcement</Button></div>
      </form>
      {items.length === 0 ? (
        <EmptyState title="No announcements" description="Announcements appear on the homepage and customer dashboard while active." />
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-3 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{a.title} <Badge tone={a.level === 'warning' ? 'warn' : a.level === 'success' ? 'gain' : 'neutral'}>{a.level}</Badge>{a.active ? <Badge tone="gain" dot>Live</Badge> : <Badge dot>Hidden</Badge>}</p>
                <p className="mt-1 text-xs text-mute">{a.body}</p>
                <p className="mt-1 text-[10px] text-dim">{relTime(a.createdAt)}</p>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" loading={busy === a.id + 't'} onClick={() => run(a.id + 't', `/api/admin/announcements/${a.id}`, 'PATCH', { active: !a.active }, a.active ? 'Announcement hidden' : 'Announcement live')}>{a.active ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}{a.active ? 'Hide' : 'Show'}</Button>
                <Button size="sm" variant="danger" loading={busy === a.id + 'd'} onClick={() => window.confirm('Delete this announcement?') && run(a.id + 'd', `/api/admin/announcements/${a.id}`, 'DELETE', undefined, 'Announcement deleted')} aria-label="Delete announcement"><Trash2 className="size-3.5" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FaqEditor({ initial, onDone }: { initial?: Faq; onDone: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const f = useForm({ question: initial?.question ?? '', answer: initial?.answer ?? '', sortOrder: initial?.sortOrder ?? 10, published: initial?.published ?? true })
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = initial ? await f.submit(`/api/admin/faqs/${initial.id}`, f.values, 'PATCH') : await f.submit('/api/admin/faqs', f.values)
        if (ok) {
          toast({ tone: 'success', title: initial ? 'FAQ updated' : 'FAQ added' })
          router.refresh()
          onDone()
        }
      }}
    >
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <Field label="Question" error={f.errors.question} htmlFor="faq-q"><Input id="faq-q" maxLength={200} value={f.values.question} onChange={(e) => f.set('question', e.target.value)} /></Field>
      <Field label="Answer" error={f.errors.answer} htmlFor="faq-a"><Textarea id="faq-a" maxLength={2000} rows={5} value={f.values.answer} onChange={(e) => f.set('answer', e.target.value)} /></Field>
      <Field label="Sort order" hint="Lower numbers appear first" htmlFor="faq-o"><Input id="faq-o" type="number" min={0} max={999} value={f.values.sortOrder} onChange={(e) => f.set('sortOrder', Number(e.target.value))} /></Field>
      <Toggle label="Published" checked={f.values.published} onChange={(v) => f.set('published', v)} />
      <Button type="submit" variant="light" loading={f.loading} className="w-full">{initial ? 'Save FAQ' : 'Add FAQ'}</Button>
    </form>
  )
}

export function FaqManager({ items }: { items: Faq[] }) {
  const { busy, run } = useMutate()
  const [editing, setEditing] = useState<Faq | 'new' | null>(null)
  return (
    <div>
      <Button size="sm" onClick={() => setEditing('new')}><Plus className="size-3.5" /> Add question</Button>
      {items.length === 0 ? <EmptyState title="No FAQs yet" /> : (
        <ul className="mt-4 divide-y divide-white/[0.05]">
          {items.map((q) => (
            <li key={q.id} className="flex flex-wrap items-start gap-3 py-3.5">
              <span className="num mt-0.5 w-8 text-xs text-dim">#{q.sortOrder}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{q.question} {!q.published && <Badge className="ml-1">Draft</Badge>}</p>
                <p className="mt-1 line-clamp-2 text-xs text-mute">{q.answer}</p>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setEditing(q)}><Pencil className="size-3.5" /> Edit</Button>
                <Button size="sm" variant="danger" loading={busy === q.id} onClick={() => window.confirm('Delete this FAQ?') && run(q.id, `/api/admin/faqs/${q.id}`, 'DELETE', undefined, 'FAQ deleted')} aria-label="Delete FAQ"><Trash2 className="size-3.5" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New FAQ' : 'Edit FAQ'} wide>
        {editing && <FaqEditor key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

export function BroadcastForm() {
  const toast = useToast()
  const f = useForm({ audience: 'all', email: '', title: '', body: '', level: 'info' })
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        if (f.values.audience === 'all' && !window.confirm('Send this notification to all active customers?')) return
        const r = await f.submit<{ recipients: number }>('/api/admin/notifications', { ...f.values, email: f.values.audience === 'user' ? f.values.email : undefined })
        if (r) {
          toast({ tone: 'success', title: 'Notification sent', body: `${r.recipients} recipient(s)` })
          f.setValues({ audience: f.values.audience, email: '', title: '', body: '', level: 'info' })
        }
      }}
    >
      {f.error && <Alert tone="loss">{f.error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Audience" htmlFor="bc-aud"><Select id="bc-aud" value={f.values.audience} onChange={(e) => f.set('audience', e.target.value)}><option value="all">All active customers</option><option value="user">Single customer</option></Select></Field>
        {f.values.audience === 'user' && <Field label="Customer email" error={f.errors.email} htmlFor="bc-em"><Input id="bc-em" type="email" value={f.values.email} onChange={(e) => f.set('email', e.target.value)} /></Field>}
        <Field label="Style" htmlFor="bc-lvl"><Select id="bc-lvl" value={f.values.level} onChange={(e) => f.set('level', e.target.value)}><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option></Select></Field>
      </div>
      <Field label="Title" error={f.errors.title} htmlFor="bc-t"><Input id="bc-t" maxLength={100} value={f.values.title} onChange={(e) => f.set('title', e.target.value)} /></Field>
      <Field label="Message" error={f.errors.body} htmlFor="bc-b"><Textarea id="bc-b" maxLength={500} value={f.values.body} onChange={(e) => f.set('body', e.target.value)} /></Field>
      <Button type="submit" variant="light" loading={f.loading}><Send className="size-3.5" /> Send notification</Button>
    </form>
  )
}
