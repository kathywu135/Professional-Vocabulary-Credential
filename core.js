/* PVQC core v1 — dependency-free, usable in browser and Node. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.PVQC=api;})(globalThis,()=>{
'use strict';
const TYPES=['T1','T2','T3','T4','T5'],LEVELS=['初級','中級','高級'];
const now=()=>new Date().toISOString();
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const norm=s=>s.trim().replace(/\s+/g,' ').toLowerCase();
const day=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));
const fresh=bank=>({schemaVersion:1,bankVersion:bank.version,catalog:bank.words.map(w=>w.wordId),sessions:[],activeId:null});
function stats(state,bank){
 const all={};for(const id of new Set([...state.catalog,...bank.words.map(w=>w.wordId)]))all[id]={status:'未學',seen:false,appearances:0,last:null,masteredAt:null,everMasteredAt:null,errors:{},types:Object.fromEntries(TYPES.map(t=>[t,{correct:0,total:0}])),lastCheck:null,lastError:null};
 for(const s of [...state.sessions].sort((a,b)=>a.started.localeCompare(b.started))){
  for(const id of s.ids){const x=all[id];if(!x)continue;x.appearances++;x.last=s.started;if(s.seen[id]){x.seen=true;if(x.status==='未學')x.status='已看過';}}
  for(const q of s.questions){if(!q.answer)continue;const x=all[q.wordId];if(!x)continue;const a=q.answer;x.seen=true;x.last=a.at;x.types[q.type].total++;if(a.correct)x.types[q.type].correct++;
   if(!a.correct){x.errors[q.type]=(x.errors[q.type]||0)+1;x.status='待複習';x.masteredAt=null;x.lastError={sessionId:s.id,type:q.type,at:a.at,value:a.value};}
   else if(q.kind==='boost'){delete x.errors[q.type];}
   else if(!['待複習','已掌握'].includes(x.status))x.status='練習中';
   if(q.kind==='check'){
    const checks=s.questions.filter(z=>z.wordId===q.wordId&&z.kind==='check');
    if(checks.length===5&&checks.every(z=>z.answer)){
     const pass=checks.every(z=>z.answer.correct);x.lastCheck={sessionId:s.id,at:a.at,pass,correct:checks.filter(z=>z.answer.correct).length};
     if(pass){x.status='已掌握';x.masteredAt=a.at;x.everMasteredAt=a.at;x.errors={};}else{x.status='待複習';x.masteredAt=null;}
    }
   }
  }
 }
 return all;
}
function pick(bank,state,count,level='混合',includeMastered=false){
 const st=stats(state,bank);let pool=bank.words.filter(w=>w.active!==false).filter(w=>includeMastered||st[w.wordId].status!=='已掌握');
 if(level!=='混合')pool=pool.filter(w=>w.level===level);
 const previous=[...state.sessions].reverse().find(s=>s.mode==='memory');const previousEasy=new Set(previous?.ids||[]);
 const rank=w=>[st[w.wordId].seen?1:0,w.level==='初級'&&previousEasy.has(w.wordId)?1:0,st[w.wordId].last||'',st[w.wordId].appearances];
 const cmp=(a,b)=>{let ra=rank(a),rb=rank(b);for(let i=0;i<ra.length;i++){if(ra[i]<rb[i])return -1;if(ra[i]>rb[i])return 1;}return 0;};
 pool=shuffle(pool).sort(cmp);if(level!=='混合')return pool.slice(0,count);
 const quota=count===10?[6,3,1]:[3,1,1],result=[];
 for(let l=0;l<3;l++)for(let n=0;n<quota[l]&&result.length<count;n++){
  const order=[0,1,2].sort((a,b)=>Math.abs(a-l)-Math.abs(b-l)||a-b);
  let found;for(const k of order){found=pool.find(w=>w.level===LEVELS[k]&&!result.includes(w));if(found)break;}if(found)result.push(found);
 }
 return result;
}
function meanings(s){return s.replace(/\([^)]*\)|（[^）]*）/g,'').split(/[;；,，：:]/).map(x=>x.replace(/[\s。]/g,'')).filter(x=>x.length>0);}
function ambiguous(a,b){
 if(norm(a.english)===norm(b.english))return true;
 if(a.exclude?.includes(b.wordId)||b.exclude?.includes(a.wordId))return true;
 const ma=meanings(a.chinese),mb=meanings(b.chinese);
 return ma.some(x=>mb.some(y=>x===y||(Math.min(x.length,y.length)>=2&&(x.includes(y)||y.includes(x)))));
}
function question(w,type,kind,pool){
 let options=[];let blocked=null;
 if(type!=='T5'){
  let chosen=[w];for(const c of shuffle(pool)){if(chosen.length===4)break;if(chosen.every(x=>!ambiguous(x,c)))chosen.push(c);}
  options=shuffle(chosen.map(x=>x.wordId));if(options.length<2)blocked='無法產生唯一答案，請校對題庫。此題未計分，請先暫停本組。';
 }
 // Every letter is available: no answer-length or answer-letter hint.
 return {id:uid(),wordId:w.wordId,type,kind,options,keys:shuffle('abcdefghijklmnopqrstuvwxyz'.split('')),blocked,answer:null};
}
function makeSession(bank,state,mode,count=5,opts={}){
 const st=stats(state,bank);let selected;
 if(opts.wordId)selected=bank.words.filter(w=>w.wordId===opts.wordId);
 else if(mode==='wrong')selected=bank.words.filter(w=>w.active!==false&&st[w.wordId].status==='待複習').sort((a,b)=>Object.values(st[b.wordId].errors).reduce((a,b)=>a+b,0)-Object.values(st[a.wordId].errors).reduce((a,b)=>a+b,0)||(st[a.wordId].last||'').localeCompare(st[b.wordId].last||'')).slice(0,5);
 else selected=pick(bank,state,count,opts.level||'混合',!!opts.includeMastered);
 if(!selected.length)return null;
 const pool=bank.words.filter(w=>w.active!==false).filter(w=>st[w.wordId].status!=='已掌握'||selected.some(x=>x.wordId===w.wordId));
 let qs=[];
 if(mode==='wrong')for(const w of selected)for(const t of TYPES.filter(t=>st[w.wordId].errors[t]))qs.push(question(w,t,'boost',pool));
 if(mode!=='pure')for(const type of TYPES)for(const w of shuffle(selected))qs.push(question(w,type,'check',pool));
 return {id:uid(),mode,ids:selected.map(w=>w.wordId),started:now(),ended:null,status:'active',phase:'cards',cardIndex:0,seen:{},done:[],questions:qs,qIndex:0,bankVersion:bank.version,requested:count};
}
function submit(session,bank,value,giveup=false){
 const q=session.questions[session.qIndex];if(!q||q.answer||q.blocked)throw Error('此題不能提交');
 if(!giveup&&!value.trim())throw Error('請先作答');
 const w=bank.words.find(w=>w.wordId===q.wordId);if(!w)throw Error('題庫缺字，請先修正');
 if(q.type!=='T5'&&!giveup&&!q.options.includes(value))throw Error('無效選項');
 const correct=!giveup&&(q.type==='T5'?w.accepted.some(a=>norm(a)===norm(value)):value===q.wordId);
 q.answer={value:giveup?'':value,correct,giveup,at:now()};return q.answer;
}
function score(s,kind='check'){const qs=s.questions.filter(q=>q.kind===kind&&q.answer);return {correct:qs.filter(q=>q.answer.correct).length,total:qs.length};}
function validate(input,bank){
 const fail=()=>{throw Error('備份格式損壞、版本不相容或包含無效紀錄；現有資料未變更。');};
 if(!input||input.schemaVersion!==1||!Array.isArray(input.sessions)||input.sessions.length>50000||!Array.isArray(input.catalog)||typeof input.bankVersion!=='string')fail();
 const ids=new Set(input.catalog);const known=new Set(bank.words.map(w=>w.wordId));
 if(input.catalog.length!==ids.size||input.catalog.some(x=>typeof x!=='string'||!known.has(x)))fail();
 const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));const sessIds=new Set();
 for(const s of input.sessions){
  if(!s||typeof s.id!=='string'||sessIds.has(s.id)||!['memory','wrong','pure','manual'].includes(s.mode)||!['active','completed','interrupted'].includes(s.status)||!['cards','quiz','result'].includes(s.phase)||!date(s.started)||(s.ended!==null&&!date(s.ended))||typeof s.bankVersion!=='string')fail();sessIds.add(s.id);
  if(!Array.isArray(s.ids)||!s.ids.length||s.ids.length>10||new Set(s.ids).size!==s.ids.length||s.ids.some(id=>!ids.has(id)))fail();
  if(!s.seen||Object.getPrototypeOf(s.seen)!==Object.prototype||Object.entries(s.seen).some(([id,t])=>!s.ids.includes(id)||!date(t))||!Array.isArray(s.done)||new Set(s.done).size!==s.done.length||s.done.some(id=>!s.ids.includes(id)))fail();
  if(!Number.isInteger(s.cardIndex)||s.cardIndex<0||s.cardIndex>=s.ids.length||!Array.isArray(s.questions)||s.questions.length>100||!Number.isInteger(s.qIndex)||s.qIndex<0||s.qIndex>s.questions.length)fail();
  const qids=new Set(),checkKeys=new Set(),boostKeys=new Set();
  for(const q of s.questions){
   if(!q||typeof q.id!=='string'||qids.has(q.id)||!s.ids.includes(q.wordId)||!TYPES.includes(q.type)||!['check','boost'].includes(q.kind))fail();qids.add(q.id);
   const key=q.wordId+q.type, keys=q.kind==='check'?checkKeys:boostKeys;if(keys.has(key))fail();keys.add(key);
   if(!Array.isArray(q.options)||q.options.some(id=>!ids.has(id))||new Set(q.options).size!==q.options.length||q.options.length>4||q.type!=='T5'&&!q.options.includes(q.wordId))fail();
   if(!Array.isArray(q.keys)||q.keys.length!==26||new Set(q.keys).size!==26||q.keys.some(x=>!(/^[a-z]$/).test(x))||!(q.blocked===null||typeof q.blocked==='string'))fail();
   if(q.answer!==null){const a=q.answer;if(!a||typeof a.value!=='string'||a.value.length>1000||typeof a.correct!=='boolean'||typeof a.giveup!=='boolean'||!date(a.at)||q.blocked)fail();
    if(!a.giveup&&!a.value.trim())fail();if(q.type!=='T5'&&!a.giveup&&!q.options.includes(a.value))fail();
    const w=bank.words.find(w=>w.wordId===q.wordId);const c=!a.giveup&&(q.type==='T5'?w.accepted.some(x=>norm(x)===norm(a.value)):q.wordId===a.value);if(c!==a.correct)fail();
   }
  }
  if(s.mode==='pure'&&s.questions.length||s.mode!=='pure'&&(checkKeys.size!==s.ids.length*5))fail();
  if(s.questions.some((q,i)=>i<s.qIndex&&!q.answer)||s.questions.some((q,i)=>i>s.qIndex&&q.answer))fail();
  if(s.status==='completed'&&(s.phase!=='result'||!s.ended||s.done.length!==s.ids.length||s.mode!=='pure'&&s.questions.some(q=>!q.answer)))fail();
 }
 if(input.activeId!==null&&(!sessIds.has(input.activeId)||input.sessions.find(s=>s.id===input.activeId).status!=='active'))fail();
 if(input.sessions.filter(s=>s.status==='active').length!==(input.activeId?1:0))fail();
 return JSON.parse(JSON.stringify(input));
}
return {TYPES,LEVELS,now,uid,shuffle,norm,day,fresh,stats,pick,ambiguous,makeSession,submit,score,validate};
});
