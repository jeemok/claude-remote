const express = require('express')
const { execSync, spawn } = require('child_process')

const app = express()
const PORT = process.env.PORT || 4242
const SECRET = process.env.REMOTE_SECRET
const WORK_DIR = process.env.WORK_DIR || process.cwd()
const SESSION_PREFIX = 'claude-'

if (!SECRET) {
  console.error('Error: REMOTE_SECRET env var is required')
  process.exit(1)
}

// Resolve the tmux binary: explicit TMUX_BIN wins, otherwise find it on PATH.
const TMUX = (() => {
  if (process.env.TMUX_BIN) return process.env.TMUX_BIN
  try {
    return execSync('command -v tmux', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    console.error('Error: tmux not found on PATH. Install tmux or set TMUX_BIN.')
    process.exit(1)
  }
})()

function auth(req, res, next) {
  const header = req.headers['authorization'] === 'Bearer ' + SECRET
  const query = req.query.token === SECRET
  if (!header && !query) return res.status(401).json({ error: 'unauthorized' })
  next()
}

function getSessions() {
  try {
    const out = execSync(
      TMUX + ' list-sessions -F "#{session_name}|#{session_created}"',
      { stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim()
    if (!out) return []
    return out.split('\n')
      .map(line => { const [name, created] = line.split('|'); return { name, created: parseInt(created) * 1000 } })
      .filter(s => s.name.startsWith(SESSION_PREFIX))
  } catch { return [] }
}

app.get('/sessions', auth, (_req, res) => res.json(getSessions()))

app.get('/start', auth, (req, res) => {
  const sessions = getSessions()
  const indices = sessions
    .map(s => s.name.replace('claude-session-', ''))
    .filter(n => /^\d+$/.test(n))
    .map(Number)
  const next = indices.length ? Math.max(...indices) + 1 : 1
  const name = 'claude-session-' + next
  spawn(TMUX, ['new-session', '-d', '-s', name, '-c', WORK_DIR, 'claude'], { detached: true, stdio: 'ignore' }).unref()
  setTimeout(() => {
    try { execSync(TMUX + ' send-keys -t ' + name + ' "/remote-control" Enter', { stdio: 'ignore' }) } catch (_) {}
  }, 5000)
  res.json({ status: 'started', name })
})

app.get('/stop', auth, (req, res) => {
  const name = (req.query.name || '').replace(/[^a-zA-Z0-9-]/g, '')
  if (!name) return res.status(400).json({ error: 'name required' })
  try { execSync(TMUX + ' kill-session -t ' + name, { stdio: 'ignore' }); res.json({ status: 'stopped', name }) }
  catch { res.status(404).json({ error: 'session not found' }) }
})

app.get('/', auth, (req, res) => res.send(dashboard(req.query.token || '', WORK_DIR)))

function dashboard(token, workDir) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>Claude Remote</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:       #090c10;
      --surface:  #111620;
      --surface2: #1c2333;
      --border:   #2a3347;
      --accent:   #4facde;
      --green:    #3dd68c;
      --red:      #ff6b6b;
      --text:     #d8e2ef;
      --muted:    #8899a6;
      --sans:     system-ui, -apple-system, sans-serif;
      --mono:     ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
    }

    html, body { height: 100%; background: var(--bg); color: var(--text);
      font-family: var(--sans); font-size: 15px; line-height: 1.5;
      -webkit-font-smoothing: antialiased; }

    body { display: flex; flex-direction: column; min-height: 100vh;
      padding-top: env(safe-area-inset-top, 0);
      padding-bottom: env(safe-area-inset-bottom, 0); }

    /* Header */
    header { padding: 1.1rem 1.25rem .9rem; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
      position: sticky; top: 0; background: var(--bg); z-index: 10; }

    .wordmark { display: flex; align-items: center; gap: .55rem; }

    .wm-icon { width: 28px; height: 28px; border-radius: 7px;
      background: linear-gradient(145deg, #2d6fa3, #1a4a73);
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; flex-shrink: 0; box-shadow: 0 1px 6px rgba(0,0,0,.5); }

    .wm-text { font-family: var(--mono); font-size: .82rem; font-weight: 500;
      letter-spacing: -.01em; }
    .wm-text .hi { color: var(--accent); }

    .hdr-right { display: flex; align-items: center; gap: .5rem; }

    .pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
    .pulse.on { animation: pulseAnim 2s ease-in-out infinite; }

    @keyframes pulseAnim {
      0%,100% { opacity:1; box-shadow:0 0 0 0 rgba(61,214,140,.35); }
      50%      { opacity:.7; box-shadow:0 0 0 5px rgba(61,214,140,0); }
    }

    .cdown { font-family: var(--mono); font-size: .7rem; color: var(--muted); }

    /* Main */
    main { flex: 1; padding: 1.25rem; display: flex; flex-direction: column; gap: 1.5rem; }

    .sec-label { font-size: .62rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .1em; color: var(--muted); margin-bottom: .6rem; }

    /* Actions */
    .btn-new { width: 100%; background: var(--accent); border: none;
      border-radius: 10px; padding: 1rem; cursor: pointer; font-family: var(--sans);
      color: #090c10; font-size: .95rem; font-weight: 700; display: flex;
      align-items: center; justify-content: center; gap: .5rem;
      transition: filter .12s; -webkit-tap-highlight-color: transparent; }
    .btn-new:active { filter: brightness(.82); }
    .btn-new:disabled { filter: brightness(.6); cursor: default; }

    .btn-stop-all { width: 100%; background: none; border: 1px solid rgba(255,107,107,.2);
      border-radius: 10px; padding: .7rem; cursor: pointer; font-family: var(--sans);
      color: var(--red); font-size: .82rem; font-weight: 500;
      transition: background .12s; -webkit-tap-highlight-color: transparent; }
    .btn-stop-all:active { background: rgba(255,107,107,.08); }

    /* Session list */
    .session-list { display: flex; flex-direction: column; gap: .55rem; }

    .empty { background: var(--surface); border: 1px dashed var(--border);
      border-radius: 10px; padding: 2rem 1rem; text-align: center; }
    .empty-icon { font-size: 1.5rem; margin-bottom: .4rem; opacity: .4; }
    .empty-text { font-size: .82rem; color: var(--muted); }

    .s-card { background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; overflow: hidden; display: flex; }

    .s-bar { width: 3px; background: var(--green); flex-shrink: 0; }

    .s-inner { flex: 1; padding: .8rem 1rem; min-width: 0; }

    .s-top { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }

    .s-info { flex: 1; min-width: 0; }

    .s-name { font-family: var(--mono); font-size: .84rem; font-weight: 500;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .s-meta { display: flex; align-items: center; gap: .4rem; margin-top: 2px; }

    .chip { display: inline-flex; align-items: center; gap: .28rem;
      font-size: .62rem; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
      color: var(--green); background: rgba(61,214,140,.1); border-radius: 4px; padding: 1px 5px; }
    .chip-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green);
      animation: pulseAnim 2s ease-in-out infinite; }

    .s-time { font-size: .7rem; color: var(--muted); }

    .btn-stop { flex-shrink: 0; background: rgba(255,107,107,.08);
      border: 1px solid rgba(255,107,107,.22); color: var(--red); border-radius: 7px;
      padding: .42rem .85rem; font-size: .78rem; font-weight: 500; cursor: pointer;
      font-family: var(--sans); min-height: 32px; transition: background .12s;
      -webkit-tap-highlight-color: transparent; }
    .btn-stop:active { background: rgba(255,107,107,.18); }

    /* Attach command */
    .s-attach { display: flex; align-items: center; justify-content: space-between;
      margin-top: .6rem; background: var(--bg); border: 1px solid var(--border);
      border-radius: 6px; padding: .4rem .6rem; gap: .5rem; cursor: pointer;
      -webkit-tap-highlight-color: transparent; }
    .s-attach:active { border-color: var(--accent); }

    .s-attach-cmd { font-family: var(--mono); font-size: .7rem; color: var(--muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }

    .s-attach-hint { font-size: .62rem; color: #3a4558; flex-shrink: 0; transition: color .15s; }
    .s-attach:active .s-attach-hint { color: var(--accent); }

    /* Footer */
    footer { padding: .7rem 1.25rem; border-top: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between; }
    .fp { font-family: var(--mono); font-size: .62rem; color: #333d52;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%; }
    .fv { font-size: .62rem; color: #333d52; }

    /* Toast */
    #toast { position: fixed; bottom: calc(1.25rem + env(safe-area-inset-bottom,0));
      left: 50%; transform: translateX(-50%) translateY(80px);
      background: var(--surface2); border: 1px solid var(--border); border-radius: 20px;
      padding: .52rem 1.1rem; font-size: .78rem; font-weight: 500;
      white-space: nowrap; z-index: 100; box-shadow: 0 8px 32px rgba(0,0,0,.5);
      transition: transform .3s cubic-bezier(.34,1.56,.64,1), opacity .3s;
      opacity: 0; pointer-events: none; }
    #toast.show  { transform: translateX(-50%) translateY(0); opacity: 1; }
    #toast.ok    { border-color: rgba(61,214,140,.4);  color: var(--green); }
    #toast.err   { border-color: rgba(255,107,107,.3); color: var(--red); }
    #toast.info  { border-color: rgba(79,172,222,.4);  color: var(--accent); }
  </style>
</head>
<body>

<header>
  <div class="wordmark">
    <div class="wm-icon">⌘</div>
    <div class="wm-text"><span class="hi">claude</span> remote</div>
  </div>
  <div class="hdr-right">
    <div class="pulse" id="pulse"></div>
    <span class="cdown" id="cdown">5s</span>
  </div>
</header>

<main>
  <button class="btn-new" id="btn-new" onclick="startSession()">
    ▶ Start Session
  </button>

  <div>
    <div class="sec-label">Active Sessions</div>
    <div class="session-list" id="slist">
      <div class="empty">
        <div class="empty-icon">◌</div>
        <div class="empty-text">Loading…</div>
      </div>
    </div>
  </div>

  <button class="btn-stop-all" onclick="stopAll()">■ Stop All Sessions</button>
</main>

<footer>
  <span class="fp">${workDir}</span>
  <span class="fv">v1</span>
</footer>

<div id="toast"></div>

<script>
  const TOKEN = '${token}'
  let cd = 5

  function api(path) {
    return fetch(path + (path.includes('?') ? '&' : '?') + 'token=' + TOKEN).then(r => r.json())
  }

  function ago(ms) {
    const s = Math.floor((Date.now() - ms) / 1000)
    if (s < 60) return s + 's ago'
    if (s < 3600) return Math.floor(s / 60) + 'm ago'
    return Math.floor(s / 3600) + 'h ago'
  }

  function short(n) { return n.startsWith('claude-') ? n.slice(7) : n }

  function copyAttach(name) {
    const cmd = 'tmux attach -t ' + name
    navigator.clipboard.writeText(cmd).then(() => toast('Copied!', 'info')).catch(() => toast(cmd, 'info'))
  }

  function render(sessions) {
    const el = document.getElementById('slist')
    const pulse = document.getElementById('pulse')
    if (!sessions.length) {
      pulse.classList.remove('on')
      el.innerHTML = \`<div class="empty"><div class="empty-icon">◌</div><div class="empty-text">No active sessions</div></div>\`
      return
    }
    pulse.classList.add('on')
    el.innerHTML = sessions.map(s => \`
      <div class="s-card">
        <div class="s-bar"></div>
        <div class="s-inner">
          <div class="s-top">
            <div class="s-info">
              <div class="s-name">\${s.name}</div>
              <div class="s-meta">
                <span class="chip"><span class="chip-dot"></span>running</span>
                <span class="s-time">\${ago(s.created)}</span>
              </div>
            </div>
            <button class="btn-stop" onclick="stop('\${s.name}')">Stop</button>
          </div>
          <div class="s-attach" onclick="copyAttach('\${s.name}')">
            <span class="s-attach-cmd">tmux attach -t \${s.name}</span>
            <span class="s-attach-hint">tap to copy</span>
          </div>
        </div>
      </div>\`).join('')
  }

  function refresh() { api('/sessions').then(render).catch(() => {}) }

  function stop(name) {
    api('/stop?name=' + encodeURIComponent(name)).then(() => { toast('Stopped ' + name, 'err'); refresh() })
  }

  function startSession() {
    const btn = document.getElementById('btn-new')
    btn.disabled = true
    btn.textContent = 'Starting…'
    api('/start')
      .then(d => {
        toast('Started ' + d.name, 'ok')
        refresh()
      })
      .catch(err => {
        console.error('startSession failed:', err)
        toast('Failed to start — check server', 'err')
      })
      .finally(() => {
        btn.disabled = false
        btn.textContent = '▶ Start Session'
      })
  }

  function stopAll() {
    api('/sessions').then(sessions => {
      if (!sessions.length) return toast('Nothing running', 'info')
      Promise.all(sessions.map(s => api('/stop?name=' + encodeURIComponent(s.name)))).then(() => {
        toast('All sessions stopped', 'err'); refresh()
      })
    })
  }

  function toast(msg, type) {
    const el = document.getElementById('toast')
    el.textContent = msg; el.className = 'toast ' + type + ' show'
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2500)
  }

  setInterval(() => {
    cd--
    document.getElementById('cdown').textContent = cd + 's'
    if (cd <= 0) { cd = 5; refresh() }
  }, 1000)

  refresh()
</script>
</body>
</html>`
}

app.listen(PORT, function () {
  console.log('claude-remote listening on :' + PORT)
  console.log('Work dir: ' + WORK_DIR)
  console.log('tmux:     ' + TMUX)
})
