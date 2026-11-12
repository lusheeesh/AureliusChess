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
  const cap
