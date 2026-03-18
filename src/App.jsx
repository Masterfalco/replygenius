import { useState, useEffect, useCallback } from 'react'

const TONES = [
  { id: 'professional', label: 'Professional', icon: '💼' },
  { id: 'friendly', label: 'Friendly', icon: '🤝' },
  { id: 'empathetic', label: 'Empathetic', icon: '💛' },
  { id: 'enthusiastic', label: 'Enthusiastic', icon: '🎉' },
]

const Stars = ({ n }) => (
  <span style={{ letterSpacing: 1 }}>
    {[1,2,3,4,5].map(i => <span key={i} style={{ color: i <= n ? '#F59E0B' : '#2D2D3D', fontSize: 14 }}>★</span>)}
  </span>
)

const Badge = ({ status }) => {
  const c = { pending: ['#78350F','#FCD34D'], ready: ['#1E3A5F','#93C5FD'], approved: ['#064E3B','#6EE7B7'], posted: ['#3B0764','#C4B5FD'] }
  const [bg, fg] = c[status] || ['#1E1E2E','#9CA3AF']
  return <span style={{ background: bg, color: fg, padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>{status}</span>
}

const SentimentDot = ({ rating }) => {
  const color = rating >= 4 ? '#6EE7B7' : rating === 3 ? '#FCD34D' : '#FCA5A5'
  return <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:color, marginRight:6 }} />
}

export default function App() {
  const [reviews, setReviews] = useState([])
  const [stats, setStats] = useState({})
  const [settings, setSettings] = useState({})
  const [tab, setTab] = useState('queue')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [editReply, setEditReply] = useState('')
  const [generating, setGenerating] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newReview, setNewReview] = useState({ author: '', rating: 5, text: '' })
  const [saving, setSaving] = useState(false)
  const [settingsForm, setSettingsForm] = useState({})
  const [genTone, setGenTone] = useState('professional')

  const load = useCallback(() => {
    fetch(`/api/reviews${filter !== 'all' ? `?status=${filter}` : ''}`).then(r=>r.json()).then(setReviews).catch(()=>{})
    fetch('/api/stats').then(r=>r.json()).then(setStats).catch(()=>{})
  }, [filter])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/settings').then(r=>r.json()).then(d => { setSettings(d); setSettingsForm(d); setGenTone(d.tone || 'professional') }).catch(()=>{})
  }, [])

  const generate = async (id, tone) => {
    setGenerating(id)
    try {
      const res = await fetch(`/api/reviews/${id}/generate`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tone: tone || genTone }) })
      const data = await res.json()
      if (data.success) {
        load()
        if (selected?.id === id) setSelected(prev => ({ ...prev, ai_reply: data.reply, keywords_used: data.keywords_used, status: 'ready' }))
      }
    } catch(e) {}
    setGenerating(null)
  }

  const approve = async (id, reply) => {
    await fetch(`/api/reviews/${id}/approve`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ reply }) })
    load()
    setSelected(null)
  }

  const addReview = async () => {
    if (!newReview.text.trim()) return
    setSaving(true)
    await fetch('/api/reviews/add', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(newReview) })
    setNewReview({ author: '', rating: 5, text: '' })
    setShowAdd(false)
    setSaving(false)
    load()
  }

  const saveSettings = async () => {
    setSaving(true)
    await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(settingsForm) })
    setSettings(settingsForm)
    setSaving(false)
  }

  const deleteReview = async (id) => {
    await fetch(`/api/reviews/${id}`, { method:'DELETE' })
    load()
    if (selected?.id === id) setSelected(null)
  }

  const F = { wrap: { minHeight:'100vh', background:'#08080D', fontFamily:"'DM Sans',sans-serif", color:'#E5E5E5' } }

  return (
    <div style={F.wrap}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0}::selection{background:#7C3AED40}input:focus,textarea:focus,select:focus{outline:none;border-color:#7C3AED!important}button{cursor:pointer;border:none;font-family:inherit}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* HEADER */}
      <header style={{ borderBottom:'1px solid #1E1E2E', padding:'16px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#2563EB,#7C3AED)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#fff', fontFamily:"'Playfair Display'" }}>R</div>
          <div>
            <div style={{ fontSize:18, fontWeight:700, fontFamily:"'Playfair Display'", background:'linear-gradient(135deg,#93C5FD,#C4B5FD)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>ReplyGenius</div>
            <div style={{ fontSize:10, color:'#6B7280', letterSpacing:1, textTransform:'uppercase' }}>SEO-Powered Review Replies</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[['queue','Reviews'],['settings','Settings']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ background: tab===k ? '#1E1E2E' : 'transparent', color: tab===k ? '#C4B5FD' : '#6B7280', padding:'8px 16px', borderRadius:8, fontSize:12, fontWeight:600, transition:'all .2s' }}>{l}</button>
          ))}
        </div>
      </header>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'24px 20px' }}>

        {/* ===== QUEUE TAB ===== */}
        {tab === 'queue' && <>
          {/* Stats bar */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:24 }}>
            {[
              ['Total', stats.total || 0, '#E5E5E5'],
              ['Pending', stats.pending || 0, '#FCD34D'],
              ['Ready', stats.ready || 0, '#93C5FD'],
              ['Approved', stats.approved || 0, '#6EE7B7'],
              ['Posted', stats.posted || 0, '#C4B5FD'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background:'#0F0F17', border:'1px solid #1E1E2E', borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:800, fontFamily:"'Playfair Display'", color }}>{val}</div>
                <div style={{ fontSize:10, color:'#6B7280', textTransform:'uppercase', letterSpacing:.5 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter + Add */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ display:'flex', gap:6 }}>
              {['all','pending','ready','approved','posted'].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ background: filter===f ? '#7C3AED' : '#0F0F17', color: filter===f ? '#fff' : '#6B7280', padding:'6px 14px', borderRadius:8, fontSize:11, fontWeight:600, textTransform:'capitalize', border:'1px solid', borderColor: filter===f ? '#7C3AED' : '#1E1E2E' }}>{f}</button>
              ))}
            </div>
            <button onClick={() => setShowAdd(true)} style={{ background:'linear-gradient(135deg,#2563EB,#7C3AED)', color:'#fff', padding:'8px 18px', borderRadius:8, fontSize:12, fontWeight:600 }}>+ Add Review</button>
          </div>

          {/* Add Review Modal */}
          {showAdd && (
            <div style={{ background:'#0F0F17', border:'1px solid #1E1E2E', borderRadius:14, padding:24, marginBottom:16, animation:'fadeIn .2s ease' }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#C4B5FD', marginBottom:14 }}>Add Review Manually</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, marginBottom:12 }}>
                <input value={newReview.author} onChange={e => setNewReview(p=>({...p, author:e.target.value}))} placeholder="Reviewer name" style={{ background:'#08080D', border:'1px solid #2D2D3D', borderRadius:8, padding:'10px 14px', color:'#E5E5E5', fontSize:13 }} />
                <select value={newReview.rating} onChange={e => setNewReview(p=>({...p, rating:parseInt(e.target.value)}))} style={{ background:'#08080D', border:'1px solid #2D2D3D', borderRadius:8, padding:'10px 14px', color:'#E5E5E5', fontSize:13 }}>
                  {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} Star{n!==1?'s':''}</option>)}
                </select>
              </div>
              <textarea value={newReview.text} onChange={e => setNewReview(p=>({...p, text:e.target.value}))} placeholder="Paste the review text..." rows={3} style={{ width:'100%', background:'#08080D', border:'1px solid #2D2D3D', borderRadius:8, padding:'10px 14px', color:'#E5E5E5', fontSize:13, resize:'none', fontFamily:'inherit' }} />
              <div style={{ display:'flex', gap:8, marginTop:12 }}>
                <button onClick={addReview} disabled={saving} style={{ background:'#7C3AED', color:'#fff', padding:'8px 20px', borderRadius:8, fontSize:12, fontWeight:600, opacity:saving?.5:1 }}>{saving ? 'Adding...' : 'Add & Generate Reply'}</button>
                <button onClick={() => setShowAdd(false)} style={{ background:'#1E1E2E', color:'#9CA3AF', padding:'8px 20px', borderRadius:8, fontSize:12, fontWeight:600 }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Review list */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {reviews.length === 0 && (
              <div style={{ background:'#0F0F17', border:'1px solid #1E1E2E', borderRadius:14, padding:40, textAlign:'center' }}>
                <div style={{ fontSize:14, color:'#6B7280' }}>No reviews yet. Add one manually or connect Zapier to pull them automatically.</div>
              </div>
            )}
            {reviews.map(r => (
              <div key={r.id} onClick={() => { setSelected(r); setEditReply(r.approved_reply || r.ai_reply || '') }} style={{ background:'#0F0F17', border:`1px solid ${selected?.id === r.id ? '#7C3AED' : '#1E1E2E'}`, borderRadius:14, padding:'16px 20px', cursor:'pointer', transition:'all .15s', animation:'fadeIn .3s ease' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <SentimentDot rating={r.rating} />
                      <span style={{ fontSize:14, fontWeight:600 }}>{r.author}</span>
                      <Stars n={r.rating} />
                    </div>
                    <div style={{ fontSize:11, color:'#4B5563' }}>{r.review_date?.split('T')[0] || r.created_at?.split('T')[0]}</div>
                  </div>
                  <Badge status={r.status} />
                </div>
                <div style={{ fontSize:13, color:'#9CA3AF', lineHeight:1.6, marginBottom:r.ai_reply ? 10 : 0 }}>{r.text}</div>
                {r.ai_reply && (
                  <div style={{ background:'#111118', borderRadius:10, padding:'10px 14px', borderLeft:'3px solid #7C3AED' }}>
                    <div style={{ fontSize:10, color:'#7C3AED', fontWeight:600, textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>AI Reply</div>
                    <div style={{ fontSize:12, color:'#D1D5DB', lineHeight:1.5 }}>{r.ai_reply}</div>
                    {r.keywords_used?.length > 0 && (
                      <div style={{ marginTop:6, display:'flex', gap:4, flexWrap:'wrap' }}>
                        {r.keywords_used.map(k => <span key={k} style={{ background:'#1E3A5F', color:'#93C5FD', padding:'2px 8px', borderRadius:6, fontSize:9, fontWeight:600 }}>{k}</span>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Selected review detail panel */}
          {selected && (
            <div style={{ position:'fixed', top:0, right:0, width:420, height:'100vh', background:'#0A0A10', borderLeft:'1px solid #1E1E2E', padding:24, overflowY:'auto', animation:'fadeIn .2s ease', zIndex:100 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <div style={{ fontSize:16, fontWeight:700, fontFamily:"'Playfair Display'", color:'#C4B5FD' }}>Review Detail</div>
                <button onClick={() => setSelected(null)} style={{ background:'#1E1E2E', color:'#9CA3AF', width:32, height:32, borderRadius:8, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
              </div>

              <div style={{ marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:15, fontWeight:600 }}>{selected.author}</span>
                  <Stars n={selected.rating} />
                  <Badge status={selected.status} />
                </div>
                <div style={{ fontSize:13, color:'#9CA3AF', lineHeight:1.6, background:'#111118', borderRadius:10, padding:'12px 14px' }}>"{selected.text}"</div>
              </div>

              {/* Tone selector + generate */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, color:'#6B7280', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>Reply Tone</div>
                <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
                  {TONES.map(t => (
                    <button key={t.id} onClick={() => setGenTone(t.id)} style={{ background: genTone===t.id ? '#7C3AED' : '#111118', color: genTone===t.id ? '#fff' : '#9CA3AF', padding:'6px 12px', borderRadius:8, fontSize:11, fontWeight:600, border:'1px solid', borderColor: genTone===t.id ? '#7C3AED' : '#2D2D3D' }}>{t.icon} {t.label}</button>
                  ))}
                </div>
                <button onClick={() => generate(selected.id, genTone)} disabled={generating === selected.id} style={{ background:'linear-gradient(135deg,#2563EB,#7C3AED)', color:'#fff', padding:'10px 20px', borderRadius:8, fontSize:12, fontWeight:600, width:'100%', opacity: generating===selected.id?.5:1 }}>
                  {generating === selected.id ? '⟳ Generating...' : selected.ai_reply ? '↻ Regenerate Reply' : '⚡ Generate Reply'}
                </button>
              </div>

              {/* Editable reply */}
              {(selected.ai_reply || selected.approved_reply) && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, color:'#6B7280', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>Reply (edit before approving)</div>
                  <textarea value={editReply} onChange={e => setEditReply(e.target.value)} rows={5} style={{ width:'100%', background:'#111118', border:'1px solid #2D2D3D', borderRadius:10, padding:'12px 14px', color:'#E5E5E5', fontSize:13, resize:'none', fontFamily:'inherit', lineHeight:1.5 }} />
                  {selected.keywords_used?.length > 0 && (
                    <div style={{ marginTop:6, display:'flex', gap:4, flexWrap:'wrap' }}>
                      <span style={{ fontSize:10, color:'#6B7280', marginRight:4 }}>Keywords:</span>
                      {selected.keywords_used.map(k => <span key={k} style={{ background:'#1E3A5F', color:'#93C5FD', padding:'2px 8px', borderRadius:6, fontSize:9, fontWeight:600 }}>{k}</span>)}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8, marginTop:12 }}>
                    {selected.status !== 'posted' && (
                      <button onClick={() => approve(selected.id, editReply)} style={{ background:'#059669', color:'#fff', padding:'10px 20px', borderRadius:8, fontSize:12, fontWeight:600, flex:1 }}>✓ Approve Reply</button>
                    )}
                    <button onClick={() => { navigator.clipboard.writeText(editReply); }} style={{ background:'#1E1E2E', color:'#9CA3AF', padding:'10px 16px', borderRadius:8, fontSize:12, fontWeight:600 }}>📋 Copy</button>
                  </div>
                </div>
              )}

              <button onClick={() => { deleteReview(selected.id) }} style={{ background:'transparent', color:'#EF4444', fontSize:11, padding:'8px 0', width:'100%', textAlign:'center' }}>Delete this review</button>
            </div>
          )}
        </>}

        {/* ===== SETTINGS TAB ===== */}
        {tab === 'settings' && (
          <div style={{ maxWidth:600, animation:'fadeIn .3s ease' }}>
            <div style={{ fontFamily:"'Playfair Display'", fontSize:24, fontWeight:800, marginBottom:24, background:'linear-gradient(135deg,#93C5FD,#C4B5FD)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Settings</div>

            <div style={{ background:'#0F0F17', border:'1px solid #1E1E2E', borderRadius:14, padding:24, marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#C4B5FD', marginBottom:16 }}>Business Profile</div>
              {[
                ['business_name', 'Business Name'],
                ['business_type', 'Business Type'],
                ['keywords', 'SEO Keywords (comma-separated)'],
              ].map(([key, label]) => (
                <div key={key} style={{ marginBottom:14 }}>
                  <label style={{ display:'block', fontSize:11, color:'#6B7280', textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>{label}</label>
                  {key === 'keywords' ? (
                    <textarea value={settingsForm[key] || ''} onChange={e => setSettingsForm(p=>({...p,[key]:e.target.value}))} rows={2} style={{ width:'100%', background:'#08080D', border:'1px solid #2D2D3D', borderRadius:8, padding:'10px 14px', color:'#E5E5E5', fontSize:13, resize:'none', fontFamily:'inherit' }} />
                  ) : (
                    <input value={settingsForm[key] || ''} onChange={e => setSettingsForm(p=>({...p,[key]:e.target.value}))} style={{ width:'100%', background:'#08080D', border:'1px solid #2D2D3D', borderRadius:8, padding:'10px 14px', color:'#E5E5E5', fontSize:13 }} />
                  )}
                </div>
              ))}
              <div style={{ marginBottom:14 }}>
                <label style={{ display:'block', fontSize:11, color:'#6B7280', textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>Default Tone</label>
                <div style={{ display:'flex', gap:6 }}>
                  {TONES.map(t => (
                    <button key={t.id} onClick={() => setSettingsForm(p=>({...p,tone:t.id}))} style={{ background: settingsForm.tone===t.id ? '#7C3AED' : '#08080D', color: settingsForm.tone===t.id ? '#fff' : '#9CA3AF', padding:'8px 14px', borderRadius:8, fontSize:11, fontWeight:600, border:'1px solid', borderColor: settingsForm.tone===t.id ? '#7C3AED' : '#2D2D3D', flex:1 }}>{t.icon} {t.label}</button>
                  ))}
                </div>
              </div>
              <button onClick={saveSettings} disabled={saving} style={{ background:'#7C3AED', color:'#fff', padding:'10px 24px', borderRadius:8, fontSize:13, fontWeight:600, opacity:saving?.5:1 }}>{saving ? 'Saving...' : 'Save Settings'}</button>
            </div>

            <div style={{ background:'#0F0F17', border:'1px solid #1E1E2E', borderRadius:14, padding:24 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#C4B5FD', marginBottom:12 }}>Zapier Integration</div>
              <div style={{ fontSize:12, color:'#6B7280', lineHeight:1.6, marginBottom:14 }}>
                Use this webhook URL in your Zapier zap to automatically receive new Google reviews.
              </div>
              <div style={{ background:'#08080D', border:'1px solid #2D2D3D', borderRadius:8, padding:'12px 14px', fontSize:12, color:'#93C5FD', wordBreak:'break-all', fontFamily:'monospace', marginBottom:8 }}>
                {window.location.origin}/api/webhook/new-review?secret={settings.webhook_secret || '...'}
              </div>
              <div style={{ fontSize:11, color:'#6B7280', lineHeight:1.6 }}>
                Send POST requests with JSON body: <code style={{ color:'#C4B5FD' }}>{`{ "reviewer_name": "...", "star_rating": 5, "review_text": "...", "review_id": "..." }`}</code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
