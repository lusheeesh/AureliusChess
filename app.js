/* AURELIUS APP v3 — complete */
(function(){
'use strict';
const A = window.Aurelius;
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const GLYPH = {k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const FILES = 'abcdefgh';
const SID = Math.random().toString(36).slice(2,10);
const NS = 'http://www.w3.org/2000/svg';
const colorOf = p => (p && p === p.toUpperCase()) ? 'w' : 'b';

/* ============ TOAST ============ */
function toast(msg,type){
  const t=$('#toast');
  t.textContent=msg;
  t.className='toast show'+(type?' '+type:'');
  clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2400);
}

/* ============ SETTINGS ============ */
const DEF={theme:'gold',lightColor:'#ede0c4',darkColor:'#7a5c3a',sound:true,volume:0.85,music:false,emotePack:'basic',coords:true,legal:true,arrow:true,showEval:false,autoflip:true};
const SETTINGS=Object.assign({},DEF,JSON.parse(localStorage.getItem('aur.settings')||'{}'));
function saveSettings(){localStorage.setItem('aur.settings',JSON.stringify(SETTINGS));}

/* ============ SOUND (LOUD) ============ */
let _ac=null;
function getAC(){return _ac||(_ac=new (window.AudioContext||window.webkitAudioContext)());}
function beep(freq,dur,type='sine',vol=0.5,delay=0){
  try{
    const ac=getAC();
    const o=ac.createOscillator(),g=ac.createGain();
    o.type=type;o.frequency.value=freq;
    o.connect(g);g.connect(ac.destination);
    const t=ac.currentTime+delay;
    const v=Math.max(0.01,vol*SETTINGS.volume);
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(v,t+0.008);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.start(t);o.stop(t+dur+0.03);
  }catch(e){}
}
const SND={
  move:()=>beep(520,0.09,'triangle',0.55),
  capture:()=>{beep(280,0.11,'sawtooth',0.65);beep(180,0.13,'triangle',0.55,0.02);},
  castle:()=>{beep(450,0.08,'square',0.5);setTimeout(()=>beep(550,0.08,'square',0.5),70);},
  promote:()=>[523,659,784,1046].forEach((f,i)=>beep(f,0.13,'sine',0.55,i*60)),
  check:()=>{beep(880,0.13,'square',0.65);setTimeout(()=>beep(660,0.17,'square',0.65),130);},
  checkmate:()=>[400,500,600,800,1000].forEach((f,i)=>beep(f,0.17,'triangle',0.6,i*90)),
  victory:()=>[523,659,784,1046,1318].forEach((f,i)=>beep(f,0.22,'sine',0.6,i*80)),
  defeat:()=>[400,340,280,220].forEach((f,i)=>beep(f,0.26,'sine',0.55,i*100)),
  draw:()=>{beep(440,0.22,'sine',0.55);setTimeout(()=>beep(440,0.22,'sine',0.55),260);},
  click:()=>beep(700,0.035,'square',0.35),
  illegal:()=>beep(140,0.15,'sawtooth',0.6),
  notify:()=>{beep(880,0.09,'sine',0.5);setTimeout(()=>beep(1100,0.11,'sine',0.5),80);},
  emote:()=>beep(1000,0.06,'sine',0.45),
  level:()=>[523,659,784,1046,1318,1568].forEach((f,i)=>beep(f,0.24,'sine',0.6,i*90)),
  music:()=>{},
};
function play(n){ if(SETTINGS.sound&&SND[n]) SND[n](); }

/* ============ MUSIC ============ */
let musicTimer=null, musicIdx=0;
const MUSIC_NOTES=[261.63,329.63,392.00,523.25,392.00,329.63,261.63,196.00,220.00,261.63,329.63,261.63];
function startMusic(){
  if(musicTimer)return;
  const tick=()=>{
    if(!SETTINGS.music){musicTimer=null;return;}
    try{
      const ac=getAC();
      const o=ac.createOscillator(),g=ac.createGain();
      o.type='sine';
      o.frequency.value=MUSIC_NOTES[musicIdx%MUSIC_NOTES.length];
      musicIdx++;
      o.connect(g);g.connect(ac.destination);
      const t=ac.currentTime;
      const v=0.06*SETTINGS.volume;
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(v,t+0.08);
      g.gain.exponentialRampToValueAtTime(0.001,t+1.3);
      o.start(t);o.stop(t+1.35);
    }catch(e){}
    musicTimer=setTimeout(tick,1200);
  };
  tick();
}
function stopMusic(){ if(musicTimer){clearTimeout(musicTimer);musicTimer=null;} }

/* ============ PROFILE ============ */
const AVATARS=['♞','♜','♝','♛','♚','♟','🦁','🐺','🦅','🐉','🦊','🐯','👑','🎭','⚔️','🗡️','🎯','🔥','🐱','👽','🏆','⚡','🗽','🐭'];
const DEF_PROFILE={id:SID,name:'Guest'+Math.floor(1000+Math.random()*9000),avatar:'♞',rating:1200,wins:0,losses:0,draws:0,games:0,xp:0,winStreak:0,dailyStreak:0,lastDaily:'',achievements:{},flags:{},history:[]};
const Profile=Object.assign({},DEF_PROFILE,JSON.parse(localStorage.getItem('aur.profile')||'{}'));
function saveProfile(){localStorage.setItem('aur.profile',JSON.stringify(Profile));renderUserChip();}

/* ============ RANKS ============ */
const RANKS=[
  {name:'Bronze',min:0,color:'#cd7f32'},{name:'Silver',min:500,color:'#c0c0c0'},
  {name:'Gold',min:1500,color:'#ffd700'},{name:'Platinum',min:3000,color:'#e5e4e2'},
  {name:'Diamond',min:5000,color:'#b9f2ff'},{name:'Master',min:8000,color:'#a335ee'},
  {name:'Grandmaster',min:12000,color:'#ff4d4d'},
];
function rankInfo(xp){
  let r=RANKS[0], next=RANKS[1];
  for(let i=0;i<RANKS.length;i++){if(xp>=RANKS[i].min){r=RANKS[i];next=RANKS[i+1]||null;}}
  const span=next?(next.min-r.min):1;
  const into=xp-r.min;
  const tier=into<span/3?'III':into<span*2/3?'II':'I';
  const pct=next?Math.min(100,(into/span)*100):100;
  return {rank:r.name,color:r.color,tier,pct,xp,next:next?next.min:null};
}

/* ============ ACHIEVEMENTS ============ */
const ACHIEVEMENTS=[
  {id:'first_win',name:'First Victory',desc:'Win your first game',icon:'🏆'},
  {id:'first_mate',name:'Checkmate!',desc:'Deliver a checkmate',icon:'♛'},
  {id:'first_castle',name:'Fortified',desc:'Castle in a game',icon:'🏰'},
  {id:'games_5',name:'Regular',desc:'Play 5 games',icon:'🎮'},
  {id:'wins_10',name:'Winner',desc:'Win 10 games',icon:'🥇'},
  {id:'streak_3',name:'On Fire',desc:'Win 3 in a row',icon:'🔥'},
  {id:'beat_medium',name:'Above Average',desc:'Beat Isabel or higher',icon:'⚔️'},
  {id:'beat_hikaru',name:'Grandmaster',desc:'Beat Hikaru or Magnus',icon:'👑'},
  {id:'puzzle_5',name:'Solver',desc:'Solve 5 puzzles',icon:'🧩'},
  {id:'puzzle_best_10',name:'Tactician',desc:'Puzzle streak of 10',icon:'🎯'},
  {id:'daily_1',name:'Daily Habit',desc:'Solve a daily puzzle',icon:'📅'},
  {id:'daily_3',name:'Consistent',desc:'Solve 3 daily puzzles',icon:'📆'},
];
function hasFlag(k){return !!Profile.flags[k];}
function setFlag(k){Profile.flags[k]=true;saveProfile();}
function checkAchievements(){
  const newly=[];
  for(const a of ACHIEVEMENTS){
    if(Profile.achievements[a.id])continue;
    let un=false;
    switch(a.id){
      case 'first_win': un=Profile.wins>=1;break;
      case 'first_mate': un=hasFlag('delivered_mate');break;
      case 'first_castle': un=hasFlag('castled');break;
      case 'games_5': un=Profile.games>=5;break;
      case 'wins_10': un=Profile.wins>=10;break;
      case 'streak_3': un=Profile.winStreak>=3;break;
      case 'beat_medium': un=hasFlag('beat_medium');break;
      case 'beat_hikaru': un=hasFlag('beat_hikaru');break;
      case 'puzzle_5': un=(PZ.streak>=5)||(PZ.best>=5);break;
      case 'puzzle_best_10': un=PZ.best>=10;break;
      case 'daily_1': un=Profile.dailyStreak>=1;break;
      case 'daily_3': un=Profile.dailyStreak>=3;break;
    }
    if(un){Profile.achievements[a.id]=true;newly.push(a);}
  }
  if(newly.length){
    saveProfile();
    newly.forEach((a,i)=>setTimeout(()=>showAchPop(a),i*600));
    play('level');
  }
}
function showAchPop(a){
  const el=document.createElement('div');
  el.className='ach-pop';
  el.innerHTML=`<div class="ae">${a.icon}</div><div class="at"><b>${a.name}</b><span>${a.desc}</span></div>`;
  document.body.appendChild(el);
  setTimeout(()=>{el.style.transition='.4s';el.style.transform='translateX(120%)';el.style.opacity='0';},3800);
  setTimeout(()=>el.remove(),4400);
}
function awardXP(n){
  const oldRank=rankInfo(Profile.xp).rank;
  Profile.xp=(Profile.xp||0)+n;
  saveProfile();
  const newRank=rankInfo(Profile.xp).rank;
  if(newRank!==oldRank){
    setTimeout(()=>{play('level');toast('Rank up: '+newRank+'!');},400);
  }
}

/* ============ MQTT ============ */
let client=null;
const Net={topic:null,room:null,role:null,connected:false,spectators:0,host:null,opponent:null};
const lobbyRooms=new Map();
const activeSubs=new Set();

function initMQTT(){
  if(typeof mqtt==='undefined')return;
  try{
    client=mqtt.connect('wss://broker.emqx.io:8084/mqtt',{clientId:'aur_'+SID,clean:true,reconnectPeriod:3000,connectTimeout:8000,keepalive:30});
    client.on('connect',()=>{
      Net.connected=true;
      const el=$('#netStatus');if(el)el.classList.add('on');
      subLobby();
      activeSubs.forEach(t=>client.subscribe(t,{qos:0}));
    });
    client.on('close',()=>{Net.connected=false;const el=$('#netStatus');if(el)el.classList.remove('on');});
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
function subTopic(t){if(client&&Net.connected&&!activeSubs.has(t)){client.subscribe(t,{qos:0});activeSubs.add(t);}}
function unsubTopic(t){if(client){client.unsubscribe(t);activeSubs.delete(t);}}
function pubRoom(m){if(Net.topic&&client&&Net.connected)client.publish(Net.topic,JSON.stringify({...m,sid:SID}));}
function pubLobby(m){if(client&&Net.connected)client.publish('aurelius/lobby/v1',JSON.stringify({...m,sid:SID}));}
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
  if(v==='editor')renderEditor();
}
document.addEventListener('click',e=>{
  const n=e.target.closest('[data-view]');
  if(n&&!e.target.closest('#board')&&!e.target.closest('#puzBoard')&&!e.target.closest('#editBoard')){
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
  const premove=opt.premove;
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
      if(premove&&idx===premove.from)cls+=' premove-from';
      if(premove&&idx===premove.to)cls+=' premove-to';
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

/* ============ ARROWS ============ */
function renderArrows(svg,arrows,flip,last){
  svg.querySelectorAll('line').forEach(l=>l.remove());
  if(!svg)return;
  if(last&&SETTINGS.arrow){
    addArrow(svg,last.from,last.to,flip,'rgba(212,175,55,.75)','arrowhead');
  }
  for(const a of arrows||[]){
    addArrow(svg,a.from,a.to,flip,a.color||'rgba(255,120,120,.85)','arrowhead');
  }
}
function addArrow(svg,from,to,flip,color,marker){
  if(from==null||to==null)return;
  const f=i=>flip?7-(i%8):(i%8);
  const r=i=>flip?7-Math.floor(i/8):Math.floor(i/8);
  const x1=f(from)+0.5,y1=r(from)+0.5,x2=f(to)+0.5,y2=r(to)+0.5;
  const ln=document.createElementNS(NS,'line');
  ln.setAttribute('x1',x1);ln.setAttribute('y1',y1);
  ln.setAttribute('x2',x2);ln.setAttribute('y2',y2);
  ln.setAttribute('stroke',color);
  ln.setAttribute('stroke-width','0.12');
  ln.setAttribute('stroke-linecap','round');
  ln.setAttribute('marker-end',`url(#${marker})`);
  svg.appendChild(ln);
}
function addCircle(svg,idx,flip,color){
  const f=flip?7-(idx%8):(idx%8);
  const r=flip?7-Math.floor(idx/8):Math.floor(idx/8);
  const c=document.createElementNS(NS,'circle');
  c.setAttribute('cx',f+0.5);
  c.setAttribute('cy',r+0.5);
  c.setAttribute('r','0.45');
  c.setAttribute('fill','none');
  c.setAttribute('stroke',color||'rgba(255,120,120,.85)');
  c.setAttribute('stroke-width','0.1');
  svg.appendChild(c);
}

/* ============ GAME ============ */
const G={
  active:false,mode:null,st:null,startFen:A.START_FEN,
  moves:[],sans:[],fens:[],keys:[],
  last:null,flip:false,myColor:null,over:false,result:null,reason:'',
  room:null,level:'medium',bot:null,
  clock:null,clockTimer:null,
  selected:-1,legal:[],pending:null,hint:null,
  players:{w:{name:'White',rating:'',avatar:'♔'},b:{name:'Black',rating:'',avatar:'♚'}},
  rated:false,opponentRating:1200,
  premove:null,
  arrows:[],
  arrowMode:false,
};

function parseTC(s){const[a,b]=(s||'0|0').split('|').map(Number);return{base:a||0,inc:b||0};}
function tcLabel(tc){if(!tc.base)return'Casual';return Math.round(tc.base/60000)+'+'+Math.round(tc.inc/1000);}

function startGame(o){
  cleanupGame();
  G.active=true;G.mode=o.mode;G.startFen=o.fen||A.START_FEN;
  G.st=A.parseFen(G.startFen);
  G.moves=[];G.sans=[];G.fens=[A.toFen(G.st)];G.keys=[A.posKey(G.st)];
  G.last=null;G.selected=-1;G.legal=[];G.over=false;G.result=null;G.reason='';
  G.pending=null;G.hint=null;G.myColor=o.myColor||null;G.level=o.level||'medium';
  G.bot=o.bot||null;
  G.players=o.players||{w:{name:'White',rating:'',avatar:'♔'},b:{name:'Black',rating:'',avatar:'♚'}};
  G.rated=!!o.rated;G.room=o.room||null;
  G.opponentRating=o.opponentRating||1200;
  G.premove=null;G.arrows=[];
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
  document.body.classList.remove('focus-mode');
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
function startClock(){if(G.clockTimer)clearInterval(G.clockTimer);G.clockTimer=setInterval(tick,100);}
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

function renderAll(){
  if(!G.active)return;
  const rep=countRep();
  const checkIdx=A.inCheck(G.st,G.st.turn)?findKing(G.st,G.st.turn):-1;
  renderBoardInto($('#board'),G.st,{
    flip:G.flip,selected:G.selected,legal:G.legal,last:G.last,
    check:checkIdx,hintFrom:G.hint&&G.hint.from,hintTo:G.hint&&G.hint.to,
    premove:G.premove
  });
  renderArrows($('#arrowLayer'),G.arrows,G.flip,G.last);
  renderPlayers();renderMoves();renderStatus(rep);renderClocks();renderEval();
  $('#btnAnalyze').disabled=!G.over;
  $('#btnUndo').disabled=G.mode==='online'||G.mode==='spectate';
  $('#btnHint').disabled=G.over||G.mode==='spectate';
  $('#btnArrow').classList.toggle('on',G.arrowMode);
  $('#emoteBar').style.display=G.mode==='spectate'?'none':'flex';
  $('#spectatorBadge').classList.toggle('hidden',!(G.mode==='spectate'||Net.role==='host'));
  if(G.mode==='spectate'||Net.role==='host'){
    $('#spectatorBadge').textContent='👁 '+Net.spectators;
  }
}
function findKing(st,c){
  for(let i=0;i<64;i++){const p=st.board[i];if(p&&p.toLowerCase()==='k'&&(p===p.toUpperCase()?'w':'b')===c)return i;}
  return-1;
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
function renderStatus(){
  const el=$('#statusLine');
  if(G.over){el.textContent=resText(G.result)+' — '+G.reason;return;}
  const side=G.st.turn==='w'?'White':'Black';
  let txt=side+' to move';
  if(A.inCheck(G.st,G.st.turn))txt+=' — check!';
  if(G.mode==='ai'&&G.st.turn!=='w'&&G.myColor==='w')txt='Aurelius is thinking…';
  if(G.mode==='online'&&G.myColor&&G.st.turn!==G.myColor)txt+=' (opponent)';
  if(G.mode==='spectate')txt='Spectating — '+side+' to move';
  const opening=A.openingName(G.sans);
  if(opening)txt+=' · '+opening;
  if(G.premove&&G.premove.to&&G.mode==='online')txt+=' · premove set';
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

/* ============ INTERACTION: drag + click + arrows ============ */
let drag=null;
function getSquareFromPoint(cx,cy){
  const b=$('#board');if(!b)return null;
  const r=b.getBoundingClientRect();
  if(cx<r.left||cx>r.right||cy<r.top||cy>r.bottom)return null;
  const vf=Math.floor((cx-r.left)/r.width*8);
  const vr=Math.floor((cy-r.top)/r.height*8);
  const f=G.flip?7-vf:vf;
  const rk=G.flip?7-vr:vr;
  return rk*8+f;
}
function onPointerDown(e){
  if(!G.active||G.over)return;
  if(e.target.closest('#btnFocusExit'))return;
  const sqEl=e.target.closest('.sq');
  if(!sqEl)return;
  const i=+sqEl.dataset.i;

  // arrow mode: draw arrow
  if(G.arrowMode){
    drag={kind:'arrow',from:i,startX:e.clientX,startY:e.clientY};
    document.addEventListener('pointermove',onPointerMove,{passive:false});
    document.addEventListener('pointerup',onPointerUp);
    return;
  }

  // premove or drag
  const p=G.st.board[i];
  const myTurn=!G.myColor||G.st.turn===G.myColor;
  const canDrag=myTurn&&p&&colorOf(p)===G.st.turn;
  const canPremove=!myTurn&&G.mode==='online'&&p&&colorOf(p)===G.myColor;
  if(canDrag||canPremove){
    drag={kind:'piece',from:i,startX:e.clientX,e.clientY:e.clientY,piece:p,ghost:null,moved:false,premove:canPremove};
    document.addEventListener('pointermove',onPointerMove,{passive:false});
    document.addEventListener('pointerup',onPointerUp);
  } else {
    // tap empty square or enemy piece — quick tap
    drag={kind:'tap',from:i};
  }
}
function onPointerMove(e){
  if(!drag)return;
  if(drag.kind==='piece'){
    const dx=Math.abs(e.clientX-drag.startX),dy=Math.abs(e.clientY-drag.startY);
    if(!drag.moved&&(dx>6||dy>6)){
      drag.moved=true;
      if(drag.piece)createGhost(drag.piece,e.clientX,e.clientY);
    }
    if(drag.moved){
      e.preventDefault();
      updateGhost(e.clientX,e.clientY);
      highlightDrop(e.clientX,e.clientY);
    }
  } else if(drag.kind==='arrow'){
    const dx=Math.abs(e.clientX-drag.startX),dy=Math.abs(e.clientY-drag.startY);
    if(dx>6||dy>6)drag.moved=true;
  }
}
function onPointerUp(e){
  document.removeEventListener('pointermove',onPointerMove);
  document.removeEventListener('pointerup',onPointerUp);
  if(!drag){return;}
  const d=drag;drag=null;

  if(d.kind==='arrow'){
    const to=getSquareFromPoint(e.clientX,e.clientY);
    if(to!=null&&to!==d.from){
      const existing=G.arrows.findIndex(a=>a.from===d.from&&a.to===to);
      if(existing>=0)G.arrows.splice(existing,1);
      else G.arrows.push({from:d.from,to});
    } else if(to===d.from){
      // tap = marker circle
      const circle=document.createElementNS(NS,'circle');
      const f=G.flip?7-(d.from%8):(d.from%8);
      const r=G.flip?7-Math.floor(d.from/8):Math.floor(d.from/8);
      circle.setAttribute('cx',f+0.5);circle.setAttribute('cy',r+0.5);
      circle.setAttribute('r','0.45');circle.setAttribute('fill','none');
      circle.setAttribute('stroke','rgba(255,120,120,.85)');
      circle.setAttribute('stroke-width','0.1');
      $('#arrowLayer').appendChild(circle);
    }
    renderArrows($('#arrowLayer'),G.arrows,G.flip,G.last);
    return;
  }

  if(d.kind==='piece'){
    clearGhost();clearDropHighlight();
    if(d.moved){
      const to=getSquareFromPoint(e.clientX,e.clientY);
      if(to!=null&&to!==d.from){
        if(d.premove)setPremove(d.from,to);
        else attemptMove(d.from,to);
      }
    } else {
      // treat as tap
      handleTap(d.from);
    }
    return;
  }

  if(d.kind==='tap'){
    handleTap(d.from);
  }
}
function createGhost(piece,cx,cy){
  const el=document.createElement('div');
  el.className='drag-ghost';
  el.textContent=GLYPH[piece.toLowerCase()];
  const color=piece===piece.toUpperCase()?'w':'b';
  el.style.color=color==='w'?'#fdfaf2':'#1a1d28';
  el.style.fontSize=getComputedStyle($('.sq .pc')).fontSize||'40px';
  document.body.appendChild(el);
  drag.ghost=el;
  updateGhost(cx,cy);
  const orig=$(`.sq[data-i="${drag.from}"] .pc`);
  if(orig)orig.classList.add('dragging');
}
function updateGhost(cx,cy){
  if(!drag||!drag.ghost)return;
  drag.ghost.style.left=cx+'px';
  drag.ghost.style.top=cy+'px';
}
function highlightDrop(cx,cy){
  $$('.sq.drop-target').forEach(s=>s.classList.remove('drop-target'));
  const sq=getSquareFromPoint(cx,cy);
  if(sq!=null){
    const el=$(`.sq[data-i="${sq}"]`);
    if(el)el.classList.add('drop-target');
  }
}
function clearDropHighlight(){$$('.sq.drop-target').forEach(s=>s.classList.remove('drop-target'));}
function clearGhost(){
  if(drag&&drag.ghost){drag.ghost.remove();drag.ghost=null;}
  $$('.sq .pc.dragging').forEach(p=>p.classList.remove('dragging'));
}

function attemptMove(from,to){
  if(!G.active||G.over)return false;
  if(G.mode==='spectate')return false;
  if(G.myColor&&G.st.turn!==G.myColor)return false;
  if(G.mode==='ai'&&G.st.turn!=='w'&&G.myColor==='w')return false;
  const legal=A.legalMoves(G.st);
  const promos=legal.filter(m=>m.from===from&&m.to===to&&m.promo);
  if(promos.length){
    G.pending={from,to};
    // if only one promo option (no pawn promo), we wouldn't be here
    showPromo(to);
    return true;
  }
  const m=legal.find(x=>x.from===from&&x.to===to);
  if(!m){play('illegal');return false;}
  return commit(m.from,m.to,null);
}

function handleTap(i){
  if(!G.active||G.over)return;
  if(G.mode==='spectate')return;
  const myTurn=!G.myColor||G.st.turn===G.myColor;
  if(!myTurn){
    // premove selection
    if(G.mode==='online'){
      const p=G.st.board[i];
      if(G.premove&&G.premove.from!=null&&G.premove.to==null){
        setPremove(G.premove.from,i);
      } else if(p&&colorOf(p)===G.myColor){
        G.premove={from:i,to:null};
        renderAll();
      }
    }
    return;
  }
  if(G.selected>=0){
    const mv=G.legal.find(m=>m.to===i);
    if(mv){attemptMove(G.selected,i);return;}
  }
  const p=G.st.board[i];
  if(p&&colorOf(p)===G.st.turn){
    G.selected=i;G.legal=A.legalMoves(G.st).filter(m=>m.from===i);
    play('click');
  } else {
    G.selected=-1;G.legal=[];
  }
  renderAll();
}

function setPremove(from,to){
  const p=G.st.board[from];
  if(!p||colorOf(p)!==G.myColor){return;}
  G.premove={from,to};
  renderAll();
  toast('Premove set');
}

function tryExecutePremove(){
  if(!G.premove||G.premove.to==null)return false;
  if(G.st.turn!==G.myColor)return false;
  const legal=A.legalMoves(G.st);
  const mv=legal.find(m=>m.from===G.premove.from&&m.to===G.premove.to);
  const pre=G.premove;
  G.premove=null;
  if(mv){
    if(mv.promo)commit(mv.from,mv.to,mv.promo);
    else commit(mv.from,mv.to,null);
    return true;
  }
  // clear invalid premove
  renderAll();
  return false;
}

function showPromo(to){
  const box=$('#promo');
  box.innerHTML=`<div class="promo-box">${['q','r','b','n'].map(t=>`<button data-p="${t}">${GLYPH[t]}</button>`).join('')}</div>`;
  box.classList.remove('hidden');
  box.querySelectorAll('button').forEach(x=>{
    x.onclick=()=>{box.classList.add('hidden');if(G.pending)commit(G.pending.from,G.pending.to,x.dataset.p);};
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
  const isCastle=!!m.castle;
  A.makeMove(G.st,m);
  G.moves.push({from,to,promo:m.promo||null});
  G.sans.push(san);G.fens.push(A.toFen(G.st));G.keys.push(A.posKey(G.st));
  G.last={from,to};G.selected=-1;G.legal=[];G.pending=null;G.hint=null;
  if(isCastle)setFlag('castled');
  if(G.clock)clockAfter(mover);
  if(san.includes('#')){play('checkmate');setFlag('delivered_mate');}
  else if(san.includes('+'))play('check');
  else if(isCastle)play('castle');
  else if(m.promo)play('promote');
  else if(capture)play('capture');
  else play('move');
  $('#promo').classList.add('hidden');
  const rep=countRep();
  const stt=A.status(G.st,rep);
  if(stt.over){
    endGame(stt.result,stt.reason);
  } else {
    if(G.mode==='local'&&SETTINGS.autoflip)G.flip=G.st.turn==='b';
    renderAll();
    if(G.mode==='ai'&&G.st.turn!=='w')setTimeout(maybeAI,120);
    if(G.mode==='online'){broadcastState();if(tryExecutePremove()){}}
  }
  return true;
}

function maybeAI(){
  if(!G.active||G.over||G.mode!=='ai')return;
  if(G.myColor==='w'&&G.st.turn!=='b')return;
  const opts=G.bot||G.level;
  const best=A.findBestMoveV2(A.toFen(G.st),opts);
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

  // King fall animation
  const loserColor=result==='1-0'?'b':result==='0-1'?'w':null;
  if(loserColor){
    const idx=findKing(G.st,loserColor);
    const el=$(`.sq[data-i="${idx}"] .pc`);
    if(el)el.classList.add('king-fall');
  }

  let title=resText(result);
  if(G.myColor)title=result==='1/2-1/2'?'Draw':(iWon?'You won!':'You lost');

  // Rating + XP (only if not spectator)
  if(G.myColor){
    const oldR=Profile.rating;
    const oppR=G.opponentRating||1200;
    let score=iWon===true?1:iWon===false?0:0.5;
    const ea=1/(1+Math.pow(10,(oppR-oldR)/400));
    const k=Profile.games<30?40:20;
    Profile.rating=Math.round(oldR+k*(score-ea));
    Profile.games++;
    if(iWon===true){Profile.wins++;Profile.winStreak=(Profile.winStreak||0)+1;awardXP(50);}
    else if(iWon===false){Profile.losses++;Profile.winStreak=0;awardXP(10);}
    else{Profile.draws++;awardXP(20);}
    // achievements flags
    if(G.bot){
      const oppElo=G.bot.elo||0;
      if(iWon&&oppElo>=1600)setFlag('beat_medium');
      if(iWon&&oppElo>=2800)setFlag('beat_hikaru');
    }
    Profile.history.unshift({opp:G.players[G.myColor==='w'?'b':'w'].name,result:score===1?'win':score===0?'loss':'draw',rating:Profile.rating,ts:Date.now()});
    Profile.history=Profile.history.slice(0,20);
    saveProfile();
    checkAchievements();
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
    P.push({x:innerWidth/2+(Math.random()-.5)*200,y:innerHeight/2,vx:(Math.random()-.5)*12,vy:-Math.random()*14-4,w:Math.random()*8+4,h:Math.random()*6+3,c:colors[Math.floor(Math.random()*colors.length)],r:Math.random()*Math.PI,a:Math.random()*Math.PI,vr:(Math.random()-.5)*.3,va:0});
  }
  let t=0;
  function frame(){
    ctx.clearRect(0,0,innerWidth,innerHeight);
    P.forEach(p=>{
      p.x+=p.vx;p.y+=p.vy;p.vy+=.35;p.r+=p.vr;
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
const EMOTE_PACKS={
  basic:['👋','👍','😎','😂','😮','🔥','😭','🤝'],
  royal:['👑','🏆','⚔️','🛡️','♛','♚','✦','💎'],
  meme:['🤡','💀','🤣','🫠','🗿','👁️','🥶','🔥'],
  animals:['🐱','🐭','🦊','🐺','🦅','🐉','🦁','🐯'],
};
function buildEmoteBar(){
  const bar=$('#emoteBar');
  const pack=EMOTE_PACKS[SETTINGS.emotePack]||EMOTE_PACKS.basic;
  bar.innerHTML=pack.map(e=>`<button data-e="${e}">${e}</button>`).join('');
  bar.querySelectorAll('button').forEach(b=>{
    b.onclick=()=>sendEmote(b.dataset.e);
  });
}
function sendEmote(emoji){
  if(!G.active)return;
  play('emote');
  showEmote(emoji);
  if(G.mode==='online')pubRoom({t:'emote',emoji,name:Profile.name});
}
function showEmote(emoji){
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
  G.selected=-1;G.legal=[];G.premove=null;
  $('#boardOver').classList.add('hidden');
  if(G.clock)G.clock.active=G.st.turn;
  renderAll();
}
function resign(){
  if(!G.active||G.over)return;
  if(!confirm('Resign this game?'))return;
  const loser=G.myColor||(G.st.turn==='w'?'b':'w');
  endGame(loser==='w'?'0-1':'1-0','resignation');
  if(G.mode==='online')pubRoom({t:'resign',result:loser==='w'?'0-1':'1-0'});
}
function drawOffer(){
  if(!G.active||G.over)return;
  if(G.mode==='online'){
    pubRoom({t:'draw',action:'offer',name:Profile.name});
    toast('Draw offer sent');return;
  }
  if(confirm('Agree to a draw?'))endGame('1/2-1/2','agreement');
}
function rematch(){
  if(G.mode==='online'&&Net.topic){
    pubRoom({t:'rematch',name:Profile.name});
    toast('Rematch requested');return;
  }
  if(G.mode==='ai'&&G.bot){
    startGame({mode:'ai',bot:G.bot,myColor:'w',tc:G.clock?{base:G.clock.base,inc:G.clock.inc}:{base:0,inc:0},
      players:{w:{name:Profile.name,rating:Profile.rating,avatar:Profile.avatar},b:{name:G.bot.name,rating:G.bot.elo,avatar:G.bot.emoji}},opponentRating:G.bot.elo});
    return;
  }
  startGame({mode:G.mode,level:G.level,rated:G.rated,tc:G.clock?{base:G.clock.base,inc:G.clock.inc}:{base:0,inc:0},players:G.players,myColor:G.myColor});
}
function exitGame(){cleanupGame();document.body.classList.remove('focus-mode');switchView('home');}

/* ============ ONLINE ============ */
function genCode(){
  const C='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s='';for(let i=0;i<5;i++)s+=C[Math.floor(Math.random()*C.length)];
  return s;
}
function hostRoom(){
  if(!Net.connected){toast('Connecting…');return;}
  const code=genCode();
  const tc=parseTC($('#selTC').value);
  const rated=$('#chkRated').checked;
  Net.topic='aurelius/room/'+code;Net.room=code;Net.role='host';Net.spectators=0;
  subTopic(Net.topic);
  startGame({mode:'online',myColor:'w',room:{code},rated,tc,
    players:{w:{name:Profile.name,rating:Profile.rating,avatar:Profile.avatar},b:{name:'Waiting…',rating:'',avatar:'♚'}},
    onStart:()=>{setTimeout(()=>broadcastState(),300);startHostAnnounce(code,tc);toast('Room '+code+' created');}
  });
  saveRecent(code);
}
let announceTimer=null;
function startHostAnnounce(code,tc){
  stopHosting();
  const send=()=>{
    pubLobby({t:'room',code,host:Profile.name,hostRating:Profile.rating,tc:tcLabel(tc),rated:G.rated,status:G.players.b.name!=='Waiting…'?'playing':'waiting',spectators:Net.spectators,ts:Date.now()});
  };
  send();
  announceTimer=setInterval(send,6000);
}
function stopHosting(){if(announceTimer){clearInterval(announceTimer);announceTimer=null;}}

function joinRoom(code,role){
  code=(code||'').toUpperCase().trim();
  if(!code){toast('Enter a room code');return;}
  if(!Net.connected){toast('Connecting…');setTimeout(()=>joinRoom(code,role),1500);return;}
  if(Net.topic)cleanupGame();
  Net.topic='aurelius/room/'+code;Net.room=code;Net.role=role||'guest';Net.spectators=0;
  subTopic(Net.topic);
  const myRole=role==='spectate'?'spectator':'guest';
  startGame({
    mode:role==='spectate'?'spectate':'online',
    myColor:null,room:{code},
    players:{w:{name:'—',rating:'',avatar:'♔'},b:{name:'—',rating:'',avatar:'♚'}},
    onStart:()=>{
      toast(role==='spectate'?'Watching room '+code:'Joining room '+code+'…');
      setTimeout(()=>pubRoom({t:'hello',role:myRole,name:Profile.name,rating:Profile.rating,avatar:Profile.avatar,sid:SID}),200);
    }
  });
  saveRecent(code);
}

function onPeerHello(msg){
  if(Net.role==='host'){
    if(msg.role==='guest'&&G.players.b.name==='Waiting…'){
      G.players.b={name:msg.name,rating:msg.rating,avatar:msg.avatar||'♚'};
      G.opponentRating=msg.rating||1200;
      G.myColor='w';
      broadcastState();renderAll();
      play('notify');toast(msg.name+' joined!');
      startHostAnnounce(Net.room,{base:G.clock?G.clock.base:0,inc:G.clock?G.clock.inc:0});
    } else if(msg.role==='spectator'){
      Net.spectators++;
      broadcastState();
      renderAll();
    }
  } else if(Net.role==='guest'){
    if(msg.role==='host'){
      // host announcing itself
    }
  }
}

function broadcastState(){
  if(!G.active)return;
  pubRoom({
    t:'state',fen:A.toFen(G.st),moves:G.moves,last:G.last,turn:G.st.turn,
    players:G.players,status:G.over?'finished':'playing',result:G.result,reason:G.reason,
    clock:G.clock?{base:G.clock.base,inc:G.clock.inc,w:clockRem('w'),b:clockRem('b'),active:G.clock.active}:null,
    rated:G.rated,host:Profile.name,hostAvatar:Profile.avatar,spectators:Net.spectators
  });
}

function onPeerState(msg){
  if(Net.role==='host')return;
  G.st=A.parseFen(msg.fen);
  G.moves=msg.moves||[];
  const replay=replayMoves(G.startFen,G.moves);
  G.sans=replay.sans;G.fens=replay.fens;G.keys=replay.keys;
  G.last=msg.last||null;G.selected=-1;G.legal=[];
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
  } else if(msg.clock&&G.clock){
    G.clock.w=msg.clock.w;G.clock.b=msg.clock.b;
    G.clock.active=msg.clock.active;G.clock.last=Date.now();
  }
  if(msg.status==='finished'&&!G.over){endGame(msg.result||'1/2-1/2',msg.reason||'game over');return;}
  renderAll();
  if(G.myColor&&G.st.turn===G.myColor)tryExecutePremove();
}

function onPeerResign(msg){if(Net.role==='host')return;if(!G.over)endGame(msg.result||(G.myColor==='w'?'0-1':'1-0'),'resignation');}
function onPeerDraw(msg){
  if(msg.action==='offer'){
    if(confirm(msg.name+' offers a draw. Accept?')){
      pubRoom({t:'draw',action:'accept'});
      endGame('1/2-1/2','agreement');
    } else pubRoom({t:'draw',action:'decline'});
  } else if(msg.action==='accept'){if(!G.over)endGame('1/2-1/2','agreement');}
  else if(msg.action==='decline'){toast(msg.name+' declined draw');}
}
function onPeerRematch(msg){
  if(Net.role==='host'){
    if(confirm(msg.name+' wants a rematch. Accept?')){
      pubRoom({t:'rematch',name:Profile.name,go:true});
      resetForRematch();
    }
  } else if(msg.go)resetForRematch();
  else toast('Rematch requested');
}
function resetForRematch(){
  G.st=A.parseFen(G.startFen);
  G.moves=[];G.sans=[];G.fens=[A.toFen(G.st)];G.keys=[A.posKey(G.st)];
  G.last=null;G.selected=-1;G.legal=[];G.over=false;G.result=null;G.reason='';G.premove=null;G.arrows=[];
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
    case 'emote':showEmote(msg.emoji);break;
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
  const r=JSON.parse(localStorage.getItem('aur.recent')||'[]').filter(x=>Date.now()-x.ts<604800000);
  const el=$('#recentRooms');
  if(!el)return;
  if(!r.length){el.classList.add('hidden');return;}
  el.classList.remove('hidden');
  el.innerHTML='<div class="rr-label">Recent rooms</div>'+r.map(x=>`<div class="rr-item" data-r="${x.code}"><span class="rr-code">${x.code}</span><span>Tap to rejoin</span></div>`).join('');
  el.querySelectorAll('[data-r]').forEach(x=>{x.onclick=()=>{play('click');joinRoom(x.dataset.r,'guest');};});
}

/* ============ PROFILE UI ============ */
function renderUserChip(){
  const n=$('#ucName'),r=$('#ucRating'),a=$('#ucAvatar');
  if(n)n.textContent=Profile.name;
  if(r)r.textContent=Profile.rating;
  if(a)a.textContent=Profile.avatar;
}
function renderProfile(){
  const rk=rankInfo(Profile.xp||0);
  $('#profName').textContent=Profile.name;
  $('#profRating').textContent='Rating '+Profile.rating;
  $('#profAvatar').textContent=Profile.avatar;
  $('#profRank').textContent=rk.rank+' '+rk.tier;
  $('#profRank').style.color=rk.color;
  $('#xpFill').style.width=rk.pct+'%';
  $('#xpLabel').textContent=(Profile.xp||0)+' XP'+(rk.next?' · '+(rk.next-Profile.xp)+' to next':' · MAX');
  $('#xpRank').textContent=rk.rank+' '+rk.tier;
  $('#statGames').textContent=Profile.games;
  $('#statWins').textContent=Profile.wins;
  $('#statDraws').textContent=Profile.draws;
  $('#statLosses').textContent=Profile.losses;
  $('#statWinRate').textContent=Profile.games?Math.round((Profile.wins/Profile.games)*100)+'%':'0%';
  $('#inpProfileName').value=Profile.name;

  const grid=$('#avatarGrid');
  if(grid){
    grid.innerHTML=AVATARS.map(a=>`<button data-a="${a}" class="${a===Profile.avatar?'active':''}">${a}</button>`).join('');
    grid.querySelectorAll('button').forEach(b=>{
      b.onclick=()=>{play('click');Profile.avatar=b.dataset.a;saveProfile();renderProfile();};
    });
  }

  const ac=$('#achGrid');
  if(ac){
    ac.innerHTML=ACHIEVEMENTS.map(a=>{
      const earned=!!Profile.achievements[a.id];
      return `<div class="ach ${earned?'earned':'locked'}"><div class="ae">${a.icon}</div><div class="an">${a.name}</div><div class="ad">${a.desc}</div></div>`;
    }).join('');
  }

  const h=$('#profHistory');
  if(!Profile.history||!Profile.history.length){
    h.innerHTML='<p class="muted">No games yet.</p>';
  } else {
    h.innerHTML=Profile.history.map(x=>`
      <div class="hrow">
        <span>vs ${esc(x.opp)}</span>
        <span class="muted">${new Date(x.ts).toLocaleDateString()}</span>
        <span class="res ${x.result}">${x.result.toUpperCase()}</span>
      </div>`).join('');
  }
  renderUserChip();
}

/* ============ SETTINGS UI ============ */
function loadSettingsUI(){
  $('#setPreset').value=SETTINGS.theme==='custom'?'custom':SETTINGS.theme;
  $('#setLightColor').value=SETTINGS.lightColor;
  $('#setDarkColor').value=SETTINGS.darkColor;
  $('#setSound').checked=SETTINGS.sound;
  $('#setVolume').value=Math.round(SETTINGS.volume*100);
  $('#setMusic').checked=SETTINGS.music;
  $('#setEmotePack').value=SETTINGS.emotePack;
  $('#setCoords').checked=SETTINGS.coords;
  $('#setLegal').checked=SETTINGS.legal;
  $('#setArrow').checked=SETTINGS.arrow;
  $('#setAutoflip').checked=SETTINGS.autoflip;
  $('#setEval').checked=SETTINGS.showEval;
}
function applyTheme(){
  document.documentElement.style.setProperty('--light',SETTINGS.lightColor);
  document.documentElement.style.setProperty('--dark',SETTINGS.darkColor);
  const btn=$('#btnSound');
  if(btn){btn.textContent=SETTINGS.sound?'🔊':'🔇';btn.classList.toggle('muted',!SETTINGS.sound);}
}

/* ============ ANALYSIS ============ */
let AN={fens:[],sans:[],labels:[],evals:[],ply:0};
function openAnalysis(){
  if(!G.moves.length){toast('Play a game first');return;}
  switchView('analyze');
  AN={fens:G.fens.slice(),sans:G.sans.slice(),labels:[],evals:[],ply:0};
  buildAnMoves();
  toast('Analyzing…');
  setTimeout(()=>{
    try{
      AN.labels=A.analyzeGame(G.startFen,G.moves,G.sans);
      AN.evals=AN.labels.map(l=>l.evalCp||0);
    }catch(e){console.warn(e);AN.evals=new Array(AN.fens.length).fill(0);}
    buildAnMoves();
    drawGraph();
    AN.ply=0;
    renderAnalysis();
    toast('Analysis complete');
  },120);
}
function buildAnMoves(){
  const ul=$('#anMoves');
  let html='';
  for(let i=0;i<AN.sans.length;i+=2){
    const num=Math.floor(i/2)+1;
    html+=`<li><span class="num">${num}.</span>`;
    // white move
    const wLab=AN.labels[i];
    html+=`<span class="mv" data-ply="${i+1}" style="cursor:pointer">${AN.sans[i]}</span>`;
    if(wLab)html+=`<span class="label-icon" title="${wLab.label}">${A.LABELS[wLab.label].icon}</span>`;
    // black move
    if(AN.sans[i+1]){
      const bLab=AN.labels[i+1];
      html+=`<span class="mv" data-ply="${i+2}" style="cursor:pointer">${AN.sans[i+1]}</span>`;
      if(bLab)html+=`<span class="label-icon" title="${bLab.label}">${A.LABELS[bLab.label].icon}</span>`;
    }
    html+='</li>';
  }
  ul.innerHTML=html;
  ul.querySelectorAll('[data-ply]').forEach(el=>{
    el.onclick=()=>{AN.ply=+el.dataset.ply;renderAnalysis();};
  });
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
  $('#anMoves').querySelectorAll('li').forEach((li,idx)=>{
    li.classList.toggle('active',false);
  });
  if(AN.evals.length)drawGraph();

  // legend
  const legend=$('#anLegend');
  if(!legend.dataset.built){
    legend.innerHTML=Object.entries(A.LABELS).map(([k,v])=>`<span style="color:${v.color}">${v.icon} ${v.text}</span>`).join('');
    legend.dataset.built='1';
  }

  // best move
  setTimeout(()=>{
    try{
      const best=A.bestMoveForAnalysis(fen,2);
      if(best){
        $('#anBest').textContent='Best: '+A.sqToName(best.from)+'→'+A.sqToName(best.to);
        const st2=A.parseFen(fen);
        renderBoardInto($('#anBoard'),st2,{flip:false,coords:SETTINGS.coords,hintFrom:best.from,hintTo:best.to});
      } else $('#anBest').textContent='Best: —';
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
  {fen:'6k1/6pp/8/8/8/8/6PP/4R1K1 w - - 0 1',from:60,to:4,title:'Back-rank pin'},
  {fen:'7k/8/8/8/8/8/6PP/5RK1 w - - 0 1',from:61,to:5,title:'Rook lift mate'},
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
  renderBoardInto($('#puzBoard'),PZ.st,{flip:false,coords:SETTINGS.coords,selected:PZ.selected,legal:PZ.legal||[],hintFrom:PZ.hint&&PZ.hint.from,hintTo:PZ.hint&&PZ.hint.to});
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
        play('victory');awardXP(5);checkAchievements();
        renderPuz();
        setTimeout(()=>{PZ.idx++;loadPuzzle();},1400);
        return;
      } else {
        $('#puzStatus').textContent='✗ Not the mate. Try again.';
        play('illegal');PZ.selected=-1;PZ.legal=[];renderPuz();return;
      }
    }
  }
  if(p&&colorOf(p)==='w'){
    PZ.selected=i;PZ.legal=A.legalMoves(PZ.st).filter(m=>m.from===i);play('click');
  } else {PZ.selected=-1;PZ.legal=[];}
  renderPuz();
}

/* ============ DAILY PUZZLE ============ */
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dailyIdx(){const s=todayStr();let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h)%PUZZLES.length;}
function renderDaily(){
  const solved=Profile.lastDaily===todayStr();
  const card=$('#dailyCard');
  card.classList.toggle('solved',solved);
  $('#dcSub').textContent=solved?'✓ Solved today · '+Profile.dailyStreak+' day streak':'Solve today\'s puzzle for +50 XP';
  $('#btnDaily').textContent=solved?'Solved':'Solve';
  $('#btnDaily').disabled=solved;
}
function solveDaily(){
  if(Profile.lastDaily===todayStr()){toast('Already solved today');return;}
  // Simple confirmation: open daily puzzle in puzzles view at that index
  PZ.idx=dailyIdx();
  switchView('puzzles');
  loadPuzzle();
  PZ.isDaily=true;
  // Award on solve handled in onPuzSquare - check flag
}
function onDailySolved(){
  const today=todayStr();
  if(Profile.lastDaily===today)return;
  const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
  const yStr=yesterday.getFullYear()+'-'+String(yesterday.getMonth()+1).padStart(2,'0')+'-'+String(yesterday.getDate()).padStart(2,'0');
  Profile.dailyStreak=Profile.lastDaily===yStr?(Profile.dailyStreak||0)+1:1;
  Profile.lastDaily=today;
  saveProfile();
  awardXP(50);
  checkAchievements();
  renderDaily();
  toast('Daily solved! +50 XP');
}

/* ============ EDITOR ============ */
const EDIT_PIECES=['K','Q','R','B','N','P','k','q','r','b','n','p',''];
const ED={board:new Array(64).fill(''),selected:'K',turn:'w'};
function renderEditor(){
  const board=$('#editBoard');
  const st={board:ED.board.slice(),turn:ED.turn};
  renderBoardInto(board,st,{flip:false,coords:SETTINGS.coords});
  const pal=$('#editPalette');
  pal.innerHTML=EDIT_PIECES.map(p=>{
    const label=p?GLYPH[p.toLowerCase()]:'×';
    const cls=p===p.toUpperCase()&&p?'w':'b';
    return `<button data-p="${p}" class="${p===ED.selected?'active':''}" style="color:${cls==='w'?'#fdfaf2':'#1a1d28'};text-shadow:0 1px 2px #000">${label}</button>`;
  }).join('');
  pal.querySelectorAll('button').forEach(b=>{
    b.onclick=()=>{ED.selected=b.dataset.p;renderEditor();};
  });
  $('#edTurn').textContent='Turn: '+(ED.turn==='w'?'White':'Black');
}
function onEditSquare(i){
  ED.board[i]=ED.selected;
  renderEditor();
}
function editorToFen(){
  let out='',empty=0;
  for(let r=0;r<8;r++){
    for(let f=0;f<8;f++){
      const p=ED.board[r*8+f];
      if(!p){empty++;continue;}
      if(empty){out+=empty;empty=0;}
      out+=p;
    }
    if(empty){out+=empty;empty=0;}
    if(r<7)out+='/';
  }
  return out+' '+ED.turn+' - - 0 1';
}

/* ============ MODALS ============ */
function showModal(html){
  $('#modal').innerHTML=`<div class="modal-box">${html}</div>`;
  $('#modal').classList.remove('hidden');
}
function hideModal(){$('#modal').classList.add('hidden');$('#modal').innerHTML='';}
function openBotPicker(){
  const html=`
    <h3>Choose your opponent</h3>
    <div class="bot-grid">
      ${A.BOTS.map(b=>`
        <button class="bot-card" data-bot="${b.id}">
          <span class="be">${b.emoji}</span>
          <div class="bi">
            <span class="bn">${b.name}</span>
            <span class="bd">${b.desc}</span>
          </div>
          <span class="belo">${b.elo}</span>
        </button>`).join('')}
    </div>
    <div class="modal-btns" style="margin-top:12px"><button class="btn sm ghost" id="botCancel">Cancel</button></div>`;
  showModal(html);
  $$('.bot-card').forEach(b=>{
    b.onclick=()=>{
      hideModal();
      const bot=A.BOTS.find(x=>x.id===b.dataset.bot);
      if(!bot)return;
      const tc=parseTC($('#selTC').value);
      startGame({mode:'ai',bot,myColor:'w',tc,rated:false,
        players:{w:{name:Profile.name,rating:Profile.rating,avatar:Profile.avatar},b:{name:bot.name,rating:bot.elo,avatar:bot.emoji}},
        opponentRating:bot.elo});
    };
  });
  $('#botCancel').onclick=hideModal;
}
function openOpponentCard(color){
  const p=G.players[color];
  if(!p)return;
  showModal(`
    <div class="opp-card">
      <div class="oa">${p.avatar||'♚'}</div>
      <div class="on">${esc(p.name||'Opponent')}</div>
      <div class="or">Rating ${p.rating||'—'}</div>
      <div class="od">Opponent in this match</div>
    </div>
    <div class="modal-btns"><button class="btn sm" id="oppClose">Close</button></div>`);
  $('#oppClose').onclick=hideModal;
}
function openPGNImport(){
  showModal(`
    <h3>Import PGN</h3>
    <p class="muted" style="font-size:12px;margin-bottom:10px">Paste a PGN — you'll be taken to analysis.</p>
    <textarea id="pgnIn" placeholder='[Event "..."]
1. e4 e5 2. Nf3 Nc6 ...'></textarea>
    <div class="modal-btns"><button class="btn sm ghost" id="pgnCancel">Cancel</button><button class="btn sm" id="pgnGo">Import</button></div>`);
  $('#pgnCancel').onclick=hideModal;
  $('#pgnGo').onclick=()=>{
    const text=$('#pgnIn').value.trim();
    if(!text){toast('Paste a PGN first');return;}
    try{
      const moves=A.parsePGN(text);
      if(!moves.length){toast('No moves parsed');return;}
      const replay=replayMoves(A.START_FEN,moves);
      G.startFen=A.START_FEN;
      G.moves=moves;
      G.sans=replay.sans;
      G.fens=replay.fens;
      G.keys=replay.keys;
      G.st=replay.st;
      G.last=null;
      hideModal();
      openAnalysis();
    }catch(e){toast('Invalid PGN');}
  };
}
function exportPGN(){
  const pgn=A.movesToPgn(G.startFen,G.moves,{Event:'Aurelius',White:G.players.w.name,Black:G.players.b.name,Result:G.result||'*'});
  const blob=new Blob([pgn],{type:'text/plain'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='aurelius-game.pgn';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('PGN exported');
}

/* ============ FULLSCREEN ============ */
function toggleFullscreen(){
  if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{});
  else document.exitFullscreen?.().catch(()=>{});
}
function toggleFocus(){
  document.body.classList.toggle('focus-mode');
  const inFocus=document.body.classList.contains('focus-mode');
  $('#btnFocusExit').classList.toggle('hidden',!inFocus);
}

/* ============ SHARE ============ */
async function shareRoom(){
  if(!G.room)return;
  const code=G.room.code;
  const text='Play chess with me on AURELIUS! Room code: '+code;
  const url=location.origin+location.pathname+'?room='+code;
  if(navigator.share){try{await navigator.share({title:'AURELIUS Chess',text,url});return;}catch(e){}}
  try{await navigator.clipboard.writeText(text+' '+url);toast('Copied to clipboard');}
  catch(e){toast('Room: '+code);}
}
function copyCode(){
  if(!G.room)return;
  navigator.clipboard.writeText(G.room.code).then(()=>toast('Code copied')).catch(()=>toast(G.room.code));
}

/* ============ WIRE ============ */
function wire(){
  const board=$('#board');
  board.addEventListener('pointerdown',onPointerDown);
  $('#puzBoard').addEventListener('click',e=>{const sq=e.target.closest('.sq');if(sq)onPuzSquare(+sq.dataset.i);});
  $('#editBoard').addEventListener('click',e=>{const sq=e.target.closest('.sq');if(sq)onEditSquare(+sq.dataset.i);});

  $('#nameTop').onclick=()=>openOpponentCard(G.flip?'w':'b');
  $('#nameBot').onclick=()=>openOpponentCard(G.flip?'b':'w');

  $('#btnAI').onclick=()=>{play('click');openBotPicker();};
  $('#btnLocal').onclick=()=>{play('click');startGame({mode:'local',tc:parseTC($('#selTC').value),players:{w:{name:'White',rating:'',avatar:'♔'},b:{name:'Black',rating:'',avatar:'♚'}}});};
  $('#btnCreate').onclick=()=>{play('click');hostRoom();};
  $('#btnQuick').onclick=()=>{
    play('click');pruneLobby();
    const open=[...lobbyRooms.values()].filter(r=>r.status==='waiting');
    if(open.length)joinRoom(open[0].code,'guest');else hostRoom();
  };
  $('#btnWatch').onclick=()=>{play('click');switchView('lobby');};
  $('#btnPuzzlesHome').onclick=()=>{play('click');switchView('puzzles');loadPuzzle();};
  $('#btnEditorHome').onclick=()=>{play('click');switchView('editor');renderEditor();};
  $('#btnJoin').onclick=()=>{play('click');joinRoom($('#inpCode').value,'guest');};
  $('#inpCode').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom($('#inpCode').value,'guest');});
  $('#btnRefreshLobby').onclick=()=>{play('click');pruneLobby();renderLobby();};

  $('#btnHint').onclick=()=>{
    if(!G.active||G.over)return;
    const opts=G.bot||'medium';
    const best=A.findBestMoveV2(A.toFen(G.st),opts);
    if(best){G.hint={from:best.from,to:best.to};renderAll();setTimeout(()=>{G.hint=null;renderAll();},1800);}
  };
  $('#btnUndo').onclick=()=>{play('click');undo();};
  $('#btnFlip').onclick=()=>{play('click');G.flip=!G.flip;renderAll();};
  $('#btnArrow').onclick=()=>{
    G.arrowMode=!G.arrowMode;
    if(!G.arrowMode){G.arrows=[];renderArrows($('#arrowLayer'),[],G.flip,G.last);}
    toast(G.arrowMode?'Arrow mode ON — drag to draw':'Arrow mode OFF');
    renderAll();
  };
  $('#btnFocus').onclick=()=>{play('click');toggleFocus();};
  $('#btnFocusExit').onclick=()=>{play('click');toggleFocus();};
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
  $('#btnSaveSettings').onclick=()=>{
    SETTINGS.theme=$('#setPreset').value==='custom'?'custom':$('#setPreset').value;
    SETTINGS.lightColor=$('#setLightColor').value;
    SETTINGS.darkColor=$('#setDarkColor').value;
    SETTINGS.sound=$('#setSound').checked;
    SETTINGS.volume=(+$('#setVolume').value)/100;
    SETTINGS.music=$('#setMusic').checked;
    SETTINGS.emotePack=$('#setEmotePack').value;
    SETTINGS.coords=$('#setCoords').checked;
    SETTINGS.legal=$('#setLegal').checked;
    SETTINGS.arrow=$('#setArrow').checked;
    SETTINGS.autoflip=$('#setAutoflip').checked;
    SETTINGS.showEval=$('#setEval').checked;
    saveSettings();applyTheme();
    if(SETTINGS.music)startMusic();else stopMusic();
    buildEmoteBar();
    if(G.active)renderAll();
    play('notify');toast('Settings saved');
  };
  $('#setPreset').onchange=()=>{
    const presets={gold:['#ede0c4','#7a5c3a'],midnight:['#8ea2c9','#34405e'],emerald:['#e8efd9','#4a7a52'],classic:['#f0d9b5','#b58863'],rose:['#f4e3e3','#a65d6b'],amethyst:['#e8dff2','#6a4c93'],slate:['#d8dde3','#4a5568']};
    const p=presets[$('#setPreset').value];
    if(p){$('#setLightColor').value=p[0];$('#setDarkColor').value=p[1];}
  };
  $('#btnSaveProfile').onclick=()=>{
    const n=$('#inpProfileName').value.trim();
    if(n)Profile.name=n;
    saveProfile();play('notify');toast('Profile saved');renderProfile();
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
  $('#anExport').onclick=exportPGN;
  $('#anImport').onclick=openPGNImport;

  $('#btnPuzNext').onclick=()=>{play('click');PZ.idx++;PZ.isDaily=false;loadPuzzle();};
  $('#btnPuzHint').onclick=()=>{
    const pz=PUZZLES[PZ.idx%PUZZLES.length];
    PZ.hint={from:pz.from,to:pz.to};renderPuz();
    setTimeout(()=>{PZ.hint=null;renderPuz();},1600);
  };
  $('#btnDaily').onclick=()=>{play('click');solveDaily();};

  $('#edClear').onclick=()=>{ED.board=new Array(64).fill('');renderEditor();};
  $('#edReset').onclick=()=>{ED.board=A.parseFen(A.START_FEN).board;ED.turn='w';renderEditor();};
  $('#edTurn').onclick=()=>{ED.turn=ED.turn==='w'?'b':'w';renderEditor();};
  $('#edPlay').onclick=()=>{
    try{
      const fen=editorToFen();
      // validate kings
      const st=A.parseFen(fen);
      if(!st.board.some(p=>p&&p.toLowerCase()==='k')){toast('Position needs a king');return;}
      startGame({mode:'local',fen,tc:{base:0,inc:0},players:{w:{name:'White',rating:'',avatar:'♔'},b:{name:'Black',rating:'',avatar:'♚'}}});
    }catch(e){toast('Invalid position');}
  };
  $('#edAnalyze').onclick=()=>{
    try{
      const fen=editorToFen();
      G.startFen=fen;G.moves=[];G.sans=[];G.fens=[fen];G.keys=[A.posKey(A.parseFen(fen))];
      AN={fens:[fen],sans:[],labels:[],evals:[A.quickEval(fen,1)],ply:0};
      switchView('analyze');buildAnMoves();drawGraph();renderAnalysis();
    }catch(e){toast('Invalid position');}
  };

  window.addEventListener('resize',()=>{if(currentView==='analyze')drawGraph();});

  // Global tap to close modal
  $('#modal').addEventListener('click',e=>{if(e.target.id==='modal')hideModal();});

  // Home stats
  $('#homeStats').innerHTML=`
    <div class="s"><b>${Profile.rating}</b><span>Rating</span></div>
    <div class="s"><b>${Profile.games}</b><span>Games</span></div>
    <div class="s"><b>${Profile.wins}</b><span>Wins</span></div>
    <div class="s"><b>${PZ.best}</b><span>Puzzle streak</span></div>`;
  renderRecent();
}

/* ============ INIT ============ */
function init(){
  applyTheme();wire();renderUserChip();buildEmoteBar();loadPuzzle();renderDaily();
  initMQTT();
  if(SETTINGS.music)startMusic();
  const m=location.search.match(/[?&]room=([A-Z0-9]{3,8})/i);
  if(m){
    const code=m[1].toUpperCase();
    setTimeout(()=>{if(Net.connected)joinRoom(code,'guest');else setTimeout(()=>joinRoom(code,'guest'),2000);},400);
  }
  setTimeout(renderRecent,100);
  setInterval(pruneLobby,5000);
}

init();
})();
