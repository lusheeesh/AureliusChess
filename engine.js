/* AURELIUS ENGINE — rules, move generation, SAN, AI, PGN */
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
    return {
      board,
      turn: parts[1] || 'w',
      castling: (parts[2] && parts[2] !== '-') ? parts[2] : '',
      ep: (parts[3] && parts[3] !== '-') ? nameToSq(parts[3]) : -1,
      halfmove: +(parts[4] || 0),
      fullmove: +(parts[5] || 1)
    };
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
    const undo = {
      board: b.slice(), turn: st.turn, castling: st.castling,
      ep: st.ep, halfmove: st.halfmove, fullmove: st.fullmove,
      captured: null, epCap: -1
    };
    const p = b[m.from];
    const color = colorOf(p), t = typeOf(p);
    let captured = b[m.to];

    if (t === 'p' && m.to === st.ep && !b[m.to]) {
      const capIdx = m.to + (color === 'w' ? 8 : -8);
      captured = b[capIdx];
      b[capIdx] = '';
      undo.epCap = capIdx;
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
    undo.move = m;
    return undo;
  }

  function unmakeMove(st, undo) {
    st.board = undo.board;
    st.turn = undo.turn;
    st.castling = undo.castling;
    st.ep = undo.ep;
    st.halfmove = undo.halfmove;
    st.fullmove = undo.fullmove;
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

  /* ---------- AI ---------- */
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
      if (whiteToMove) {
        line += (line ? ' ' : '') + `${num}. ${san}`;
        num++; whiteToMove = false;
      } else {
        line += (line ? ' ' : '') + san;
        whiteToMove = true;
        pgn += line + '\n';
        line = '';
      }
    }
    if (line) pgn += line + '\n';
    return pgn;
  }

  global.Aurelius = {
    START_FEN, parseFen, toFen, posKey, legalMoves, makeMove, unmakeMove,
    inCheck, isAttacked, status, moveToSan, findBestMove, quickEval,
    bestMoveForAnalysis, sqToName, nameToSq, movesToPgn, evaluate, insufficientMaterial
  };
})(window);
