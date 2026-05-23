import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

// ── Constants ─────────────────────────────────────────────────────────────────
const NOTE_TYPES = [
  { key: 'general',  label: 'general',      bg: '#EAE6DF', color: '#5C5750' },
  { key: 'work',     label: 'work',         bg: '#E4EDF5', color: '#185FA5' },
  { key: 'personal', label: 'personal',     bg: '#E8F5EE', color: '#2D6A4F' },
  { key: 'remember', label: '⚠ remember',   bg: '#FDECEA', color: '#C0392B' },
  { key: 'followup', label: '⏰ follow up',  bg: '#FEF3E2', color: '#B7610A' },
]

const PERSON_TAGS = ['work', 'client', 'friend', 'family', 'neighbor', 'vendor', 'golf', 'school']

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (weeks === 1) return '1 week ago'
  if (weeks < 5) return `${weeks} weeks ago`
  if (months === 1) return '1 month ago'
  return `${months} months ago`
}

function formatNoteDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Btn({ children, variant = 'primary', onClick, style = {}, disabled = false }) {
  const variants = {
    primary: { background: 'var(--accent)', color: 'white', border: 'none' },
    outline: { background: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
    danger:  { background: 'var(--red)', color: 'white', border: 'none' },
    dark:    { background: 'var(--header)', color: 'white', border: 'none' },
  }
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...variants[variant], padding: '8px 18px', borderRadius: 'var(--radius-sm)',
      fontSize: '13px', fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
      transition: 'all 0.15s', ...style
    }}>{children}</button>
  )
}

function Card({ children, style = {}, onClick, hoverable = false }) {
  const [hov, setHov] = useState(false)
  return (
    <div onClick={onClick}
      onMouseEnter={() => hoverable && setHov(true)}
      onMouseLeave={() => hoverable && setHov(false)}
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px 18px',
        boxShadow: hov ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: hov ? 'translateY(-2px)' : 'none',
        transition: 'all 0.18s', cursor: onClick ? 'pointer' : 'default', ...style
      }}>{children}</div>
  )
}

function NoteTypeBadge({ type }) {
  const t = NOTE_TYPES.find(n => n.key === type) || NOTE_TYPES[0]
  return (
    <span style={{
      fontSize: 10, padding: '2px 9px', borderRadius: 999,
      background: t.bg, color: t.color, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{t.label}</span>
  )
}

function PersonTag({ label }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 999,
      background: 'var(--accent-light)', color: 'var(--accent)',
      border: '1px solid var(--accent-mid)', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{label}</span>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--accent)', gap: 12, fontSize: 14 }}>
      <div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      Loading...
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{children}</div>
}

// ── Person List ───────────────────────────────────────────────────────────────
function PersonList({ people, notes, onSelect, onAdd }) {
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('all')

  const allTags = ['all', ...Array.from(new Set(people.flatMap(p => p.tags || []))).sort()]

  const lastNote = (personId) => {
    const pNotes = notes.filter(n => n.person_id === personId)
    if (!pNotes.length) return null
    return pNotes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
  }

  const hasFollowUp = (personId) => {
    return notes.some(n => n.person_id === personId && n.type === 'followup' && n.follow_up_date && new Date(n.follow_up_date) >= new Date())
  }

  const filtered = people.filter(p => {
    const s = search.toLowerCase()
    const matchSearch = !s ||
      p.name.toLowerCase().includes(s) ||
      (p.description || '').toLowerCase().includes(s) ||
      (p.tags || []).some(t => t.toLowerCase().includes(s)) ||
      notes.filter(n => n.person_id === p.id).some(n => n.content.toLowerCase().includes(s))
    const matchTag = tagFilter === 'all' ||
      (tagFilter === 'followup' ? hasFollowUp(p.id) : (p.tags || []).includes(tagFilter))
    return matchSearch && matchTag
  }).sort((a, b) => {
    const aN = lastNote(a.id)
    const bN = lastNote(b.id)
    if (!aN && !bN) return a.name.localeCompare(b.name)
    if (!aN) return 1
    if (!bN) return -1
    return new Date(bN.created_at) - new Date(aN.created_at)
  })

  return (
    <div>
      {/* Search + add */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search by name, tag, or note content..." style={{ flex: 1 }} />
        <Btn onClick={onAdd} style={{ whiteSpace: 'nowrap' }}>+ add person</Btn>
      </div>

      {/* Tag filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {allTags.map(tag => (
          <button key={tag} onClick={() => setTagFilter(tag)} style={{
            padding: '4px 12px', borderRadius: 999, border: '1px solid var(--border)',
            fontSize: 11, background: tagFilter === tag ? 'var(--header)' : 'none',
            color: tagFilter === tag ? 'white' : 'var(--text-secondary)',
            fontFamily: 'inherit', cursor: 'pointer',
          }}>{tag === 'followup' ? '⏰ follow up' : tag}</button>
        ))}
        {!allTags.includes('followup') && (
          <button onClick={() => setTagFilter('followup')} style={{
            padding: '4px 12px', borderRadius: 999,
            border: `1px solid ${tagFilter === 'followup' ? 'var(--amber)' : 'var(--border)'}`,
            fontSize: 11, background: tagFilter === 'followup' ? 'var(--amber-bg)' : 'none',
            color: tagFilter === 'followup' ? 'var(--amber)' : 'var(--text-secondary)',
            fontFamily: 'inherit', cursor: 'pointer',
          }}>⏰ follow up</button>
        )}
      </div>

      {/* People cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>👤</div>
          <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 16 }}>
            {search || tagFilter !== 'all' ? 'no people match your search' : 'no people yet — add someone'}
          </p>
        </div>
      ) : (
        filtered.map(person => {
          const ln = lastNote(person.id)
          const pNotes = notes.filter(n => n.person_id === person.id)
          const followUp = hasFollowUp(person.id)
          return (
            <Card key={person.id} hoverable onClick={() => onSelect(person)} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 400, color: 'var(--text-primary)' }}>{person.name}</div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 12 }}>{pNotes.length} note{pNotes.length !== 1 ? 's' : ''} →</span>
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                {(person.tags || []).map(tag => <PersonTag key={tag} label={tag} />)}
                {followUp && (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid #F5D49A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>⏰ follow up</span>
                )}
              </div>
              {person.description && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{person.description}</p>
              )}
              {ln && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <NoteTypeBadge type={ln.type} />
                  <span>{timeAgo(ln.created_at)}: {ln.content.slice(0, 80)}{ln.content.length > 80 ? '…' : ''}</span>
                </div>
              )}
            </Card>
          )
        })
      )}
    </div>
  )
}

// ── Add / Edit Person Form ────────────────────────────────────────────────────
function PersonForm({ person, onSave, onCancel, saving }) {
  const [name, setName] = useState(person?.name || '')
  const [description, setDescription] = useState(person?.description || '')
  const [tags, setTags] = useState(person?.tags || [])
  const [customTag, setCustomTag] = useState('')

  const toggleTag = (tag) => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])

  const addCustomTag = () => {
    const t = customTag.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setCustomTag('')
  }

  const handleSave = () => {
    if (!name.trim()) return alert('Name is required.')
    onSave({ name: name.trim(), description: description.trim(), tags })
  }

  return (
    <div>
      <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, padding: '0 0 16px', fontFamily: 'inherit' }}>← cancel</button>
      <Card>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 400, marginBottom: 20 }}>{person ? 'edit person' : 'add person'}</h2>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5, fontWeight: 700 }}>Name</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" autoFocus />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5, fontWeight: 700 }}>Brief description</div>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="How you know them, where you met, their role..." style={{ minHeight: 80, resize: 'vertical' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontWeight: 700 }}>Tags</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {PERSON_TAGS.map(tag => (
              <button key={tag} onClick={() => toggleTag(tag)} style={{
                padding: '4px 12px', borderRadius: 999, border: '1px solid var(--border)',
                fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                background: tags.includes(tag) ? 'var(--accent)' : 'none',
                color: tags.includes(tag) ? 'white' : 'var(--text-secondary)',
              }}>{tag}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={customTag} onChange={e => setCustomTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCustomTag() }} placeholder="add custom tag..." style={{ flex: 1 }} />
            <Btn onClick={addCustomTag} style={{ padding: '6px 14px', fontSize: 12 }}>add</Btn>
          </div>
          {tags.filter(t => !PERSON_TAGS.includes(t)).length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {tags.filter(t => !PERSON_TAGS.includes(t)).map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent-mid)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {tag}
                  <span onClick={() => toggleTag(tag)} style={{ cursor: 'pointer', fontSize: 12 }}>×</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="outline" onClick={onCancel}>cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? 'saving...' : 'save'}</Btn>
        </div>
      </Card>
    </div>
  )
}

// ── Person Detail ─────────────────────────────────────────────────────────────
function PersonDetail({ person, notes, onBack, onEdit, onDelete, onAddNote, onDeleteNote, savingNote }) {
  const [noteType, setNoteType] = useState('general')
  const [noteContent, setNoteContent] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [noteFilter, setNoteFilter] = useState('all')

  const personNotes = notes
    .filter(n => n.person_id === person.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const filteredNotes = noteFilter === 'all' ? personNotes : personNotes.filter(n => n.type === noteFilter)

  const activeFollowUps = personNotes.filter(n => n.type === 'followup' && n.follow_up_date && new Date(n.follow_up_date) >= new Date())

  const handleAddNote = () => {
    if (!noteContent.trim()) return
    onAddNote(person.id, noteType, noteContent.trim(), noteType === 'followup' ? followUpDate : null)
    setNoteContent('')
    setFollowUpDate('')
    setNoteType('general')
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, padding: 0, fontFamily: 'inherit' }}>← back to people</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="outline" onClick={onEdit} style={{ fontSize: 12, padding: '5px 12px' }}>edit</Btn>
          {confirmDelete ? (
            <>
              <Btn variant="danger" onClick={onDelete} style={{ fontSize: 12, padding: '5px 12px' }}>confirm delete</Btn>
              <Btn variant="outline" onClick={() => setConfirmDelete(false)} style={{ fontSize: 12, padding: '5px 12px' }}>cancel</Btn>
            </>
          ) : (
            <Btn variant="outline" onClick={() => setConfirmDelete(true)} style={{ fontSize: 12, padding: '5px 12px', color: 'var(--red)' }}>delete</Btn>
          )}
        </div>
      </div>

      {/* Person header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 400, color: 'var(--text-primary)', marginBottom: 8 }}>{person.name}</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {(person.tags || []).map(tag => <PersonTag key={tag} label={tag} />)}
        </div>
        {person.description && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{person.description}</p>
        )}
      </div>

      {/* Follow ups */}
      {activeFollowUps.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>follow ups</SectionLabel>
          {activeFollowUps.map(n => (
            <div key={n.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', background: 'var(--amber-bg)', border: '1px solid #F5D49A', borderRadius: 'var(--radius-sm)', marginBottom: 6 }}>
              <div style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{n.content}</div>
              {n.follow_up_date && <div style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700, flexShrink: 0 }}>due {new Date(n.follow_up_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
              <button onClick={() => onDeleteNote(n.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>✓</button>
            </div>
          ))}
        </div>
      )}

      {/* Add note */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>add a note</SectionLabel>
        <div style={{ background: 'var(--bg-subtle)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {NOTE_TYPES.map(t => (
              <button key={t.key} onClick={() => setNoteType(t.key)} style={{
                padding: '4px 12px', borderRadius: 999, border: `1px solid ${noteType === t.key ? t.color : 'var(--border)'}`,
                fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                background: noteType === t.key ? t.bg : 'none',
                color: noteType === t.key ? t.color : 'var(--text-secondary)',
                fontWeight: noteType === t.key ? 700 : 400,
              }}>{t.label}</button>
            ))}
          </div>
          <textarea
            value={noteContent}
            onChange={e => setNoteContent(e.target.value)}
            placeholder="type your note here..."
            style={{ minHeight: 80, resize: 'vertical', marginBottom: noteType === 'followup' ? 10 : 0 }}
          />
          {noteType === 'followup' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>follow up date (optional)</div>
                <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
              </div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <Btn onClick={handleAddNote} disabled={savingNote || !noteContent.trim()} style={{ fontSize: 12, padding: '6px 16px' }}>
              {savingNote ? 'saving...' : 'save note'}
            </Btn>
          </div>
        </div>
      </div>

      {/* Notes log */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <SectionLabel>notes ({personNotes.length})</SectionLabel>
          <div style={{ display: 'flex', gap: 5 }}>
            {['all', ...NOTE_TYPES.map(t => t.key)].map(f => (
              <button key={f} onClick={() => setNoteFilter(f)} style={{
                padding: '3px 10px', borderRadius: 999, border: '1px solid var(--border)',
                fontSize: 10, fontFamily: 'inherit', cursor: 'pointer',
                background: noteFilter === f ? 'var(--header)' : 'none',
                color: noteFilter === f ? 'white' : 'var(--text-secondary)',
              }}>{f}</button>
            ))}
          </div>
        </div>

        {filteredNotes.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>no notes yet</p>
        ) : (
          filteredNotes.map(note => (
            <div key={note.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <NoteTypeBadge type={note.type} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatNoteDate(note.created_at)}</span>
                </div>
                <button onClick={() => onDeleteNote(note.id)} style={{ background: 'none', border: 'none', color: 'var(--border)', cursor: 'pointer', fontSize: 15, padding: 0, lineHeight: 1 }}>×</button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{note.content}</p>
              {note.follow_up_date && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--amber)', fontWeight: 700 }}>
                  ⏰ follow up by {new Date(note.follow_up_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── App Root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('list') // list | add | detail | edit
  const [people, setPeople] = useState([])
  const [notes, setNotes] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [error, setError] = useState(null)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [{ data: p }, { data: n }] = await Promise.all([
          supabase.from('people').select('*').order('name'),
          supabase.from('notes').select('*').order('created_at', { ascending: false }),
        ])
        if (p) setPeople(p)
        if (n) setNotes(n)
      } catch (e) {
        setError('Could not connect to database.')
      }
      setLoaded(true)
    })()
  }, [])

  // ── Add person ────────────────────────────────────────────────────────────
  const addPerson = useCallback(async (data) => {
    setSaving(true)
    const { data: result, error } = await supabase.from('people').insert([data]).select()
    if (error) alert('Save failed: ' + error.message)
    else if (result) {
      setPeople(prev => [...prev, result[0]].sort((a, b) => a.name.localeCompare(b.name)))
      setView('list')
    }
    setSaving(false)
  }, [])

  // ── Update person ─────────────────────────────────────────────────────────
  const updatePerson = useCallback(async (data) => {
    setSaving(true)
    const { data: result, error } = await supabase.from('people').update(data).eq('id', selectedPerson.id).select()
    if (error) alert('Update failed: ' + error.message)
    else if (result) {
      setPeople(prev => prev.map(p => p.id === selectedPerson.id ? result[0] : p))
      setSelectedPerson(result[0])
      setView('detail')
    }
    setSaving(false)
  }, [selectedPerson])

  // ── Delete person ─────────────────────────────────────────────────────────
  const deletePerson = useCallback(async () => {
    await supabase.from('people').delete().eq('id', selectedPerson.id)
    setPeople(prev => prev.filter(p => p.id !== selectedPerson.id))
    setNotes(prev => prev.filter(n => n.person_id !== selectedPerson.id))
    setSelectedPerson(null)
    setView('list')
  }, [selectedPerson])

  // ── Add note ──────────────────────────────────────────────────────────────
  const addNote = useCallback(async (personId, type, content, followUpDate) => {
    setSavingNote(true)
    const payload = { person_id: personId, type, content, follow_up_date: followUpDate || null }
    const { data, error } = await supabase.from('notes').insert([payload]).select()
    if (error) alert('Note save failed: ' + error.message)
    else if (data) {
      setNotes(prev => [data[0], ...prev])
      // update person updated_at
      await supabase.from('people').update({ updated_at: new Date().toISOString() }).eq('id', personId)
      setPeople(prev => prev.map(p => p.id === personId ? { ...p, updated_at: new Date().toISOString() } : p))
    }
    setSavingNote(false)
  }, [])

  // ── Delete note ───────────────────────────────────────────────────────────
  const deleteNote = useCallback(async (noteId) => {
    await supabase.from('notes').delete().eq('id', noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }, [])

  if (!loaded) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <Spinner />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--header)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
        <div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 2 }}>My</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#FDF8F2', fontWeight: 400 }}>People</h1>
        </div>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{people.length} {people.length === 1 ? 'person' : 'people'}</span>
      </div>

      {error && (
        <div style={{ background: 'var(--red-bg)', borderBottom: '1px solid var(--red)', padding: '10px 24px' }}>
          <p style={{ fontSize: 13, color: 'var(--red)' }}>⚠ {error}</p>
        </div>
      )}

      <div style={{ padding: '20px 24px', maxWidth: 720, margin: '0 auto' }}>
        {view === 'list' && (
          <PersonList
            people={people}
            notes={notes}
            onSelect={p => { setSelectedPerson(p); setView('detail') }}
            onAdd={() => setView('add')}
          />
        )}
        {view === 'add' && (
          <PersonForm
            onSave={addPerson}
            onCancel={() => setView('list')}
            saving={saving}
          />
        )}
        {view === 'edit' && selectedPerson && (
          <PersonForm
            person={selectedPerson}
            onSave={updatePerson}
            onCancel={() => setView('detail')}
            saving={saving}
          />
        )}
        {view === 'detail' && selectedPerson && (
          <PersonDetail
            person={selectedPerson}
            notes={notes}
            onBack={() => setView('list')}
            onEdit={() => setView('edit')}
            onDelete={deletePerson}
            onAddNote={addNote}
            onDeleteNote={deleteNote}
            savingNote={savingNote}
          />
        )}
      </div>
    </div>
  )
}
