/* AURELIUS APP v2 — loginless, PeerJS-free online via MQTT, rich sounds/visuals */
(function(){
'use strict';
const A = window.Aurelius;
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const GLYPH = {k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const FILES = 'abcdefgh';
const SID = Math.random().toString(36).slice(2,10);

/* ============ TOAST ============ */
function toast(msg,type){
  const t=$('#toast');
  t.textContent=msg;
  t.className='toast show'+(type?' '+type:'');
  clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2200);
}

/* ============ SOUNDS ============ */
let _ac=null;
function getAC(){return _ac||(_ac=new (window.AudioContext||window.webkitAudioContext)());}
function beep(freq,dur,type='sine',vol=0.1,delay=0){
  try{
    const ac=getAC();
    const o=ac.createOscillator(),g=ac.createGain();
    o.type=type;o.frequency.value=freq;
    o.connect(g);g.connect(ac.destination);
    const t=ac.currentTime+delay;
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+0.01);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.start(t);o.stop(t+dur+0.03);
  }catch(e){}
}
const SND={
  move:()=>beep(520,0.06,'triangle',0.06),
  capture:()=>{beep(280,0.08,'sawtooth',0.1);beep(180,0.1,'triangle',0.08,0.02);},
  castle:()=>{beep(450,0.05,'square',0.05);setTimeout(()=>beep(550,0.05,'square',0.05),60);},
  promote:()=>[523,659,784,1046].forEach((f,i)=>beep(f,0.1,'sine',0.06,i*50)),
  check:()=>{beep(880,0.1,'square',0.08);setTimeout(()=>beep(660,0.14,'square',0.08),110);},
  checkmate:()=>[400,500,600,800,1000].forEach((f,i)=>beep(f,0.14,'triangle',0.08,i*80)),
  victory:()=>[523,659,784,1046,1318].forEach((f,i)=>beep(f,0.18,'sine',0.07,i*70)),
  defeat:()=>[400,340,280,220].forEach((f,i)=>beep(f,0.22,'sine',0.07,i*90)),
  draw:()=>{beep(440,0.18,'sine',0.07);setTimeout(()=>beep(440,0.18,'sine',0.07),220);},
  click:()=>beep(700,0.02,'square',0.03),
  illegal:()=>beep(140,0.12,'sawtooth',0.08),
  notify:()=>{beep(880,0.06,'sine',0.06);setTimeout(()=>beep(1100,0.08,'sine',0.06),70);},
  emote:()=>beep(1000,0.05,'sine',0.05),
};
function play(n){ if(SETTINGS.sound&&SND[n]) SND[n](); }

/* ============ SETTINGS ============ */
const DEF={theme:'gold',sound:true,coords:true,legal:true,arrow:true,showEval:false,autoflip:true};
const SETTINGS=Object.assign({},DEF,JSON.parse(localStorage.getItem('aur.settings')||'{}'));
function saveSettings(){localStorage.setItem('aur.settings',JSON.stringify(SETTINGS));}

/* ============ PROFILE (loginless) ============ */
const AVATARS=['♞','♜','♝','♛','♚','♟','🦁','🐺','🦅','🐉','🦊','🐯','👑','🎭','⚔️','🗡️','🎯','🔥'];
const DEF_PROFILE={id:SID,name:'Guest'+Math.floor(1000+Math.random()*9000),avatar:'♞',rating:1200,wins:0,losses:0,draws:0,games:0,history:[]};
const Profile=Object.assign({},DEF_PROFILE,JSON.parse(localStorage.getItem('aur.profile')||'{}'));
function saveProfile(){localStorage.setItem('aur.profile',JSON.stringify(Profile));renderUserChip();renderProfile();}

/* ============ MQTT ============ */
let client=null;
const Net={topic:null,room:null,role:null,connected:false,host:null,hostRating:null,opponent:null,opponentRating:null,spectators:0};
const lobbyRooms=new Map();
const activeSubs=new Set();

function initMQTT(){
  if(typeof mqtt==='undefined'){console.warn('mqtt missing');return;}
  try{
    client=mqtt.connect('wss://broker.emqx.io:8084/mqtt',{
      clientId:'aur_'+SID,
      clean:true,reconnectPeriod:3000,connectTimeout:8000,keepalive:30
    });
    client.on('connect',()=>{
      Net.connected=true;
      $('#netStatus').classList.add('on');
      subLobby();
      activeSubs.forEach(t=>client.subscribe(t,{qos:0}));
    });
    client.on('close',()=>{Net.connected=false;$('#netStatus').classList.remove('on');});
    client.on('message',(topic,payload)=>{
      try{
        const msg=JSON.parse(payload.toString());
        if(msg.sid===SID)return;
        if(topic==='aurelius/lobby/v1')onLobbyMsg(msg);
        else if(topic===Net.topic)onRoomMsg(msg);
      }catch(e){}
    });
  }catch(e){console.warn(e);}
}
function subLobby(){
  if(!client||!Net.connected)return;
  if(!activeSubs.has('aurelius/lobby/v1')){client.subscribe('aurelius/lobby/v1',{qos:0});activeSubs.add('aurelius/lobby/v1');}
}
function subTopic(t){
  if(!client||!Net.connected)return;
  if(!activeSubs.has(t)){client.subscribe(t,{qos:0});activeSubs.add(t);}
}
function unsubTopic(t){
  if(!client)return;
  client.unsubscribe(t);
  activeSubs.delete(t);
}
function pubRoom(m){ if(Net.topic&&client&&Net.connected)client.publish(Net.topic,JSON.stringify({...m,sid:SID})); }
function pubLobby(m){ if(client&&Net.connected)client.publish('aurelius/lobby/v1',JSON.stringify({...m,sid:SID})); }

function onLobbyMsg(msg){
  if(msg.t!=='room')return;
  lobbyRooms.set(msg.code,{...msg,lastSeen:Date.now()});
  if(currentView==='lobby')renderLobby();
}
function pruneLobby(){
  const now=Date.now();
  for(const [k,v] of lobbyRooms){if(now-v.lastSeen>18000)lobbyRooms.delete(k);}
}

/* ============ VIEW ============ */
let currentView='home';
function switchView(v){
  currentView=v;
  $$('.view').forEach(x=>x.classList.toggle('active',x.id==='view-'+v));
  $$('.tabbar button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  window.scrollTo(0,0);
  if(v==='lobby'){pruneLobby();renderLobby();}
  if(v==='profile'){renderProfile();}
  if(v==='settings')loadSettingsUI();
}
document.addEventListener('click',e=>{
  const n=e.target.closest('[data-view]');
  if(n&&!e.target.closest('#board')&&!e.target.closest('#puzBoard')&&!e.target.closest('.user-chip')===false||
    (n&&!e.target.closest('#board')&&!e.target.closest('#puzBoard'))){
    if(n.dataset.view){play('click');switchView(n.dataset.view);}
  }
});

/* ============ BOARD RENDER ============ */
function renderBoardInto(el,st,opt){
  opt=opt||{};
  const flip=!!opt.flip;
  const sel=opt.selected;
  const legalTo=new Set((opt.legal||[]).map(m=>m.to));
  const last=opt.last;
  const checkIdx=opt.check;
  let html='';
  for(let vr=0;vr<8;vr++){
    for(let vf=0;vf<8;vf++){
      const f=flip?7-vf:vf;
      const r=flip?7-vr:vr;
      const idx=r*8+f;
      const dark=(f+r)%2===0;
      let cls='sq '+(dark?'dark':'light');
      if(last&&(idx===last.from||idx===last.to))cls+=' last';
      if(idx===sel)cls+=' sel';
      if(idx===checkIdx)cls+=' check';
      if(opt.hintFrom===idx)cls+=' hint-from';
      if(opt.hintTo===idx)cls+=' hint-to';
      let attrs=`data-i="${idx}"`;
      if(SETTINGS.coords){
        if(vf===0)attrs+=` data-rank="${8-r}"`;
        if(vr===7)attrs+=` data-file="${FILES[f]}"`;
      }
      html+=`<div class="${cls}" ${attrs}>`;
      if(sel>=0&&legalTo.has(idx)){
        html+=st.board[idx]?'<span class="ring"></span>':'<span class="dot"></span>';
      }
      const p=st.board[idx];
      if(p){
        const c=p===p.toUpperCase()?'w':'b';
        html+=`<span class="pc ${c}">${GLYPH[p.toLowerCase()]}</span>`;
      }
      html+='</div>';
    }
  }
  el.innerHTML=html;
}

function drawArrow(from,to,flip,svgEl){
  if(!svgEl)return;
  svgEl.querySelectorAll('line').forEach(l=>l.remove());
  if(!SETTINGS.arrow||from==null||to==null)return;
  const f=i=>flip?7-(i%8):(i%8);
  const r=i=>flip?7-Math.floor(i/8):Math.floor(i/8);
  const x1=f(from)+0.5,y1=r(from)+0.5,x2=f(to)+0.5,y2=r(to)+0.5;
  const NS='http://www.w3.org/2000/svg';
  const ln=document.createElementNS(NS,'line');
  ln.setAttribute('x1',x1);ln.setAttribute('y1',y1);
  ln.setAttribute('x2',x2);ln.setAttribute('y2',y2);
  ln.setAttribute('stroke','rgba(212,175,55,.75)');
  ln.setAttribute('stroke-width','0.11');
  ln.setAttribute('stroke-linecap','round');
  ln.setAttribute('marker-end','url(#arrowhead)');
  svgEl.appendChild(ln);
}

/* ============ GAME STATE ============ */
const G={
  active:false,mode:null,st:null,startFen:A.START_FEN,
  moves:[],sans:[],fens:[],keys:[],
  last:null,flip:false,myColor:null,over:false,result:null,reason:'',
  room:null,level:'medium',
  clock:null,clockTimer:null,
  selected:-1,legal:[],pending:null,hint:null,
  players:{w:{name:'White',rating:''},b:{name:'Black',rating:''}},
  rated:false,
  drawOfferedBy:null,
};

function parseTC(str){const[a,b]=(str||'0|0').split('|').map(Number);return{base:a||0,inc:b||0};}
function tcLabel(tc){if(!tc.base)return'Casual';return Math.round(tc.base/60000)+'+'+Math.round(tc.inc/1000);}

function startGame(o){
  cleanupGame();
  G.active=true;G.mode=o.mode;G.startFen=o.fen||A.START_FEN;
  G.st=A.parseFen(G.startFen);
  G.moves=[];G.sans=[];G.fens=[A.toFen(G.st)];G.keys=[A.posKey(G.st)];
  G.last=null;G.selected=-1;G.legal=[];G.over=false;G.result=null;G.reason='';
  G.pending=null;G.hint=null;G.myColor=o.myColor||null;G.level=o.level||'medium';
  G.players=o.players||{w:{name:'White',rating:''},b:{name:'Black',rating:''}};
  G.rated=!!o.rated;G.room=o.room||null;G.drawOfferedBy=null;
  G.flip=G.myColor==='b';
  const tc=o.tc||{base:0,inc:0};
  G.clock=tc.base>0?{base:tc.base,inc:tc.inc,w:tc.base,b:tc.base,active:'w',last:Date.now()}:null;
  $('#boardOver').classList.add('hidden');
  $('#promo').classList.add('hidden');
  $('#chatLog').innerHTML='';
  $('#btnRematch').classList.add('hidden');
  $('#btnAnalyze').disabled=true;
  $('#evalBar').classList.toggle('hidden',!(SETTINGS.showEval&&G.mode==='ai'));
  $('#shareRow').classList.toggle('hidden',!(o.room&&(o.mode==='online')));
  if(o.room&&o.mode==='online')$('#shareCode').textContent=o.room.code;
  switchView('game');
  renderAll();
  if(G.clock)startClock();
  play('notify');
  if(o.onStart)o.onStart();
}
function cleanupGame(){
  if(G.clockTimer){clearInterval(G.clockTimer);G.clockTimer=null;}
  if(Net.topic){unsubTopic(Net.topic);Net.topic=null;}
  G.active=false;
}

function startClock(){
  if(G.clockTimer)clearInterval(G.clockTimer);
  G.clockTimer=setInterval(tick,100);
}
function clockRem(c){
  const cc=G.clock;let t=c==='w'?cc.w:cc.b;
  if(cc.active===c&&cc.last)t-=(Date.now()-cc.last);
  return Math.max(0,t);
}
function tick(){
  if(!G.active||!G.clock)return;
  if(!G.over&&G.clock.active){
    if(clockRem(G.clock.active)<=0){
      const loser=G.clock.active;
      endGame(loser==='w'?'0-1':'1-0','timeout');
      return;
    }
  }
  renderClocks();
}
function clockAfter(mover){
  const c=G.clock;if(!c)return;
  const rem=clockRem(mover);
  if(mover==='w')c.w=rem+c.inc;else c.b=rem+c.inc;
  c.active=mover==='w'?'b':'w';c.last=Date.now();
}
function fmtClk(ms){
  if(ms==null)return'--:--';
  const t=Math.max(0,Math.floor(ms/1000));
  const m=Math.floor(t/60),s=t%60;
  if(ms<20000)return m+':'+String(s).padStart(2,'0')+'.'+Math.floor((ms%1000)/100);
  return m+':'+String(s).padStart(2,'0');
}
function renderClocks(){
  if(!G.clock){$('#clockTop').textContent='--:--';$('#clockBot').textContent='--:--';return;}
  const top=G.flip?'w':'b',bot=G.flip?'b':'w';
  const te=$('#clockTop'),be=$('#clockBot');
  te.textContent=fmtClk(clockRem(top));
  be.textContent=fmtClk(clockRem(bot));
  te.classList.toggle('active',G.clock.active===top);
  be.classList.toggle('active',G.clock.active===bot);
  te.classList.toggle('low',clockRem(top)<20000);
  be.classList.toggle('low',clockRem(bot)<20000);
}

/* ============ RENDER ============ */
function renderAll(){
  if(!G.active)return;
  const rep=countRep();
  const checkIdx=A.inCheck(G.st,G.st.turn)?findKing(G.st,G.st.turn):-1;
  renderBoardInto($('#board'),G.st,{
    flip:G.flip,selected:G.selected,legal:G.legal,last:G.last,
    check:checkIdx,hintFrom:G.hint&&G.hint.from,hintTo:G.hint&&G.hint.to
  });
  drawArrow(G.last&&G.last.from,G.last&&G.last.to,G.flip,$('#arrowLayer'));
  renderPlayers();renderMoves();renderStatus(rep);renderClocks();renderEval();
  $('#btnAnalyze').disabled=!G.over;
  $('#btnUndo').disabled=G.mode==='online'||G.mode==='spectate';
  $('#btnHint').disabled=G.over||G.mode==='spectate';
  $('#emoteBar').style.display=G.mode==='spectate'?'none':'flex';
}
function findKing(st,c){
  for(let i=0;i<64;i++){
    const p=st.board[i];
    if(p&&p.toLowerCase()==='k'&&(p===p.toUpperCase()?'w':'b')===c)return i;
  }return-1;
}
function countRep(){
  if(!G.keys.length)return 0;
  const last=G.keys[G.keys.length-1];
  return G.keys.filter(k=>k===last).length;
}
function renderPlayers(){
  const top=G.flip?'w':'b',bot=G.flip?'b':'w';
  const tp=G.players[top]||{name:'—',rating:''},bp=G.players[bot]||{name:'—',rating:''};
  $('#nameTop').textContent=tp.name;
  $('#rateTop').textContent=tp.rating?('('+tp.rating+')'):'';
  $('#nameBot').textContent=bp.name;
  $('#rateBot').textContent=bp.rating?('('+bp.rating+')'):'';
  $('#avTop').textContent=top==='w'?'♔':'♚';
  $('#avBot').textContent=bot==='w'?'♔':'♚';
  const cap=captured(G.st);
  $('#capTop').textContent=cap[top].map(t=>GLYPH[t]).join('');
  $('#capBot').textContent=cap[bot].map(t=>GLYPH[t]).join('');
  $('#pcTop').classList.toggle('active',G.clock&&G.clock.active===top);
  $('#pcBot').classList.toggle('active',G.clock&&G.clock.active===bot);
}
const INIT={p:8,n:2,b:2,r:2,q:1,k:1};
function captured(st){
  const cnt={w:{},b:{}};
  for(const p of st.board){
    if(!p)continue;
    const c=p===p.toUpperCase()?'w':'b',t=p.toLowerCase();
    cnt[c][t]=(cnt[c][t]||0)+1;
  }
  const miss={w:[],b:[]};
  for(const c of['w','b'])for(const t of['q','r','b','n','p']){
    const n=INIT[t]-(cnt[c][t]||0);
    for(let i=0;i<n;i++)miss[c].push(t);
  }
  return miss;
}
function renderMoves(){
  const ol=$('#moveList');
  let html='';
  for(let i=0;i<G.sans.length;i+=2){
    const num=Math.floor(i/2)+1;
    html+=`<li><span class="num">${num}.</span><span class="mv">${G.sans[i]}</span><span class="mv">${G.sans[i+1]||''}</span></li>`;
  }
  ol.innerHTML=html;ol.scrollTop=ol.scrollHeight;
}
function renderStatus(rep){
  const el=$('#statusLine');
  if(G.over){el.textContent=resText(G.result)+' — '+G.reason;return;}
  const side=G.st.turn==='w'?'White':'Black';
  let txt=side+' to move';
  if(A.inCheck(G.st,G.st.turn))txt+=' — check!';
  if(G.mode==='ai'&&G.st.turn==='b')txt='Aurelius is thinking…';
  if(G.mode==='online'&&G.myColor&&G.st.turn!==G.myColor)txt+=' (opponent)';
  if(G.mode==='spectate')txt='Spectating — '+side+' to move';
  el.textContent=txt;
}
function resText(r){if(r==='1-0')return'White wins';if(r==='0-1')return'Black wins';if(r==='1/2-1/2')return'Draw';return'—';}
function renderEval(){
  if(!(SETTINGS.showEval&&G.mode==='ai')||!G.active){$('#evalBar').classList.add('hidden');return;}
  $('#evalBar').classList.remove('hidden');
  try{
    const cp=A.quickEval(A.toFen(G.st),1);
    const pct=50+Math.max(-50,Math.min(50,cp/20));
    $('#evalFill').style.width=pct+'%';
  }catch(e){}
}

/* ============ MOVE ============ */
function onSquare(i){
  if(!G.active||G.over||G.pending)return;
  if(G.mode==='spectate')return;
  if(G.myColor&&G.st.turn!==G.myColor)return;
  if(G.mode==='ai'&&G.st.turn!=='w')return;
  const p=G.st.board[i];
  if(G.selected>=0){
    const mv=G.legal.find(m=>m.to===i);
    if(mv){
      const promos=G.legal.filter(m=>m.to===i&&m.promo);
      if(promos.length){showPromo(i);G.pending={from:G.selected,to:i};return;}
      commit(G.selected,i,null);return;
    }
  }
  if(p&&(p===p.toUpperCase()?'w':'b')===G.st.turn){
    G.selected=i;G.legal=A.legalMoves(G.st).filter(m=>m.from===i);
    play('click');
  }else{G.selected=-1;G.legal=[];}
  renderAll();
}
function showPromo(to){
  const b=$('#promo');
  b.innerHTML=`<div class="promo-box">${['q','r','b','n'].map(t=>`<button data-p="${t}">${GLYPH[t]}</button>`).join('')}</div>`;
  b.classList.remove('hidden');
  b.querySelectorAll('button').forEach(x=>{
    x.onclick=()=>{b.classList.add('hidden');if(G.pending)commit(G.pending.from,G.pending.to,x.dataset.p);};
  });
}
function commit(from,to,promo){
  if(G.over)return false;
  const legal=A.legalMoves(G.st);
  const m=legal.find(x=>x.from===from&&x.to===to&&(promo?x.promo===promo:!x.promo));
  if(!m){play('illegal');return false;}
  const san=A.moveToSan(G.st,m,legal);
  const mover=G.st.turn;
  const capture=!!G.st.board[to]||!!m.ep;
  A.makeMove(G.st,m);
  G.moves.push({from,to,promo:m.promo||null});
  G.sans.push(san);G.fens.push(A.toFen(G.st));G.keys.push(A.posKey(G.st));
  G.last={from,to};G.selected=-1;G.legal=[];G.pending=null;G.hint=null;
  if(G.clock)clockAfter(mover);
  if(san.includes('#'))play('checkmate');
  else if(san.includes('+'))play('check');
  else if(m.castle)play('castle');
  else if(m.promo)play('promote');
  else if(capture)play('capture');
  else play('move');
  $('#promo').classList.add('hidden');
  const rep=countRep();
  const stt=A.status(G.st,rep);
  if(stt.over){
    endGame(stt.result,stt.reason);
  }else{
    if(G.mode==='local'&&SETTINGS.autoflip)G.flip=G.st.turn==='b';
    renderAll();
    if(G.mode==='ai')setTimeout(maybeAI,120);
    if(G.mode==='online')broadcastState();
  }
  return true;
}
function maybeAI(){
  if(!G.active||G.over||G.mode!=='ai'||G.st.turn!=='b')return;
  const best=A.findBestMove(A.toFen(G.st),G.level);
  if(best&&!G.over)commit(best.from,best.to,best.promo);
}

function endGame(result,reason){
  if(G.over)return;
  G.over=true;G.result=result;G.reason=reason;
  if(G.clock)G.clock.active=null;

  const iWon=G.myColor?((result==='1-0'&&G.myColor==='w')||(result==='0-1'&&G.myColor==='b')):null;
  if(result==='1/2-1/2')play('draw');
  else if(iWon===true)play('victory');
  else if(iWon===false)play('defeat');
  else play('checkmate');

  let title=resText(result);
  if(G.myColor)title=result==='1/2-1/2'?'Draw':(iWon?'You won!':'You lost');

  // Update local rating if not spectator
  if(G.myColor){
    const oldR=Profile.rating;
    const oppR=G.opponentRating||1200;
    let score=iWon===true?1:iWon===false?0:0.5;
    const ea=1/(1+Math.pow(10,(oppR-oldR)/400));
    const k=Profile.games<30?40:20;
    Profile.rating=Math.round(oldR+k*(score-ea));
    Profile.games++;
    if(iWon===true)Profile.wins++;else if(iWon===false)Profile.losses++;else Profile.draws++;
    Profile.history.unshift({
      opp:G.players[G.myColor==='w'?'b':'w'].name,
      result:score===1?'win':score===0?'loss':'draw',
      rating:Profile.rating,ts:Date.now()
    });
    Profile.history=Profile.history.slice(0,20);
    saveProfile();
  }
  if(iWon===true)confetti();

  const ov=$('#boardOver');
  ov.innerHTML=`<div class="ov-card">
    <div class="ov-title">${title}</div>
    <div class="ov-sub">${reason}</div>
    <div class="ov-btns">
      <button class="btn sm" id="ovAnalyze">Analyze</button>
      <button class="btn sm ghost" id="ovRematch">Rematch</button>
      <button class="btn sm ghost" id="ovExit">Exit</button>
    </div>
  </div>`;
  ov.classList.remove('hidden');
  $('#ovAnalyze').onclick=()=>{ov.classList.add('hidden');openAnalysis();};
  $('#ovRematch').onclick=()=>{ov.classList.add('hidden');rematch();};
  $('#ovExit').onclick=()=>{ov.classList.add('hidden');exitGame();};
  $('#btnAnalyze').disabled=false;
  $('#btnRematch').classList.remove('hidden');
  renderAll();

  if(G.mode==='online'){
    pubRoom({t:'end',result,reason});
    if(Net.role==='host')stopHosting();
  }
}

/* ============ CONFETTI ============ */
function confetti(){
  const cv=$('#confetti');
  const ctx=cv.getContext('2d');
  cv.width=innerWidth*2;cv.height=innerHeight*2;
  cv.style.width='100%';cv.style.height='100%';
  ctx.scale(2,2);
  const P=[];
  const colors=['#d4af37','#f5d76e','#ffe89a','#4cc38a','#4a9eff','#e05252'];
  for(let i=0;i<160;i++){
    P.push({
      x:innerWidth/2+(Math.random()-.5)*200,
      y:innerHeight/2,
      vx:(Math.random()-.5)*12,
      vy:-Math.random()*14-4,
      w:Math.random()*8+4,h:Math.random()*6+3,
      c:colors[Math.floor(Math.random()*colors.length)],
      r:Math.random()*Math.PI,a:Math.random()*Math.PI,vr:(Math.random()-.5)*.3,va:0
    });
  }
  let t=0;
  function frame(){
    ctx.clearRect(0,0,innerWidth,innerHeight);
    P.forEach(p=>{
      p.x+=p.vx;p.y+=p.vy;p.vy+=.35;p.r+=p.vr;p.a+=p.va;
      p.vx*=.99;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.r);
      ctx.globalAlpha=Math.max(0,1-t/120);
      ctx.fillStyle=p.c;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
      ctx.restore();
    });
    t++;
    if(t<120)requestAnimationFrame(frame);
    else ctx.clearRect(0,0,innerWidth,innerHeight);
  }
  frame();
}

/* ============ EMOTES ============ */
function sendEmote(emoji){
  if(!G.active)return;
  play('emote');
  showEmote(emoji,Profile.name);
  if(G.mode==='online')pubRoom({t:'emote',emoji,name:Profile.name});
}
function showEmote(emoji,name){
  const pop=$('#emotePop');
  const el=document.createElement('div');
  el.className='emote-float';
  el.textContent=emoji;
  el.style.left=(20+Math.random()*60)+'%';
  el.style.top=(60+Math.random()*20)+'%';
  pop.appendChild(el);
  setTimeout(()=>el.remove(),2100);
}

/* ============ UNDO / RESIGN / DRAW / REMATCH ============ */
function undo(){
  if(!G.active||G.over||G.mode==='online'||G.mode==='spectate')return;
  const plies=(G.mode==='ai'&&G.sans.length>1)?2:1;
  for(let k=0;k<plies&&G.moves.length;k++){G.moves.pop();G.sans.pop();G.fens.pop();G.keys.pop();}
  const lastFen=G.fens[G.fens.length-1]||G.startFen;
  G.st=A.parseFen(lastFen);G.last=null;G.over=false;G.result=null;G.reason='';
  G.selected=-1;G.legal=[];
  $('#boardOver').classList.add('hidden');
  if(G.clock)G.clock.active=G.st.turn;
  renderAll();
}
function resign(){
  if(!G.active||G.over)return;
  if(!confirm('Resign this game?'))return;
  const loser=G.myColor||(G.st.turn==='w'?'b':'w');
  const result=loser==='w'?'0-1':'1-0';
  endGame(result,'resignation');
  if(G.mode==='online')pubRoom({t:'resign',result});
}
function drawOffer(){
  if(!G.active||G.over)return;
  if(G.mode==='online'){
    pubRoom({t:'draw',action:'offer',name:Profile.name});
    toast('Draw offer sent');
    return;
  }
  if(confirm('Agree to a draw?'))endGame('1/2-1/2','agreement');
}
function rematch(){
  if(G.mode==='online'&&Net.topic){
    pubRoom({t:'rematch',name:Profile.name});
    toast('Rematch requested');
    return;
  }
  startGame({mode:G.mode,level:G.level,rated:G.rated,
    tc:G.clock?{base:G.clock.base,inc:G.clock.inc}:{base:0,inc:0},
    players:G.players,myColor:G.myColor});
}
function exitGame(){cleanupGame();switchView('home');}

/* ============ ONLINE (MQTT) ============ */
function genCode(){
  const C='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s='';for(let i=0;i<5;i++)s+=C[Math.floor(Math.random()*C.length)];
  return s;
}

async function hostRoom(){
  const code=genCode();
  const tc=readTC();
  const rated=$('#chkRated').checked;
  Net.topic='aurelius/room/'+code;
  Net.room=code;Net.role='host';
  subTopic(Net.topic);

  startGame({
    mode:'online',myColor:'w',room:{code},rated,tc,
    players:{w:{name:Profile.name,rating:Profile.rating},b:{name:'Waiting…',rating:''}},
    onStart:()=>{
      setTimeout(()=>broadcastState(),300);
      startHostAnnounce(code,tc);
      toast('Room '+code+' created — share the code!');
    }
  });
  saveRecent(code);
}

let announceTimer=null;
function startHostAnnounce(code,tc){
  stopHosting();
  const send=()=>{
    pubLobby({t:'room',code,host:Profile.name,hostRating:Profile.rating,
      tc:tcLabel(tc),rated:G.rated,status:G.opponent?'playing':'waiting',
      spectators:Net.spectators,ts:Date.now()});
  };
  send();
  announceTimer=setInterval(send,6000);
}
function stopHosting(){
  if(announceTimer){clearInterval(announceTimer);announceTimer=null;}
  if(Net.room)pubLobby({t:'room',code:Net.room,host:'',hostRating:0,tc:'',rated:false,status:'ended',spectators:0,ts:0});
}

async function joinRoom(code,role){
  code=(code||'').toUpperCase().trim();
  if(!code){toast('Enter a room code');return;}
  if(!Net.connected){toast('Connecting to server…');return;}
  if(Net.topic)cleanupGame();

  Net.topic='aurelius/room/'+code;
  Net.room=code;
  Net.role=role||'guest';
  Net.opponent=null;Net.host=null;Net.opponentRating=null;Net.spectators=0;
  subTopic(Net.topic);

  // Send hello
  const helloMsg={
    t:'hello',
    role:role==='spectate'?'spectator':'guest',
    name:Profile.name,rating:Profile.rating,sid:SID
  };
  setTimeout(()=>{
    pubRoom(helloMsg);
  },150);

  startGame({
    mode:role==='spectate'?'spectate':'online',
    myColor:null,room:{code},
    players:{w:{name:'—',rating:''},b:{name:'—',rating:''}},
    onStart:()=>{
      toast(role==='spectate'?'Watching room '+code:'Joining room '+code+'…');
      setTimeout(()=>{
        pubRoom({t:'hello',role:role==='spectate'?'spectator':'guest',name:Profile.name,rating:Profile.rating,sid:SID});
      },200);
    }
  });
  saveRecent(code);
}

function onPeerHello(msg){
  if(Net.role==='host'){
    if(msg.role==='guest'&&!Net.opponent){
      Net.opponent=msg.name;
      Net.opponentRating=msg.rating||1200;
      G.myColor='w';
      G.players.b={name:msg.name,rating:msg.rating};
      G.rated=G.rated;
      G.flip=false;
      broadcastState();
      renderAll();
      play('notify');
      toast(msg.name+' joined!');
    }else if(msg.role==='spectator'){
      Net.spectators++;
      broadcastState();
    }
  }
}

function broadcastState(){
  if(!G.active)return;
  pubRoom({
    t:'state',
    fen:A.toFen(G.st),
    moves:G.moves,
    last:G.last,
    turn:G.st.turn,
    players:G.players,
    status:G.over?'finished':'playing',
    result:G.result,
    reason:G.reason,
    clock:G.clock?{
      base:G.clock.base,inc:G.clock.inc,
      w:clockRem('w'),b:clockRem('b'),active:G.clock.active
    }:null,
    myColor:G.myColor,
    rated:G.rated,
    host:Profile.name
  });
}

function onPeerState(msg){
  if(Net.role==='host')return; // host is authoritative
  G.st=A.parseFen(msg.fen);
  G.moves=msg.moves||[];
  const replay=replayMoves(G.startFen,G.moves);
  G.sans=replay.sans;
  G.fens=replay.fens;
  G.keys=replay.keys;
  G.last=msg.last||null;
  G.selected=-1;G.legal=[];
  G.players=msg.players||G.players;
  G.rated=msg.rated||false;

  if(!G.myColor){
    const me=Profile.name;
    if(msg.players.w.name===me)G.myColor='w';
    else if(msg.players.b.name===me)G.myColor='b';
  }
  G.flip=G.myColor==='b';

  if(msg.clock&&!G.clock){
    G.clock={base:msg.clock.base,inc:msg.clock.inc,w:msg.clock.w,b:msg.clock.b,active:msg.clock.active,last:Date.now()};
    startClock();
  }else if(msg.clock&&G.clock){
    G.clock.w=msg.clock.w;G.clock.b=msg.clock.b;
    G.clock.active=msg.clock.active;G.clock.last=Date.now();
  }
  if(msg.status==='finished'&&!G.over){
    endGame(msg.result||'1/2-1/2',msg.reason||'game over');
    return;
  }
  renderAll();
}

function onPeerResign(msg){
  if(Net.role==='host')return;
  if(!G.over)endGame(msg.result||(G.myColor==='w'?'0-1':'1-0'),'resignation');
}

function onPeerDraw(msg){
  if(msg.action==='offer'){
    if(confirm(msg.name+' offers a draw. Accept?')){
      pubRoom({t:'draw',action:'accept'});
      endGame('1/2-1/2','agreement');
    }else{
      pubRoom({t:'draw',action:'decline'});
    }
  }else if(msg.action==='accept'){
    if(!G.over)endGame('1/2-1/2','agreement');
  }else if(msg.action==='decline'){
    toast(msg.name+' declined draw');
  }
}

function onPeerRematch(msg){
  if(Net.role==='host'){
    if(confirm(msg.name+' wants a rematch. Accept?')){
      pubRoom({t:'rematch',name:Profile.name,go:true});
      resetForRematch();
    }
  }else{
    if(msg.go)resetForRematch();
    else toast('Rematch requested');
  }
}

function resetForRematch(){
  G.st=A.parseFen(G.startFen);
  G.moves=[];G.sans=[];G.fens=[A.toFen(G.st)];G.keys=[A.posKey(G.st)];
  G.last=null;G.selected=-1;G.legal=[];G.over=false;G.result=null;G.reason='';
  if(G.clock){G.clock.w=G.clock.base;G.clock.b=G.clock.base;G.clock.active='w';G.clock.last=Date.now();}
  $('#boardOver').classList.add('hidden');
  renderAll();
  if(Net.role==='host')broadcastState();
}

function replayMoves(startFen,moves){
  const st=A.parseFen(startFen);
  const sans=[],fens=[A.toFen(st)],keys=[A.posKey(st)];
  for(const mv of moves){
    const legal=A.legalMoves(st);
    const m=legal.find(x=>x.from===mv.from&&x.to===mv.to&&(mv.promo?x.promo===mv.promo:!x.promo))
         ||legal.find(x=>x.from===mv.from&&x.to===mv.to);
    if(!m)break;
    sans.push(A.moveToSan(st,m,legal));
    A.makeMove(st,m);
    fens.push(A.toFen(st));keys.push(A.posKey(st));
  }
  return{st,sans,fens,keys};
}

function onRoomMsg(msg){
  switch(msg.t){
    case 'hello':onPeerHello(msg);break;
    case 'state':onPeerState(msg);break;
    case 'chat':addChatMsg(msg.name,msg.text);break;
    case 'emote':showEmote(msg.emoji,msg.name);break;
    case 'resign':onPeerResign(msg);break;
    case 'draw':onPeerDraw(msg);break;
    case 'rematch':onPeerRematch(msg);break;
    case 'end':if(Net.role!=='host'&&!G.over)endGame(msg.result,msg.reason);break;
  }
}

/* ============ CHAT ============ */
function addChatMsg(name,text){
  const log=$('#chatLog');
  const d=document.createElement('div');
  d.className='msg';
  d.innerHTML=`<b>${esc(name||'Player')}</b><p>${esc(text)}</p>`;
  log.appendChild(d);log.scrollTop=log.scrollHeight;
  if(document.hidden)play('notify');
}
function sendChat(text){
  if(!text||!text.trim())return;
  addChatMsg(Profile.name,text.trim());
  if(G.mode==='online'&&Net.topic)pubRoom({t:'chat',name:Profile.name,text:text.trim()});
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

/* ============ LOBBY ============ */
function renderLobby(){
  const el=$('#lobbyList');
  const rooms=[...lobbyRooms.values()].filter(r=>r.status!=='ended');
  if(!rooms.length){el.innerHTML='<p class="muted">No live games right now. Create one!</p>';return;}
  el.innerHTML=rooms.map(r=>`
    <div class="lobby-row">
      <span class="live-dot"></span>
      <div class="lr-players">${esc(r.host||'?')} · ${r.status==='waiting'?'waiting for opponent':'live'}
        <div class="lr-sub">${esc(r.tc||'Casual')}${r.rated?' · Rated':''} · ${r.spectators||0} watching</div>
      </div>
      <button class="btn sm ghost" data-join="${r.code}" data-role="${r.status==='waiting'?'guest':'spectate'}">${r.status==='waiting'?'Join':'Watch'}</button>
    </div>`).join('');
  el.querySelectorAll('[data-join]').forEach(b=>{
    b.onclick=()=>{play('click');joinRoom(b.dataset.join,b.dataset.role);};
  });
}

/* ============ RECENT ROOMS ============ */
function saveRecent(code){
  let r=JSON.parse(localStorage.getItem('aur.recent')||'[]');
  r=r.filter(x=>x.code!==code);
  r.unshift({code,ts:Date.now()});
  localStorage.setItem('aur.recent',JSON.stringify(r.slice(0,6)));
  renderRecent();
}
function renderRecent(){
  const r=JSON.parse(localStorage.getItem('aur.recent')||'[]').filter(x=>Date.now()-x.ts<86400000*7);
  const el=$('#recentRooms');
  if(!r.length){el.classList.add('hidden');return;}
  el.classList.remove('hidden');
  el.innerHTML='<div class="rr-label">Recent rooms</div>'+r.map(x=>
    `<div class="rr-item" data-r="${x.code}"><span class="rr-code">${x.code}</span><span>Tap to rejoin</span></div>`
  ).join('');
  el.querySelectorAll('[data-r]').forEach(x=>{
    x.onclick=()=>{play('click');joinRoom(x.dataset.r,'guest');};
  });
}

/* ============ PROFILE UI ============ */
function renderUserChip(){
  $('#ucName').textContent=Profile.name;
  $('#ucRating').textContent=Profile.rating;
  $('#ucAvatar').textContent=Profile.avatar;
}
function renderProfile(){
  $('#profName').textContent=Profile.name;
  $('#profRating').textContent='Rating '+Profile.rating;
  $('#profAvatar').textContent=Profile.avatar;
  $('#statGames').textContent=Profile.games;
  $('#statWins').textContent=Profile.wins;
  $('#statDraws').textContent=Profile.draws;
  $('#statLosses').textContent=Profile.losses;
  $('#statWinRate').textContent=Profile.games?Math.round((Profile.wins/Profile.games)*100)+'%':'0%';
  $('#inpProfileName').value=Profile.name;
  renderUserChip();

  const grid=$('#avatarGrid');
  if(grid){
    grid.innerHTML=AVATARS.map(a=>
      `<button data-a="${a}" class="${a===Profile.avatar?'active':''}">${a}</button>`
    ).join('');
    grid.querySelectorAll('button').forEach(b=>{
      b.onclick=()=>{play('click');Profile.avatar=b.dataset.a;saveProfile();};
    });
  }

  const h=$('#profHistory');
  if(!Profile.history||!Profile.history.length){
    h.innerHTML='<p class="muted">No games yet.</p>';
  }else{
    h.innerHTML=Profile.history.map(x=>`
      <div class="hrow">
        <span>vs ${esc(x.opp)}</span>
        <span class="muted">${new Date(x.ts).toLocaleDateString()}</span>
        <span class="res ${x.result}">${x.result.toUpperCase()}</span>
      </div>`).join('');
  }
}

/* ============ SETTINGS UI ============ */
function loadSettingsUI(){
  $('#setTheme').value=SETTINGS.theme;
  $('#setSound').checked=SETTINGS.sound;
  $('#setCoords').checked=SETTINGS.coords;
  $('#setLegal').checked=SETTINGS.legal;
  $('#setArrow').checked=SETTINGS.arrow;
  $('#setAutoflip').checked=SETTINGS.autoflip;
  $('#setEval').checked=SETTINGS.showEval;
}
function applyTheme(){
  document.body.dataset.theme=SETTINGS.theme;
  $('#btnSound').textContent=SETTINGS.sound?'🔊':'🔇';
  $('#btnSound').classList.toggle('muted',!SETTINGS.sound);
}

/* ============ ANALYSIS ============ */
let AN={fens:[],evals:[],ply:0,sans:[]};
function openAnalysis(){
  if(!G.moves.length){toast('Play a game first');return;}
  AN={fens:G.fens.slice(),sans:G.sans.slice(),evals:[],ply:G.fens.length-1};
  switchView('analyze');
  $('#anMoves').innerHTML=G.sans.map((s,i)=>
    `<li data-ply="${i+1}"><span class="num">${Math.floor(i/2)+1}${i%2===0?'.':'…'}</span><span class="mv">${s}</span></li>`
  ).join('');
  $('#anMoves').querySelectorAll('li').forEach(li=>{
    li.onclick=()=>{AN.ply=+li.dataset.ply;renderAnalysis();};
  });
  computeEvals();
  renderAnalysis();
}
function computeEvals(){
  AN.evals=[];
  let i=0;
  const step=()=>{
    for(let k=0;k<4&&i<AN.fens.length;k++,i++){
      try{AN.evals.push(A.quickEval(AN.fens[i],1));}
      catch(e){AN.evals.push(0);}
    }
    drawGraph();
    if(i<AN.fens.length)setTimeout(step,0);
    else{drawGraph();renderAnalysis();}
  };
  step();
}
function drawGraph(){
  const cv=$('#evalGraph');
  const w=cv.clientWidth||300,h=90;
  cv.width=w*2;cv.height=h*2;cv.style.height=h+'px';
  const ctx=cv.getContext('2d');
  ctx.setTransform(2,0,0,2,0,0);
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#131626';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#252a44';ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
  if(!AN.evals.length)return;
  const n=AN.evals.length;
  const x=i=>(i/Math.max(1,n-1))*w;
  const y=cp=>h/2-Math.max(-1,Math.min(1,cp/800))*(h/2-4);
  ctx.beginPath();ctx.moveTo(0,h);
  for(let i=0;i<n;i++)ctx.lineTo(x(i),y(AN.evals[i]||0));
  ctx.lineTo(w,h);ctx.closePath();
  ctx.fillStyle='rgba(232,228,214,.18)';ctx.fill();
  ctx.beginPath();
  for(let i=0;i<n;i++){
    const px=x(i),py=y(AN.evals[i]||0);
    i?ctx.lineTo(px,py):ctx.moveTo(px,py);
  }
  ctx.strokeStyle='#d4af37';ctx.lineWidth=1.5;ctx.stroke();
  const px=x(AN.ply);
  ctx.strokeStyle='#f5d76e';ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,h);ctx.stroke();
}
function renderAnalysis(){
  const fen=AN.fens[AN.ply]||A.START_FEN;
  const st=A.parseFen(fen);
  renderBoardInto($('#anBoard'),st,{flip:false,coords:SETTINGS.coords});
  const cp=AN.evals[AN.ply]||0;
  $('#anEval').textContent=(cp>=0?'+':'')+(cp/100).toFixed(2);
  $('#anMoves').querySelectorAll('li').forEach(li=>li.classList.toggle('active',+li.dataset.ply===AN.ply));
  if(AN.evals.length)drawGraph();
  setTimeout(()=>{
    try{
      const best=A.bestMoveForAnalysis(fen,2);
      if(best){
        $('#anBest').textContent='Best: '+A.sqToName(best.from)+'→'+A.sqToName(best.to);
        const st2=A.parseFen(fen);
        renderBoardInto($('#anBoard'),st2,{flip:false,coords:SETTINGS.coords,hintFrom:best.from,hintTo:best.to});
      }else $('#anBest').textContent='Best: —';
    }catch(e){}
  },20);
}

/* ============ PUZZLES ============ */
const PUZZLES=[
  {fen:'6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',from:56,to:0,title:'Back-rank mate'},
  {fen:'7k/6pp/8/8/8/8/6PP/5R1K w - - 0 1',from:61,to:5,title:'Rook lift'},
  {fen:'6k1/5ppp/8/8/8/8/5PPP/4Q1K1 w - - 0 1',from:60,to:4,title:'Queen invasion'},
  {fen:'6k1/R7/8/8/8/8/8/1R4K1 w - - 0 1',from:57,to:1,title:'Rook ladder'},
  {fen:'5rk1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',from:60,to:4,title:'Back rank'},
  {fen:'6k1/8/8/8/8/8/8/R5K1 w - - 0 1',from:56,to:0,title:'Rook mate'},
  {fen:'6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',from:59,to:3,title:'Rook to the 8th'},
  {fen:'5rk1/5ppp/8/8/8/8/5PPP/2QR2K1 w - - 0 1',from:59,to:3,title:'Queen & rook'},
];
let PZ={idx:0,st:null,streak:0,best:+(localStorage.getItem('aur.puzBest')||0),solved:false,hint:null,selected:-1,legal:[]};
function loadPuzzle(){
  const p=PUZZLES[PZ.idx%PUZZLES.length];
  PZ.st=A.parseFen(p.fen);PZ.solved=false;PZ.hint=null;PZ.selected=-1;PZ.legal=[];
  $('#puzStatus').textContent='White to move — '+p.title;
  $('#puzStreak').textContent=PZ.streak;
  $('#puzBest').textContent=PZ.best;
  renderPuz();
}
function renderPuz(){
  renderBoardInto($('#puzBoard'),PZ.st,{
    flip:false,coords:SETTINGS.coords,selected:PZ.selected,legal:PZ.legal||[],
    hintFrom:PZ.hint&&PZ.hint.from,hintTo:PZ.hint&&PZ.hint.to
  });
}
function onPuzSquare(i){
  if(PZ.solved)return;
  const p=PZ.st.board[i];
  if(PZ.selected>=0){
    const mv=(PZ.legal||[]).find(m=>m.to===i);
    if(mv){
      const pz=PUZZLES[PZ.idx%PUZZLES.length];
      if(mv.from===pz.from&&mv.to===pz.to){
        A.makeMove(PZ.st,mv);PZ.solved=true;PZ.streak++;
        if(PZ.streak>PZ.best){PZ.best=PZ.streak;localStorage.setItem('aur.puzBest',PZ.best);}
        $('#puzStreak').textContent=PZ.streak;$('#puzBest').textContent=PZ.best;
        $('#puzStatus').textContent='✓ Correct! '+pz.title;
        play('victory');
        renderPuz();
        setTimeout(()=>{PZ.idx++;loadPuzzle();},1400);
        return;
      }else{
        $('#puzStatus').textContent='✗ Not the mate. Try again.';
        play('illegal');
        PZ.selected=-1;PZ.legal=[];renderPuz();return;
      }
    }
  }
  if(p&&(p===p.toUpperCase()?'w':'b')===PZ.st.turn){
    PZ.selected=i;PZ.legal=A.legalMoves(PZ.st).filter(m=>m.from===i);play('click');
  }else{PZ.selected=-1;PZ.legal=[];}
  renderPuz();
}

/* ============ SHARE ============ */
async function shareRoom(){
  if(!G.room)return;
  const code=G.room.code;
  const text='Play chess with me on AURELIUS! Room code: '+code;
  const url=location.origin+location.pathname+'?room='+code;
  if(navigator.share){
    try{await navigator.share({title:'AURELIUS Chess',text,url});return;}catch(e){}
  }
  try{await navigator.clipboard.writeText(text+' '+url);toast('Copied to clipboard');}
  catch(e){toast('Room: '+code);}
}
function copyCode(){
  if(!G.room)return;
  navigator.clipboard.writeText(G.room.code).then(()=>toast('Code copied')).catch(()=>toast(G.room.code));
}

/* ============ FULLSCREEN ============ */
function toggleFullscreen(){
  if(!document.fullscreenElement){
    document.documentElement.requestFullscreen?.().catch(()=>{});
  }else{
    document.exitFullscreen?.().catch(()=>{});
  }
}

/* ============ WIRE ============ */
function wire(){
  $('#board').addEventListener('click',e=>{
    const sq=e.target.closest('.sq');if(sq)onSquare(+sq.dataset.i);
  });
  $('#puzBoard').addEventListener('click',e=>{
    const sq=e.target.closest('.sq');if(sq)onPuzSquare(+sq.dataset.i);
  });
  $('#btnAI').onclick=()=>{play('click');startGame({
    mode:'ai',level:$('#selLevel').value,myColor:'w',tc:readTC(),
    players:{w:{name:Profile.name,rating:Profile.rating},b:{name:'Aurelius AI',rating:''}}
  });};
  $('#btnLocal').onclick=()=>{play('click');startGame({
    mode:'local',tc:readTC(),
    players:{w:{name:'White',rating:''},b:{name:'Black',rating:''}}
  });};
  $('#btnCreate').onclick=()=>{play('click');hostRoom();};
  $('#btnQuick').onclick=()=>{
    play('click');
    pruneLobby();
    const open=[...lobbyRooms.values()].filter(r=>r.status==='waiting');
    if(open.length){joinRoom(open[0].code,'guest');}
    else{hostRoom();}
  };
  $('#btnWatch').onclick=()=>{play('click');switchView('lobby');};
  $('#btnPuzzlesHome').onclick=()=>{play('click');switchView('puzzles');loadPuzzle();};
  $('#btnJoin').onclick=()=>{play('click');joinRoom($('#inpCode').value,'guest');};
  $('#inpCode').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom($('#inpCode').value,'guest');});
  $('#btnRefreshLobby').onclick=()=>{play('click');pruneLobby();renderLobby();};
  $('#btnHint').onclick=()=>{
    if(!G.active||G.over)return;
    const best=A.findBestMove(A.toFen(G.st),'medium');
    if(best){G.hint={from:best.from,to:best.to};renderAll();setTimeout(()=>{G.hint=null;renderAll();},1800);}
  };
  $('#btnUndo').onclick=()=>{play('click');undo();};
  $('#btnFlip').onclick=()=>{play('click');G.flip=!G.flip;renderAll();};
  $('#btnDraw').onclick=()=>{play('click');drawOffer();};
  $('#btnResign').onclick=()=>{play('click');resign();};
  $('#btnAnalyze').onclick=()=>{play('click');openAnalysis();};
  $('#btnRematch').onclick=()=>{play('click');rematch();};
  $('#btnExit').onclick=()=>{play('click');exitGame();};
  $('#btnShare').onclick=()=>{play('click');shareRoom();};
  $('#btnCopy').onclick=()=>{play('click');copyCode();};
  $('#chatForm').onsubmit=e=>{e.preventDefault();const v=$('#chatInput').value;$('#chatInput').value='';sendChat(v);};
  $$('.tab').forEach(t=>{
    t.onclick=()=>{
      play('click');
      $$('.tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const m=t.dataset.tab==='moves';
      $('#paneMoves').classList.toggle('hidden',!m);
      $('#paneChat').classList.toggle('hidden',m);
    };
  });
  $$('#emoteBar button').forEach(b=>{
    b.onclick=()=>sendEmote(b.dataset.e);
  });
  $('#btnSaveSettings').onclick=()=>{
    SETTINGS.theme=$('#setTheme').value;
    SETTINGS.sound=$('#setSound').checked;
    SETTINGS.coords=$('#setCoords').checked;
    SETTINGS.legal=$('#setLegal').checked;
    SETTINGS.arrow=$('#setArrow').checked;
    SETTINGS.autoflip=$('#setAutoflip').checked;
    SETTINGS.showEval=$('#setEval').checked;
    saveSettings();applyTheme();
    if(G.active)renderAll();
    play('notify');toast('Settings saved');
  };
  $('#btnSaveProfile').onclick=()=>{
    const n=$('#inpProfileName').value.trim();
    if(n){Profile.name=n;}
    saveProfile();play('notify');toast('Profile saved');
  };
  $('#btnSound').onclick=()=>{
    SETTINGS.sound=!SETTINGS.sound;
    saveSettings();applyTheme();
    if(SETTINGS.sound)play('notify');
  };
  $('#btnFullscreen').onclick=toggleFullscreen;
  $('#anStart').onclick=()=>{AN.ply=0;renderAnalysis();};
  $('#anPrev').onclick=()=>{AN.ply=Math.max(0,AN.ply-1);renderAnalysis();};
  $('#anNext').onclick=()=>{AN.ply=Math.min(AN.fens.length-1,AN.ply+1);renderAnalysis();};
  $('#anEnd').onclick=()=>{AN.ply=AN.fens.length-1;renderAnalysis();};
  $('#anCopy').onclick=()=>{
    const pgn=A.movesToPgn(G.startFen,G.moves,{Event:'Aurelius',Result:G.result||'*'});
    navigator.clipboard.writeText(pgn).then(()=>toast('PGN copied')).catch(()=>toast('Copy failed'));
  };
  $('#btnPuzNext').onclick=()=>{play('click');PZ.idx++;loadPuzzle();};
  $('#btnPuzHint').onclick=()=>{
    const pz=PUZZLES[PZ.idx%PUZZLES.length];
    PZ.hint={from:pz.from,to:pz.to};renderPuz();
    setTimeout(()=>{PZ.hint=null;renderPuz();},1600);
  };
  window.addEventListener('resize',()=>{if(currentView==='analyze')drawGraph();});
  // Home stats
  $('#homeStats').innerHTML=`
    <div class="s"><b>${Profile.rating}</b><span>Rating</span></div>
    <div class="s"><b>${Profile.games}</b><span>Games</span></div>
    <div class="s"><b>${Profile.wins}</b><span>Wins</span></div>
    <div class="s"><b>${PZ.best}</b><span>Puzzle streak</span></div>`;
  renderRecent();
}

function readTC(){return parseTC($('#selTC').value);}

/* ============ INIT ============ */
function init(){
  applyTheme();wire();renderUserChip();loadPuzzle();
  initMQTT();
  // Room code in URL
  const m=location.search.match(/[?&]room=([A-Z0-9]{3,8})/i);
  if(m){
    const code=m[1].toUpperCase();
    setTimeout(()=>{
      if(Net.connected)joinRoom(code,'guest');
      else{toast('Connecting…');setTimeout(()=>joinRoom(code,'guest'),2000);}
    },400);
  }
  setTimeout(renderRecent,100);
  setInterval(pruneLobby,5000);
}

init();
})();
