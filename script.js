/* 營養科廚房大挑戰 V1.4.1 — 每次啟動以正式 CSV 載入玩家與題庫。 */
'use strict';
(() => {
const KEY='kitchen-monopoly-v1', CATEGORIES=['配膳']; // 擴充分類時新增此設定即可；抽題依場次分類篩選。
const PF=['PlayerID','Name','Department','Position'];
const QF=['QuestionID','Category','Type','Question','OptionA','OptionB','OptionC','OptionD','Answer','Explanation','Source','QuestionImage','OptionImageA','OptionImageB','OptionImageC','OptionImageD','Score','Difficulty','LearningObjective','Keyword'];
const RF=['GameSessionID','PlayerID','PlayerName','QuestionID','Category','Type','Question','SelectedAnswer','CorrectAnswer','IsCorrect','Score','ResponseTime','Timestamp','Source','IsComputer','TimedOut','AnswerStatus','TimeLimit'];
const COLORS=['#1c6654','#d58036','#36749b','#8a60a5'];
const TILES=['start','question','question','question','reward','question','question','question','event','question','question','question','reward','question','question','question','event','question','question','finish'];
const TILELABEL={start:'起點',question:'考題',reward:'獎勵站',event:'學習事件',finish:'終點'};
const TILEICON={start:'⚑',question:'?',reward:'★',event:'✦',finish:'✓'};
const $=id=>document.getElementById(id), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>new Date().toISOString(), clone=x=>JSON.parse(JSON.stringify(x));
const fmtDate=x=>x?new Date(x).toLocaleString('zh-TW',{hour12:false}):'—';
const n=x=>Number(x)||0, avg=rs=>rs.length?+(rs.reduce((s,r)=>s+n(r.ResponseTime),0)/rs.length).toFixed(1):0;
const accuracy=rs=>rs.length?+(100*rs.filter(r=>r.IsCorrect).length/rs.length).toFixed(1):null;
const pct=x=>x===null?'尚未作答':`${x}%`;
let players=[], questions=[], records=[], sessions=[], game=null;
let page='home', selected=new Set(), filterSession='all', statsTab='players', busy=false, timer=null, toastTimer;
const IMAGE_TIME_LIMIT=30;
let gameMode='multi', computerTimer=null;
let storageError='', externalConflict=false, savedRaw=null;
let catalogStatus='loading', catalogError='';

// ====================== Local Storage ======================
function historyGame(g){
  if(!g)return null;
  const copy={...g,questionBank:undefined};
  if(copy.pending){
    const id=copy.pending.QuestionID||copy.pending.question?.QuestionID||'';
    copy.pending={...copy.pending,QuestionID:id,question:undefined};
  }
  return copy;
}
function readStore(){
  try {
    savedRaw=localStorage.getItem(KEY);
    if(savedRaw){const d=JSON.parse(savedRaw);if(!Array.isArray(d.records)||!Array.isArray(d.sessions))throw Error('資料格式不符');
      records=d.records;sessions=d.sessions;game=historyGame(d.game);
    }
  } catch(e){storageError='無法讀取本機學習紀錄。未覆寫原有資料，請檢查瀏覽器儲存權限。';}
}
function normalizeQuestion(q){
  const legacy=q.Category==='配膳份量'||['圖片選擇','圖片選擇題','圖片辨識','圖片辨識題'].includes(q.Type);
  if(q.Category==='配膳份量')q.Category='配膳';
  q.Type=({'文字選擇題':'文字選擇','圖片選擇':'圖文選擇','圖片選擇題':'圖文選擇','圖片辨識':'圖文選擇','圖片辨識題':'圖文選擇','圖文選擇題':'圖文選擇'})[q.Type]||q.Type;
  q.Source=q.Source||q.DataSource||q['資料來源']||'';
  if(legacy)for(const k of ['Source','QuestionImage','OptionImageA','OptionImageB','OptionImageC','OptionImageD'])if(q[k]&&!/[\\/]/.test(q[k]))q[k]='questions/'+q[k];
  q.Source=q.Source||q.QuestionImage||'';return q;
}
function migrate(){records.forEach(r=>{if(r.Category==='配膳份量')r.Category='配膳';r.Type=normalizeQuestion({Category:r.Category,Type:r.Type}).Type;r.IsComputer=!!r.IsComputer;});
  sessions.forEach(ss=>{if(ss.Category==='配膳份量')ss.Category='配膳';ss.GameMode=ss.GameMode||'multi';ss.HumanPlayerCount=ss.HumanPlayerCount??ss.PlayerCount;ss.Activity=ss.Activity||[];});
  if(game){if(game.Category==='配膳份量')game.Category='配膳';game.GameMode=game.GameMode||'multi';if(game.pending?.question)normalizeQuestion(game.pending.question);}
}
function logActivity(type,data={}){if(!game)return;const ss=sessions.find(x=>x.GameSessionID===game.GameSessionID);ss.Activity.push({Timestamp:now(),Type:type,PlayerID:currentPlayer().PlayerID,PlayerName:currentPlayer().Name,IsComputer:!!currentPlayer().isComputer,...data});}
function save(){
  if(externalConflict) return false;
  try {const current=localStorage.getItem(KEY);if(current!==savedRaw){externalConflict=true;storageError='另一個分頁已更新資料。請重新整理此頁後繼續，以避免覆蓋紀錄。';showStorageWarning();return false;}
    const activeGame=historyGame(game);
    const raw=JSON.stringify({version:2,records,sessions,game:activeGame});localStorage.setItem(KEY,raw);savedRaw=raw;return true;
  }catch(e){storageError='本機資料儲存失敗（可能空間不足或權限受限）。目前資料仍在畫面中，請立即匯出備份；關閉頁面可能遺失變更。';showStorageWarning();return false;}
}
function sanitizeLegacyBackup(){
  const key=KEY+'-pre-cloud';
  try{const raw=localStorage.getItem(key);if(!raw)return;const d=JSON.parse(raw);
    const priorGame=historyGame(d.game);
    localStorage.setItem(key,JSON.stringify({version:2,records:Array.isArray(d.records)?d.records:[],sessions:Array.isArray(d.sessions)?d.sessions:[],game:priorGame}));
  }catch(e){try{localStorage.removeItem(key);}catch{}storageError='舊版備份無法轉為僅含學習紀錄，請檢查瀏覽器儲存權限。';showStorageWarning();}
}
function showStorageWarning(){const el=$('storage-warning');el.hidden=!storageError;el.textContent=storageError;}
window.addEventListener('storage',e=>{if(e.key===KEY){externalConflict=true;storageError='另一個分頁已更新資料。請重新整理此頁後繼續，以避免覆蓋紀錄。';showStorageWarning();}});
function notify(s){$('toast').textContent=s;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),5000);}
function confirmAction(title,text,action){clearTimeout(computerTimer);$('confirm-title').textContent=title;$('confirm-text').textContent=text;$('confirm-ok').onclick=()=>{$('confirm-dialog').close();action();};$('confirm-cancel').onclick=()=>{$('confirm-dialog').close();scheduleComputer();};$('confirm-dialog').showModal();}

// ====================== Official CSV catalog ======================
async function fetchOfficialCsv(path){
  const response=await fetch(path+'?v='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error(`${path} 讀取失敗（HTTP ${response.status}）`);
  const bytes=await response.arrayBuffer(),start=new Uint8Array(bytes,0,Math.min(bytes.byteLength,4));
  if(start.length===4&&start[0]===0x50&&start[1]===0x4b&&start[2]===0x03&&start[3]===0x04)throw Error(`${path} 實際是 Excel 活頁簿，不能只改副檔名為 .csv；請在 Excel 使用「另存新檔 → CSV UTF-8」後再試。`);
  let source;
  try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error(`${path} 不是有效的 UTF-8 CSV，請重新另存為 CSV UTF-8。`);}
  return parseCSV(source);
}
async function loadCatalog(){
  catalogStatus='loading';catalogError='';render();
  try{
    if(location.protocol==='file:')throw Error('請使用 start.cmd 啟動本機版本；直接開啟 index.html 無法讀取正式 CSV。');
    const [p,q]=await Promise.all([fetchOfficialCsv('data/players.csv'),fetchOfficialCsv('data/questions.csv')]);
    const missingPlayers=PF.filter(k=>!p.headers.includes(k));
    const requiredQuestions=['QuestionID','Category','Type','Question','OptionA','OptionB','OptionC','OptionD','Answer','Explanation','Score'];
    const missingQuestions=requiredQuestions.filter(k=>!q.headers.includes(k));
    if(missingPlayers.length)throw Error('players.csv 缺少欄位：'+missingPlayers.join('、'));
    if(missingQuestions.length)throw Error('questions.csv 缺少欄位：'+missingQuestions.join('、'));
    const nextPlayers=validatePlayers(p.rows),nextQuestions=validateQuestions(q.rows);
    players=nextPlayers;questions=nextQuestions;
    selected=new Set([...selected].filter(id=>players.some(x=>x.PlayerID===id)));
    if(game){
      game.questionBank=clone(questions.filter(x=>x.Category===game.Category));
      if(game.pending){
        const updated=game.questionBank.find(x=>x.QuestionID===game.pending.QuestionID);
        if(updated)game.pending.question=clone(updated);
        else{game.pending=null;game.phase='next';game.message='原題目已從新版題庫移除，請繼續下一位玩家。';save();}
      }
    }
    catalogStatus='ready';render();
  }catch(e){catalogStatus='error';catalogError=e.message;render();}
}
function catalogGateView(){return catalogStatus==='loading'
  ?'<section class="panel cloud-gate"><h1>正在讀取正式 CSV</h1><p>每次啟動都重新載入 data/players.csv 與 data/questions.csv。</p></section>'
  :`<section class="panel cloud-gate"><h1>正式資料載入失敗</h1><p class="error-box">${esc(catalogError)}</p><button id="catalog-retry">重新讀取 CSV</button><p class="note">未使用舊本機資料或範例資料。請檢查 CSV 後重試。</p></section>`;}
function catalogBanner(){return `<div class="sync-banner"><span>正式資料：data/players.csv（${players.length} 位）與 data/questions.csv（${questions.length} 題）</span><span>每次啟動重新讀取；學習歷程留在此瀏覽器。</span></div>`;}

// ====================== Views ======================
function navigate(p){if(busy)return notify('棋子移動中，請稍候。');page=p;location.hash=p;render();}
function render(){clearTimeout(computerTimer);clearInterval(timer);timer=null;document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  if(catalogStatus!=='ready'){$('app').innerHTML=catalogGateView();if($('catalog-retry'))$('catalog-retry').onclick=loadCatalog;return;}
  $('app').innerHTML=catalogBanner()+(page==='game'&&game?gameView():page==='players'?playersView():page==='questions'?questionsView():page==='stats'?statsView():homeView());
  wire();imageFallbacks();tick();scheduleComputer();
}
function homeView(){return `<section class="hero"><div><span class="eyebrow">KITCHEN LEARNING / 配膳份量</span><h1>一起走一圈，<br>把正確份量記起來。</h1><p>把日常配膳變成一場互動挑戰。輪流擲骰、辨識份量，讓每一次作答都成為學習的起點。</p><span class="pill">20 格棋盤</span> <span class="pill">多人 / 單人對電腦</span> <span class="pill">文字 × 圖文題</span></div><div class="hero-art"><span class="eyebrow" style="color:#d9e7d9">營養科廚房大挑戰</span><strong>學習有趣，<br>成效有跡可循。</strong><div class="steps"><span>01<br>選擇玩家</span><span>02<br>配膳挑戰</span><span>03<br>學習成果</span></div></div></section>${game?`<div class="panel" style="margin-bottom:20px"><h2>有一場進行中的遊戲</h2><p>${esc(game.members.map(p=>p.Name).join('、'))} · ${esc(game.GameSessionID)}</p><button id="resume">繼續遊戲</button></div>`:''}<section class="setup"><div class="panel"><div class="page-head"><h2>選擇今天的玩家</h2><button class="quiet" data-go="players">管理名單 →</button></div><label class="field">遊戲模式<select id="game-mode" ${game?'disabled':''}><option value="multi" ${gameMode==='multi'?'selected':''}>多人同樂（2–4 位玩家）</option><option value="computer" ${gameMode==='computer'?'selected':''}>單人與電腦對戰（1 位玩家 + 電腦）</option></select></label><p class="muted">${gameMode==='computer'?'選擇 1 位玩家；電腦會自動擲骰與模擬作答。':'勾選 2–4 位玩家，大家輪流操作同一台電腦。'}</p><div class="player-picker">${players.map(p=>`<label class="pick"><input type="checkbox" data-pick="${esc(p.PlayerID)}" ${selected.has(p.PlayerID)?'checked':''} ${game?'disabled':''}><span><strong>${esc(p.Name)}</strong><small>${esc(p.Department)} · ${esc(p.Position)}</small><small>${esc(p.PlayerID)}</small></span></label>`).join('')||'<p>請先在 data/players.csv 填入正式玩家。</p>'}</div><div class="actions"><button id="start" ${game?'disabled':''}>開始遊戲 <span id="selected-count">（${selected.size}/${gameMode==='computer'?1:4}）</span></button><small>目前題庫 ${questions.filter(q=>q.Category===CATEGORIES[0]).length} 題</small></div></div><aside class="panel"><h2>今天的遊戲規則</h2><ul class="rules"><li>每人初始 100 分</li><li>骰子點數 1–6，輪流前進</li><li>答對依題庫加分，答錯不扣分</li><li>獎勵格 +10；事件格 +5 或 −5</li><li>全部抵達終點後查看成果</li><li>可隨時強制結束並保存歷程</li><li>電腦模擬作答不納入人員成效</li></ul><p class="note">正式玩家與題目請編輯 data/ 內的 CSV，再重新發布專案；圖片放在 images/questions/。</p></aside></section>`;}
function playersView(){return `<div class="page-head"><div><span class="eyebrow">PLAYER MANAGEMENT</span><h1>正式玩家名單</h1><p class="muted">從 data/players.csv 載入 ${players.length} 位玩家。</p></div></div><div class="toolbar"><a class="file-label" href="data/players.csv" download>下載正式 players.csv</a></div><p class="note">唯一正式來源為 data/players.csv。管理者請在專案檔案中編輯 PlayerID、Name、Department、Position，重新 Push／下載或 git pull 後再次啟動。此畫面不修改正式檔案。</p><div class="table-wrap"><table><thead><tr><th>編號</th><th>姓名</th><th>單位 / 部門</th><th>職稱</th></tr></thead><tbody>${players.map(p=>`<tr><td>${esc(p.PlayerID)}</td><td>${esc(p.Name)}</td><td>${esc(p.Department)}</td><td>${esc(p.Position)}</td></tr>`).join('')}</tbody></table></div>`;}
function questionsView(){return `<div class="page-head"><div><span class="eyebrow">QUESTION BANK</span><h1>正式配膳題庫</h1><p class="muted">從 data/questions.csv 載入 ${questions.length} 道題目。</p></div></div><div class="toolbar"><a class="file-label" href="data/questions.csv" download>下載正式 questions.csv</a></div><p class="note">唯一正式來源為 data/questions.csv。管理者請直接編輯此檔並重新發布專案。圖文題的 Source 或圖片欄位填 questions/檔名.jpg，圖片放在 images/questions/，檔名須完全一致。</p><div class="table-wrap"><table><thead><tr><th>編號</th><th>分類 / 題型</th><th>題目</th><th>資料來源</th><th>答案</th><th>分數</th></tr></thead><tbody>${questions.map(q=>`<tr><td>${esc(q.QuestionID)}</td><td>${esc(q.Category)} / ${esc(q.Type)}<br><small>${esc(q.Difficulty)}</small></td><td><span class="qtext">${esc(q.Question)}</span><small>${esc(q.LearningObjective)}</small></td><td>${esc(q.Source||'—')}</td><td>${esc(q.Answer)}</td><td>${q.Score}</td></tr>`).join('')}</tbody></table></div>`;}
// ====================== Player Management ======================

function validatePlayers(rows){const seen=new Set();return rows.map((r,i)=>{const p=Object.fromEntries(PF.map(k=>[k,String(r[k]??'').trim()]));const missing=PF.filter(k=>!p[k]);if(missing.length)throw Error(`第 ${i+1} 筆資料有錯誤：${missing.join('、')} 不可空白`);if(seen.has(p.PlayerID))throw Error(`第 ${i+1} 筆資料有錯誤：PlayerID 重複`);seen.add(p.PlayerID);return p;});}

// ====================== Question Bank ======================

function safeImagePath(x){if(!x)return '';const path=String(x).replace(/\\/g,'/').replace(/^images\//,'');if(path.includes('..')||!/^[-\p{L}\p{N}_ ./%]+\.(png|jpg|jpeg|webp|gif|svg)$/iu.test(path))return '';return 'images/'+path.split('/').map(encodeURIComponent).join('/');}
function validateQuestions(rows){const seen=new Set();return rows.map((r,i)=>{const q=Object.fromEntries(QF.map(k=>[k,String(r[k]??'').trim()]));q.QuestionImage=q.QuestionImage||String(r.Image??'').trim();q.Source=q.Source||String(r.DataSource??r['資料來源']??'').trim();normalizeQuestion(q);
    q.Answer=q.Answer.toUpperCase();const fail=m=>{throw Error(`第 ${i+1} 筆資料有錯誤：${m}`);};
    if(!q.QuestionID)fail('QuestionID 不可空白');if(seen.has(q.QuestionID))fail('QuestionID 重複');seen.add(q.QuestionID);
    if(!CATEGORIES.includes(q.Category))fail('第一版 Category 必須為配膳');if(!['文字選擇','圖文選擇'].includes(q.Type))fail('Type 必須為文字選擇或圖文選擇');
    if(!q.Question)fail('題目不可空白');if(!q.Explanation)fail('解析不可空白');if(!/^[ABCD]$/.test(q.Answer))fail('Answer 必須為 A、B、C 或 D');
    const options=['A','B','C','D'].filter(a=>q['Option'+a]||q['OptionImage'+a]);if(options.length<2)fail('至少需要兩個選項');if(!options.includes(q.Answer))fail('正確答案對應的選項不存在');
    if(q.Score===''||!Number.isFinite(Number(q.Score))||Number(q.Score)<0||Number(q.Score)>10000)fail('Score 必須為 0–10000 的數字');q.Score=Number(q.Score);
    if(q.Type==='圖文選擇'&&!q.Source&&!q.QuestionImage&&!['A','B','C','D'].some(a=>q['OptionImage'+a]))fail('圖片題需要至少一張題目或選項圖片');
    for(const k of ['Source','QuestionImage','OptionImageA','OptionImageB','OptionImageC','OptionImageD'])if(q[k]&&!safeImagePath(q[k]))fail(`${k} 必須為 images/ 內的圖片路徑，不可使用網址或上層路徑`);
    return q;});}
function imageHTML(file,alt){if(!file)return '';const src=safeImagePath(file);return src?`<img src="${esc(src)}" alt="${esc(alt)}" data-fallback>`:'<span class="image-missing">圖片尚未建立</span>';}
function imageFallbacks(){document.querySelectorAll('img[data-fallback]').forEach(img=>{const fallback=()=>{const span=document.createElement('span');span.className='image-missing';span.textContent='圖片尚未建立 · 請參考選項文字';img.replaceWith(span);};img.onerror=fallback;if(img.complete&&!img.naturalWidth)fallback();});}

// ====================== Game State / Session ======================
function startGame(){if(game)return;const ids=[...selected];if(gameMode==='computer'?ids.length!==1:(ids.length<2||ids.length>4))return notify(gameMode==='computer'?'請選擇 1 位玩家與電腦對戰。':'請選擇 2–4 位不同玩家。');const bank=questions.filter(q=>q.Category===CATEGORIES[0]);if(!bank.length)return notify('請先在 data/questions.csv 填入配膳題目。');
  const id='GAME-'+new Date().toLocaleDateString('sv-SE').replaceAll('-','')+'-'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2));
  const members=ids.map((pid,i)=>({...clone(players.find(p=>p.PlayerID===pid)),isComputer:false,position:0,score:100,color:COLORS[i],token:i+1,finished:false,seen:[]}));
  if(gameMode==='computer')members.push({PlayerID:'CPU-'+id,Name:'電腦對手',Department:'模擬對戰',Position:'電腦',isComputer:true,position:0,score:100,color:COLORS[1],token:2,finished:false,seen:[]});
  game={GameSessionID:id,GameMode:gameMode,Category:CATEGORIES[0],members,current:0,phase:'roll',dice:0,pending:null,message:'',questionBank:clone(bank)};
  sessions.push({GameSessionID:id,GameStartTime:now(),GameEndTime:'',PlayerCount:members.length,HumanPlayerCount:ids.length,GameMode:gameMode,Activity:[],Category:CATEGORIES[0],Status:'進行中',Players:clone(members)});logActivity('開始遊戲');save();navigate('game');
}
function currentPlayer(){return game.members[game.current];}
function boardPosition(i){if(i<=5)return [1,i+1];if(i<=10)return [i-4,6];if(i<=15)return [6,16-i];return [21-i,1];}
function gameView(){const p=currentPlayer();return `<div class="game-top"><div><h1>營養科廚房大挑戰</h1><span class="session-id">${esc(game.GameSessionID)}</span></div><div class="actions"><span class="pill">${game.members.filter(x=>x.finished).length}/${game.members.length} 位已抵達</span><button id="end-game" class="danger">強制結束並保存</button></div></div><div class="game-layout ${game.pending?'focus-question':''}"><section><div class="board">${TILES.map((t,i)=>{const [r,c]=boardPosition(i);return `<div class="tile ${t}" style="grid-row:${r};grid-column:${c}" aria-label="第 ${i+1} 格 ${TILELABEL[t]}"><span class="tile-number">${String(i+1).padStart(2,'0')}</span><span class="tile-icon">${TILEICON[t]}</span><span class="tile-name">${TILELABEL[t]}</span><div class="tokens">${game.members.filter(x=>x.position===i).map(x=>`<span class="token" style="--player-color:${x.color}" title="${esc(x.Name)}">${x.token}</span>`).join('')}</div></div>`;}).join('')}<div class="board-center"><div class="plate">◉</div><span class="eyebrow">PORTION PRACTICE</span><h2>每一份，都用心。</h2><p>輪流擲骰 · 一起學習<br>完成後查看個人學習成果</p><span class="pill">配膳份量 / 20 格</span></div></div><div class="legend"><span>題目：依題庫加分</span><span>獎勵：+10</span><span>事件：+5 / −5</span></div><div class="roster">${game.members.map((x,i)=>`<div class="roster-card ${i===game.current?'current':''}" style="--player-color:${x.color}"><span class="token" style="--player-color:${x.color}">${x.token}</span><strong>${esc(x.Name)}${x.isComputer?' · 模擬':''}</strong><span class="score">${x.score} 分</span><small>${x.finished?'✓ 已抵達終點':`第 ${x.position+1} 格`}</small></div>`).join('')}</div></section><section class="panel play-panel"><div class="turn-label"><span class="token" style="--player-color:${p.color}">${p.token}</span><div><small>${p.isComputer?'電腦回合 · 自動操作':'現在輪到'}</small><br><strong>${esc(p.Name)}</strong></div></div>${game.pending?questionView():game.phase==='roll'?`<div class="dice-area"><span class="eyebrow">準備好接受下一個挑戰了嗎？</span><span id="dice" class="dice">${['⚀','⚁','⚂','⚃','⚄','⚅'][Math.max(0,game.dice-1)]}</span><h2>擲骰子，向前走！</h2><p class="muted">${game.dice?'上次骰子：'+game.dice+' 點':'骰子點數 1–6'}</p><button id="roll" class="roll" ${busy||p.isComputer?'disabled':''}>${p.isComputer?'電腦準備擲骰…':'擲骰子'}</button></div>`:`<div class="event-card"><span class="event-icon">${TILEICON[TILES[p.position]]}</span><h2>${esc(game.message)}</h2><p class="muted">停在第 ${p.position+1} 格 · ${TILELABEL[TILES[p.position]]}</p><button id="next" class="continue" ${p.isComputer?'disabled':''}>${p.isComputer?'電腦即將交棒…':'下一位玩家 →'}</button></div>`}</section></div>`;}

// ====================== Dice / Board Movement ======================
async function rollDice(){if(!game||busy||game.phase!=='roll')return;if(!game.questionBank?.length)return notify('正式題庫目前沒有題目；請強制結束本場並更新 questions.csv。');const activeGame=game;busy=true;$('roll').disabled=true;$('dice').classList.add('rolling');
  const dice=1+Math.floor(Math.random()*6);await new Promise(r=>setTimeout(r,450));if(game!==activeGame)return;game.dice=dice;const p=currentPlayer(),target=Math.min(19,p.position+dice);logActivity('擲骰移動',{Dice:dice,From:p.position+1,Target:target+1});
  // 儲存移動完成後的穩定狀態；重新載入不會停在半途動畫。
  for(let pos=p.position+1;pos<=target;pos++){p.position=pos;render();await new Promise(r=>setTimeout(r,140));if(game!==activeGame)return;}
  if(target===19){p.finished=true;game.message='完成這一圈，辛苦了！';game.phase='landed';}
  else if(TILES[target]==='question'){
    let pool=game.questionBank.filter(q=>!p.seen.includes(q.QuestionID));if(!pool.length){p.seen=[];pool=game.questionBank;}
    const q=clone(pool[Math.floor(Math.random()*pool.length)]);p.seen.push(q.QuestionID);game.pending={question:q,startedAt:Date.now(),answered:false,selected:'',record:null};game.phase='question';
  }else{game.phase='landed';if(TILES[target]==='reward'){p.score+=10;game.message='配膳練習獎勵 +10 分';}else if(TILES[target]==='event'){const gain=Math.random()<.5?5:-5;p.score+=gain;game.message=gain>0?'分享配膳經驗，獲得 +5 分':'調整配膳節奏，本次 −5 分';}else game.message='穩穩前進，準備下一次挑戰。';}
  logActivity('抵達格子',{BoardPosition:p.position+1,Score:p.score,QuestionID:game.pending?.question.QuestionID||''});busy=false;save();if(game.members.every(x=>x.finished))finishGame('已完成');else render();
}
function nextTurn(){if(!game||busy||(game.pending&&!game.pending.answered)||game.phase==='roll')return;game.pending=null;do{game.current=(game.current+1)%game.members.length;}while(currentPlayer().finished);game.phase='roll';save();render();}
function finishGame(status){if(!game)return;clearTimeout(computerTimer);busy=false;const session=sessions.find(s=>s.GameSessionID===game.GameSessionID);
  if(game.pending&&!game.pending.answered){const a=game.pending;session.UnansweredQuestion={PlayerID:currentPlayer().PlayerID,PlayerName:currentPlayer().Name,IsComputer:!!currentPlayer().isComputer,QuestionID:a.question.QuestionID,Question:a.question.Question,Source:a.question.Source||'',ResponseTime:+((Date.now()-a.startedAt)/1000).toFixed(1),Status:'未作答（強制結束）'};}
  logActivity(status==='已完成'?'完成遊戲':'強制結束',{UnansweredQuestion:session.UnansweredQuestion||null});session.GameEndTime=now();session.Status=status;session.Players=clone(game.members);filterSession=game.GameSessionID;game=null;selected.clear();save();page='stats';statsTab='personal';location.hash='stats';render();notify(status==='已完成'?'本場遊戲完成！查看大家的學習成果。':'已強制結束，並保存本場學習歷程。');
}

// ====================== Computer Opponent ======================
// 電腦是模擬對手，75% 機率答對；紀錄明確標記，統計時不計入人員成效。
function scheduleComputer(){clearTimeout(computerTimer);if(!game||page!=='game'||busy||!currentPlayer().isComputer||$('confirm-dialog').open||externalConflict||!game.questionBank?.length)return;
  const activeGame=game;computerTimer=setTimeout(()=>{if(game!==activeGame||busy||page!=='game'||$('confirm-dialog').open)return;
    if(game.phase==='roll')rollDice();
    else if(game.pending&&!game.pending.answered){const q=game.pending.question,choices=['A','B','C','D'].filter(a=>(q['Option'+a]||q['OptionImage'+a])&&a!==q.Answer);const choice=Math.random()<.75?q.Answer:choices[Math.floor(Math.random()*choices.length)];answer(choice);}
    else nextTurn();
  },game.pending?.answered?1800:1200);
}

// ====================== Question System / Answer Recording ======================
function questionView(){const a=game.pending,q=a.question;return `<div><span class="pill">${esc(q.Type)} · ${esc(q.Difficulty||'配膳挑戰')}</span><span id="timer" class="timer" role="timer">${a.answered?a.record.ResponseTime.toFixed(1)+' 秒':q.Type==='圖文選擇'?'剩餘 30 秒':'計時中'}</span><h2 class="question-heading">${esc(q.Question)}</h2>${(q.QuestionImage||q.Source)?`<div class="question-image">${imageHTML(q.QuestionImage||q.Source,'題目圖片 / 資料來源')}<button type="button" class="secondary zoom-button" data-zoom="${esc(q.QuestionImage||q.Source)}">⛶ 放大檢視圖片</button></div>`:''}<div class="options">${['A','B','C','D'].filter(x=>q['Option'+x]||q['OptionImage'+x]).map(x=>`<button class="option ${a.answered?(x===q.Answer?'correct':x===a.selected?'wrong':''):''}" data-answer="${x}" ${a.answered||currentPlayer().isComputer?'disabled':''}><span class="letter">${x}</span>${esc(q['Option'+x]||'圖片選項 '+x)}${imageHTML(q['OptionImage'+x],'選項 '+x)}</button>`).join('')}</div>${a.answered?`<div class="feedback ${a.record.IsCorrect?'':'wrong'}" role="status"><h3>${a.record.TimedOut?'⏱ 時間到 · 未作答 · 正確答案 '+q.Answer:a.record.IsCorrect?'✓ 答對！ +'+a.record.Score+' 分':'✕ 答錯 · 正確答案 '+q.Answer}</h3><p>${esc(q.Explanation)}</p></div><button id="next" class="continue" ${currentPlayer().isComputer?'disabled':''}>${currentPlayer().isComputer?'電腦即將交棒…':'了解了，下一位玩家 →'}</button>`:`<p class="note">${q.Type==='圖文選擇'?'請在 30 秒內選擇答案。時間到會記錄為逾時未作答，並顯示解析。':'請選擇一個答案。作答後會立即顯示解析。'}</p>`}</div>`;}
function tick(){
  if(!game?.pending||game.pending.answered)return;
  const a=game.pending,elapsed=Math.max(0,(Date.now()-a.startedAt)/1000),limited=a.question.Type==='圖文選擇';
  if(limited&&elapsed>=IMAGE_TIME_LIMIT){answer('',true);return;}
  const remaining=Math.max(0,Math.ceil(IMAGE_TIME_LIMIT-elapsed));
  if($('timer')){$('timer').textContent=limited?'剩餘 '+remaining+' 秒':elapsed.toFixed(1)+' 秒';$('timer').classList.toggle('urgent',limited&&remaining<=10);}
  if($('image-timer'))$('image-timer').textContent=limited?'作答剩餘 '+remaining+' 秒':'作答計時 '+elapsed.toFixed(1)+' 秒';
}
function answer(choice,timedOut=false){if(!game?.pending||game.pending.answered||busy)return;const a=game.pending,q=a.question,p=currentPlayer();
  const limit=q.Type==='圖文選擇'?IMAGE_TIME_LIMIT:0,elapsed=Math.max(0,(Date.now()-a.startedAt)/1000);
  // 同時檢查點選當下的截止時間，避免背景分頁延遲執行計時器時仍可逾時得分。
  timedOut=!!(limit&&elapsed>=limit);if(!timedOut&&!['A','B','C','D'].includes(choice))return;if(timedOut)choice='';
  const correct=!timedOut&&choice===q.Answer,score=correct?q.Score:0;
  const record={GameSessionID:game.GameSessionID,PlayerID:p.PlayerID,PlayerName:p.Name,Department:p.Department,Position:p.Position,Source:q.Source||'',IsComputer:!!p.isComputer,QuestionID:q.QuestionID,Category:q.Category,Type:q.Type,Question:q.Question,SelectedAnswer:choice,CorrectAnswer:q.Answer,IsCorrect:correct,Score:score,ResponseTime:timedOut?limit:+elapsed.toFixed(1),Timestamp:now(),Explanation:q.Explanation,LearningObjective:q.LearningObjective,Keyword:q.Keyword,TimedOut:timedOut,AnswerStatus:timedOut?'逾時未作答':correct?'答對':'答錯',TimeLimit:limit};
  records.push(record);logActivity(timedOut?'逾時未作答':'作答',{QuestionID:q.QuestionID,SelectedAnswer:choice,IsCorrect:correct,Score:score,ResponseTime:record.ResponseTime,TimedOut:timedOut});p.score+=score;a.answered=true;a.selected=choice;a.record=record;
  if($('image-viewer').open)$('image-viewer').close();save();render();
}

// ====================== Statistics ======================
function filteredRecords(){return records.filter(r=>filterSession==='all'||r.GameSessionID===filterSession);}
function filteredSessions(){return sessions.filter(s=>filterSession==='all'||s.GameSessionID===filterSession);}
function membersOf(s){return game?.GameSessionID===s.GameSessionID?game.members:s.Players;}
function playerStats(rs=filteredRecords(),ss=filteredSessions()){rs=rs.filter(r=>!r.IsComputer);
  const map=new Map();ss.forEach(s=>(membersOf(s)||[]).filter(p=>!p.isComputer).forEach(p=>{if(!map.has(p.PlayerID))map.set(p.PlayerID,{...p,TotalScore:0,SessionCount:0});const item=map.get(p.PlayerID);item.TotalScore+=p.score;item.SessionCount++;}));
  rs.forEach(r=>{if(!map.has(r.PlayerID))map.set(r.PlayerID,{PlayerID:r.PlayerID,Name:r.PlayerName,Department:r.Department,Position:r.Position,TotalScore:0,SessionCount:0});});
  return [...map.values()].map(p=>{const rr=rs.filter(r=>r.PlayerID===p.PlayerID),c=rr.filter(r=>r.IsCorrect).length;return {PlayerID:p.PlayerID,Name:p.Name,Department:p.Department,Position:p.Position,TotalQuestions:rr.length,CorrectQuestions:c,WrongQuestions:rr.filter(r=>!r.IsCorrect&&!r.TimedOut).length,TimeoutQuestions:rr.filter(r=>r.TimedOut).length,Accuracy:accuracy(rr),TotalScore:p.TotalScore,AverageResponseTime:avg(rr),SessionCount:p.SessionCount,AnswerScore:rr.reduce((s,r)=>s+r.Score,0)};});
}
function questionStats(rs=filteredRecords()){rs=rs.filter(r=>!r.IsComputer);
  // 依作答時保存的題目文字分組，避免題庫修改／刪除後污染歷史分析。
  const map=new Map();rs.forEach(r=>{const k=JSON.stringify([r.QuestionID,r.Question,r.CorrectAnswer]);if(!map.has(k))map.set(k,[]);map.get(k).push(r);});
  return [...map.values()].map(rr=>({QuestionID:rr[0].QuestionID,Question:rr[0].Question,CorrectAnswer:rr[0].CorrectAnswer,Attempts:rr.length,Participants:new Set(rr.map(r=>r.PlayerID)).size,Correct:rr.filter(r=>r.IsCorrect).length,Wrong:rr.filter(r=>!r.IsCorrect&&!r.TimedOut).length,Timeout:rr.filter(r=>r.TimedOut).length,Accuracy:accuracy(rr),AverageResponseTime:avg(rr)})).sort((a,b)=>a.Accuracy-b.Accuracy);
}
function statsView(){const allRecords=filteredRecords(),rs=allRecords.filter(r=>!r.IsComputer),ss=filteredSessions(),ps=playerStats(rs,ss);return `<div class="page-head"><div><span class="eyebrow">LEARNING INSIGHTS</span><h1>看見每一次進步</h1><p class="muted">個人學習成果與管理者統計 · 以答題表現找出需要再練習的概念。</p></div><button id="export-excel">↓ 匯出學習成果 Excel</button></div><div class="stats-filter"><label for="session-filter">統計範圍</label><select id="session-filter"><option value="all">全部場次</option>${sessions.slice().reverse().map(s=>`<option value="${esc(s.GameSessionID)}" ${filterSession===s.GameSessionID?'selected':''}>${fmtDate(s.GameStartTime)} · ${s.PlayerCount} 人 · ${esc(s.Status)}</option>`).join('')}</select><small>此頁僅顯示這台電腦保存的學習紀錄。</small></div><div class="metrics"><div class="metric"><small>參與玩家</small><strong>${ps.length}</strong><small>${ss.length} 場遊戲</small></div><div class="metric"><small>累計作答</small><strong>${rs.length}</strong><small>每次作答均自動記錄</small></div><div class="metric"><small>整體答對率</small><strong>${rs.length?pct(accuracy(rs)):'—'}</strong><small>答對 ${rs.filter(r=>r.IsCorrect).length} / 答錯 ${rs.filter(r=>!r.IsCorrect&&!r.TimedOut).length} / 逾時 ${rs.filter(r=>r.TimedOut).length}</small></div><div class="metric"><small>平均答題時間</small><strong>${rs.length?avg(rs):'—'}<small> 秒</small></strong><small>依每次作答計算</small></div></div><div class="tabs">${[['personal','個人學習成果'],['players','玩家總表'],['records','答題明細'],['questions','題目分析'],['sessions','遊戲場次'],['history','學習歷程']].map(([k,v])=>`<button data-tab="${k}" class="${statsTab===k?'active':''}">${v}</button>`).join('')}</div>${battleResults(ss)}${statsContent(ps,allRecords,ss)}<p class="note">總分包含每場初始 100 分、答題得分與棋盤事件；跨場總分為各場分數加總，並非單次測驗分數。未作答者答對率顯示「尚未作答」。題目分析依作答時的題目與答案保存版本計算。圖文題逾時另列為未作答（0 分），納入作答總數與答對率分母，不計入答錯題數。電腦模擬作答不納入人員成果、答對率或題目分析。</p><section class="export-area"><h2>學習紀錄備份與本機管理</h2><div class="actions"><button id="backup" class="secondary">匯出完整 JSON 備份</button><button id="export-records" class="secondary">匯出答題明細 CSV</button><button id="clear-records" class="quiet">清除遊戲紀錄</button></div><p class="note">備份僅包含場次、答題紀錄與進行中的遊戲；正式玩家與題庫請備份 data/ 內的 CSV。Excel 下載至瀏覽器預設下載資料夾；results/ 可用來整理匯出檔案。</p></section>`;}
function battleResults(ss){const battles=ss.filter(s=>s.GameMode==='computer');return battles.length?'<div class="panel battle-results"><h2>電腦對戰結果</h2>'+battles.map(s=>{const mm=membersOf(s)||[],human=mm.find(p=>!p.isComputer),cpu=mm.find(p=>p.isComputer);return '<p>'+esc(fmtDate(s.GameStartTime))+' · '+esc(s.Status)+' · '+esc(human?.Name)+': '+n(human?.score)+' 分 / 電腦: '+n(cpu?.score)+' 分</p>';}).join('')+'<small>電腦僅作為遊戲模擬對手，不納入人員學習統計。</small></div>':'';}
function table(headers,rows){return rows.length?`<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<div class="panel empty">目前沒有資料。完成一場配膳挑戰後，就能查看學習成果。</div>';}
function statsContent(ps,rs,ss){
  if(statsTab==='personal')return ps.length?`<div class="result-grid">${ps.map((p,i)=>`<article class="result-card"><h3><span class="token" style="--player-color:${COLORS[i%4]}">${i+1}</span>${esc(p.Name)}</h3><small>${esc(p.Department)} · ${esc(p.Position)} · ${p.SessionCount} 場</small><div class="accuracy">${pct(p.Accuracy)}</div><div class="bar" role="img" aria-label="答對率 ${pct(p.Accuracy)}"><i style="width:${p.Accuracy||0}%"></i></div><div class="result-meta"><span>作答 ${p.TotalQuestions} 題</span><span class="good">✓ ${p.CorrectQuestions} 題</span><span class="bad">✕ ${p.WrongQuestions} 題</span><span class="timeout-count">⏱ 逾時 ${p.TimeoutQuestions} 題</span></div><hr style="border:0;border-top:1px solid #eee;margin:20px 0"><div class="result-meta"><strong>總分 ${p.TotalScore} 分</strong><span>平均 ${p.TotalQuestions?p.AverageResponseTime:'—'} 秒</span></div>${rs.some(r=>r.PlayerID===p.PlayerID&&!r.IsCorrect)?`<p class="note">建議再練習：${esc([...new Set(rs.filter(r=>r.PlayerID===p.PlayerID&&!r.IsCorrect).map(r=>r.LearningObjective||r.Question))].join('、'))}</p>`:''}</article>`).join('')}</div>`:table([],[]);
  if(statsTab==='players')return table(['玩家編號','姓名','單位','職稱','場數','答題數','答對','答錯','逾時','答對率','總分','平均秒數'],ps.map(p=>[p.PlayerID,p.Name,p.Department,p.Position,p.SessionCount,p.TotalQuestions,p.CorrectQuestions,p.WrongQuestions,p.TimeoutQuestions,pct(p.Accuracy),p.TotalScore,p.TotalQuestions?p.AverageResponseTime:'—']));
  if(statsTab==='records')return table(['時間 / 場次','玩家','題目','選擇','答案','結果','得分','秒數'],rs.slice().reverse().map(r=>[fmtDate(r.Timestamp)+' / '+r.GameSessionID,r.PlayerName+(r.IsComputer?'（電腦模擬）':''),r.QuestionID+' · '+r.Question,r.SelectedAnswer,r.CorrectAnswer,r.TimedOut?'逾時未作答':r.IsCorrect?'答對':'答錯',r.Score,r.ResponseTime]));
  if(statsTab==='questions')return table(['題目編號','題目','作答次數','作答人數','答對次數','答錯次數','逾時次數','答對率','平均秒數'],questionStats(rs).map(q=>[q.QuestionID,q.Question,q.Attempts,q.Participants,q.Correct,q.Wrong,q.Timeout,pct(q.Accuracy),q.AverageResponseTime]));
  if(statsTab==='history')return table(['時間','場次','玩家','歷程','內容'],ss.flatMap(s=>(s.Activity||[]).map(a=>[fmtDate(a.Timestamp),s.GameSessionID,a.PlayerName,a.Type,(a.Type==='作答'||a.Type==='逾時未作答')?a.QuestionID+' · '+a.SelectedAnswer+' · '+(a.TimedOut?'逾時未作答':a.IsCorrect?'答對':'答錯'):a.Type==='擲骰移動'?a.Dice+' 點 · '+a.From+' → '+a.Target:a.UnansweredQuestion?'未作答：'+a.UnansweredQuestion.Question:a.BoardPosition?'第 '+a.BoardPosition+' 格 · '+a.Score+' 分':''])));
  return table(['場次編號','開始','結束','模式','人員 / 電腦','狀態','玩家','未完成題目'],ss.slice().reverse().map(s=>[s.GameSessionID,fmtDate(s.GameStartTime),fmtDate(s.GameEndTime),s.GameMode==='computer'?'單人對電腦':'多人同樂',s.HumanPlayerCount+' 人 / '+(s.PlayerCount-s.HumanPlayerCount)+' 電腦',s.Status,(s.Players||[]).map(p=>p.Name).join('、'),s.UnansweredQuestion?.Question||'—']));
}

// ====================== Excel / CSV Import Export ======================
function parseCSV(text){text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],value='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;}
    else if(c==='"'){if(value.length||closed)throw Error('CSV 引號格式錯誤');quoted=true;}
    else if(c===','){row.push(value);value='';closed=false;}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(x=>x.trim()))rows.push(row);row=[];value='';closed=false;}
    else {if(closed&&c.trim())throw Error('CSV 引號後有不合法字元');if(!closed)value+=c;}
  }
  if(quoted)throw Error('CSV 有未關閉的引號');row.push(value);if(row.some(x=>x.trim()))rows.push(row);if(rows.length<1)throw Error('CSV 沒有標題列');
  const headers=rows.shift().map(x=>x.trim());if(new Set(headers).size!==headers.length||headers.some(x=>!x))throw Error('CSV 欄位名稱重複或空白');return {headers,rows:rows.map((r,i)=>{if(r.length!==headers.length)throw Error(`第 ${i+1} 筆資料有錯誤：欄位數與標題不符`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));})};
}

function requireXLSX(){if(!window.XLSX)throw Error('Excel 套件未載入。請確認 vendor/xlsx.full.min.js 存在，或使用 CSV 匯入 / 匯出。');}
function download(filename,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csv(fields,data){const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  // 在 CSV 中中和公式開頭，防止匯入任意文字在 Excel 開啟時被當成公式。
  const safe=v=>typeof v==='string'&&/^[\s]*[=+@-]/.test(v)?"'"+v:v;
  return '\uFEFF'+[fields.map(cell).join(','),...data.map(r=>fields.map(k=>cell(safe(r[k]))).join(','))].join('\r\n');
}
function exportCSV(name,fields,data){download(name,csv(fields,data),'text/csv;charset=utf-8');}
function createWorkbook(){requireXLSX();const wb=XLSX.utils.book_new(),rs=filteredRecords(),ss=filteredSessions();
  const add=(name,fields,data)=>{const sheet=XLSX.utils.json_to_sheet(data.map(r=>Object.fromEntries(fields.map(k=>[k,r[k]??'']))),{header:fields});sheet['!cols']=fields.map(k=>({wch:['Question','GameSessionID'].includes(k)?48:Math.max(16,k.length+2)}));XLSX.utils.book_append_sheet(wb,sheet,name);};
  add('玩家總表',['PlayerID','Name','Department','Position','TotalQuestions','CorrectQuestions','WrongQuestions','Accuracy','TotalScore','AverageResponseTime','SessionCount','AnswerScore','TimeoutQuestions'],playerStats(rs,ss));
  add('答題明細',RF,rs);add('題目分析',['QuestionID','Question','Attempts','Correct','Wrong','Accuracy','AverageResponseTime','Participants','CorrectAnswer','Timeout'],questionStats(rs));
  // Excel 每個儲存格有字數上限；長場次歷程按 30000 字元分欄保存。
  const historyRows=ss.map(s=>{const text=JSON.stringify(s.Activity||[]),row={...s,UnansweredQuestion:s.UnansweredQuestion?JSON.stringify(s.UnansweredQuestion):''};for(let i=0;i<text.length;i+=30000)row[i===0?'LearningHistory':'LearningHistory'+(i/30000+1)]=text.slice(i,i+30000);return row;});
  const historyFields=['LearningHistory',...new Set(historyRows.flatMap(r=>Object.keys(r).filter(k=>/^LearningHistory\d+$/.test(k))))];
  add('遊戲場次',['GameSessionID','GameStartTime','GameEndTime','PlayerCount','HumanPlayerCount','GameMode','Status','Category','UnansweredQuestion',...historyFields],historyRows);return wb;
}
function exportExcel(){try{const wb=createWorkbook();XLSX.writeFile(wb,'配膳學習成果-'+new Date().toLocaleDateString('sv-SE')+'.xlsx');notify('已下載 Excel（答對率單位為 %，答題時間為秒）。');}catch(e){notify(e.message);}}

// ====================== Events ======================
function showLargeImage(file){const src=safeImagePath(file);if(!src)return;const img=$('large-image');img.src=src;img.alt='放大的題目圖片';$('image-viewer').showModal();tick();}
function wire(){
  document.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>showLargeImage(b.dataset.zoom));
  const on=(id,fn,event='click')=>{if($(id))$(id).addEventListener(event,fn);};
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  on('game-mode',e=>{gameMode=e.target.value;selected.clear();render();},'change');
  document.querySelectorAll('[data-pick]').forEach(b=>b.onchange=()=>{const limit=gameMode==='computer'?1:4;if(b.checked&&selected.size>=limit){b.checked=false;return notify(gameMode==='computer'?'單人模式只能選擇 1 位玩家。':'最多選擇 4 位玩家。');}if(b.checked)selected.add(b.dataset.pick);else selected.delete(b.dataset.pick);$('selected-count').textContent=`（${selected.size}/${gameMode==='computer'?1:4}）`;});
  on('start',startGame);on('resume',()=>navigate('game'));on('roll',rollDice);on('next',nextTurn);
  on('end-game',()=>confirmAction('強制結束並保存學習歷程？','會保存已完成作答、得分、棋盤位置與本場歷程。當前未完成題目標示為未作答，不算答錯；電腦回合也會停止。',()=>finishGame('強制結束')));
  document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>answer(b.dataset.answer));
  on('session-filter',e=>{filterSession=e.target.value;render();},'change');
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{statsTab=b.dataset.tab;render();});
  on('export-excel',exportExcel);
  on('export-records',()=>exportCSV('答題明細.csv',RF,filteredRecords()));
  on('backup',()=>download('配膳學習紀錄備份-'+Date.now()+'.json',JSON.stringify({version:2,records,sessions,game:historyGame(game)},null,2),'application/json'));
  on('clear-records',()=>confirmAction('確定要刪除所有遊戲紀錄嗎？','此操作無法復原。所有場次、答題紀錄與進行中的遊戲將清除；正式玩家與題庫 CSV 不受影響。請先匯出備份。',()=>{records=[];sessions=[];game=null;filterSession='all';selected.clear();save();render();notify('遊戲紀錄已清除。');}));
}

document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notify('此瀏覽器無法切換全螢幕，請使用 F11。');}};
window.addEventListener('hashchange',()=>{const p=location.hash.slice(1);if(['home','players','questions','stats','game'].includes(p)&&p!==page){if(busy){location.hash=page;return;}page=p;render();}});
$('image-close').onclick=()=>$('image-viewer').close();
$('confirm-dialog').addEventListener('close',scheduleComputer);
setInterval(tick,200);
readStore();migrate();showStorageWarning();if(!storageError){save();sanitizeLegacyBackup();}page=game?'game':(['home','players','questions','stats'].includes(location.hash.slice(1))?location.hash.slice(1):'home');render();if(!storageError)loadCatalog();
})();

