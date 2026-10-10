'use client'
// app/staff/bill-review/page.tsx
//
// BR8: THE BILL REVIEW SPECIALIST PAGE. Protected by its data (ruling 10 Oct 2026): the page itself holds nothing. It
// shows nothing until /api/staff/bill-review/queue answers 200; to anyone else it shows only the route's own sentence
// (403: "This page is for ThemisIQ staff with access to Bill Review."). Every bill, reading and document comes from a
// staff route that checks the role and writes the access log first (lib/staff/*, server only, never imported here).
// All text is for ThemisIQ staff: plain language, no em dash.

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { convertibleUnits, type FuelType } from '../../../lib/unitConversions'
import { unitLabel } from '../../../lib/ghg/unitLabels'
import { isoDateInWords } from '../../../lib/ghg/dateWords'
import { formatActivity } from '../../../lib/ghg/workingsCells'
import { blankDraft, draftMissing, canSave, type Draft } from '../../../lib/billReview/readingDraft'

type QueueItem = { id: string; inventoryId: string; status: string; submitted_at: string; expected_by: string | null; overdue: boolean
  company: string | null; year: string | null; site: string | null; fileName: string; documentType: string; readable: boolean; stateWords: string | null }
type Queue = { today: string; waiting: QueueItem[]; done: QueueItem[]; failedEmails: { id: string; kind: string; company: string | null; attempts: number; last_error: string | null; last_attempt_at: string | null }[] }
type Bill = { id: string; status: string; fileName: string; documentTypeLabel: string; site: string | null; company: string | null; year: string; expected_by: string | null; fuels: FuelType[] }
type SavedReading = { id: string; fuel_type: string; raw_value: number; raw_unit: string; period_start: string | null; period_end: string | null; delivery_date: string | null; source_quote: string | null; notes: string | null; supersedes: string | null; read_at: string }

// The outbox's kinds, in words (BR7, and the staff notifications of 10 Oct 2026).
const NOTICE_KIND_WORDS: Record<string, string> = { ready: 'Ready to confirm, to the customer', overdue: 'Running late, to the customer',
  staff_new_batch: 'New bills, to a specialist', staff_digest: 'Morning digest, to a specialist' }
const FUEL_WORDS: Record<string, string> = { electricity: 'Electricity', natural_gas: 'Natural gas', diesel: 'Diesel', propane: 'Propane', gasoline: 'Petrol (gasoline)' }
const words = (d: string | null | undefined) => (d ? isoDateInWords(d.slice(0, 10)) : 'not set')
const box = { background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1rem' } as const
const btn = { fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '0.5px solid #e8e7e4', background: '#fff', color: '#0d0d0d', cursor: 'pointer' } as const
const primary = { ...btn, background: 'var(--color-brand)', color: '#fff', border: 'none', fontWeight: 600 } as const
const input = { fontSize: 12, padding: '5px 8px', border: '0.5px solid #e8e7e4', borderRadius: 6 } as const

async function api(path: string, init?: { method?: string; body?: unknown }) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`/api/staff/bill-review/${path}`, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session.access_token}` } : {}) },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

// Every figure and count on this page is written through formatActivity: "4,210 kWh", never "4210 kWh".
const num = (n: number) => formatActivity(n)

export default function StaffBillReviewPage() {
  const [phase, setPhase] = useState<'loading' | 'refused' | 'error' | 'ready'>('loading')
  const [message, setMessage] = useState('')
  const [queue, setQueue] = useState<Queue | null>(null)
  const [tab, setTab] = useState<'queue' | 'spot' | 'switch'>('queue')

  const apply = (r: { status: number; body: { ok?: boolean; message?: unknown; error?: unknown } & Queue }) => {
    if (r.status === 200 && r.body?.ok) { setQueue(r.body); setPhase('ready'); return }
    setMessage(typeof r.body?.message === 'string' ? r.body.message : typeof r.body?.error === 'string' ? r.body.error : `The queue could not be read (HTTP ${r.status}).`)
    setPhase(r.status === 401 || r.status === 403 ? 'refused' : 'error')
  }
  const load = () => { api('queue').then(apply) }
  useEffect(() => { api('queue').then(apply) }, [])

  // Nothing renders but a sentence until the queue route has said yes.
  if (phase === 'loading') return <main style={{ padding: '3rem', fontSize: 13, color: '#555553' }}>Loading.</main>
  if (phase !== 'ready' || !queue) return <main style={{ padding: '3rem', fontSize: 14, color: '#0d0d0d' }}>{message}</main>

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem 4rem', background: '#f8f7f5', minHeight: '100vh' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 400, marginBottom: 4 }}>Bill Review</h1>
      <p style={{ fontSize: 12, color: '#555553', marginBottom: '1rem' }}>Every bill you open, every reading you save and every change you make is recorded in the staff access log.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
        <button style={tab === 'queue' ? primary : btn} onClick={() => setTab('queue')}>Queue</button>
        <button style={tab === 'spot' ? primary : btn} onClick={() => setTab('spot')}>Spot-checks</button>
        <button style={tab === 'switch' ? primary : btn} onClick={() => setTab('switch')}>Change an inventory&rsquo;s reading</button>
      </div>
      {tab === 'queue' ? <QueueView queue={queue} reload={load} /> : tab === 'spot' ? <SpotCheckView /> : <SwitchView />}
    </main>
  )
}

function QueueView({ queue, reload }: { queue: Queue; reload: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (openId) return <BillView id={openId} back={() => { setOpenId(null); reload() }} />
  return (
    <>
      {queue.failedEmails.length > 0 && (
        <div style={{ ...box, background: '#FEF3E2' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Emails not sent</div>
          {queue.failedEmails.map(e => (
            <div key={e.id} style={{ fontSize: 12, color: '#555553' }}>
              {NOTICE_KIND_WORDS[e.kind] ?? e.kind}{e.company ? ` for ${e.company}` : ''}: {num(e.attempts)} attempt{e.attempts === 1 ? '' : 's'}, last on {words(e.last_attempt_at)}. Last error: {e.last_error ?? 'not recorded'}.
            </div>
          ))}
        </div>
      )}
      <div style={box}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>With the team ({num(queue.waiting.length)}), overdue first, then oldest first</div>
        {queue.waiting.length === 0 && <div style={{ fontSize: 12, color: '#555553' }}>No bills are waiting.</div>}
        {queue.waiting.map(b => (
          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '0.5px solid #f0efed', fontSize: 12 }}>
            <div>
              {b.overdue && <span style={{ color: '#B91C1C', fontWeight: 600 }}>Overdue. </span>}
              <strong style={{ fontWeight: 600 }}>{b.company ?? 'Company not named'}</strong>, {b.year ?? ''}. {b.site ?? 'Site not named'}: {b.documentType}, {b.fileName}.
              <div style={{ color: '#555553' }}>Uploaded {words(b.submitted_at)}. Expected by {words(b.expected_by)}.{b.stateWords ? ` ${b.stateWords}` : ''}</div>
            </div>
            {b.readable ? <button style={btn} onClick={() => setOpenId(b.id)}>Open</button> : <span style={{ color: '#555553' }}>Not readable</span>}
          </div>
        ))}
      </div>
      {queue.done.length > 0 && (
        <div style={box}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Read or marked unreadable</div>
          {queue.done.map(b => (
            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderTop: '0.5px solid #f0efed', fontSize: 12 }}>
              <span>{b.company ?? 'Company not named'}, {b.site ?? ''}: {b.fileName}. {b.status === 'read' ? 'Read.' : 'Marked unreadable.'}{b.stateWords ? ` ${b.stateWords}` : ''}</span>
              {b.readable && b.status === 'read' && <button style={btn} onClick={() => setOpenId(b.id)}>Open to correct</button>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function BillView({ id, back }: { id: string; back: () => void }) {
  const [state, setState] = useState<{ url: string; bill: Bill; readings: SavedReading[] } | null>(null)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [note, setNote] = useState('')
  const [done, setDone] = useState('')
  const applyOpen = (r: { status: number; body: { error?: string; message?: string; url: string; bill: Bill; readings: SavedReading[] } }) => {
    if (r.status !== 200) { setError(r.body?.error ?? r.body?.message ?? `The bill could not be opened (HTTP ${r.status}).`); return }
    setState(r.body)
    setDrafts(r.body.readings.length === 0 ? [blankDraft(r.body.bill.fuels[0] ?? 'electricity')] : [])
  }
  const openBill = () => { api('open', { body: { documentId: id } }).then(applyOpen) }
  // Each opening is logged and signs a fresh 5-minute link.
  useEffect(() => { api('open', { body: { documentId: id } }).then(applyOpen) }, [id])
  const set = (i: number, patch: Partial<Draft>) => setDrafts(d => d.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const save = async () => {
    const readings = drafts.map(d => ({ fuelType: d.fuelType, value: d.value, unit: d.unit, sourceQuote: d.sourceQuote, notes: d.notes, supersedes: d.supersedes,
      ...(d.dates === 'period' ? { periodStart: d.periodStart, periodEnd: d.periodEnd } : { deliveryDate: d.deliveryDate }) }))
    const r = await api('read', { body: { documentId: id, readings } })
    if (r.status === 200) { setDone(`Saved ${num(r.body.saved)} reading${r.body.saved === 1 ? '' : 's'}. The customer confirms each one.`); setDrafts([]); openBill() } else setError(r.body?.error ?? `Not saved (HTTP ${r.status}).`)
  }
  const cantRead = async () => {
    const r = await api('unreadable', { body: { documentId: id, note } })
    if (r.status === 200) { setDone('Marked as unreadable. The customer reads your note and enters the figure themselves.'); openBill() } else setError(r.body?.error ?? `Not marked (HTTP ${r.status}).`)
  }
  if (error && !state) return <div style={box}><p style={{ fontSize: 12 }}>{error}</p><button style={btn} onClick={back}>Back to the queue</button></div>
  if (!state) return <div style={box}><p style={{ fontSize: 12 }}>Opening.</p></div>
  const { bill, url, readings } = state
  const current = readings.filter(r => !readings.some(x => x.supersedes === r.id))
  return (
    <div>
      <button style={{ ...btn, marginBottom: 12 }} onClick={back}>Back to the queue</button>
      <div style={box}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{bill.company ?? 'Company not named'}, {bill.year}</div>
        <div style={{ fontSize: 12, color: '#555553', marginBottom: 8 }}>{bill.site ?? 'Site not named'}: {bill.documentTypeLabel}, {bill.fileName}. Expected by {words(bill.expected_by)}.</div>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--color-brand)' }}>Open the bill</a>
        <span style={{ fontSize: 11, color: '#555553' }}> The link works for 5 minutes. Open the bill again for a new one; each opening is logged.</span>
      </div>
      {done && <div style={{ ...box, background: '#E1F5EE', fontSize: 12 }}>{done}</div>}
      {error && <div style={{ ...box, background: '#FEF3E2', fontSize: 12 }}>{error}</div>}
      {current.length > 0 && (
        <div style={box}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Readings saved</div>
          {current.map(r => (
            <div key={r.id} style={{ fontSize: 12, padding: '4px 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{FUEL_WORDS[r.fuel_type] ?? r.fuel_type}: {num(r.raw_value)} {unitLabel(r.raw_unit)}, {r.delivery_date ? `delivered ${words(r.delivery_date)}` : `${words(r.period_start)} to ${words(r.period_end)}`}. &ldquo;{r.source_quote}&rdquo;</span>
              <button style={btn} onClick={() => setDrafts(d => [...d, { ...blankDraft(r.fuel_type, r.id), value: String(r.raw_value), unit: r.raw_unit, sourceQuote: r.source_quote ?? '' }])}>Correct this reading</button>
            </div>
          ))}
        </div>
      )}
      {bill.status !== 'unreadable' && (
        <div style={box}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Read the bill</div>
          {drafts.map((d, i) => (
            <div key={i} style={{ display: 'grid', gap: 6, padding: '8px 0', borderTop: '0.5px solid #f0efed', fontSize: 12 }}>
              {d.supersedes && <div style={{ color: '#555553' }}>This corrects a saved reading. The customer reviews the correction.</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <select aria-label="Fuel" style={input} value={d.fuelType} onChange={e => set(i, { fuelType: e.target.value, unit: convertibleUnits(e.target.value as FuelType)[0] ?? '' })}>
                  {bill.fuels.map(f => <option key={f} value={f}>{FUEL_WORDS[f] ?? f}</option>)}
                </select>
                <input aria-label="Figure" style={input} inputMode="decimal" placeholder="Figure" value={d.value} onChange={e => set(i, { value: e.target.value })} />
                <select aria-label="Unit" style={input} value={d.unit} onChange={e => set(i, { unit: e.target.value })}>
                  {convertibleUnits(d.fuelType as FuelType).map(u => <option key={u} value={u}>{unitLabel(u)}</option>)}
                </select>
                <select aria-label="Dates" style={input} value={d.dates} onChange={e => set(i, { dates: e.target.value as Draft['dates'] })}>
                  <option value="period">Billing period</option><option value="delivery">Delivery date</option>
                </select>
                {d.dates === 'period' ? (<>
                  <input aria-label="Period start" type="date" style={input} value={d.periodStart} onChange={e => set(i, { periodStart: e.target.value })} />
                  <input aria-label="Period end" type="date" style={input} value={d.periodEnd} onChange={e => set(i, { periodEnd: e.target.value })} />
                </>) : <input aria-label="Delivery date" type="date" style={input} value={d.deliveryDate} onChange={e => set(i, { deliveryDate: e.target.value })} />}
              </div>
              <input aria-label="Quote" style={input} maxLength={300} placeholder="The figure and its unit exactly as printed (required)" value={d.sourceQuote} onChange={e => set(i, { sourceQuote: e.target.value })} />
              <input aria-label="Notes" style={input} placeholder="Notes (optional)" value={d.notes} onChange={e => set(i, { notes: e.target.value })} />
              {draftMissing(d).length > 0 && <div style={{ color: '#555553' }}>Still needed: {draftMissing(d).join(', ')}.</div>}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={btn} onClick={() => setDrafts(d => [...d, blankDraft(bill.fuels[0] ?? 'electricity')])}>Add another reading</button>
            {drafts.length > 0 && <button style={canSave(drafts) ? primary : { ...primary, opacity: 0.5, cursor: 'not-allowed' }} disabled={!canSave(drafts)} onClick={save}>Save {drafts.length === 1 ? 'reading' : `${num(drafts.length)} readings`}</button>}
          </div>
        </div>
      )}
      {bill.status === 'waiting' && (
        <div style={box}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Can&rsquo;t read this bill</div>
          <textarea aria-label="Why it cannot be read" style={{ ...input, width: '100%', minHeight: 50 }} maxLength={500}
            placeholder="Say why. The customer reads this note, then enters the figure themselves." value={note} onChange={e => setNote(e.target.value)} />
          <button style={{ ...btn, marginTop: 6 }} disabled={!note.trim()} onClick={cantRead}>Mark as unreadable</button>
        </div>
      )}
    </div>
  )
}

type SwitchRow = { inventoryId: string; company: string | null; year: string; ownerEmail: string | null; reading: 'ai' | 'human' | null }
type SwitchConfirm = { inventoryId: string; company: string | null; year: string; to: 'ai' | 'human'; now: string; ifChange: string; sentence: string; button: string }

// BR8 follow-up (10 Oct 2026): the inventories whose owner holds Bill Review, searchable by company or the owner's
// email (staff only), each with a Change button; the id box stays below as a fallback.
function SwitchView() {
  const [rows, setRows] = useState<SwitchRow[] | null>(null)
  const [q, setQ] = useState('')
  const [inventoryId, setInventoryId] = useState('')
  const [view, setView] = useState<SwitchConfirm | null>(null)
  const [msg, setMsg] = useState('')
  const applyList = (r: { status: number; body: { items?: SwitchRow[]; error?: string; message?: string } }) => {
    if (r.status === 200 && r.body.items) setRows(r.body.items); else setMsg(r.body?.error ?? r.body?.message ?? `HTTP ${r.status}`)
  }
  const list = (query: string) => api(`reading-switch/inventories${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`).then(applyList)
  useEffect(() => { api('reading-switch/inventories').then(applyList) }, [])
  const show = async (id: string) => {
    setMsg(''); setView(null)
    const r = await api(`reading-switch?inventoryId=${encodeURIComponent(id.trim())}`)
    if (r.status === 200) setView(r.body); else setMsg(r.body?.message ?? r.body?.error ?? `HTTP ${r.status}`)
  }
  const change = async () => {
    if (!view) return
    const r = await api('reading-switch', { body: { inventoryId: view.inventoryId, reading: view.to } })
    if (r.status === 200) { setMsg(`Changed. Since ${words(r.body.setAt)}, this inventory’s bills are read by ${view.to === 'human' ? 'a ThemisIQ specialist' : 'the AI'}. The customer sees this on their Energy and fuel data step.`); setView(null); list(q) }
    else setMsg(r.body?.error ?? r.body?.message ?? `HTTP ${r.status}`)
  }
  const readingWords = (r: SwitchRow['reading']) => (r === 'human' ? 'Specialist reading' : 'AI reading')
  if (view) return (
    <div style={box}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{view.company ?? 'Company not named'}, {view.year}</div>
      <p style={{ fontSize: 12 }}>{view.now}</p>
      <p style={{ fontSize: 12, fontWeight: 600, marginTop: 8 }}>{view.ifChange}</p>
      <p style={{ fontSize: 12, margin: '4px 0 10px' }}>{view.sentence}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={primary} onClick={change}>{view.button}</button>
        <button style={btn} onClick={() => setView(null)}>Back</button>
      </div>
    </div>
  )
  return (
    <div style={box}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Change an inventory&rsquo;s reading, on the customer&rsquo;s request</div>
      <p style={{ fontSize: 12, color: '#555553', marginBottom: 8 }}>For a lead only. Quote and invoice the customer first. The change applies to bills uploaded from now on.</p>
      {msg && <p style={{ margin: '0 0 8px', fontSize: 12 }}>{msg}</p>}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input aria-label="Search" style={{ ...input, flex: 1 }} placeholder="Search by company name or customer email" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') list(q) }} />
        <button style={btn} onClick={() => list(q)}>Search</button>
      </div>
      {rows && rows.length === 0 && <p style={{ fontSize: 12, color: '#555553' }}>{q.trim() ? 'No Bill Review inventory matches that search.' : 'No customer holds Bill Review.'}</p>}
      {(rows ?? []).map(r => (
        <div key={r.inventoryId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderTop: '0.5px solid #f0efed', fontSize: 12 }}>
          <span><strong style={{ fontWeight: 600 }}>{r.company ?? 'Company not named'}</strong>, {r.year}. {r.ownerEmail ?? 'Email not found'}. {readingWords(r.reading)}.</span>
          <button style={btn} onClick={() => show(r.inventoryId)}>Change</button>
        </div>
      ))}
      <div style={{ fontSize: 12, color: '#555553', margin: '14px 0 4px' }}>Not in the list? Enter the inventory id.</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input aria-label="Inventory id" style={{ ...input, flex: 1 }} placeholder="Inventory id (the id= in the customer's wizard address)" value={inventoryId} onChange={e => setInventoryId(e.target.value)} />
        <button style={btn} disabled={!inventoryId.trim()} onClick={() => show(inventoryId)}>Show</button>
      </div>
    </div>
  )
}

type SpotItem = { inventoryId: string; sourceDocId: string; fuelType: string; proposalIndex: number; company: string | null; year: string; site: string; fileName: string; documentType: string; confirmedAt: string }
type SpotReading = { value: number | null; unit: string | null; rawValue: number | null; rawUnit: string | null; periodStart: string | null; periodEnd: string | null; deliveryDate: string | null; sourceQuote: string | null }

// BR8b (Q4): 1 in 10 of the AI readings customers have confirmed, the same readings every time, oldest confirmed first.
function SpotCheckView() {
  const [items, setItems] = useState<SpotItem[] | null>(null)
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState<{ item: SpotItem; url: string; reading: SpotReading } | null>(null)
  const [note, setNote] = useState('')
  const applyList = (r: { status: number; body: { items?: SpotItem[]; error?: string; message?: string } }) => {
    if (r.status === 200 && r.body.items) setItems(r.body.items); else setMsg(r.body?.error ?? r.body?.message ?? `HTTP ${r.status}`)
  }
  useEffect(() => { api('spot-checks').then(applyList) }, [])
  const ident = (i: SpotItem) => ({ inventoryId: i.inventoryId, sourceDocId: i.sourceDocId, fuelType: i.fuelType, proposalIndex: i.proposalIndex })
  const openOne = async (item: SpotItem) => {
    const r = await api('spot-check/open', { body: ident(item) })
    if (r.status === 200) { setOpen({ item, url: r.body.url, reading: r.body.reading }); setNote(''); setMsg('') } else setMsg(r.body?.error ?? `HTTP ${r.status}`)
  }
  const record = async (result: 'agrees' | 'disagrees') => {
    if (!open) return
    const r = await api('spot-check', { body: { ...ident(open.item), result, note } })
    if (r.status === 200) { setMsg(result === 'agrees' ? 'Recorded: agrees.' : 'Recorded: disagrees. The customer sees your note and must confirm the figure again or correct it before they can export.'); setOpen(null); api('spot-checks').then(applyList) }
    else setMsg(r.body?.error ?? `HTTP ${r.status}`)
  }
  if (open) {
    const rd = open.reading
    return (
      <div style={box}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{open.item.company ?? 'Company not named'}, {open.item.year}</div>
        <div style={{ fontSize: 12, color: '#555553', marginBottom: 8 }}>{open.item.site}: {open.item.documentType}, {open.item.fileName}.</div>
        <a href={open.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--color-brand)' }}>Open the bill</a>
        <span style={{ fontSize: 11, color: '#555553' }}> The link works for 5 minutes.</span>
        <p style={{ fontSize: 12, margin: '10px 0' }}>
          The AI read {FUEL_WORDS[open.item.fuelType] ?? open.item.fuelType}: {rd.rawValue == null ? 'no figure' : num(rd.rawValue)} {rd.rawUnit ? unitLabel(rd.rawUnit) : ''}, {rd.deliveryDate ? `delivered ${words(rd.deliveryDate)}` : `${words(rd.periodStart)} to ${words(rd.periodEnd)}`}.
          {rd.sourceQuote ? <> Quote: &ldquo;{rd.sourceQuote}&rdquo;.</> : null} The customer confirmed it.
        </p>
        <textarea aria-label="Note" style={{ ...input, width: '100%', minHeight: 50 }} maxLength={500}
          placeholder="If it differs, say how. The customer reads this note." value={note} onChange={e => setNote(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button style={primary} onClick={() => record('agrees')}>Agrees</button>
          <button style={btn} disabled={!note.trim()} onClick={() => record('disagrees')}>Disagrees</button>
          <button style={btn} onClick={() => setOpen(null)}>Back</button>
        </div>
      </div>
    )
  }
  return (
    <div style={box}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Spot-checks: 1 in 10 confirmed AI readings, oldest confirmed first</div>
      {msg && <p style={{ fontSize: 12 }}>{msg}</p>}
      {items && items.length === 0 && <p style={{ fontSize: 12, color: '#555553' }}>No readings are waiting for a spot-check.</p>}
      {(items ?? []).map(i => (
        <div key={`${i.inventoryId}:${i.sourceDocId}:${i.fuelType}:${i.proposalIndex}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderTop: '0.5px solid #f0efed', fontSize: 12 }}>
          <span>{i.company ?? 'Company not named'}, {i.year}. {i.site}: {i.documentType}, {i.fileName}. Confirmed {words(i.confirmedAt)}.</span>
          <button style={btn} onClick={() => openOne(i)}>Check</button>
        </div>
      ))}
    </div>
  )
}
