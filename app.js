/* AURELIUS APP — UI, modes, Supabase realtime, analysis, puzzles */
(function () {
  'use strict';

  /* ================= CONFIG ================= */
  const SUPABASE_URL = 'https://wlaalnqprqvrqknlabcb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_ziN-MaAKMCXXoBNAaxF5Xg_uGDLs1wN';

  /* ================= HELPERS ================= */
  const A = window.Aurelius;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const FILES = 'abcdefgh';

  const DEF = { theme: 'gold', coords: true, legal: true, sound: true, autoflip: true, showEval: false };
  const S = Object.assign({}, DEF, safeParse(localStorage.getItem('aur.settings')));
  function safeParse(x) { try { return JSON.parse(x) || {}; } catch (e) { return {}; } }
  function saveS() { localStorage.setItem('aur.settings', JSON.stringify(S)); }

  const User = { id: null, name: 'Guest', rating: 1200, avatar: '♞', wins: 0, losses: 0, draws: 0, games: 0 };
  let sb = null, ONLINE = false;

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ================= SUPABASE ================= */
  async function bootSupabase() {
    if (!window.supabase || !SUPABASE_URL.startsWith('https')) {
      $('#offlineNote').classList.remove('hidden');
      return;
    }
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      let { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const r = await sb.auth.signInAnonymously();
        session = r.data ? r.data.session : null;
      }
      if (session) {
        User.id = session.user.id;
        await loadProfile();
        ONLINE = true;
      }
    } catch (e) {
      console.warn('Supabase boot failed', e);
      $('#offlineNote').classList.remove('hidden');
    }
    renderUserChip();
  }

  async function loadProfile() {
    const { data, error } = await sb.from('profiles').select('*').eq('id', User.id).maybeSingle();
    if (error) { console.warn(error); return; }
    if (!data) {
      let uname = 'Guest' + Math.floor(1000 + Math.random() * 9000);
      const ins = await sb.from('profiles').insert({ id: User.id, username: uname }).select().maybeSingle();
      if (ins.error) { console.warn(ins.error); return; }
      Object.assign(User, fromProfile(ins.data));
    } else {
      Object.assign(User, fromProfile(data));
    }
    renderUserChip();
    renderProfile();
  }

  function fromProfile(p) {
    return {
      id: p.id, name: p.username, rating: p.rating, avatar: p.avatar || '♞',
      wins: p.wins, losses: p.losses, draws: p.draws, games: p.games_played
    };
  }

  function renderUserChip() {
    $('#ucName').textContent = User.name;
    $('#ucRating').textContent = User.rating;
    $('#ucAvatar').textContent = User.avatar || '♞';
  }

  /* ================= VIEW SWITCHING ================= */
  function switchView(name) {
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    window.scrollTo(0, 0);
    if (name === 'lobby') loadLobby();
    if (name === 'rank') loadRank();
    if (name === 'profile') { renderProfile(); loadHistory(); }
  }

  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-view]');
    if (nav && !e.target.closest('#board') && !e.target.closest('#puzBoard')) {
      switchView(nav.dataset.view);
    }
  });

  /* ================= BOARD RENDERING ================= */
  function renderBoardInto(el, st, opt) {
    opt = opt || {};
    const flip = !!opt.flip;
    const sel = opt.selected;
    const legalTo = new Set((opt.legal || []).map(m => m.to));
    const legalSet = new Set((opt.legal || []).map(m => m.from));
    const last = opt.last;
    const checkIdx = opt.check;

    let html = '';
    for (let vr = 0; vr < 8; vr++) {
      for (let vf = 0; vf < 8; vf++) {
        const f = flip ? 7 - vf : vf;
        const r = flip ? 7 - vr : vr;
        const idx = r * 8 + f;
        const dark = (f + r) % 2 === 0;
        let cls = 'sq ' + (dark ? 'dark' : 'light');
        if (last && (idx === last.from || idx === last.to)) cls += ' last';
        if (idx === sel) cls += ' sel';
        if (idx === checkIdx) cls += ' check';
        if (opt.hintFrom === idx) cls += ' hint-from';
        if (opt.hintTo === idx) cls += ' hint-to';

        let attrs = `data-i="${idx}"`;
        if (S.coords) {
          if (vf === 0) attrs += ` data-rank="${8 - r}"`;
          if (vr === 7) attrs += ` data-file="${FILES[f]}"`;
        }
        html += `<div class="${cls}" ${attrs}>`;
        if (sel >= 0 && legalTo.has(idx)) {
          html += st.board[idx] ? '<span class="ring"></span>' : '<span class="dot"></span>';
        }
        const p = st.board[idx];
        if (p) {
          const c = p === p.toUpperCase() ? 'w' : 'b';
          html += `<span class="pc ${c}">${GLYPH[p.toLowerCase()]}</span>`;
        }
        html += '</div>';
      }
    }
    el.innerHTML = html;
  }

  /* ================= GAME STATE ================= */
  const G = {
    active: false, mode: null, st: null, startFen: A.START_FEN,
    moves: [], sans: [], fens: [], keys: [],
    last: null, flip: false, myColor: null, over: false,
    result: null, reason: '', room: null, level: 'medium',
    clock: null, clockTimer: null, selected: -1, legal: [],
    pending: null, hint: null, players: null, rated: false,
    opponentName: '', opponentRating: ''
  };
  let channel = null;

  function parseTC(str) {
    const [b, i] = (str || '0|0').split('|').map(Number);
    return { base: b || 0, inc: i || 0 };
  }

  function startGame(opts) {
    cleanupGame();
    G.active = true;
    G.mode = opts.mode;
    G.startFen = opts.fen || A.START_FEN;
    G.st = A.parseFen(G.startFen);
    G.moves = []; G.sans = []; G.fens = [A.toFen(G.st)]; G.keys = [A.posKey(G.st)];
    G.last = null; G.selected = -1; G.legal = []; G.over = false;
    G.result = null; G.reason = ''; G.pending = null; G.hint = null;
    G.myColor = opts.myColor || null;
    G.level = opts.level || 'medium';
    G.players = opts.players || { w: { name: 'White', rating: '' }, b: { name: 'Black', rating: '' } };
    G.rated = !!opts.rated;
    G.room = opts.room || null;
    G.opponentName = '';
    G.flip = G.myColor === 'b';

    const tc = opts.tc || { base: 0, inc: 0 };
    G.clock = tc.base > 0 ? { base: tc.base, inc: tc.inc, w: tc.base, b: tc.base, active: 'w', last: Date.now() } : null;

    $('#boardOver').classList.add('hidden');
    $('#promo').classList.add('hidden');
    $('#chatLog').innerHTML = '';
    $('#btnRematch').classList.add('hidden');
    $('#btnAnalyze').disabled = true;
    $('#evalBar').classList.toggle('hidden', !(S.showEval && G.mode === 'ai'));

    switchView('game');
    renderAll();
    if (G.clock) startClockTicker();
    if (opts.onStart) opts.onStart();
  }

  function cleanupGame() {
    if (G.clockTimer) { clearInterval(G.clockTimer); G.clockTimer = null; }
    if (channel) { try { sb.removeChannel(channel); } catch (e) {} channel = null; }
    G.active = false;
  }

  /* ================= CLOCK ================= */
  function startClockTicker() {
    if (G.clockTimer) clearInterval(G.clockTimer);
    G.clockTimer = setInterval(tickClock, 100);
  }

  function clockRemaining(color) {
    const c = G.clock;
    let t = color === 'w' ? c.w : c.b;
    if (c.active === color && c.last) t -= (Date.now() - c.last);
    return Math.max(0, t);
  }

  function tickClock() {
    if (!G.active || !G.clock) return;
    if (!G.over && G.clock.active) {
      const rem = clockRemaining(G.clock.active);
      if (rem <= 0) {
        const loser = G.clock.active;
        endGame(loser === 'w' ? '0-1' : '1-0', 'timeout');
        return;
      }
    }
    renderClocks();
  }

  function clockAfterMove(mover) {
    const c = G.clock;
    if (!c) return;
    const rem = clockRemaining(mover);
    if (mover === 'w') c.w = rem + c.inc; else c.b = rem + c.inc;
    c.active = mover === 'w' ? 'b' : 'w';
    c.last = Date.now();
  }

  function fmtClock(ms) {
    if (ms == null) return '--:--';
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60), s = total % 60;
    if (ms < 20000) return `${m}:${String(s).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function renderClocks() {
    if (!G.clock) {
      $('#clockTop').textContent = '--:--';
      $('#clockBot').textContent = '--:--';
      return;
    }
    const topColor = G.flip ? 'w' : 'b';
    const botColor = G.flip ? 'b' : 'w';
    const topEl = $('#clockTop'), botEl = $('#clockBot');
    topEl.textContent = fmtClock(clockRemaining(topColor));
    botEl.textContent = fmtClock(clockRemaining(botColor));
    topEl.classList.toggle('active', G.clock.active === topColor);
    botEl.classList.toggle('active', G.clock.active === botColor);
    topEl.classList.toggle('low', clockRemaining(topColor) < 20000);
    botEl.classList.toggle('low', clockRemaining(botColor) < 20000);
  }

  /* ================= RENDER ================= */
  function renderAll() {
    if (!G.active) return;
    const rep = countRep();
    const checkIdx = A.inCheck(G.st, G.st.turn) ? findKing(G.st, G.st.turn) : -1;

    renderBoardInto($('#board'), G.st, {
      flip: G.flip, selected: G.selected, legal: G.legal, last: G.last,
      check: checkIdx, hintFrom: G.hint && G.hint.from, hintTo: G.hint && G.hint.to
    });
    renderPlayers();
    renderMoves();
    renderStatus(rep);
    renderClocks();
    renderEval();
    $('#btnAnalyze').disabled = !G.over;
    $('#btnUndo').disabled = G.mode === 'online' || G.mode === 'spectate';
    $('#btnHint').disabled = G.over || G.mode === 'spectate';
  }

  function findKing(st, color) {
    for (let i = 0; i < 64; i++) {
      const p = st.board[i];
      if (p && p.toLowerCase() === 'k' && (p === p.toUpperCase() ? 'w' : 'b') === color) return i;
    }
    return -1;
  }

  function countRep() {
    if (!G.keys.length) return 0;
    const last = G.keys[G.keys.length - 1];
    return G.keys.filter(k => k === last).length;
  }

  function renderPlayers() {
    const topColor = G.flip ? 'w' : 'b';
    const botColor = G.flip ? 'b' : 'w';
    const topP = G.players[topColor] || { name: topColor === 'w' ? 'White' : 'Black', rating: '' };
    const botP = G.players[botColor] || { name: topColor === 'w' ? 'Black' : 'White', rating: '' };

    $('#nameTop').textContent = topP.name;
    $('#rateTop').textContent = topP.rating ? '(' + topP.rating + ')' : '';
    $('#nameBot').textContent = botP.name;
    $('#rateBot').textContent = botP.rating ? '(' + botP.rating + ')' : '';
    $('#avTop').textContent = topColor === 'w' ? '♔' : '♚';
    $('#avBot').textContent = botColor === 'w' ? '♔' : '♚';

    const cap = capturedLists(G.st);
    $('#capTop').textContent = cap[topColor].map(t => GLYPH[t]).join('');
    $('#capBot').textContent = cap[botColor].map(t => GLYPH[t]).join('');
  }

  const INIT = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  function capturedLists(st) {
    const cnt = { w: {}, b: {} };
    for (const p of st.board) {
      if (!p) continue;
      const c = p === p.toUpperCase() ? 'w' : 'b';
      const t = p.toLowerCase();
      cnt[c][t] = (cnt[c][t] || 0) + 1;
    }
    const missing = { w: [], b: [] };
    for (const c of ['w', 'b']) {
      for (const t of ['q', 'r', 'b', 'n', 'p']) {
        const n = INIT[t] - (cnt[c][t] || 0);
        for (let i = 0; i < n; i++) missing[c].push(t);
      }
    }
    return missing;
  }

  function renderMoves() {
    const ol = $('#moveList');
    let html = '';
    for (let i = 0; i < G.sans.length; i += 2) {
      const num = Math.floor(i / 2) + 1;
      html += `<li><span class="num">${num}.</span><span class="mv">${G.sans[i]}</span><span class="mv">${G.sans[i + 1] || ''}</span></li>`;
    }
    ol.innerHTML = html;
    ol.scrollTop = ol.scrollHeight;
  }

  function renderStatus(rep) {
    const el = $('#statusLine');
    if (G.over) {
      el.textContent = resultText(G.result) + ' — ' + G.reason;
      return;
    }
    const side = G.st.turn === 'w' ? 'White' : 'Black';
    let txt = side + ' to move';
    if (A.inCheck(G.st, G.st.turn)) txt += ' — check!';
    if (G.mode === 'ai' && G.st.turn === 'b') txt = 'Aurelius is thinking…';
    el.textContent = txt;
  }

  function resultText(result) {
    if (result === '1-0') return 'White wins';
    if (result === '0-1') return 'Black wins';
    return 'Draw';
  }

  function renderEval() {
    if (!(S.showEval && G.mode === 'ai') || !G.active) { $('#evalBar').classList.add('hidden'); return; }
    $('#evalBar').classList.remove('hidden');
    try {
      const cp = A.quickEval(A.toFen(G.st), 1);
      const pct = 50 + Math.max(-50, Math.min(50, cp / 20));
      $('#evalFill').style.width = pct + '%';
    } catch (e) {}
  }

  /* ================= MOVE HANDLING ================= */
  function onSquare(i) {
    if (!G.active || G.over || G.pending) return;
    if (G.mode === 'spectate') return;
    if (G.myColor && G.st.turn !== G.myColor) return;
    if (G.mode === 'ai' && G.st.turn !== 'w') return;

    const p = G.st.board[i];

    if (G.selected >= 0) {
      const move = G.legal.find(m => m.to === i);
      if (move) {
        const promos = G.legal.filter(m => m.to === i && m.promo);
        if (promos.length) {
          showPromo(i);
          G.pending = { from: G.selected, to: i };
          return;
        }
        commitMove(G.selected, i, null);
        return;
      }
    }

    if (p && (p === p.toUpperCase() ? 'w' : 'b') === G.st.turn) {
      G.selected = i;
      G.legal = A.legalMoves(G.st).filter(m => m.from === i);
    } else {
      G.selected = -1; G.legal = [];
    }
    renderAll();
  }

  function showPromo(to) {
    const box = $('#promo');
    box.innerHTML = `<div class="promo-box">${['q', 'r', 'b', 'n'].map(t =>
      `<button data-p="${t}">${GLYPH[t]}</button>`).join('')}</div>`;
    box.classList.remove('hidden');
    box.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        const promo = b.dataset.p;
        box.classList.add('hidden');
        if (G.pending) commitMove(G.pending.from, G.pending.to, promo);
      };
    });
  }

  function commitMove(from, to, promo) {
    if (G.over) return false;
    const legal = A.legalMoves(G.st);
    const m = legal.find(x => x.from === from && x.to === to && (promo ? x.promo === promo : !x.promo));
    if (!m) return false;

    const san = A.moveToSan(G.st, m, legal);
    const mover = G.st.turn;
    const capture = !!G.st.board[to] || !!m.ep;

    A.makeMove(G.st, m);
    G.moves.push({ from, to, promo: m.promo || null });
    G.sans.push(san);
    G.fens.push(A.toFen(G.st));
    G.keys.push(A.posKey(G.st));
    G.last = { from, to };
    G.selected = -1; G.legal = []; G.pending = null; G.hint = null;

    if (G.clock) clockAfterMove(mover);
    playSound(san, capture);
    $('#promo').classList.add('hidden');

    const rep = countRep();
    const stt = A.status(G.st, rep);
    if (stt.over) {
      endGame(stt.result, stt.reason);
    } else {
      if (G.mode === 'local' && S.autoflip) G.flip = G.st.turn === 'b';
      renderAll();
      if (G.mode === 'ai') setTimeout(maybeAI, 120);
      if (G.mode === 'online') syncRoom();
    }
    return true;
  }

  function maybeAI() {
    if (!G.active || G.over || G.mode !== 'ai') return;
    if (G.st.turn !== 'b') return;
    const best = A.findBestMove(A.toFen(G.st), G.level);
    if (best && !G.over) commitMove(best.from, best.to, best.promo);
  }

  function endGame(result, reason) {
    if (G.over) return;
    G.over = true;
    G.result = result;
    G.reason = reason;
    if (G.clock) G.clock.active = null;
    playSound('end', false);

    let title = resultText(result);
    if (G.myColor) {
      const iWon = (result === '1-0' && G.myColor === 'w') || (result === '0-1' && G.myColor === 'b');
      title = result === '1/2-1/2' ? 'Draw' : (iWon ? 'You won!' : 'You lost');
    }

    const over = $('#boardOver');
    over.innerHTML = `<div class="ov-card">
      <div class="ov-title">${title}</div>
      <div class="ov-sub">${reason}</div>
      <div class="ov-btns">
        <button class="btn sm" id="ovAnalyze">Analyze</button>
        <button class="btn sm ghost" id="ovRematch">Rematch</button>
        <button class="btn sm ghost" id="ovExit">Exit</button>
      </div>
    </div>`;
    over.classList.remove('hidden');
    $('#ovAnalyze').onclick = () => { over.classList.add('hidden'); openAnalysis(); };
    $('#ovRematch').onclick = () => { over.classList.add('hidden'); rematch(); };
    $('#ovExit').onclick = () => { over.classList.add('hidden'); exitGame(); };

    $('#btnAnalyze').disabled = false;
    $('#btnRematch').classList.remove('hidden');

    if (G.mode === 'online' && G.room && ONLINE) {
      syncRoom(true);
      sb.rpc('finish_game', { p_room: G.room.id, p_result: result })
        .then(() => loadProfile())
        .catch(e => console.warn(e));
    }
    renderAll();
  }

  function playSound(san, capture) {
    if (!S.sound) return;
    try {
      const AC = new (window.AudioContext || window.webkitAudioContext)();
      const o = AC.createOscillator(), g = AC.createGain();
      o.connect(g); g.connect(AC.destination);
      let f = 520, d = 0.08;
      if (san.includes('#')) { f = 300; d = 0.3; }
      else if (san.includes('+')) { f = 700; d = 0.12; }
      else if (capture) { f = 320; d = 0.1; }
      o.frequency.value = f;
      g.gain.setValueAtTime(0.06, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + d);
      o.start(); o.stop(AC.currentTime + d);
    } catch (e) {}
  }

  /* ================= UNDO / RESIGN / DRAW / FLIP ================= */
  function undo() {
    if (!G.active || G.over || G.mode === 'online' || G.mode === 'spectate') return;
    const plies = (G.mode === 'ai' && G.sans.length > 1) ? 2 : 1;
    for (let k = 0; k < plies && G.moves.length; k++) {
      G.moves.pop(); G.sans.pop(); G.fens.pop(); G.keys.pop();
    }
    const lastFen = G.fens[G.fens.length - 1] || G.startFen;
    G.st = A.parseFen(lastFen);
    G.last = null;
    G.over = false; G.result = null; G.reason = '';
    G.selected = -1; G.legal = [];
    $('#boardOver').classList.add('hidden');
    if (G.clock) G.clock.active = G.st.turn;
    renderAll();
  }

  function resign() {
    if (!G.active || G.over) return;
    if (!confirm('Resign this game?')) return;
    const loser = G.myColor || (G.st.turn === 'w' ? 'b' : 'w');
    const result = G.myColor ? (G.myColor === 'w' ? '0-1' : '1-0')
                             : (G.st.turn === 'w' ? '0-1' : '1-0');
    endGame(result, 'resignation');
  }

  function drawOffer() {
    if (!G.active || G.over) return;
    if (G.mode === 'online') {
      if (confirm('Offer a draw?')) {
        sendChat('🤝 Draw offered by ' + User.name);
        toast('Draw offer sent');
      }
      return;
    }
    if (confirm('Agree to a draw?')) endGame('1/2-1/2', 'agreement');
  }

  function rematch() {
    if (G.mode === 'online' && G.room && ONLINE) {
      sb.from('rooms').update({
        fen: A.START_FEN, moves: [], pgn: '', last_move: null, turn: 'w',
        status: 'playing', result: null,
        white_time: G.clock ? G.clock.base : 0,
        black_time: G.clock ? G.clock.base : 0,
        last_move_at: new Date().toISOString()
      }).eq('id', G.room.id).then(() => {});
      return;
    }
    const opts = {
      mode: G.mode, level: G.level, rated: G.rated,
      tc: G.clock ? { base: G.clock.base, inc: G.clock.inc } : { base: 0, inc: 0 },
      players: G.players, myColor: G.myColor
    };
    if (G.mode === 'ai') opts.players = { w: { name: User.name, rating: User.rating }, b: { name: 'Aurelius', rating: '' } };
    startGame(opts);
  }

  function exitGame() {
    cleanupGame();
    switchView('home');
  }

  /* ================= CLICK WIRING ================= */
  $('#board').addEventListener('click', e => {
    const sq = e.target.closest('.sq');
    if (sq) onSquare(+sq.dataset.i);
  });

  /* ================= ONLINE ================= */
  function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function readTC() {
    return parseTC($('#selTC').value);
  }

  function tcLabel(tc) {
    if (!tc.base) return 'Casual';
    return Math.round(tc.base / 60000) + '+' + Math.round(tc.inc / 1000);
  }

  async function createRoom() {
    if (!ONLINE) { toast('Online is offline — add Supabase keys'); return; }
    const code = genCode();
    const tc = readTC();
    const rated = $('#chkRated').checked;
    const { error } = await sb.from('rooms').insert({
      id: code, white_id: User.id, white_name: User.name,
      fen: A.START_FEN, status: 'waiting', turn: 'w',
      tc_base: tc.base, tc_inc: tc.inc, tc_label: tcLabel(tc),
      white_time: tc.base, black_time: tc.base, is_rated: rated
    });
    if (error) { toast('Could not create room'); console.warn(error); return; }

    startGame({
      mode: 'online', myColor: 'w', room: { id: code }, rated,
      tc, players: { w: { name: User.name, rating: User.rating }, b: { name: 'Waiting…', rating: '' } }
    });
    subscribeRoom(code);
    toast('Room ' + code + ' created — share the code!');
    sendChat('Room code: ' + code);
  }

  async function joinRoom(code) {
    if (!ONLINE) { toast('Online is offline — add Supabase keys'); return; }
    code = (code || '').toUpperCase().trim();
    if (!code) return;
    const { data: room, error } = await sb.from('rooms').select('*').eq('id', code).maybeSingle();
    if (error || !room) { toast('Room not found'); return; }

    let myColor = null;
    if (room.white_id === User.id) myColor = 'w';
    else if (room.black_id === User.id) myColor = 'b';
    else if (room.status === 'waiting' && !room.black_id) {
      const { error: e2 } = await sb.from('rooms').update({
        black_id: User.id, black_name: User.name, status: 'playing',
        last_move_at: new Date().toISOString()
      }).eq('id', code).is('black_id', null);
      if (e2) { toast('Could not join'); return; }
      myColor = 'b';
    } else {
      // spectate
      startGame({
        mode: 'spectate', room: { id: code }, myColor: null,
        fen: room.fen, tc: { base: room.tc_base, inc: room.tc_inc },
        players: { w: { name: room.white_name || 'White', rating: '' }, b: { name: room.black_name || 'Black', rating: '' } }
      });
      subscribeRoom(code);
      toast('Spectating room ' + code);
      return;
    }

    const { data: fresh } = await sb.from('rooms').select('*').eq('id', code).maybeSingle();
    startGame({
      mode: 'online', myColor, room: { id: code }, rated: fresh.is_rated,
      fen: fresh.fen, tc: { base: fresh.tc_base, inc: fresh.tc_inc },
      players: {
        w: { name: fresh.white_name || 'White', rating: '' },
        b: { name: fresh.black_name || 'Black', rating: '' }
      }
    });
    applyRoomState(fresh);
    subscribeRoom(code);
  }

  async function quickMatch() {
    if (!ONLINE) { toast('Online is offline — add Supabase keys'); return; }
    const { data: waiting } = await sb.from('rooms')
      .select('*').eq('status', 'waiting').is('black_id', null)
      .neq('white_id', User.id).limit(1);

    if (waiting && waiting.length) {
      joinRoom(waiting[0].id);
    } else {
      await createRoom();
    }
  }

  function subscribeRoom(code) {
    if (!ONLINE) return;
    if (channel) { try { sb.removeChannel(channel); } catch (e) {} }
    channel = sb.channel('room-' + code)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: 'id=eq.' + code },
        payload => { if (payload.new) applyRoomState(payload.new); })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat', filter: 'room_id=eq.' + code },
        payload => { if (payload.new) addChatMsg(payload.new); })
      .subscribe();
  }

  function applyRoomState(r) {
    if (!G.active || !G.room) return;
    const sameFen = A.toFen(G.st) === r.fen;

    if (!sameFen) {
      G.st = A.parseFen(r.fen);
      G.moves = Array.isArray(r.moves) ? r.moves : [];
      const replay = replayMoves(G.startFen, G.moves);
      G.sans = replay.sans;
      G.fens = replay.fens;
      G.keys = replay.keys;
      G.last = r.last_move || null;
      G.selected = -1; G.legal = [];
      if (G.myColor === 'b') G.flip = true;
    }

    if (G.clock && r.white_time != null) {
      G.clock.w = r.white_time;
      G.clock.b = r.black_time;
      G.clock.active = r.turn === 'w' ? 'w' : 'b';
      G.clock.last = Date.now();
    }

    G.players = {
      w: { name: r.white_name || 'White', rating: '' },
      b: { name: r.black_name || 'Black', rating: '' }
    };

    if (r.status === 'finished' && !G.over) {
      endGame(r.result || '1/2-1/2', 'game over');
      return;
    }
    if (r.status === 'playing' && G.moves.length === 0 && !G.clock) {
      // start clock when game starts
    }
    renderAll();
  }

  function syncRoom(finished) {
    if (!ONLINE || !G.room) return;
    const pgn = A.movesToPgn(G.startFen, G.moves, {
      Event: 'Aurelius Online', White: G.players.w.name, Black: G.players.b.name,
      Result: finished ? G.result : '*'
    });
    sb.from('rooms').update({
      fen: A.toFen(G.st),
      moves: G.moves,
      pgn,
      last_move: G.last,
      turn: G.st.turn,
      status: G.over ? 'finished' : 'playing',
      result: G.result,
      white_time: G.clock ? Math.round(clockRemaining('w')) : 0,
      black_time: G.clock ? Math.round(clockRemaining('b')) : 0,
      last_move_at: new Date().toISOString()
    }).eq('id', G.room.id).then(({ error }) => {
      if (error) console.warn('sync', error);
    });
  }

  function replayMoves(startFen, moves) {
    const st = A.parseFen(startFen);
    const sans = [], fens = [A.toFen(st)], keys = [A.posKey(st)];
    for (const mv of moves) {
      const legal = A.legalMoves(st);
      const m = legal.find(x => x.from === mv.from && x.to === mv.to && (mv.promo ? x.promo === mv.promo : !x.promo))
             || legal.find(x => x.from === mv.from && x.to === mv.to);
      if (!m) break;
      sans.push(A.moveToSan(st, m, legal));
      A.makeMove(st, m);
      fens.push(A.toFen(st));
      keys.push(A.posKey(st));
    }
    return { st, sans, fens, keys };
  }

  /* ================= CHAT ================= */
  function sendChat(text) {
    if (!text || !text.trim()) return;
    if (!ONLINE || !G.room) { addChatMsg({ name: User.name, text }); return; }
    sb.from('chat').insert({ room_id: G.room.id, user_id: User.id, name: User.name, text: text.trim() })
      .then(({ error }) => { if (error) console.warn(error); });
  }

  function addChatMsg(m) {
    const log = $('#chatLog');
    const div = document.createElement('div');
    div.className = 'msg';
    div.innerHTML = `<b>${escapeHtml(m.name || 'Player')}</b><p>${escapeHtml(m.text)}</p>`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ================= LOBBY ================= */
  async function loadLobby() {
    const el = $('#lobbyList');
    if (!ONLINE) { el.innerHTML = '<p class="muted">Online spectating requires Supabase keys.</p>'; return; }
    const { data, error } = await sb.from('rooms')
      .select('*').in('status', ['waiting', 'playing'])
      .order('created_at', { ascending: false }).limit(30);
    if (error) { el.innerHTML = '<p class="muted">Could not load games.</p>'; return; }
    if (!data.length) { el.innerHTML = '<p class="muted">No live games right now. Start one!</p>'; return; }

    el.innerHTML = data.map(r => `
      <div class="lobby-row">
        <span class="live-dot"></span>
        <div class="lr-players">
          <div>${escapeHtml(r.white_name || 'White')} vs ${escapeHtml(r.black_name || '—')}</div>
          <div class="lr-sub">${r.status === 'waiting' ? 'Waiting for opponent' : 'Live'} · ${escapeHtml(r.tc_label || 'Casual')}</div>
        </div>
        <button class="btn sm ghost" data-join="${r.id}">${r.status === 'waiting' ? 'Join' : 'Watch'}</button>
      </div>`).join('');

    el.querySelectorAll('[data-join]').forEach(b => {
      b.onclick = () => joinRoom(b.dataset.join);
    });
  }

  /* ================= RANK ================= */
  async function loadRank() {
    const el = $('#rankList');
    if (!ONLINE) { el.innerHTML = '<p class="muted">Ratings require Supabase.</p>'; return; }
    const { data, error } = await sb.from('profiles').select('*')
      .order('rating', { ascending: false }).limit(50);
    if (error) { el.innerHTML = '<p class="muted">Could not load leaderboard.</p>'; return; }
    el.innerHTML = data.map((p, i) => `
      <div class="rank-row">
        <span class="pos">${i + 1}</span>
        <span class="rname">${escapeHtml(p.username)}</span>
        <span class="muted">${p.games_played} games</span>
        <span class="rrating">${p.rating}</span>
      </div>`).join('') || '<p class="muted">No players yet.</p>';
  }

  /* ================= PROFILE ================= */
  function renderProfile() {
    $('#profName').textContent = User.name;
    $('#profRating').textContent = 'Rating ' + User.rating;
    $('#profAvatar').textContent = User.avatar || '♞';
    $('#statGames').textContent = User.games;
    $('#statWins').textContent = User.wins;
    $('#statDraws').textContent = User.draws;
    $('#statLosses').textContent = User.losses;
    $('#statWinRate').textContent = User.games ? Math.round((User.wins / User.games) * 100) + '%' : '0%';
    renderUserChip();
  }

  async function loadHistory() {
    const el = $('#profHistory');
    if (!ONLINE || !User.id) { el.innerHTML = '<p class="muted">Sign in to see history.</p>'; return; }
    const { data, error } = await sb.from('games').select('*')
      .or(`white_id.eq.${User.id},black_id.eq.${User.id}`)
      .order('created_at', { ascending: false }).limit(15);
    if (error || !data || !data.length) { el.innerHTML = '<p class="muted">No games yet.</p>'; return; }
    el.innerHTML = data.map(g => {
      const isWhite = g.white_id === User.id;
      const myRes = g.result === '1/2-1/2' ? 'draw'
        : ((g.result === '1-0' && isWhite) || (g.result === '0-1' && !isWhite)) ? 'win' : 'loss';
      return `<div class="hrow">
        <span>vs ${escapeHtml(isWhite ? g.black_name : g.white_name)}</span>
        <span class="muted">${escapeHtml(g.time_control || 'Casual')}</span>
        <span class="res ${myRes}">${myRes.toUpperCase()}</span>
      </div>`;
    }).join('');
  }

  /* ================= ANALYSIS ================= */
  let AN = { fens: [], evals: [], ply: 0, sans: [] };

  function openAnalysis() {
    if (!G.moves.length) { toast('Play a game first'); return; }
    AN = { fens: G.fens.slice(), sans: G.sans.slice(), evals: [], ply: G.fens.length - 1 };
    switchView('analyze');
    $('#anMoves').innerHTML = G.sans.map((s, i) =>
      `<li data-ply="${i + 1}"><span class="num">${Math.floor(i / 2) + 1}${i % 2 === 0 ? '.' : '…'}</span><span class="mv">${s}</span></li>`
    ).join('');
    $('#anMoves').querySelectorAll('li').forEach(li => {
      li.onclick = () => { AN.ply = +li.dataset.ply; renderAnalysis(); };
    });
    computeEvals();
    renderAnalysis();
  }

  function computeEvals() {
    AN.evals = [];
    let i = 0;
    const step = () => {
      const chunk = 4;
      for (let k = 0; k < chunk && i < AN.fens.length; k++, i++) {
        try { AN.evals.push(A.quickEval(AN.fens[i], 1)); }
        catch (e) { AN.evals.push(0); }
      }
      drawGraph();
      if (i < AN.fens.length) setTimeout(step, 0);
      else { drawGraph(); renderAnalysis(); }
    };
    step();
  }

  function drawGraph() {
    const cv = $('#evalGraph');
    const w = cv.clientWidth || 300, h = 90;
    cv.width = w * 2; cv.height = h * 2;
    cv.style.height = h + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#12141b';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#262b3d';
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

    if (!AN.evals.length) return;
    const n = AN.evals.length;
    const x = i => (i / Math.max(1, n - 1)) * w;
    const y = cp => h / 2 - Math.max(-1, Math.min(1, cp / 800)) * (h / 2 - 4);

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < n; i++) ctx.lineTo(x(i), y(AN.evals[i] || 0));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(232,228,214,.18)';
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const px = x(i), py = y(AN.evals[i] || 0);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const px = x(AN.ply);
    ctx.strokeStyle = '#f5d76e';
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
  }

  function renderAnalysis() {
    const fen = AN.fens[AN.ply] || A.START_FEN;
    const st = A.parseFen(fen);
    renderBoardInto($('#anBoard'), st, { flip: false, coords: S.coords });
    const cp = AN.evals[AN.ply] || 0;
    $('#anEval').textContent = (cp >= 0 ? '+' : '') + (cp / 100).toFixed(2);
    $('#anMoves').querySelectorAll('li').forEach(li =>
      li.classList.toggle('active', +li.dataset.ply === AN.ply));

    if (AN.evals.length) drawGraph();

    // best move
    setTimeout(() => {
      try {
        const best = A.bestMoveForAnalysis(fen, 2);
        if (best) {
          $('#anBest').textContent = 'Best: ' + A.sqToName(best.from) + '→' + A.sqToName(best.to);
          const st2 = A.parseFen(fen);
          renderBoardInto($('#anBoard'), st2, {
            flip: false, coords: S.coords,
            hintFrom: best.from, hintTo: best.to
          });
        } else {
          $('#anBest').textContent = 'Best: —';
        }
      } catch (e) {}
    }, 20);
  }

  /* ================= PUZZLES ================= */
  const PUZZLES = [
    { fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', from: 56, to: 0, title: 'Back-rank mate' },
    { fen: '7k/6pp/8/8/8/8/6PP/5R1K w - - 0 1', from: 61, to: 5, title: 'Rook lift' },
    { fen: '6k1/5ppp/8/8/8/8/5PPP/4Q1K1 w - - 0 1', from: 60, to: 4, title: 'Queen invasion' },
    { fen: '6k1/R7/8/8/8/8/8/1R4K1 w - - 0 1', from: 57, to: 1, title: 'Rook ladder' },
    { fen: '5rk1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', from: 60, to: 4, title: 'Back rank' },
    { fen: '6k1/8/8/8/8/8/8/R5K1 w - - 0 1', from: 56, to: 0, title: 'Rook mate' },
    { fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', from: 59, to: 3, title: 'Rook to the 8th' },
    { fen: '5rk1/5ppp/8/8/8/8/5PPP/2QR2K1 w - - 0 1', from: 59, to: 3, title: 'Queen & rook' }
  ];
  let PZ = { idx: 0, st: null, streak: 0, solved: false, hint: null };

  function loadPuzzle() {
    const p = PUZZLES[PZ.idx % PUZZLES.length];
    PZ.st = A.parseFen(p.fen);
    PZ.solved = false;
    PZ.hint = null;
    $('#puzStatus').textContent = 'White to move — ' + p.title;
    renderPuzzle();
  }

  function renderPuzzle() {
    renderBoardInto($('#puzBoard'), PZ.st, {
      flip: false, coords: S.coords,
      selected: PZ.selected, legal: PZ.legal || [],
      hintFrom: PZ.hint ? PZ.hint.from : undefined,
      hintTo: PZ.hint ? PZ.hint.to : undefined
    });
  }

  function onPuzzleSquare(i) {
    if (PZ.solved) return;
    const p = PZ.st.board[i];
    if (PZ.selected >= 0) {
      const mv = (PZ.legal || []).find(m => m.to === i);
      if (mv) {
        const pz = PUZZLES[PZ.idx % PUZZLES.length];
        if (mv.from === pz.from && mv.to === pz.to) {
          A.makeMove(PZ.st, mv);
          PZ.solved = true;
          PZ.streak++;
          $('#puzStreak').textContent = PZ.streak;
          $('#puzStatus').textContent = '✓ Correct! ' + pz.title;
          playSound('end', false);
          renderPuzzle();
          setTimeout(() => { PZ.idx++; loadPuzzle(); }, 1400);
          return;
        } else {
          $('#puzStatus').textContent = '✗ Not the mate. Try again.';
          PZ.selected = -1; PZ.legal = [];
          renderPuzzle();
          return;
        }
      }
    }
    if (p && (p === p.toUpperCase() ? 'w' : 'b') === PZ.st.turn) {
      PZ.selected = i;
      PZ.legal = A.legalMoves(PZ.st).filter(m => m.from === i);
    } else {
      PZ.selected = -1; PZ.legal = [];
    }
    renderPuzzle();
  }

  $('#puzBoard').addEventListener('click', e => {
    const sq = e.target.closest('.sq');
    if (sq) onPuzzleSquare(+sq.dataset.i);
  });

  $('#btnPuzNext').onclick = () => { PZ.idx++; loadPuzzle(); };
  $('#btnPuzHint').onclick = () => {
    const pz = PUZZLES[PZ.idx % PUZZLES.length];
    PZ.hint = { from: pz.from, to: pz.to };
    renderPuzzle();
    setTimeout(() => { PZ.hint = null; renderPuzzle(); }, 1600);
  };

  /* ================= SETTINGS ================= */
  function applyTheme() {
    document.body.dataset.theme = S.theme;
  }

  function loadSettingsUI() {
    $('#setTheme').value = S.theme;
    $('#setCoords').checked = S.coords;
    $('#setLegal').checked = S.legal;
    $('#setSound').checked = S.sound;
    $('#setAutoflip').checked = S.autoflip;
    $('#setEval').checked = S.showEval;
  }

  $('#btnSaveSettings').onclick = () => {
    S.theme = $('#setTheme').value;
    S.coords = $('#setCoords').checked;
    S.legal = $('#setLegal').checked;
    S.sound = $('#setSound').checked;
    S.autoflip = $('#setAutoflip').checked;
    S.showEval = $('#setEval').checked;
    saveS();
    applyTheme();
    if (G.active) renderAll();
    toast('Settings saved');
  };

  $('#btnEditProfile').onclick = async () => {
    if (!ONLINE) { toast('Profile editing requires Supabase'); return; }
    const name = prompt('New username', User.name);
    if (!name) return;
    const av = prompt('Avatar symbol (e.g. ♞ ♜ ♝)', User.avatar) || '♞';
    const { error } = await sb.from('profiles').update({ username: name, avatar: av }).eq('id', User.id);
    if (error) { toast('Username may be taken'); return; }
    User.name = name; User.avatar = av;
    renderUserChip(); renderProfile();
    toast('Profile updated');
  };

  /* ================= BUTTON WIRING ================= */
  function wireButtons() {
    $('#btnAI').onclick = () => {
      const tc = readTC();
      startGame({
        mode: 'ai', level: $('#selLevel').value, myColor: 'w', tc,
        players: { w: { name: User.name, rating: User.rating }, b: { name: 'Aurelius AI', rating: '' } }
      });
    };
    $('#btnLocal').onclick = () => {
      const tc = readTC();
      startGame({
        mode: 'local', tc,
        players: { w: { name: 'White', rating: '' }, b: { name: 'Black', rating: '' } }
      });
    };
    $('#btnCreate').onclick = createRoom;
    $('#btnQuick').onclick = quickMatch;
    $('#btnWatch').onclick = () => switchView('lobby');
    $('#btnPuzzlesHome').onclick = () => { switchView('puzzles'); loadPuzzle(); };
    $('#btnJoin').onclick = () => joinRoom($('#inpCode').value);
    $('#btnRefreshLobby').onclick = loadLobby;

    $('#btnHint').onclick = () => {
      if (!G.active || G.over) return;
      const best = A.findBestMove(A.toFen(G.st), 'medium');
      if (best) {
        G.hint = { from: best.from, to: best.to };
        renderAll();
        setTimeout(() => { G.hint = null; renderAll(); }, 1800);
      }
    };
    $('#btnUndo').onclick = undo;
    $('#btnFlip').onclick = () => { G.flip = !G.flip; renderAll(); };
    $('#btnDraw').onclick = drawOffer;
    $('#btnResign').onclick = resign;
    $('#btnAnalyze').onclick = openAnalysis;
    $('#btnRematch').onclick = rematch;
    $('#btnExit').onclick = exitGame;

    $('#chatForm').onsubmit = e => {
      e.preventDefault();
      const v = $('#chatInput').value;
      $('#chatInput').value = '';
      sendChat(v);
    };

    $$('.tab').forEach(t => {
      t.onclick = () => {
        $$('.tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const isMoves = t.dataset.tab === 'moves';
        $('#paneMoves').classList.toggle('hidden', !isMoves);
        $('#paneChat').classList.toggle('hidden', isMoves);
      };
    });

    $('#anStart').onclick = () => { AN.ply = 0; renderAnalysis(); };
    $('#anPrev').onclick = () => { AN.ply = Math.max(0, AN.ply - 1); renderAnalysis(); };
    $('#anNext').onclick = () => { AN.ply = Math.min(AN.fens.length - 1, AN.ply + 1); renderAnalysis(); };
    $('#anEnd').onclick = () => { AN.ply = AN.fens.length - 1; renderAnalysis(); };
    $('#anCopy').onclick = () => {
      const pgn = A.movesToPgn(G.startFen, G.moves, { Event: 'Aurelius', Result: G.result || '*' });
      navigator.clipboard.writeText(pgn).then(() => toast('PGN copied')).catch(() => toast('Copy failed'));
    };

    window.addEventListener('resize', () => { if ($('#view-analyze').classList.contains('active')) drawGraph(); });
  }

  /* ================= INIT ================= */
  async function init() {
    applyTheme();
    loadSettingsUI();
    wireButtons();
    await bootSupabase();
    loadPuzzle();
    if (G.active) renderAll();
  }

  init();
})();
