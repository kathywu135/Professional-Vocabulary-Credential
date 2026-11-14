(function(){
'use strict';
const B=globalThis.PVQC_BANK,C=globalThis.PVQC,$=s=>document.querySelector(s), W=new Map(B.words.map(w=>[w.wordId,w]));
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>x?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(x)):'尚無紀錄';
const modeName={memory:'記憶學習',wrong:'錯題補強',pure:'純學習',manual:'主動複習'};
const typeName={T1:'看英文，選中文',T2:'聽英文，選中文',T3:'看中文，選英文',T4:'聽英文，選英文',T5:'聽英文，拼出英文'};
let state=C.fresh(B),db=null,saveQueue=Promise.resolve(),persistOK=false,storageBlocked=false,recoveryRaw=null,view='home',detailId=null,wordQuery='',wordLevel='全部',wordStatus='全部',wordPage=0,historyDate='',wrongTab='pending',selected='',spelling='',heard=null,audioToken=0,busy=false;
const main=$('#main'),modal=$('#modal');
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',3500);}
function saveLabel(message,ok){$('#saveStatus').textContent=message;$('#saveStatus').classList.toggle('bad',!ok);}
async function init(){
 try{
  if(!globalThis.indexedDB)throw Error('此瀏覽器無法使用 IndexedDB');
  db=await new Promise((resolve,reject)=>{const r=indexedDB.open('louie-pvqc',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('資料庫被其他分頁占用'));});
  db.onversionchange=()=>{db.close();db=null;persistOK=false;saveLabel('儲存已中斷，請備份並重開',false);};
  const loaded=await new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('main');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  if(loaded){try{state=C.validate(loaded,B);}catch(err){recoveryRaw=loaded;storageBlocked=true;throw Error('原有資料無法讀取，已保留原檔。請先匯出原始資料。');}}
  state.catalog=[...new Set([...state.catalog,...B.words.map(w=>w.wordId)])];state.bankVersion=B.version;
  persistOK=true;saveLabel('● 本機已儲存',true);
 }catch(err){persistOK=false;saveLabel('⚠ 儲存不可用',false);toast(err.message);}
 render();
 if(!storageBlocked)await save();
}
async function save(){
 const snapshot=JSON.parse(JSON.stringify(state));saveLabel('儲存中…',true);
 saveQueue=saveQueue.catch(()=>{}).then(async()=>{
  if(!db||storageBlocked){persistOK=false;saveLabel('⚠ 僅暫存記憶體，請匯出',false);return;}
  try{await new Promise((resolve,reject)=>{const t=db.transaction('state','readwrite');t.objectStore('state').put(snapshot,'main');t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});persistOK=true;saveLabel('● 本機已儲存',true);}
  catch(err){persistOK=false;saveLabel('⚠ 儲存失敗，請匯出',false);toast('儲存失敗。進度暫存在記憶體，重新整理可能遺失；請立即匯出備份。');}
 });return saveQueue;
}
function active(){return state.sessions.find(s=>s.id===state.activeId);}
function tag(level){return `<span class="badge ${level==='中級'?'mid':level==='高級'?'high':''}">${e(level)}</span>`;}
function statusTag(status){return `<span class="badge ${status==='已掌握'?'master':status==='待複習'?'error':'neutral'}">${e(status)}</span>`;}
function stopAudio(){audioToken++;globalThis.speechSynthesis?.cancel();}
function navigate(to){stopAudio();heard=null;selected='';spelling='';view=to;render();window.scrollTo(0,0);main.focus({preventScroll:true});}
function top(title,subtitle=''){return `<button class="textbtn back" data-action="home">← 回學習首頁</button><div class="eyebrow">LOUIE / PVQC AI</div><h1>${title}</h1>${subtitle?`<p class="muted">${subtitle}</p>`:''}`;}
function storageWarning(){return persistOK?'':`<div class="errorbox">此頁目前僅暫存記憶體，重新整理可能遺失進度。請先到「備份」匯出。${storageBlocked?'原始資料已保留，未被覆寫。':''}</div>`;}
function render(){
 document.querySelectorAll('[data-nav]').forEach(n=>n.classList.toggle('active',n.dataset.nav===view));
 let html=storageWarning();
 if(view==='home')html+=home();else if(view==='session')html+=sessionView();else if(view==='words')html+=wordsView();else if(view==='history')html+=historyView();else if(view==='data')html+=dataView();else if(view==='review')html+=reviewView();else if(view==='wrong')html+=wrongView();else if(view==='detail')html+=detailView();
 main.innerHTML=html;
 if(view==='words'){$('#wordSearch').value=wordQuery;$('#wordLevel').value=wordLevel;$('#wordStatus').value=wordStatus;}
 if(view==='history')$('#historyDate').value=historyDate;
 if(view==='session'){
  const s=active();if(s?.phase==='cards'){const id=s.ids[s.cardIndex];if(!s.seen[id]){s.seen[id]=C.now();void save();}}
 }
}
function home(){
 const st=C.stats(state,B),xs=B.words.map(w=>st[w.wordId]),today=C.day(C.now());
 const done=state.sessions.filter(s=>s.status==='completed'),last=[...state.sessions].reverse()[0];
 const n={seen:xs.filter(x=>x.seen).length,master:xs.filter(x=>x.status==='已掌握').length,wrong:xs.filter(x=>x.status==='待複習').length,today:done.filter(s=>C.day(s.ended)===today).length};
 return `<div class="notice"><b>開發試用版 · 題庫待確認</b>　已依 PDF 整理 ${B.words.length} 筆。分級、原文疑點與縮寫讀音尚待確認；目前紀錄供試用驗收。<button class="textbtn" data-action="review">查看完整分級表 →</button></div>
 <section class="intro"><div><div class="eyebrow">A LITTLE EVERY DAY.</div><h1>Louie，今天也來<br>學會幾個新單字。</h1><p>從熟悉的字出發，慢慢讀懂人工智慧。<br>每次 5 個字，把認字、聽力和拼寫一起練好。</p><span class="small">最近練習：${fmt(last?.started)}</span></div><div class="step-art" aria-hidden="true"><div class="art-card"></div><div class="art-card front"><small>CONNECT THE DOTS</small><b>sensor</b><span style="font-size:.75rem">感應器 · 傳感器</span></div><div class="orbit"></div><span class="art-caption">01 / UNDERSTAND → REMEMBER</span></div></section>
 <div class="stats"><div class="stat"><strong>${n.today}<span> 組</span></strong><span>今日完成</span></div><div class="stat"><strong>${n.seen}<span> / ${B.words.length}</span></strong><span>累計接觸</span></div><div class="stat"><strong>${n.master}<span> 字</span></strong><span>已掌握</span></div><div class="stat"><strong>${n.wrong}<span> 字</span></strong><span>待複習</span></div></div><p class="small">累計接觸包含已掌握與待複習，以上數字不可相加。</p>
 ${active()?`<div class="resume"><p><b>有一組還沒完成</b><br>${modeName[active().mode]} · ${active().ids.length} 字 · 進度已保留</p><div class="row"><button class="primary" data-action="resume">接著練習 →</button><button class="textbtn" data-action="end">結束這一組</button></div></div>`:''}
 <div class="section-top"><h2>選擇今天的練習</h2><span class="small">照自己的步調，不限時</span></div><div class="modes"><section class="mode featured"><span class="icon" aria-hidden="true">▤</span><span class="tag">01 / LEARN & REMEMBER</span><h2>記憶學習</h2><p>先認字，再完成五輪測驗。<br>五種能力都答對，才算學會。</p><button data-action="setup" data-mode="memory">開始學習 <span>↗</span></button></section><section class="mode"><span class="icon" aria-hidden="true">↻</span><span class="tag">02 / TRY AGAIN</span><h2>錯題補強</h2><p>從答錯的題型重新練習，<br>最後用完整檢核確認掌握。</p><button data-action="wrong">複習 ${n.wrong} 個單字 <span>→</span></button></section><section class="mode"><span class="icon" aria-hidden="true">Aa</span><span class="tag">03 / JUST EXPLORE</span><h2>純學習</h2><p>翻翻字卡、聽聽發音。<br>不考試，也可以慢慢認識。</p><button data-action="setup" data-mode="pure">瀏覽單字卡 <span>→</span></button></section></div>
 <div class="section-top"><h2>學習小提醒</h2></div><div class="panel"><p class="small" style="margin:0">固定使用同一台裝置、同一瀏覽器與同一網址。完成練習後記得偶爾匯出備份，清除瀏覽器資料可能讓紀錄遺失。</p></div>`;
}
function setup(mode){
 if(active()){showModal(`<h2>先處理未完成的練習</h2><p>目前同時保留一組。可接續，或結束後再開始新模式；已作答紀錄會保留。</p><div class="row"><button data-close>取消</button><button data-action="end">結束這一組</button><button class="primary" data-action="resume">繼續練習</button></div>`);return;}
 showModal(`<div class="eyebrow">${mode==='pure'?'JUST EXPLORE':'LEARN & REMEMBER'}</div><h2>${modeName[mode]}，一次幾個字？</h2><p class="small">${mode==='pure'?'只看字卡與聽發音，不計分、不改變掌握狀態。':'先看字卡，再練五種題型。預設初級為主，已掌握的字不再自動抽選。'}</p><label for="count">本組數量</label><select id="count"><option value="5">5 個字</option><option value="10">10 個字</option></select>${mode==='pure'?`<p><label for="pureLevel">選擇級別</label> <select id="pureLevel"><option>混合</option>${C.LEVELS.map(l=>`<option>${l}</option>`).join('')}</select></p><label><input type="checkbox" id="includeMastered">包含已掌握的字</label>`:''}<p class="small">測試發音：<button class="textbtn" data-action="audio-test">▶ engine</button><span id="audioStatus" role="status"></span></p><div class="row"><button data-close>取消</button><button class="primary" data-action="prepare" data-mode="${mode}">選取本組單字 →</button></div>`);
}
let pendingSession=null;
function prepare(mode,opts={}){
 if(active()){setup(mode);return;}
 const count=Number($('#count')?.value||5),level=$('#pureLevel')?.value||'混合',includeMastered=!!$('#includeMastered')?.checked;
 const s=C.makeSession(B,state,mode,count,{level,includeMastered,...opts});
 if(!s){closeModal();toast(mode==='wrong'?'目前沒有待複習單字。':'符合條件的單字已全部掌握。可在單字紀錄主動複習。');return;}
 pendingSession=s;
 const counts=C.LEVELS.map(l=>`${l} ${s.ids.filter(id=>W.get(id).level===l).length}`).join(' · ');
 showModal(`<h2>本組準備好了</h2><p>${s.ids.length} 個字 · ${e(counts)}</p>${s.ids.length<count&&mode!=='wrong'&&mode!=='manual'?`<div class="notice">可用單字不足 ${count} 個，本組以剩餘 ${s.ids.length} 個進行，沒有補入已掌握字。</div>`:''}<p class="small">${mode==='pure'?'完成卡片會記錄接觸情況。':`${s.ids.length*5} 題完整檢核${mode==='wrong'?`，另有 ${s.questions.filter(q=>q.kind==='boost').length} 題針對錯誤的補強。`:'，每輪順序都不同。'}`}</p><div class="row"><button data-close>取消</button><button class="primary" data-action="start">開始這一組 →</button></div>`);
}
function sessionView(){
 const s=active();if(!s)return top('目前沒有進行中的練習')+`<button class="primary" data-action="home">回首頁</button>`;
 if(s.phase==='cards')return cardsView(s);
 return quizView(s);
}
function cardsView(s){
 const w=W.get(s.ids[s.cardIndex]),done=s.done.includes(w.wordId),allDone=s.done.length===s.ids.length;
 return `<div class="narrow">${top(modeName[s.mode],`${s.ids.length} 個字 · 認識完再進下一步`)}<div class="row between"><span class="small">字卡 ${s.cardIndex+1} / ${s.ids.length}</span><span class="small">已完成 ${s.done.length} 張</span></div><div class="progress"><div style="width:${s.done.length/s.ids.length*100}%"></div></div><div class="panel card">${tag(w.level)}<div class="word" lang="en">${e(w.english)}</div><span class="pos">${e(w.pos)}</span><div class="definition">${e(w.chinese)}</div><div class="row" style="justify-content:center"><button class="speaker" data-action="speak" data-id="${w.wordId}">▶ 聽發音</button><button class="textbtn" data-action="speak-slow" data-id="${w.wordId}">慢速</button></div><p id="audioStatus" class="small" role="status"></p>${w.plain?`<p class="plain">白話理解：${e(w.plain)}</p>`:''}${w.note?`<p class="small">校對提醒：${e(w.note)}</p>`:''}<span class="source">PDF 第 ${w.page} 頁 · ${w.wordId} · 題庫待確認</span></div><div class="card-actions"><button data-action="prev-card" ${s.cardIndex===0?'disabled':''}>← 上一張</button><button class="primary" data-action="done-card" ${done?'disabled':''}>${done?'✓ 這個字已學習完畢':'這個學習完畢'}</button><button data-action="next-card" ${s.cardIndex===s.ids.length-1?'disabled':''}>下一張 →</button></div>${allDone?`<div class="panel" style="margin-top:20px"><h3>本組字卡已全部完成</h3><p class="small">${s.mode==='pure'?'卡片學習只記錄接觸，不代表已掌握。':s.mode==='wrong'?'先練原本答錯的題型，再完成五輪檢核。':'接下來五輪，每輪測本組全部單字。'}</p><button class="primary full" data-action="begin-quiz">${s.mode==='pure'?'完成本組純學習':'學習完畢，開始測驗 →'}</button></div>`:''}<p class="small" style="margin-top:20px">可以隨時回首頁，完成的動作會自動保存。</p></div>`;
}
function quizView(s){
 const q=s.questions[s.qIndex];if(!q)return `<p>本組已完成。</p><button data-action="finish">查看結果</button>`;
 const w=W.get(q.wordId),answered=!!q.answer,listen=['T2','T4','T5'].includes(q.type),ready=!listen||heard===q.id||answered;
 const roundQs=s.questions.filter(z=>z.kind===q.kind&&z.type===q.type),ri=roundQs.findIndex(z=>z.id===q.id)+1,full=s.questions.filter(z=>z.kind==='check').length;
 const sc=C.score(s);const round=q.kind==='boost'?'原錯題型補強':`第 ${C.TYPES.indexOf(q.type)+1} / 5 輪`;
 const feedback=answered?`<div class="feedback ${q.answer.correct?'':'wrong'}" role="status"><strong>${q.answer.correct?'✓ 答對了！':'✕ 這個字再記一次'}</strong><span lang="en">${e(w.english)}</span> · ${e(w.chinese)}${!q.answer.correct?`<div class="small">首次答案：${q.answer.giveup?'不會，查看答案':e(q.type==='T5'?q.answer.value:W.get(q.answer.value)?.[q.type==='T1'||q.type==='T2'?'chinese':'english']||q.answer.value)}</div><div class="row"><button class="textbtn" data-action="peek" data-id="${w.wordId}">再看字卡</button><button class="textbtn" data-action="speak" data-id="${w.wordId}">▶ 重播</button></div>`:''}</div>`:'';
 return `<div class="narrow">${top(modeName[s.mode])}<div class="row between"><b class="round-label">${q.kind==='boost'?'補強練習 · 不列正式檢核':round}</b><span class="small">本輪 ${ri} / ${roundQs.length} 題</span></div><div class="progress"><div style="width:${s.questions.filter(z=>z.answer).length/s.questions.length*100}%"></div></div><div class="panel"><div class="row between"><span class="badge">${q.type}</span><span class="small">${typeName[q.type]}</span></div>
 ${listen?`<div class="listen"><button data-action="listen" aria-label="播放本題英文">▶</button><span class="small">${ready?'可以重播，再確認答案':'先點播放，聽完再作答'}</span></div><p id="audioStatus" class="small" role="status" style="text-align:center"></p>`:`<h2 class="quiz-title" ${q.type==='T1'?'lang="en"':''}>${e(q.type==='T1'?w.english:w.chinese)}</h2>`}
 ${q.blocked?`<div class="errorbox">${e(q.blocked)}</div>`:q.type==='T5'?`<label class="small" for="spellInput">輸入聽到的英文（大小寫不影響一般判分）</label><input id="spellInput" class="spelling" type="text" value="${e(answered?q.answer.value:spelling)}" autocomplete="off" autocapitalize="off" spellcheck="false" ${answered?'disabled':''}><div class="keyboard">${q.keys.map(k=>`<button data-action="key" data-key="${k}" ${answered?'disabled':''}>${k}</button>`).join('')}</div><div class="row" style="margin-top:12px"><button data-action="key" data-key=" " ${answered?'disabled':''}>空格</button><button data-action="key" data-key="-" ${answered?'disabled':''}>-</button><button data-action="key" data-key="delete" ${answered?'disabled':''}>⌫ 刪除</button><button data-action="key" data-key="clear" ${answered?'disabled':''}>清空</button></div>`:`<div class="options">${q.options.map((id,i)=>{const ow=W.get(id),showChinese=q.type==='T1'||q.type==='T2';return `<button class="option ${selected===id?'selected':''} ${answered&&id===q.wordId?'correct':''} ${answered&&id===q.answer.value&&!q.answer.correct?'incorrect':''}" data-action="option" data-id="${id}" ${answered?'disabled':''} aria-pressed="${selected===id}"><span>${'ABCD'[i]}</span><span>${answered&&id===q.wordId?'✓ ':''}${e(showChinese?ow.chinese:ow.english)}</span></button>`;}).join('')}</div><p class="small">${q.options.length} 選一 · 選好後按「確認答案」，送出前可修改。</p>`}
 ${feedback}<div class="quiz-actions">${answered?`<span class="small">已記錄首次作答</span><button class="primary" data-action="next-question">${s.qIndex===s.questions.length-1?'查看結果':'下一題 →'}</button>`:`<button class="textbtn" data-action="giveup" ${!ready||q.blocked?'disabled':''}>不會，查看答案</button><button class="primary" id="submitAnswer" data-action="submit" ${!ready||q.blocked?'disabled':''}>確認答案</button>`}</div></div><p class="small">完整檢核暫計：${sc.correct} / ${sc.total} 題首次答對 · 預計 ${full} 題。補強成績另計。</p></div>`;
}
function wordsView(){
 const st=C.stats(state,B),matches=B.words.filter(w=>(wordLevel==='全部'||w.level===wordLevel)&&(wordStatus==='全部'||st[w.wordId].status===wordStatus)&&(!wordQuery||`${w.english} ${w.chinese}`.toLowerCase().includes(wordQuery.toLowerCase()))),pages=Math.max(1,Math.ceil(matches.length/25));wordPage=Math.min(wordPage,pages-1);
 return `${top('單字紀錄','每個字都有自己的進度。點英文可以查看五種題型與歷史。')}<div class="filters"><input id="wordSearch" type="search" aria-label="搜尋英文或中文" placeholder="搜尋英文或中文…"><select id="wordLevel" aria-label="級別"><option>全部</option>${C.LEVELS.map(l=>`<option>${l}</option>`).join('')}</select><select id="wordStatus" aria-label="學習狀態">${['全部','未學','已看過','練習中','待複習','已掌握'].map(l=>`<option>${l}</option>`).join('')}</select></div><p class="small">共 ${matches.length} 個單字 · 第 ${wordPage+1} / ${pages} 頁</p><div class="panel table-wrap"><table><thead><tr><th>英文 / PDF 頁</th><th>正式中文</th><th>級別</th><th>目前狀態</th></tr></thead><tbody>${matches.slice(wordPage*25,(wordPage+1)*25).map(w=>`<tr><td><button class="textbtn" data-action="detail" data-id="${w.wordId}">${e(w.english)}</button><div class="source">第 ${w.page} 頁</div></td><td>${e(w.chinese)}</td><td>${tag(w.level)}</td><td>${statusTag(st[w.wordId].status)}</td></tr>`).join('')}</tbody></table>${matches.length?'':'<p class="empty">沒有符合條件的單字。</p>'}</div><div class="row between"><button data-action="page-prev" ${wordPage===0?'disabled':''}>← 上一頁</button><button data-action="page-next" ${wordPage===pages-1?'disabled':''}>下一頁 →</button></div>`;
}
function detailView(){
 const w=W.get(detailId);if(!w)return top('找不到單字');const st=C.stats(state,B)[w.wordId],sessions=state.sessions.filter(s=>s.ids.includes(w.wordId));
 return `<div class="narrow">${top(e(w.english))}<div class="panel">${tag(w.level)} ${statusTag(st.status)}<p class="definition">${e(w.chinese)}</p><p class="pos">${e(w.pos)} · PDF 第 ${w.page} 頁 · ${w.wordId}</p><button data-action="speak" data-id="${w.wordId}">▶ 聽發音</button><p id="audioStatus" class="small" role="status"></p>${w.plain?`<p>${e(w.plain)}</p>`:''}<p class="small">${e(w.note)}</p><button class="primary" data-action="manual" data-id="${w.wordId}">主動練習此字（完整五題）</button><p class="small">主動練錯會轉為待複習，曾掌握日期仍保留。</p></div><div class="panel"><h2>學習軌跡</h2><p class="small">最近完整檢核：${st.lastCheck?`${st.lastCheck.correct} / 5 · ${st.lastCheck.pass?'已通過':'待補強'} · ${fmt(st.lastCheck.at)}`:'尚未完成'}<br>目前掌握日期：${fmt(st.masteredAt)}<br>最近曾掌握：${fmt(st.everMasteredAt)}<br>最近錯誤：${st.lastError?`${typeName[st.lastError.type]} · ${fmt(st.lastError.at)}`:'無'}</p><table><thead><tr><th>題型</th><th>累計首次答對 / 作答</th></tr></thead><tbody>${C.TYPES.map(t=>`<tr><td>${t} ${typeName[t]}</td><td>${st.types[t].correct} / ${st.types[t].total}</td></tr>`).join('')}</tbody></table><p class="small">歷史累計包含補強與各次檢核，不能拼湊成單次掌握。</p></div><h2>曾練習的組別</h2>${sessions.length?sessions.reverse().map(s=>record(s)).join(''):'<p class="empty">尚未練習。</p>'}<button data-action="words">返回單字紀錄</button></div>`;
}
function record(s){const sc=C.score(s),boost=C.score(s,'boost');return `<article class="record"><div class="row between"><h3>${modeName[s.mode]} <span class="badge neutral">${s.status==='completed'?'已完成':s.status==='interrupted'?'已中斷':'進行中'}</span></h3><span class="small">${fmt(s.started)}</span></div><p>${s.ids.map(id=>e(W.get(id)?.english||id)).join(' · ')}</p><p class="small">完成字卡 ${s.done.length} / ${s.ids.length}${s.mode==='pure'?' · 純學習不計答對率':` · ${s.status==='completed'?'正式':'暫計'}檢核 ${sc.correct} / ${sc.total}${sc.total?`（${Math.round(sc.correct/sc.total*100)}%）`:''}`}${boost.total?` · 補強 ${boost.correct} / ${boost.total}`:''}<br>開始：${fmt(s.started)}　結束：${fmt(s.ended)}</p><button class="textbtn" data-action="result" data-id="${s.id}">查看逐題紀錄 →</button></article>`;}
function historyView(){
 const ss=[...state.sessions].reverse().filter(s=>!historyDate||C.day(s.started)===historyDate||s.ended&&C.day(s.ended)===historyDate);
 return `${top('學習紀錄','按台灣時間顯示；跨日組別保留開始與完成時間，今日完成數以完成日計算。')}<div class="filters"><label for="historyDate">篩選日期</label><input type="date" id="historyDate"><button data-action="clear-date">全部日期</button></div><p class="small">${ss.length} 組練習</p><div class="records">${ss.length?ss.map(record).join(''):'<div class="panel empty">這天還沒有練習紀錄。</div>'}</div>`;
}
function wrongView(){
 const st=C.stats(state,B),wrong=B.words.filter(w=>wrongTab==='pending'?st[w.wordId].status==='待複習':!!st[w.wordId].lastError);
 return `${top('錯題補強','先練原本答錯題型，再完成五種題型檢核；五題首次全對才移出待複習。')}<div class="row"><button class="${wrongTab==='pending'?'primary':''}" data-action="wrong-pending">待複習</button><button class="${wrongTab==='history'?'primary':''}" data-action="wrong-history">歷史錯題</button></div><div class="section-top"><h2>${wrongTab==='pending'?'待複習':'歷史'} ${wrong.length} 字</h2>${wrongTab==='pending'&&wrong.length?'<button class="primary" data-action="wrong-start">開始補強（最多 5 字）</button>':''}</div>${wrong.length?wrong.map(w=>`<div class="record"><div class="row between"><button class="textbtn" data-action="detail" data-id="${w.wordId}">${e(w.english)}</button>${statusTag(st[w.wordId].status)}</div><p>${e(w.chinese)}</p><p class="small">尚未補強題型：${Object.keys(st[w.wordId].errors).join('、')||'已補強，待完整檢核'} · 最近錯誤 ${fmt(st[w.wordId].lastError?.at)}</p></div>`).join(''):'<div class="panel empty"><h2>目前沒有待複習單字</h2><p>可以開始新的記憶學習，或輕鬆翻翻字卡。</p><button data-action="setup" data-mode="memory">開始記憶學習 →</button></div>'}`;
}
function dataView(){return `${top('資料與備份','進度只存在目前的瀏覽器，沒有帳號與雲端同步。')}<div class="panel"><h2>匯出進度</h2><p>備份包含完整歷史、首次答案、錯題與未完成的練習。建議完成幾組後下載一次，存到自己找得到的地方。</p><button class="primary" data-action="export">下載 JSON 備份</button>${recoveryRaw?'<button data-action="export-recovery">匯出未能讀取的原始資料</button>':''}</div><div class="panel"><h2>從備份恢復</h2><p>第一版採整份取代，不合併。選檔後會先檢查，再顯示摘要；確認前不會改動現有資料。</p><label for="importFile">選擇 JSON 備份</label><input type="file" id="importFile" accept="application/json,.json"><div id="importStatus" class="small" role="status"></div></div><div class="panel"><h2>保存說明</h2><ul class="note-list"><li>固定使用同一裝置、同一瀏覽器、一般瀏覽模式與同一網址。</li><li>每次確認答案、完成字卡或切換階段即保存；不依賴關閉頁面。</li><li>清除網站資料、移除瀏覽器或系統回收資料，可能造成紀錄遺失。</li><li>網站版本更新保留紀錄；換網址或瀏覽器前，請先匯出備份。</li><li>語音使用裝置英文聲音。首次載入需連線，未承諾離線使用。</li></ul><button data-action="audio-test">▶ 測試 engine 發音</button><p id="audioStatus" class="small" role="status"></p></div><div class="panel"><h2>重新開始</h2><p class="small">重設會清除本瀏覽器的全部練習紀錄，需兩次確認。</p><button class="danger" data-action="reset">重設全部紀錄</button></div>`;}
function reviewView(){return `${top('題庫校對與分級',`${B.words.length} 筆 · 來源 PDF 第 2–20 頁 · 所有分級尚待使用者確認`)}<div class="notice">本表不是正式確認題庫。英文、詞性與正式中文保留 PDF 內容；白話說明、分級與縮寫讀音屬建議。請核對原文疑點，發布前再確認公開內容範圍。</div><div class="row"><span class="badge">初級 ${B.words.filter(w=>w.level==='初級').length}</span><span class="badge mid">中級 ${B.words.filter(w=>w.level==='中級').length}</span><span class="badge high">高級 ${B.words.filter(w=>w.level==='高級').length}</span><button data-action="download-bank">下載完整分級 JSON</button></div><div class="panel table-wrap" style="margin-top:20px"><table><thead><tr><th>英文 / ID</th><th>詞性 / 正式中文</th><th>建議級別 / 依據</th><th>頁 / 校對提醒</th></tr></thead><tbody>${B.words.map(w=>`<tr><td>${e(w.english)}<div class="source">${w.wordId}</div></td><td>${e(w.pos)}<br>${e(w.chinese)}</td><td>${tag(w.level)}<div class="small">${e(w.levelReason)}</div></td><td>${w.page}<div class="small">${e(w.note)}</div></td></tr>`).join('')}</tbody></table></div>`;}
function resultModal(id){
 const s=state.sessions.find(x=>x.id===id);if(!s)return;const sc=C.score(s),boost=C.score(s,'boost'),master=s.ids.filter(id=>{const qs=s.questions.filter(q=>q.kind==='check'&&q.wordId===id);return qs.length===5&&qs.every(q=>q.answer?.correct);});
 showModal(`<div class="eyebrow">${s.status==='completed'?'SESSION COMPLETE':'SESSION RECORD'}</div><h2>${s.status==='completed'?'這一組，練習完成。':'這一組的練習紀錄'}</h2>${s.mode==='pure'?'<p>完成純學習，只記錄接觸，不判定掌握。</p>':`<div class="result-ring"><strong>${sc.total?Math.round(sc.correct/sc.total*100):0}%</strong><small>${s.status==='completed'?'正式':'暫計'}首次答對率</small></div><div class="summary-grid"><div><b>${sc.correct} / ${sc.total}</b><p class="small" style="margin:5px 0 0">完整檢核首次答對</p></div><div><b>${master.length} / ${s.ids.length} 字</b><p class="small" style="margin:5px 0 0">本組五題全對</p></div></div>${boost.total?`<p class="small">原錯題型補強：${boost.correct} / ${boost.total}（不計入正式檢核）</p>`:''}`}
 <p class="small">${fmt(s.started)}<br>${s.status==='completed'?'完成':'結束'}：${fmt(s.ended)}</p><details><summary>查看字卡與首次答案</summary><div class="small">${s.ids.map(id=>`${e(W.get(id)?.english||id)}：${s.done.includes(id)?'字卡已完成':'字卡未完成'}`).join('<br>')}</div>${s.questions.map(q=>{const w=W.get(q.wordId),a=q.answer;return `<p class="small">${q.kind==='boost'?'補強':'檢核'} ${q.type} · ${e(w?.english||q.wordId)}<br>${a?`${a.correct?'✓ 正確':'✕ 錯誤'} · 首次：${a.giveup?'不會，查看答案':e(q.type==='T5'?a.value:W.get(a.value)?.[q.type==='T1'||q.type==='T2'?'chinese':'english']||a.value)}`:'尚未作答'}</p>`;}).join('')}</details><div class="row"><button data-action="export">下載備份</button><button class="primary" data-close>關閉</button></div>`);
}
function showModal(html){stopAudio();$('#modalBody').innerHTML=html;if(!modal.open)modal.showModal();}
function closeModal(){stopAudio();modal.close();}
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function exportData(){download(state,`Louie_PVQC_Backup_${C.day(C.now()).replaceAll('/','-')}.json`);toast('已建立備份下載，請確認檔案已儲存。');}
let importCandidate=null;
async function importFile(file){
 try{if(!file||file.size>25*1024*1024)throw Error('請選擇 25 MB 以下的 JSON 備份。');const parsed=JSON.parse(await file.text());importCandidate=C.validate(parsed,B);const counts=importCandidate.sessions.length;showModal(`<h2>確認備份內容</h2><p>包含 ${counts} 組練習${importCandidate.activeId?'，其中 1 組未完成':''}。<br>最後練習：${fmt(importCandidate.sessions.at(-1)?.started)}<br>題庫：${e(importCandidate.bankVersion)}</p><div class="notice">匯入將整份取代現有紀錄，無法合併。請先匯出目前資料。</div><button data-action="export">先匯出現有資料</button><p><label><input type="checkbox" id="replaceConfirm">我確認要取代目前全部紀錄</label></p><div class="row"><button data-close>取消</button><button class="primary" data-action="import-confirm">確認取代並恢復</button></div>`);}
 catch(err){$('#importStatus').textContent=err.message;toast('備份檢查失敗，現有資料未變更。');}
}
function speak(w,slow=false,qid=null){
 const status=$('#audioStatus'),set=t=>{if(status)status.textContent=t;};
 if(!globalThis.speechSynthesis||!globalThis.SpeechSynthesisUtterance){set('此瀏覽器無法播放英文語音。請使用裝置英文語音或稍後重試，聽力進度會保留。');return;}
 stopAudio();const token=audioToken,voices=speechSynthesis.getVoices(),english=voices.filter(v=>/^en([-_]|$)/i.test(v.lang));
 if(!english.length){set('尚無可用英文聲音。請確認裝置已安裝英文語音，再點重試；此情況不計錯。');return;}
 const u=new SpeechSynthesisUtterance(w.speech||w.english);u.lang='en-US';u.voice=english.find(v=>v.lang==='en-US')||english[0];u.rate=slow?.7:.9;
 let timer=setTimeout(()=>{if(token===audioToken){set('播放未完成，請再試一次；本題未計錯。');speechSynthesis.cancel();}},30000);
 u.onstart=()=>{if(token===audioToken)set('播放中…');};
 u.onend=()=>{clearTimeout(timer);if(token!==audioToken)return;set('✓ 已播放，可重播。');if(qid){heard=qid;$('#submitAnswer')?.removeAttribute('disabled');main.querySelector('[data-action="giveup"]')?.removeAttribute('disabled');}};
 u.onerror=()=>{clearTimeout(timer);if(token===audioToken)set('語音播放失敗，請重試。進度已保留，此情況不計錯。');};
 set('準備播放…');speechSynthesis.speak(u);
}
async function complete(s){s.status='completed';s.ended=C.now();s.phase='result';state.activeId=null;await save();navigate('home');resultModal(s.id);}
async function action(a,el){
 const s=active();
 switch(a){
 case 'home':navigate('home');break;case 'words':navigate('words');break;case 'review':navigate('review');break;case 'wrong':navigate('wrong');break;
 case 'setup':setup(el.dataset.mode);break;case 'prepare':prepare(el.dataset.mode);break;
 case 'start':if(!pendingSession||active())return;state.sessions.push(pendingSession);state.activeId=pendingSession.id;pendingSession=null;closeModal();await save();navigate('session');break;
 case 'resume':closeModal();navigate('session');break;
 case 'end':if(!s)return;showModal(`<h2>結束這一組？</h2><p>會保留已看字卡、首次答案與已達成的單字掌握。這組列為中斷，不算今日完成組數。</p><div class="row"><button data-close>繼續保留</button><button class="danger" data-action="end-confirm">確認結束</button></div>`);break;
 case 'end-confirm':if(!s)return;s.status='interrupted';s.ended=C.now();state.activeId=null;closeModal();await save();navigate('home');break;
 case 'prev-card':case 'next-card':if(!s)return;stopAudio();s.cardIndex=Math.max(0,Math.min(s.ids.length-1,s.cardIndex+(a==='next-card'?1:-1)));await save();render();break;
 case 'done-card':if(!s)return;{const id=s.ids[s.cardIndex];if(!s.done.includes(id))s.done.push(id);await save();render();}break;
 case 'begin-quiz':if(!s||s.done.length!==s.ids.length)return;if(s.mode==='pure'){await complete(s);return;}s.phase='quiz';heard=null;await save();render();break;
 case 'option':selected=el.dataset.id;main.querySelectorAll('.option').forEach(b=>{b.classList.toggle('selected',b.dataset.id===selected);b.setAttribute('aria-pressed',String(b.dataset.id===selected));});break;
 case 'key':{const input=$('#spellInput');if(!input||input.disabled)return;const k=el.dataset.key;spelling=k==='clear'?'':k==='delete'?spelling.slice(0,-1):spelling.length<200?spelling+k:spelling;input.value=spelling;break;}
 case 'submit':case 'giveup':{
  if(!s)return;const q=s.questions[s.qIndex];if(!q||q.answer)return;if(['T2','T4','T5'].includes(q.type)&&heard!==q.id){toast('請先成功播放本題英文，再作答。');return;}
  const v=q.type==='T5'?($('#spellInput')?.value||''):selected;C.submit(s,B,v,a==='giveup');stopAudio();await save();render();break;}
 case 'next-question':if(!s||!s.questions[s.qIndex]?.answer)return;stopAudio();const previous=s.questions[s.qIndex];s.qIndex++;selected='';spelling='';heard=null;if(s.qIndex>=s.questions.length){await complete(s);return;}await save();render();if(previous.type!==s.questions[s.qIndex].type||previous.kind!==s.questions[s.qIndex].kind){showModal(`<h2>這一輪完成了</h2><p>下一輪：${typeName[s.questions[s.qIndex].type]}。可以休息一下，隨時接著練。</p><div class="row"><button data-action="pause">先回首頁</button><button class="primary" data-close>繼續下一輪 →</button></div>`);}break;
 case 'pause':closeModal();navigate('home');break;
 case 'finish':if(s&&s.questions.every(q=>q.answer))await complete(s);break;
 case 'listen':if(s)speak(W.get(s.questions[s.qIndex].wordId),false,s.questions[s.qIndex].id);break;
 case 'speak':case 'speak-slow':speak(W.get(el.dataset.id),a==='speak-slow');break;
 case 'audio-test':speak(B.words.find(w=>w.english==='engine'));break;
 case 'peek':{const w=W.get(el.dataset.id);showModal(`<h2>${e(w.english)}</h2><p>${e(w.pos)} · ${e(w.chinese)}</p><p>${e(w.plain)}</p><button data-action="speak" data-id="${w.wordId}">▶ 重播</button><p id="audioStatus" class="small" role="status"></p><div class="row"><button class="primary" data-close>返回原題</button></div>`);break;}
 case 'detail':detailId=el.dataset.id;navigate('detail');break;
 case 'manual':prepare('manual',{wordId:el.dataset.id});break;
 case 'wrong-start':prepare('wrong');break;
 case 'wrong-pending':wrongTab='pending';render();break;case 'wrong-history':wrongTab='history';render();break;
 case 'page-prev':wordPage=Math.max(0,wordPage-1);render();window.scrollTo(0,0);break;case 'page-next':wordPage++;render();window.scrollTo(0,0);break;
 case 'clear-date':historyDate='';render();break;
 case 'result':resultModal(el.dataset.id);break;
 case 'export':await saveQueue;exportData();break;
 case 'export-recovery':download(recoveryRaw,'Louie_PVQC_Recovery_Raw.json');break;
 case 'download-bank':download(B,'PVQC_Word_Review_Draft.json');break;
 case 'import-confirm':if(!$('#replaceConfirm')?.checked){toast('請勾選確認取代。');return;}if(!importCandidate)return;await saveQueue;state=importCandidate;importCandidate=null;storageBlocked=false;state.catalog=[...new Set([...state.catalog,...B.words.map(w=>w.wordId)])];state.bankVersion=B.version;closeModal();await save();navigate('home');toast(persistOK?'備份已恢復。':'已載入備份，但保存失敗，請保留原備份檔。');break;
 case 'reset':showModal(`<h2>重設全部紀錄？</h2><p>建議先備份。繼續後仍需第二次確認。</p><div class="row"><button data-action="export">先下載備份</button><button data-close>取消</button><button class="danger" data-action="reset-next">繼續重設</button></div>`);break;
 case 'reset-next':showModal(`<h2>最後確認</h2><p>這會清除所有練習、錯題與未完成組。輸入「重設」才可執行。</p><input id="resetText" type="text" aria-label="輸入重設"><div class="row"><button data-close>取消</button><button class="danger" data-action="reset-confirm">確認清除全部</button></div>`);break;
 case 'reset-confirm':if($('#resetText')?.value!=='重設'){toast('請輸入「重設」。');return;}await saveQueue;state=C.fresh(B);storageBlocked=false;closeModal();await save();navigate('home');break;
 }
}
document.addEventListener('click',async event=>{
 const close=event.target.closest('[data-close]');if(close){closeModal();return;}
 const nav=event.target.closest('[data-nav]');if(nav){navigate(nav.dataset.nav);return;}
 const el=event.target.closest('[data-action]');if(!el||el.disabled||busy)return;
 busy=true;try{await action(el.dataset.action,el);}catch(err){toast(err.message||'操作未完成，請重試。');}finally{busy=false;}
});
document.addEventListener('input',ev=>{
 if(ev.target.id==='spellInput')spelling=ev.target.value;
 if(ev.target.id==='wordSearch'){const input=ev.target,pos=input.selectionStart;wordQuery=input.value;wordPage=0;render();$('#wordSearch').focus();try{$('#wordSearch').setSelectionRange(pos,pos);}catch{}}
});
document.addEventListener('change',async ev=>{
 if(ev.target.id==='wordLevel'){wordLevel=ev.target.value;wordPage=0;render();}
 if(ev.target.id==='wordStatus'){wordStatus=ev.target.value;wordPage=0;render();}
 if(ev.target.id==='historyDate'){historyDate=ev.target.value;render();}
 if(ev.target.id==='importFile'&&ev.target.files[0])await importFile(ev.target.files[0]);
});
modal.addEventListener('cancel',stopAudio);window.addEventListener('pagehide',stopAudio);
// Multiple writers could overwrite progress; allow a single learning tab.
if(navigator.locks){navigator.locks.request('louie-pvqc-writer',{ifAvailable:true},async lock=>{
 if(!lock){storageBlocked=true;saveLabel('請使用已開啟的學習分頁',false);main.innerHTML='<div class="panel"><h1>另一個分頁正在學習</h1><p>請回到原本的分頁，避免兩邊同時更新紀錄。關閉原分頁後，可重新整理此頁。</p></div>';document.querySelectorAll('nav button').forEach(b=>b.disabled=true);return;}
 await init();await new Promise(()=>{});
});}else{void init();}

})();
