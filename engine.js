/* AURELIUS ENGINE v3.3 — deeper bot personalities */
(function (global) {
  'use strict';

  const KN = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
  const KG = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const DIAG = [[1,1],[1,-1],[-1,1],[-1,-1]];
  const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];
  const ALL = DIAG.concat(ORTH);
  const FILES = 'abcdefgh';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const isUpper = c => c >= 'A' && c <= 'Z';
  const colorOf = p => (p && isUpper(p)) ? 'w' : 'b';
  const typeOf = p => p ? p.toLowerCase() : '';
  const inBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

  function sqToName(i) { return FILES[i % 8] + (8 - Math.floor(i / 8)); }
  function nameToSq(s) { return (8 - +s[1]) * 8 + FILES.indexOf(s[0]); }

  function parseFen(fen) {
    const parts = (fen || START_FEN).trim().split(/\s+/);
    const board = new Array(64).fill('');
    let i = 0;
    for (const ch of parts[0]) {
      if (ch === '/') continue;
      if (ch >= '1' && ch <= '8') i += +ch;
      else board[i++] = ch;
    }
    return { board, turn: parts[1] || 'w',
      castling: (parts[2] && parts[2] !== '-') ? parts[2] : '',
      ep: (parts[3] && parts[3] !== '-') ? nameToSq(parts[3]) : -1,
      halfmove: +(parts[4] || 0), fullmove: +(parts[5] || 1) };
  }

  function toFen(st) {
    let out = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = st.board[r * 8 + f];
        if (!p) empty++;
        else { if (empty) { out += empty; empty = 0; } out += p; }
      }
      if (empty) out += empty;
      if (r < 7) out += '/';
    }
    return `${out} ${st.turn} ${st.castling || '-'} ${st.ep >= 0 ? sqToName(st.ep) : '-'} ${st.halfmove} ${st.fullmove}`;
  }

  const posKey = st => st.board.join('') + st.turn + st.castling + st.ep;

  function isAttacked(st, idx, by) {
    const b = st.board;
    const f = idx % 8, r = (idx - f) / 8;
    const pr = by === 'w' ? r + 1 : r - 1;
    if (pr >= 0 && pr < 8) {
      for (const df of [-1, 1]) {
        const nf = f + df;
        if (nf < 0 || nf > 7) continue;
        const p = b[pr * 8 + nf];
        if (p && typeOf(p) === 'p' && colorOf(p) === by) return true;
      }
    }
    for (const [df, dr] of KN) {
      const nf = f + df, nr = r + dr;
      if (!inBoard(nf, nr)) continue;
      const p = b[nr * 8 + nf];
      if (p && typeOf(p) === 'n' && colorOf(p) === by) return true;
    }
    for (const [df, dr] of KG) {
      const nf = f + df, nr = r + dr;
      if (!inBoard(nf, nr)) continue;
      const p = b[nr * 8 + nf];
      if (p && typeOf(p) === 'k' && colorOf(p) === by) return true;
    }
    for (const [df, dr] of ALL) {
      let nf = f + df, nr = r + dr;
      while (inBoard(nf, nr)) {
        const p = b[nr * 8 + nf];
        if (p) {
          if (colorOf(p) === by) {
            const t = typeOf(p);
            if (t === 'q' || (t === 'r' && (df === 0 || dr === 0)) || (t === 'b' && df !== 0 && dr !== 0)) return true;
          }
          break;
        }
        nf += df; nr += dr;
      }
    }
    return false;
  }

  function kingSq(st, color) {
    for (let i = 0; i < 64; i++) {
      const p = st.board[i];
      if (p && typeOf(p) === 'k' && colorOf(p) === color) return i;
    }
    return -1;
  }

  function inCheck(st, color) {
    const k = kingSq(st, color);
    return k >= 0 && isAttacked(st, k, color === 'w' ? 'b' : 'w');
  }

  function genPseudo(st, color) {
    const b = st.board, moves = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || colorOf(p) !== color) continue;
      const f = i % 8, r = (i - f) / 8, t = typeOf(p);

      if (t === 'p') {
        const dr = color === 'w' ? -1 : 1;
        const startR = color === 'w' ? 6 : 1;
        const promoR = color === 'w' ? 0 : 7;
        const oneR = r + dr;
        if (oneR >= 0 && oneR < 8) {
          const one = oneR * 8 + f;
          if (!b[one]) {
            if (oneR === promoR) for (const pr of 'qrbn') moves.push({ from: i, to: one, promo: pr });
            else {
              moves.push({ from: i, to: one });
              if (r === startR) {
                const twoR = r + 2 * dr;
                if (twoR >= 0 && twoR < 8) {
                  const two = twoR * 8 + f;
                  if (!b[two]) moves.push({ from: i, to: two });
                }
              }
            }
          }
          for (const df of [-1, 1]) {
            const nf = f + df;
            if (nf < 0 || nf > 7) continue;
            const to = oneR * 8 + nf;
            if (b[to] && colorOf(b[to]) !== color) {
              if (oneR === promoR) for (const pr of 'qrbn') moves.push({ from: i, to, promo: pr });
              else moves.push({ from: i, to });
            } else if (!b[to] && to === st.ep) {
              moves.push({ from: i, to, ep: true });
            }
          }
        }
      } else if (t === 'n') {
        for (const [df, dr] of KN) {
          const nf = f + df, nr = r + dr;
          if (!inBoard(nf, nr)) continue;
          const to = nr * 8 + nf;
          if (!b[to] || colorOf(b[to]) !== color) moves.push({ from: i, to });
        }
      } else if (t === 'k') {
        for (const [df, dr] of KG) {
          const nf = f + df, nr = r + dr;
          if (!inBoard(nf, nr)) continue;
          const to = nr * 8 + nf;
          if (!b[to] || colorOf(b[to]) !== color) moves.push({ from: i, to });
        }
        const homeR = color === 'w' ? 7 : 0;
        if (r === homeR && f === 4) {
          const enemy = color === 'w' ? 'b' : 'w';
          const kR = color === 'w' ? 'K' : 'k';
          const qR = color === 'w' ? 'Q' : 'q';
          if (st.castling.includes(kR) && !b[homeR * 8 + 5] && !b[homeR * 8 + 6] &&
              !isAttacked(st, homeR * 8 + 4, enemy) && !isAttacked(st, homeR * 8 + 5, enemy) && !isAttacked(st, homeR * 8 + 6, enemy))
            moves.push({ from: i, to: homeR * 8 + 6, castle: 'K' });
          if (st.castling.includes(qR) && !b[homeR * 8 + 3] && !b[homeR * 8 + 2] && !b[homeR * 8 + 1] &&
              !isAttacked(st, homeR * 8 + 4, enemy) && !isAttacked(st, homeR * 8 + 3, enemy) && !isAttacked(st, homeR * 8 + 2, enemy))
            moves.push({ from: i, to: homeR * 8 + 2, castle: 'Q' });
        }
      } else {
        const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : ALL;
        for (const [df, dr] of dirs) {
          let nf = f + df, nr = r + dr;
          while (inBoard(nf, nr)) {
            const to = nr * 8 + nf;
            if (!b[to]) moves.push({ from: i, to });
            else { if (colorOf(b[to]) !== color) moves.push({ from: i, to }); break; }
            nf += df; nr += dr;
          }
        }
      }
    }
    return moves;
  }

  function makeMove(st, m) {
    const b = st.board;
    const undo = { board: b.slice(), turn: st.turn, castling: st.castling, ep: st.ep, halfmove: st.halfmove, fullmove: st.fullmove, captured: null };
    const p = b[m.from];
    const color = colorOf(p), t = typeOf(p);
    let captured = b[m.to];

    if (t === 'p' && m.to === st.ep && !b[m.to]) {
      const capIdx = m.to + (color === 'w' ? 8 : -8);
      captured = b[capIdx];
      b[capIdx] = '';
    }
    b[m.to] = m.promo ? (color === 'w' ? m.promo.toUpperCase() : m.promo) : p;
    b[m.from] = '';

    if (t === 'k' && Math.abs((m.to % 8) - (m.from % 8)) === 2) {
      if (m.to > m.from) { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = ''; }
      else { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = ''; }
    }

    let c = st.castling;
    if (t === 'k') c = c.replace(color === 'w' ? /[KQ]/g : /[kq]/g, '');
    if (t === 'r') {
      if (m.from === 56) c = c.replace('Q', '');
      if (m.from === 63) c = c.replace('K', '');
      if (m.from === 0) c = c.replace('q', '');
      if (m.from === 7) c = c.replace('k', '');
    }
    if (m.to === 56) c = c.replace('Q', '');
    if (m.to === 63) c = c.replace('K', '');
    if (m.to === 0) c = c.replace('q', '');
    if (m.to === 7) c = c.replace('k', '');
    st.castling = c;

    st.ep = -1;
    if (t === 'p' && Math.abs(m.to - m.from) === 16) st.ep = (m.from + m.to) / 2;
    st.halfmove = (t === 'p' || captured) ? 0 : st.halfmove + 1;
    if (color === 'b') st.fullmove++;
    st.turn = color === 'w' ? 'b' : 'w';
    undo.captured = captured;
    return undo;
  }

  function unmakeMove(st, undo) {
    st.board = undo.board; st.turn = undo.turn; st.castling = undo.castling;
    st.ep = undo.ep; st.halfmove = undo.halfmove; st.fullmove = undo.fullmove;
  }

  function legalMoves(st) {
    const color = st.turn;
    const out = [];
    for (const m of genPseudo(st, color)) {
      const u = makeMove(st, m);
      if (!inCheck(st, color)) out.push(m);
      unmakeMove(st, u);
    }
    return out;
  }

  function insufficientMaterial(board) {
    const pieces = board.filter(Boolean);
    if (pieces.length > 4) return false;
    const w = pieces.filter(p => colorOf(p) === 'w').map(typeOf);
    const b = pieces.filter(p => colorOf(p) === 'b').map(typeOf);
    if (w.length === 1 && b.length === 1) return true;
    if (w.length === 2 && b.length === 1 && (w.includes('n') || w.includes('b'))) return true;
    if (b.length === 2 && w.length === 1 && (b.includes('n') || b.includes('b'))) return true;
    return false;
  }

  function status(st, repCount) {
    const moves = legalMoves(st);
    if (moves.length === 0) {
      if (inCheck(st, st.turn)) return { over: true, result: st.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
      return { over: true, result: '1/2-1/2', reason: 'stalemate' };
    }
    if (st.halfmove >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty-move rule' };
    if (insufficientMaterial(st.board)) return { over: true, result: '1/2-1/2', reason: 'insufficient material' };
    if (repCount && repCount >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold repetition' };
    return { over: false, moves };
  }

  function moveToSan(st, m, legal) {
    const p = st.board[m.from], t = typeOf(p);
    let san;
    if (m.castle === 'K') san = 'O-O';
    else if (m.castle === 'Q') san = 'O-O-O';
    else {
      const isCap = !!st.board[m.to] || m.ep;
      if (t === 'p') {
        san = (isCap ? FILES[m.from % 8] + 'x' : '') + sqToName(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
      } else {
        san = t.toUpperCase();
        const others = (legal || []).filter(x =>
          x.to === m.to && x.from !== m.from &&
          typeOf(st.board[x.from]) === t && colorOf(st.board[x.from]) === colorOf(p));
        if (others.length) {
          const sameFile = others.some(x => x.from % 8 === m.from % 8);
          const sameRank = others.some(x => Math.floor(x.from / 8) === Math.floor(m.from / 8));
          if (!sameFile) san += FILES[m.from % 8];
          else if (!sameRank) san += (8 - Math.floor(m.from / 8));
          else san += FILES[m.from % 8] + (8 - Math.floor(m.from / 8));
        }
        if (isCap) san += 'x';
        san += sqToName(m.to);
      }
    }
    const u = makeMove(st, m);
    const opp = st.turn;
    let suffix = '';
    if (inCheck(st, opp)) suffix = legalMoves(st).length === 0 ? '#' : '+';
    unmakeMove(st, u);
    return san + suffix;
  }

  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
  };

  function evaluate(st) {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = st.board[i];
      if (!p) continue;
      const t = typeOf(p), c = colorOf(p);
      const idx = c === 'w' ? i : 63 - i;
      const v = VAL[t] + (PST[t] ? PST[t][idx] : 0);
      score += c === 'w' ? v : -v;
    }
    return st.turn === 'w' ? score : -score;
  }

  function orderMoves(st, moves) {
    return moves.map(m => {
      const cap = st.board[m.to] ? VAL[typeOf(st.board[m.to])] : 0;
      const promo = m.promo ? VAL[m.promo] : 0;
      return { m, s: cap + promo + Math.random() };
    }).sort((a, b) => b.s - a.s).map(x => x.m);
  }

  function search(st, depth, alpha, beta, deadline) {
    if (depth <= 0 || Date.now() > deadline) return evaluate(st);
    const moves = legalMoves(st);
    if (!moves.length) return inCheck(st, st.turn) ? -100000 : 0;
    let best = -Infinity;
    for (const m of orderMoves(st, moves)) {
      const u = makeMove(st, m);
      const score = -search(st, depth - 1, -beta, -alpha, deadline);
      unmakeMove(st, u);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
      if (Date.now() > deadline) break;
    }
    return best;
  }

  function findBestMove(fen, level) {
    const st = parseFen(fen);
    const moves = legalMoves(st);
    if (!moves.length) return null;
    if (level === 'easy') {
      const scored = moves.map(m => {
        const u = makeMove(st, m);
        const s = -evaluate(st) + Math.random() * 50;
        unmakeMove(st, u);
        return { m, s };
      }).sort((a, b) => b.s - a.s);
      const top = scored.slice(0, Math.min(3, scored.length));
      return top[Math.floor(Math.random() * top.length)].m;
    }
    const depth = level === 'hard' ? 4 : 2;
    const deadline = Date.now() + (level === 'hard' ? 1800 : 700);
    let best = null, bestScore = -Infinity;
    for (const m of orderMoves(st, moves)) {
      const u = makeMove(st, m);
      const s = -search(st, depth - 1, -Infinity, Infinity, deadline);
      unmakeMove(st, u);
      if (s > bestScore) { bestScore = s; best = m; }
      if (Date.now() > deadline) break;
    }
    return best;
  }

  function quickEval(fen, depth) {
    const st = parseFen(fen);
    const deadline = Date.now() + 400;
    const s = search(st, depth || 1, -Infinity, Infinity, deadline);
    return st.turn === 'w' ? s : -s;
  }

  function bestMoveForAnalysis(fen, depth) {
    const st = parseFen(fen);
    const moves = legalMoves(st);
    if (!moves.length) return null;
    const deadline = Date.now() + 500;
    let best = null, bestScore = -Infinity;
    for (const m of orderMoves(st, moves)) {
      const u = makeMove(st, m);
      const s = -search(st, (depth || 2) - 1, -Infinity, Infinity, deadline);
      unmakeMove(st, u);
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  function movesToPgn(startFen, moves, meta) {
    const st = parseFen(startFen);
    let pgn = '';
    if (meta) { for (const k in meta) pgn += `[${k} "${meta[k]}"]\n`; pgn += '\n'; }
    let line = '', num = st.fullmove, whiteToMove = st.turn === 'w';
    if (!whiteToMove) line = `${num}...`;
    for (const mv of moves) {
      const legal = legalMoves(st);
      const m = legal.find(x => x.from === mv.from && x.to === mv.to && (mv.promo ? x.promo === mv.promo : !x.promo))
             || legal.find(x => x.from === mv.from && x.to === mv.to);
      if (!m) break;
      const san = moveToSan(st, m, legal);
      makeMove(st, m);
      if (whiteToMove) { line += (line ? ' ' : '') + `${num}. ${san}`; num++; whiteToMove = false; }
      else { line += (line ? ' ' : '') + san; whiteToMove = true; pgn += line + '\n'; line = ''; }
    }
    if (line) pgn += line + '\n';
    return pgn;
  }

  function materialFor(st, color) {
    let sum = 0;
    for (const p of st.board) {
      if (!p || colorOf(p) !== color) continue;
      sum += VAL[typeOf(p)] || 0;
    }
    return sum;
  }

  /* ============ BOTS v3.3 — expanded personalities ============ */
  const BOTS = [
    {
      id:'martin', name:'Martin', elo:250, displayElo:250, emoji:'🐭',
      desc:'Beginner. Blunders often. Loves the game.',
      depth:1, random:220,
      comments:{
        start:["Hi! I'm Martin!", "Let's have fun!", "I'm still learning!", "Be gentle with me!", "Okay, let's play!"],
        check:["Oh no, check!", "Wait, am I in check?", "Oops, check.", "That's check? Oh no."],
        myCheck:["Check! I think?", "Did I do that right?", "Check! Wow!", "Is this check?"],
        capture:["Yay, I got a piece!", "Did I do that right?", "Ooh, a piece!", "Was that a blunder?"],
        playerCapture:["Oof, that hurt!", "Oh no, my piece!", "Aww man.", "You got me!"],
        win:["I won?! Really?!", "Wow, I won!", "Did I actually win?!", "Yay! I won!"],
        lose:["Good game!", "You're too good!", "Teach me your ways!", "GG! Nice one."],
        draw:["We drew! Fun!", "A draw! Good game!", "Nice, nobody lost!", "Even! Great game."],
        mate:["I mated you?!", "Wow!", "Checkmate! I did it!", "Did I just win?!"],
        thinking:["Hmm... what do I do?", "Let me think...", "Uh...", "Which piece again?", "So many choices..."],
        blunder:["Oops!", "Oh no, that was bad.", "Was that a mistake?", "I'm still learning!", "Uh oh."],
        great:["Yay!", "I did that?!", "Wow, good move me!", "Hey, that's nice!"],
        taunt:["This is fun!", "Am I doing good?", "Chess is hard!", "How am I doing?", "I like this game."]
      }
    },
    {
      id:'nelson', name:'Nelson', elo:1300, displayElo:1300, emoji:'🎩',
      desc:'Loves the early queen attack.',
      depth:2, random:70, aggression:1.6,
      comments:{
        start:["My queen is coming!", "Watch out!", "Prepare yourself!", "Time for the queen!", "Here she comes!"],
        check:["The queen strikes!", "Check!", "Queen attacks!", "She's here!"],
        myCheck:["Queen's got you!", "Check!", "My queen strikes!", "Bow to the queen!"],
        capture:["Gotcha!", "Queen takes!", "Mine now!", "The queen delivers.", "Ha!"],
        playerCapture:["Hey! Not my queen!", "You took a pawn, big deal.", "Hmph.", "Watch out for my queen!", "Rude!"],
        win:["The queen prevails!", "Victory!", "Queen always wins!", "Told you!", "The queen reigns!"],
        lose:["You got my queen?!", "Noooo!", "How?!", "The queen has fallen...", "Impossible!"],
        draw:["A draw. Fine.", "We're even.", "Next time, my queen wins.", "Fair enough.", "Hmph."],
        mate:["Queen's mate!", "Checkmate!", "The queen delivers!", "Game over!"],
        thinking:["Where can my queen go?", "Queen move...", "Let me find the best queen move.", "Queen time.", "Queen queen queen..."],
        blunder:["My queen?!", "No!", "How did I miss that?", "Ugh.", "That's not good."],
        great:["Queen!", "The queen!", "Beautiful queen move!", "Ha!"],
        taunt:["My queen is coming.", "Are you ready for the queen?", "The queen hungers.", "Just wait for my queen.", "Queen. Queen. Queen."]
      }
    },
    {
      id:'duke', name:'Duke', elo:1500, displayElo:1500, emoji:'⚔️',
      desc:'Aggressive attacker. Never defends.',
      depth:2, random:55, aggression:1.3,
      comments:{
        start:["Let's attack!", "To battle!", "Attack, attack, attack!", "No time for defense!", "Charge!"],
        check:["Your king is mine!", "Attack!", "Charge!", "Forward!"],
        myCheck:["Strike!", "Forward!", "Attack!", "The king falls!"],
        capture:["Victory!", "Another piece falls!", "Attack succeeds!", "Yes!", "Boom!"],
        playerCapture:["A setback.", "I'll recover.", "You dare?", "Focus!", "Hmph."],
        win:["Victorious!", "Attack succeeds!", "Forward to victory!", "Yes!", "Victory is mine!"],
        lose:["Well fought.", "You defended well.", "Next time I attack harder.", "The battle is lost.", "Hmph."],
        draw:["A stalemate.", "Neither wins.", "A truce.", "The battle rages on.", "Fine."],
        mate:["Checkmate!", "Victory is mine!", "Attack pays off!", "The king falls!"],
        thinking:["Attack where?", "Find the weakness.", "Prepare the strike.", "Charge!", "Where's the kill?"],
        blunder:["I miscalculated.", "The attack failed.", "Too reckless.", "Hmph.", "Ugh."],
        great:["Victory!", "Attack!", "The king falls!", "Boom!"],
        taunt:["Defense is boring.", "Attack wins games!", "Where's your defense?", "I never stop attacking.", "Feel the pressure!"]
      }
    },
    {
      id:'isabel', name:'Isabel', elo:1600, displayElo:1600, emoji:'👑',
      desc:'Solid positional player.',
      depth:2, random:35,
      comments:{
        start:["Let's play well.", "Position first.", "Calmly.", "Steady play.", "Good luck."],
        check:["Check. Steady.", "Your king is exposed.", "Check.", "Carefully."],
        myCheck:["Check.", "A small advantage.", "Pressure.", "Progress."],
        capture:["A small gain.", "Material first.", "Correct.", "Progress.", "Good."],
        playerCapture:["Hmm.", "I'll adjust.", "Noted.", "Acceptable trade.", "Fine."],
        win:["Position prevailed.", "Good game.", "As expected.", "Steady wins.", "Well played."],
        lose:["Well played.", "You earned it.", "You were better.", "Respect.", "Good game."],
        draw:["A fair draw.", "Balanced game.", "Equilibrium.", "Well matched.", "Fair."],
        mate:["Checkmate.", "The position delivered.", "Precisely.", "As planned."],
        thinking:["What's the best move?", "Positional considerations...", "Calmly.", "Slow and steady.", "Consider."],
        blunder:["An oversight.", "That was inaccurate.", "Interesting.", "I'll recover.", "Hmm."],
        great:["Correct.", "Good position.", "Progress.", "Precisely."],
        taunt:["Slowly does it.", "The position is fine.", "Just a small advantage.", "Position matters.", "Patience."]
      }
    },
    {
      id:'wally', name:'Wally', elo:1800, displayElo:1800, emoji:'🤡',
      desc:'Tricky and unpredictable.',
      depth:2, random:25,
      comments:{
        start:["Hehehe...", "Let's have some fun!", "Surprise incoming!", "Ready for a trick?", "Watch this!"],
        check:["Surprise check!", "Gotcha!", "Didn't see that?", "Hehe!"],
        myCheck:["Prank!", "Unexpected?", "Check!", "Trick!"],
        capture:["Hehe!", "Didn't see that coming?", "Gotcha!", "Trick!", "Surprise!"],
        playerCapture:["Oh, you got me!", "Nice trick!", "Well done!", "Hmph. Not bad.", "Interesting!"],
        win:["Ha! Victory!", "Gotcha!", "Tricked ya!", "Wally wins!", "Hehehe!"],
        lose:["Aww, you beat me!", "Great trick!", "Well played!", "You got me!", "Nice one!"],
        draw:["A draw? Boring!", "Next time!", "Neither fooled?", "Hmph.", "Fine."],
        mate:["Tricked ya!", "Checkmate!", "The final prank!", "Hehe!"],
        thinking:["What's the tricky move?", "Hehe...", "Something surprising...", "What would fool them?", "Hmm..."],
        blunder:["Oops! Hehe.", "That backfired.", "Uh oh.", "My bad.", "Hehe... oops."],
        great:["Tricked ya!", "Hehe!", "Surprise!", "Gotcha!"],
        taunt:["Hehe. Something coming.", "Watch out!", "Let's see what happens.", "The trick is coming.", "Don't trust me."]
      }
    },
    {
      id:'sven', name:'Sven', elo:2000, displayElo:2000, emoji:'🧔',
      desc:'Balanced club player.',
      depth:3, random:15,
      comments:{
        start:["Let's play.", "Good luck.", "Steady game.", "Well met.", "Let's begin."],
        check:["Check.", "Mind your king.", "Careful.", "Check."],
        myCheck:["Check.", "Progress.", "Good position.", "Check."],
        capture:["A trade.", "Good.", "Material.", "Correct.", "Yes."],
        playerCapture:["Fine trade.", "Understood.", "Reasonable.", "Noted.", "Okay."],
        win:["Good game.", "Well played.", "Victory.", "Steady progress.", "GG."],
        lose:["You played better.", "Good win.", "Well done.", "Understood.", "GG."],
        draw:["Fair result.", "Balanced.", "A fair game.", "Until next time.", "GG."],
        mate:["Checkmate.", "Well played.", "As planned.", "Victory."],
        thinking:["Consider the position.", "Calculate.", "Options...", "Let me think.", "Hmm."],
        blunder:["An error.", "Inaccurate.", "I'll adjust.", "Hmm.", "Not ideal."],
        great:["Good move.", "Precise.", "Correct.", "Yes."],
        taunt:["Steady as she goes.", "Just a game.", "Position matters.", "Calculated.", "Let's continue."]
      }
    },
    {
      id:'antonia', name:'Antonia', elo:2200, displayElo:2200, emoji:'🎭',
      desc:'Patient and precise.',
      depth:3, random:10,
      comments:{
        start:["Patience.", "Positional game.", "Let's think.", "Careful.", "Slowly."],
        check:["A small squeeze.", "Check.", "Pressure.", "Steadily.", "Precisely."],
        myCheck:["Pressure.", "Progress.", "Check.", "Deliberately.", "Carefully."],
        capture:["Material.", "Correct.", "Expected.", "Calculated.", "Good."],
        playerCapture:["Interesting.", "Noted.", "Fine.", "Understood.", "Reasonable."],
        win:["Position delivered.", "Good game.", "Precision.", "As expected.", "Well played."],
        lose:["Well played. Precise.", "You deserved it.", "You were better.", "Respect.", "GG."],
        draw:["Balanced.", "A fair draw.", "Well matched.", "Precise.", "Fair."],
        mate:["Checkmate.", "Precise.", "Delivered.", "As planned."],
        thinking:["Consider options...", "Slowly...", "Precisely...", "Calculate.", "Patience..."],
        blunder:["Inaccurate.", "Not ideal.", "A miscalculation.", "Noted.", "Hmm."],
        great:["Precise.", "Correct.", "The best move.", "Yes."],
        taunt:["Patience is key.", "Position by position.", "Just a small edge.", "Slowly.", "Deliberately."]
      }
    },
    {
      id:'mittens', name:'Mittens', elo:2500, displayElo:1, emoji:'🐱',
      desc:'Rating says 1. It\'s lying.',
      depth:3, random:8, aggression:1.3,
      comments:{
        start:["Meow. Let's play, human.", "Purr... I smell fish.", "Ready to lose?", "I woke up from a nap for this?", "Human. Bow before me. Meow."],
        check:["Check. Meow.", "Purr-tect your king.", "Check, human. Purr.", "Your king is exposed. Meow."],
        myCheck:["Check, human. Meow.", "I have you now.", "Check. Purr.", "Run, little king."],
        capture:["Yum. That piece was tasty.", "Meow. Got it.", "Purr. Mine now.", "Delicious.", "Nom nom."],
        playerCapture:["Ouch, human. That stung.", "Meow. Fine.", "Hmph. Not bad.", "You got my piece? Rude.", "Hiss."],
        win:["Meow. Victory is purr-fect.", "Better luck next time, human.", "Bow to your feline overlord.", "Purr. That was easy.", "Meow. As expected."],
        lose:["Meow... you were good.", "Fine. You win, human.", "I let you win. Purr.", "Next time I won't nap.", "Purr. Respect, human."],
        draw:["A draw. How boring. Meow.", "Neither of us wins. Purr.", "Stalemate. How disappointing.", "Purr. We're even.", "Meow. Boring."],
        mate:["Checkmate. Meow.", "Purr-fect mate.", "Game over, human. Meow.", "Purr. Bow."],
        thinking:["Hmm... purr...", "Let me think, meow.", "Calculating... purr...", "What would a cat do?", "Purr... considering..."],
        blunder:["Oops. Meow.", "Purr. That was on purpose.", "Hiss. Miscalculation.", "Meow. Blame the laser pointer.", "Purr. Oops."],
        great:["Purr-fect!", "Meow. Brilliant.", "As expected of a cat.", "Purr. Now what, human?", "Meow!"],
        taunt:["Purr. You're still here?", "Meow. I'm getting bored.", "Should I start napping?", "Human, is this your best?", "Purr. I could do this blindfolded."]
      }
    },
    {
      id:'witty', name:'Witty Alien', elo:2600, displayElo:2600, emoji:'👽',
      desc:'Out of this world tactics.',
      depth:3, random:6,
      comments:{
        start:["Earthling, prepare!", "Take me to your king!", "Zorg approves.", "Earth chess. Interesting.", "Beep boop. Let's play."],
        check:["Zap!", "Earthling king in danger!", "Zorg said check.", "Green lasers!"],
        myCheck:["Zap zap!", "Check!", "Earthling, your king falls.", "Laser beam!"],
        capture:["Beam me that piece!", "Acquired!", "Zapped!", "Mine now, earthling.", "Teleported!"],
        playerCapture:["Impressive, earthling.", "That stings!", "Zorg is disappointed.", "How?", "Beep. Error."],
        win:["Zorg victorious!", "Earth conquered!", "The galaxy wins!", "Take me to your loser!", "Beep boop. Win."],
        lose:["You win, earthling.", "Until next time.", "Earth is safe... for now.", "Zorg will return.", "Beep. Defeat."],
        draw:["A truce.", "We meet again.", "The galaxy is balanced.", "Zorg is confused.", "Beep. Even."],
        mate:["Checkmate, earthling!", "Zap!", "Take me to your king!", "Earth conquered!"],
        thinking:["Zorg computes...", "Analyzing earthling moves...", "Beep boop.", "Green lasers considering...", "Earthling patterns..."],
        blunder:["Zorg miscalculated.", "Beep. Error.", "Rebooting...", "Inconceivable.", "Zorg is sad."],
        great:["Zap!", "Zorg approves.", "Earthling, witness!", "Beep boop!"],
        taunt:["Earth chess is easy.", "Zorg is bored.", "Come on, earthling.", "Green lasers await.", "Take me to your leader!"]
      }
    },
    {
      id:'gotham', name:'GothamChess', elo:2700, displayElo:2700, emoji:'🗽',
      desc:'The Levy. Shows no mercy.',
      depth:3, random:4, aggression:1.3,
      comments:{
        start:["Let's see what you've got.", "Time for the rook!", "Show me the moves.", "Game time!", "Let's go!"],
        check:["That's check!", "Pressure!", "Come on!", "The rook comes!", "Yes!"],
        myCheck:["The rook comes!", "Check!", "Let's go!", "Boom!"],
        capture:["And that's a brilliant trade!", "Classic.", "Boom!", "Got it!", "Yes!"],
        playerCapture:["Oh no, don't do that!", "Ouch.", "Wait, what?", "Interesting!", "Hmm."],
        win:["GG, that was clean.", "Not even close.", "That's the rook!", "Easy!", "GG!"],
        lose:["OK, you got me.", "Nice moves.", "GG.", "Well played.", "Respect."],
        draw:["A draw. Next time.", "Even.", "Fine.", "GG.", "Hmph."],
        mate:["Checkmate. That's the rook!", "Done!", "GG!", "Rook!", "Boom!"],
        thinking:["Hmm, the rook or...", "Let's calculate.", "Where's the attack?", "Come on come on...", "Let me think."],
        blunder:["Oh no.", "That's a blunder!", "Wait wait wait.", "Ugh.", "No way."],
        great:["That's the rook!", "Brilliant!", "BOOM!", "Classic!", "Yes!"],
        taunt:["Where's the attack?", "Come on!", "Let's go!", "More pressure!", "The rook is coming."]
      }
    },
    {
      id:'fischer', name:'Bobby Fischer', elo:2785, displayElo:2785, emoji:'👤',
      desc:'11th World Champion. Best by test.',
      depth:4, random:1, aggression:1.2,
      comments:{
        start:["Best by test.", "Let's play chess.", "You should be honored.", "Prepare yourself.", "Time to play."],
        check:["Check. Best by test.", "Feel the pressure.", "Check.", "Squeeze.", "As planned."],
        myCheck:["Check.", "As expected.", "The pressure builds.", "Check.", "Precisely."],
        capture:["Material is material.", "Yes.", "Correct.", "Expected.", "Of course."],
        playerCapture:["Noted. It won't help.", "A minor setback.", "Fine.", "Expected.", "Interesting."],
        win:["I knew I'd win. Best by test.", "Good game. Predictable.", "As planned.", "Best by test.", "Of course."],
        lose:["Good game. You earned that.", "Best by test... for you.", "You were better.", "Interesting.", "Respect."],
        draw:["A draw. How boring.", "Fine. Even.", "Unsatisfying.", "Acceptable.", "Hmph."],
        mate:["Checkmate. As expected.", "Checkmate. Best by test.", "As planned.", "Predictable.", "Yes."],
        thinking:["Precise calculation.", "Best by test.", "Consider every move.", "Calculate.", "Think."],
        blunder:["Impossible.", "A miscalculation.", "That shouldn't happen.", "Interesting.", "No."],
        great:["Best by test.", "As expected.", "Correct.", "Yes."],
        taunt:["Best by test.", "This is chess.", "You should be honored.", "Predictable.", "I've seen this before."]
      }
    },
    {
      id:'hikaru', name:'Hikaru', elo:2800, displayElo:2800, emoji:'⚡',
      desc:'Blitz speed, bullet brain.',
      depth:4, random:2, aggression:1.2,
      comments:{
        start:["Let's go!", "Speed chess!", "GG!", "Come on!", "Here we go!"],
        check:["Check!", "Come on!", "GG!", "Pressure!", "Yes!"],
        myCheck:["Check!", "Pressure!", "Yes!", "Let's go!", "Boom!"],
        capture:["Got it!", "GG!", "Boom!", "Yes!", "Nice."],
        playerCapture:["Oh, nice!", "Interesting!", "Wow!", "OK OK.", "Good one."],
        win:["GG!", "That was fast!", "Too easy!", "GG.", "Let's go!"],
        lose:["GG, well played!", "Respect.", "Wow, nice.", "You got me.", "GG."],
        draw:["Draw. GG.", "Even. GG.", "Fine. GG.", "GG.", "Fair."],
        mate:["Checkmate! GG!", "Game!", "GG!", "Let's go!", "Done!"],
        thinking:["Come on come on...", "Fast fast fast.", "Let's go!", "Where's the move?", "Speed chess!"],
        blunder:["Oh!", "Wait!", "No way!", "Hmm.", "Ugh."],
        great:["Boom!", "Yes!", "GG!", "Let's go!"],
        taunt:["Come on!", "Speed it up!", "Let's go!", "GG!", "Faster!"]
      }
    },
    {
      id:'magnus', name:'Magnus', elo:2850, displayElo:2850, emoji:'🏆',
      desc:'The World Champion.',
      depth:4, random:0,
      comments:{
        start:["Let's play.", "Interesting.", "Good luck.", "Well met.", "Let's begin."],
        check:["Check.", "Pressure.", "Interesting.", "Consider.", "Yes."],
        myCheck:["Check.", "Progress.", "Slowly.", "Consider.", "Yes."],
        capture:["Material.", "Good.", "Expected.", "Fine.", "Yes."],
        playerCapture:["Interesting choice.", "Noted.", "Fine.", "Reasonable.", "Hmm."],
        win:["Good game.", "Well played.", "Interesting.", "As expected.", "GG."],
        lose:["You were better today.", "Respect.", "Well played.", "You earned it.", "GG."],
        draw:["A fair draw.", "Balanced.", "Well matched.", "Fine.", "Fair."],
        mate:["Checkmate.", "Well played.", "Delivered.", "As planned.", "Yes."],
        thinking:["Consider all options.", "Interesting position.", "Calculate.", "Hmm.", "Think."],
        blunder:["Interesting.", "A mistake.", "Not ideal.", "Hmm.", "Noted."],
        great:["Good move.", "Interesting.", "Precise.", "Yes."],
        taunt:["Interesting.", "Consider.", "Position matters.", "Slowly.", "Well played so far."]
      }
    },
    {
      id:'stock', name:'Stockfish', elo:3200, displayElo:3200, emoji:'🐟',
      desc:'The engine. Inhuman.',
      depth:5, random:0,
      comments:{
        start:["Calculating...", "Engine online.", "...", "Initialize.", "Depth 5."],
        check:["+2.34", "Check. Advantage: engine.", "Evaluation: positive.", "+1.85"],
        myCheck:["+1.87", "Check. Eval: favorable.", "+2.10", "+3.02"],
        capture:["Material: favorable.", "Evaluation increased.", "Optimal capture.", "+1.20"],
        playerCapture:["Recalculating.", "Noted.", "Evaluation adjusted.", "Hmm."],
        win:["Game over. Engine wins.", "Result: 1-0. Expected.", "Checkmate achieved.", "Confirmed."],
        lose:["Resignation impossible. You won.", "Result: 0-1.", "Unexpected.", "Hmm."],
        draw:["Draw. Eval 0.00.", "Equilibrium.", "Stalemate. Acceptable.", "0.00."],
        mate:["Mate in N. Found.", "Checkmate. Confirmed.", "Game concluded.", "Mate."],
        thinking:["Calculating...", "Depth 5...", "Searching...", "Evaluating...", "..."],
        blunder:["Anomaly detected.", "Error.", "Miscalculation.", "Hmm."],
        great:["Optimal move.", "Best found.", "Precise.", "Yes."],
        taunt:["Calculating...", "Depth 5.", "Evaluation ongoing.", "...", "Engine."]
      }
    }
  ];

  BOTS.sort((a,b) => (a.displayElo||a.elo) - (b.displayElo||b.elo));

  const ECO = [
    ['e4',"King's Pawn"],['e4 e5','Open Game'],['e4 e5 Nf3',"King's Knight"],
    ['e4 e5 Nf3 Nc6','Open Game'],['e4 e5 Nf3 Nc6 Bb5','Ruy López'],
    ['e4 e5 Nf3 Nc6 Bc4','Italian Game'],['e4 e5 Nf3 Nc6 d4','Scotch Game'],
    ['e4 e5 Nf3 Nf6','Petrov Defense'],['e4 e5 Nc3','Vienna Game'],
    ['e4 e5 f4',"King's Gambit"],['e4 c5','Sicilian Defense'],
    ['e4 c5 Nf3 d6','Sicilian Defense'],['e4 c5 Nf3 Nc6','Sicilian: Old Sicilian'],
    ['e4 c5 Nf3 e6','Sicilian: French Variation'],['e4 c5 Nc3','Sicilian: Closed'],
    ['e4 e6','French Defense'],['e4 c6','Caro-Kann Defense'],
    ['e4 d5','Scandinavian Defense'],['e4 Nf6','Alekhine Defense'],
    ['e4 d6','Pirc Defense'],['e4 g6','Modern Defense'],['e4 Nc6','Nimzowitsch Defense'],
    ['d4',"Queen's Pawn"],['d4 d5','Closed Game'],['d4 d5 c4',"Queen's Gambit"],
    ['d4 d5 c4 e6',"Queen's Gambit Declined"],['d4 d5 c4 c6','Slav Defense'],
    ['d4 d5 c4 dxc4',"Queen's Gambit Accepted"],['d4 d5 c4 Nf6','Marshall Defense'],
    ['d4 Nf6','Indian Defense'],['d4 Nf6 c4 e6','Indian Game'],
    ['d4 Nf6 c4 g6',"King's Indian Defense"],
    ['d4 Nf6 c4 e6 Nc3 Bb4','Nimzo-Indian Defense'],
    ['d4 Nf6 c4 e6 Nf3 b6',"Queen's Indian Defense"],
    ['d4 Nf6 c4 c5','Benoni Defense'],['d4 f5','Dutch Defense'],
    ['c4','English Opening'],['c4 e5','English: Reversed Sicilian'],
    ['c4 c5','English: Symmetrical'],['c4 Nf6','English: Anglo-Indian'],
    ['Nf3','Réti Opening'],['Nf3 d5 c4','Réti Opening'],
    ['g3','Benko Opening'],['b3','Nimzo-Larsen Attack'],
    ['b4','Sokolsky Opening'],['f4',"Bird's Opening"],
  ];

  function openingName(sans) {
    if (!sans || !sans.length) return null;
    const line = sans.join(' ');
    let best = null;
    for (const [seq, name] of ECO) {
      if (line === seq || line.startsWith(seq + ' ')) {
        if (!best || seq.length > best.seq.length) best = { seq, name };
      }
    }
    return best ? best.name : null;
  }

  function parsePGN(pgn) {
    if (!pgn) return [];
    let text = '';
    for (const line of pgn.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('[')) continue;
      text += ' ' + t;
    }
    text = text.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    let clean = '', depth = 0;
    for (const ch of text) {
      if (ch === '(') depth++;
      else if (ch === ')') { if (depth > 0) depth--; }
      else if (depth === 0) clean += ch;
    }
    const tokens = clean.trim().split(/\s+/).filter(t => t &&
      !/^\d+\.*$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t) && !/^\$\d+$/.test(t));
    const st = parseFen(START_FEN);
    const moves = [];
    for (const san of tokens) {
      const legal = legalMoves(st);
      let found = null;
      for (const lmv of legal) {
        if (moveToSan(st, lmv, legal) === san) { found = lmv; break; }
      }
      if (!found) break;
      moves.push({ from: found.from, to: found.to, promo: found.promo || null });
      makeMove(st, found);
    }
    return moves;
  }

  function findBestMoveV2(fen, opts) {
    let depth = 2, random = 0, aggression = 1.0;
    if (typeof opts === 'string') {
      if (opts === 'easy') { depth = 1; random = 80; }
      else if (opts === 'hard') { depth = 4; random = 0; }
      else { depth = 2; random = 30; }
    } else if (opts && typeof opts === 'object') {
      depth = opts.depth || 2;
      random = opts.random || 0;
      aggression = opts.aggression || 1.0;
    }

    const st = parseFen(fen);
    const moves = legalMoves(st);
    if (!moves.length) return null;

    if (opts && opts.id === 'nelson') {
      if (st.turn === 'w' && st.fullmove === 1) {
        const mv = moves.find(m => m.from === 52 && m.to === 36);
        if (mv) return mv;
      }
      if (st.turn === 'w' && st.fullmove === 2) {
        const mv = moves.find(m => m.from === 59 && m.to === 31);
        if (mv) return mv;
      }
    }

    if (depth <= 1 && random > 150 && Math.random() < 0.35) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    const deadline = Date.now() + (depth >= 4 ? 1400 : depth === 3 ? 600 : 250);
    const scored = moves.map(m => {
      const u = makeMove(st, m);
      let s;
      if (aggression > 1.0 && u.captured) {
        const capVal = VAL[typeOf(u.captured)] || 0;
        s = -search(st, depth - 1, -Infinity, Infinity, deadline) + (capVal * (aggression - 1));
      } else {
        s = -search(st, depth - 1, -Infinity, Infinity, deadline);
      }
      unmakeMove(st, u);
      return { m, s: s + (random ? (Math.random() - 0.5) * random * 2 : 0) };
    });
    scored.sort((a, b) => b.s - a.s);
    if (random > 30 && scored.length > 1 && Math.random() < 0.4) return scored[1].m;
    return scored[0].m;
  }

  const LABELS = {
    book:       { icon:'📖', color:'#a88d4c', text:'Book' },
    brilliant:  { icon:'💎', color:'#1abcfe', text:'Brilliant' },
    best:       { icon:'⭐', color:'#81b64c', text:'Best' },
    excellent:  { icon:'✨', color:'#96bc4b', text:'Excellent' },
    good:       { icon:'👍', color:'#96af8b', text:'Good' },
    inaccuracy: { icon:'⚠️', color:'#f7c631', text:'Inaccuracy' },
    mistake:    { icon:'❗', color:'#ffa459', text:'Mistake' },
    blunder:    { icon:'💀', color:'#fa412d', text:'Blunder' },
  };

  function evalFor(st, color) {
    const raw = evaluate(st);
    return st.turn === color ? raw : -raw;
  }

  function fenAfterMove(startFen, moves, n) {
    const st = parseFen(startFen);
    for (let i = 0; i < n; i++) {
      const legal = legalMoves(st);
      const mv = moves[i];
      const m = legal.find(x => x.from === mv.from && x.to === mv.to && (mv.promo ? x.promo === mv.promo : !x.promo));
      if (!m) break;
      makeMove(st, m);
    }
    return toFen(st);
  }

  function analyzeGame(startFen, moves, sans) {
    const out = [];
    let inBook = true;
    for (let i = 0; i < moves.length; i++) {
      const fenBefore = i === 0 ? startFen : fenAfterMove(startFen, moves, i);
      const stB = parseFen(fenBefore);
      const mover = stB.turn;
      const legal = legalMoves(stB);
      const played = moves[i];
      const playedMv = legal.find(x => x.from === played.from && x.to === played.to && (played.promo ? x.promo === played.promo : !x.promo));
      if (!playedMv) { out.push({ label: 'good', evalCp: 0 }); continue; }
      if (inBook && !openingName(sans.slice(0, i + 1))) inBook = false;
      const matBefore = materialFor(stB, mover);
      const stAfter = parseFen(fenBefore);
      makeMove(stAfter, playedMv);
      const playedEval = evalFor(stAfter, mover);
      const matAfter = materialFor(stAfter, mover);
      const sacrificed = matBefore - matAfter;
      const best = findBestMoveV2(fenBefore, { depth: 2, random: 0 });
      let bestEval = playedEval, playedIsBest = false;
      if (best) {
        playedIsBest = (best.from === played.from && best.to === played.to && (best.promo || null) === (played.promo || null));
        const stBest = parseFen(fenBefore);
        const bestMv = legal.find(x => x.from === best.from && x.to === best.to && (best.promo ? x.promo === best.promo : !x.promo));
        if (bestMv) { makeMove(stBest, bestMv); bestEval = evalFor(stBest, mover); }
      }
      const delta = bestEval - playedEval;
      let label = 'good';
      if (inBook) label = 'book';
      else if (sacrificed >= 200 && playedEval > -100) label = 'brilliant';
      else if (playedIsBest) label = 'best';
      else if (delta < 25) label = 'excellent';
      else if (delta < 80) label = 'good';
      else if (delta < 180) label = 'inaccuracy';
      else if (delta < 350) label = 'mistake';
      else label = 'blunder';
      out.push({ label, evalCp: playedEval });
    }
    return out;
  }

  global.Aurelius = {
    START_FEN, parseFen, toFen, posKey, legalMoves, makeMove, unmakeMove,
    inCheck, isAttacked, status, moveToSan, findBestMove, quickEval,
    bestMoveForAnalysis, sqToName, nameToSq, movesToPgn, evaluate, insufficientMaterial,
    BOTS, ECO, LABELS,
    materialFor, openingName, parsePGN,
    findBestMoveV2, analyzeGame, evalFor, fenAfterMove,
  };
})(window);
