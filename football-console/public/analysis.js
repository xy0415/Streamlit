'use strict';
const LEAGUES=[
['uefa.nations','歐國聯'],['fifa.friendly','國際友誼賽'],['eng.1','英超'],['eng.2','英冠'],
['esp.1','西甲'],['ger.1','德甲'],['ita.1','義甲'],['fra.1','法甲'],['ned.1','荷甲'],
['por.1','葡超'],['uefa.champions','歐冠'],['uefa.europa','歐霸'],['uefa.europa.conf','歐協聯'],
['bra.1','巴甲'],['arg.1','阿甲'],['usa.1','美職聯'],['ksa.1','沙職'],['jpn.1','日職'],
['kor.1','韓職'],['aus.1','澳甲'],['fifa.world','世界盃'],['fifa.worldq.uefa','世界盃歐洲區資格賽'],
['fifa.worldq.conmebol','世界盃南美區資格賽'],['concacaf.champions','中北美冠軍盃'],['afc.champions','亞冠'],
['mex.1','墨超'],['tur.1','土超'],['bel.1','比甲'],['sco.1','蘇超'],['chn.1','中超']
];
const KN=Object.fromEntries(LEAGUES);
const defaultLeagues=['uefa.nations','fifa.friendly','eng.1','eng.2','esp.1','ger.1','ita.1','fra.1','bra.1','usa.1','ksa.1'];
const $=id=>document.getElementById(id);
const state={day:'',view:'schedule',feed:null,report:null,fixtures:[],sources:[],loading:false,
  leagues:new Set(defaultLeagues),cache:new Map()};
function escapeHtml(x){return String(x==null?'':x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function fTaiwan(date){
 const d=new Date(date);if(!Number.isFinite(d.getTime()))return null;
 const p={};new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).forEach(x=>{if(x.type!=='literal')p[x.type]=x.value});
 return {date:p.year+'-'+p.month+'-'+p.day,time:p.hour+':'+p.minute,stamp:p.year+'/'+p.month+'/'+p.day+' '+p.hour+':'+p.minute}
}
function todayTaiwan(){return fTaiwan(new Date()).date}
function addDay(date,n){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function statusPill(name,type){return '<span class="pill '+(type||'neutral')+'">'+escapeHtml(name)+'</span>'}
function toast(s){$('snackbar').textContent=s;$('snackbar').classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('snackbar').classList.add('hidden'),4200)}
function normalizeReport(r){
 const matches=Array.isArray(r.matches)?r.matches:[];
 return {date:String(r.date||''),article:String(r.article||''),cutoff:String(r.cutoff||''),publishedAt:r.publishedAt||r.sentAt||'',
  matches:matches.map((m,i)=>({
   id:m.id||r.date+'-'+i,date:m.date||r.date,time:m.time||'',league:m.league||'',round:m.round||'',
   home:m.home||'',homeZh:m.homeZh||m.home_zh||'',away:m.away||'',awayZh:m.awayZh||m.away_zh||'',
   market:m.market||'',probability:m.probability===''?null:Number(m.probability),probabilityType:m.probabilityType||'命中',
   status:m.status||m.scoreStatus||'待核對',homeScore:m.homeScore===null||m.homeScore===undefined||m.homeScore===''?null:Number(m.homeScore),
   awayScore:m.awayScore===null||m.awayScore===undefined||m.awayScore===''?null:Number(m.awayScore),
   settlement:m.settlement||'待核實',verified:m.verified===true||m.verified==='true',
   source:m.source||'正式 Gmail',sourceUrl:m.sourceUrl||'',group:m.group||'串關單',order:Number(m.order)||i+1
  }))};
}
async function loadFeed(){
 try{
  const response=await fetch('/api/reports',{cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data.reports))throw Error('回傳缺少 reports');
  state.feed={...data,reports:data.reports.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)).map(normalizeReport).sort((a,b)=>b.date.localeCompare(a.date))};
  $('sideSync').textContent=data.connected?'正式預測同步已連接':'歷史正式預測已匯入';
  $('sideTime').textContent=data.connected?'最後同步：'+(data.syncedAt||'尚未執行'):'自動更新尚待 Google 授權';
  $('dataFooter').textContent=data.connected?'正式 Gmail 預測 · 公開賽事資料':'已匯入正式 Gmail 預測 · 自動同步尚待設定';
  if(!state.day||state.feed.reports.length&&!state.feed.reports.some(r=>r.date===state.day)){
   if(!state.day)state.day=state.feed.reports[0]?.date||todayTaiwan();
  }
  $('selectedDay').value=state.day;
 }catch(e){state.feed={connected:false,reports:[]};$('sideSync').textContent='正式預測資料未連線';$('sideTime').textContent=String(e.message||e);toast('預測資料來源暫時無法讀取')}
 setReport();render();
}
function setReport(){state.report=state.feed?.reports.find(x=>x.date===state.day)||null}
function pickDay(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;state.day=day;$('selectedDay').value=day;setReport();state.fixtures=state.cache.get(cacheKey())?.fixtures||[];state.sources=state.cache.get(cacheKey())?.sources||[];render();loadFixtures(false)}
function cacheKey(){return state.day+'|'+[...state.leagues].sort().join(',')}
function getSelected(){const set=new Set(state.leagues);return LEAGUES.filter(x=>set.has(x[0]))}
function parseScore(item){
 const competition=item.competitions?.[0]||{},players=competition.competitors||[];
 const home=players.find(x=>x.homeAway==='home')||{},away=players.find(x=>x.homeAway==='away')||{};
 const titleHome=home.team?.displayName||home.team?.name||'',titleAway=away.team?.displayName||away.team?.name||'';
 const stamp=fTaiwan(item.date||competition.date),type=item.status?.type||{};
 if(!stamp||!titleHome||!titleAway)return null;
 const completed=type.completed===true||/final|full.?time/i.test(String(type.name||''));
 const progress=!completed&&(/in|live|half/i.test(String(type.state||''))||type.state==='in');
 let homeScore=home.score,awayScore=away.score;
 if(typeof homeScore==='object')homeScore=homeScore.value;if(typeof awayScore==='object')awayScore=awayScore.value;
 return {id:String(item.id||''),date:stamp.date,time:stamp.time,
  leagueCode:item._league||'',league:KN[item._league]||item._league||'',
  home:titleHome,away:titleAway,scoreHome:completed||progress?homeScore:null,scoreAway:completed||progress?awayScore:null,
  status:completed?'finished':progress?'inprogress':'scheduled',
  stateName:type.description||type.name||'',source:'ESPN',url:item.links?.[0]?.href||''};
}
async function loadFixtures(force){
 if(state.loading)return;
 const key=cacheKey();
 if(!force&&state.cache.has(key)){const cached=state.cache.get(key);state.fixtures=cached.fixtures;state.sources=cached.sources;render();return}
 if(state.leagues.size===0){state.fixtures=[];state.sources=[];render();toast('請至少選擇一個查核聯賽');return}
 state.loading=true;$('reloadFixtures').disabled=true;$('refreshAll').disabled=true;
 $('fixtureNotice').textContent='正在查詢 ESPN 免費賽程介面；若來源失敗將保留來源異常，不視為沒有比賽。';
 const queries=[];
 for(const league of state.leagues)for(const date of [addDay(state.day,-1),state.day])queries.push({league,date});
 let cursor=0,finished=0;const results=[],sources=[];
 async function worker(){
  for(;;){
   const ix=cursor++;if(ix>=queries.length)break;
   const q=queries[ix];
   try{
    const url='/api/fixtures?provider=espn&league='+encodeURIComponent(q.league)+'&date='+q.date;
    const response=await fetch(url,{cache:'no-store'}),json=await response.json();
    if(!response.ok||json.upstreamStatus!==200)throw Error(json.error||'HTTP '+(json.upstreamStatus||response.status));
    if(!json.data||!Array.isArray(json.data.events))throw Error('來源未提供 events');
    sources.push({league:q.league,date:q.date,status:'ok',count:json.data.events.length});
    for(const event of json.data.events)results.push({...event,_league:q.league})
   }catch(e){sources.push({league:q.league,date:q.date,status:'error',message:String(e.message||e)})}
   finished++;
   $('sourceSummary').textContent='賽程來源查詢 '+finished+' / '+queries.length;
  }
 }
 await Promise.all(Array.from({length:Math.min(3,queries.length)},worker));
 const seen=new Map();
 for(const e of results){const f=parseScore(e);if(!f||f.date!==state.day)continue;
  const identity=f.id||f.leagueCode+'|'+f.home+'|'+f.away+'|'+f.time;
  if(!seen.has(identity))seen.set(identity,f);
 }
 state.fixtures=[...seen.values()].sort((a,b)=>a.time.localeCompare(b.time)||a.league.localeCompare(b.league,'zh-Hant'));
 state.sources=sources;state.cache.set(key,{fixtures:state.fixtures,sources});
 state.loading=false;$('reloadFixtures').disabled=false;$('refreshAll').disabled=false;
 render();
 const err=sources.filter(s=>s.status==='error').length;
 $('fixtureNotice').textContent=err?('成功 '+(sources.length-err)+' / '+sources.length+' 筆查詢，失敗 '+err+' 筆；賽事覆蓋可能不完整。'):
  ('已完成 '+sources.length+' 筆來源請求；僅代表選取聯賽與免費 API 的回傳範圍。');
}
function fixturesForView(){
 const lc=$('leagueFilter').value,st=$('statusFilter').value;
 return state.fixtures.filter(x=>(!lc||x.leagueCode===lc||x.league===lc)&&(!st||st==='unverified'||x.status===st));
}
function predsForView(){
 const lc=$('leagueFilter').value,st=$('statusFilter').value;
 const reports=state.report?.matches||[];
 return reports.filter(x=>(!lc||x.league===lc||KN[lc]===x.league)&&(!st||st==='unverified'?!x.verified:st==='finished'?Boolean(x.homeScore!==null&&x.awayScore!==null):st==='scheduled'?x.status==='未完賽':true));
}
function updateFilter(){
 const l=$('leagueFilter'),old=l.value;
 const opts=new Map(LEAGUES);
 for(const p of state.report?.matches||[])if(p.league&&!Array.from(opts.values()).includes(p.league))opts.set(p.league,p.league);
 l.innerHTML='<option value="">所有聯賽</option>'+[...opts].map(x=>'<option value="'+escapeHtml(x[0])+'">'+escapeHtml(x[1])+'</option>').join('');
 l.value=opts.has(old)?old:'';
}
function renderSchedule(){
 const rows=fixturesForView();$('fixtureCount').textContent=rows.length;$('fixtureEmpty').classList.toggle('hidden',rows.length>0);
 $('fixtureTable').innerHTML=rows.map(x=>'<tr><td><strong>'+escapeHtml(x.time)+'</strong></td><td class="comp">'+escapeHtml(x.league)+'</td><td class="fixture-home">'+escapeHtml(x.home)+'</td><td class="vscol"><span class="score '+(x.status==='scheduled'?'vs':'')+'">'+(x.status==='scheduled'?'VS':escapeHtml(x.scoreHome)+' : '+escapeHtml(x.scoreAway))+'</span></td><td class="fixture-away">'+escapeHtml(x.away)+'</td><td>'+statusPill(x.status==='finished'?'已完賽':x.status==='inprogress'?'進行中':'未開賽',x.status==='finished'?'ok':x.status==='inprogress'?'blue':'neutral')+'</td><td>'+escapeHtml(x.source)+'</td></tr>').join('');
 const failures=state.sources.filter(x=>x.status==='error').length;
 $('mFixtures').textContent=state.sources.length?state.fixtures.length:'—';
 $('mFixturesHelp').textContent=state.sources.length?'已查詢 '+state.sources.length+' 筆 · 異常 '+failures:'等待免費賽程來源';
 if(!state.loading)$('sourceSummary').textContent=state.sources.length?'ESPN · '+(state.sources.length-failures)+' / '+state.sources.length+' 請求成功':'尚未查詢賽程';
}
function renderPredictions(){
 const rows=predsForView();
 $('predictionCount').textContent=rows.length;$('predictionEmpty').classList.toggle('hidden',rows.length>0);
 $('publishedStamp').textContent=state.report?.cutoff?'資料截止：'+state.report.cutoff:'僅採已正式寄出的預測';
 $('showOriginal').disabled=!state.report;
 $('predictionsGrid').innerHTML=rows.map(p=>
 '<article class="prediction"><div class="pred-top"><span>第 '+p.order+' 關 · '+escapeHtml(p.time)+' · '+escapeHtml(p.league)+(p.round?' · '+escapeHtml(p.round):'')+'</span><span>'+escapeHtml(p.group)+'</span></div>'+
 '<div class="pred-teams">'+escapeHtml(p.home)+'<span>VS</span>'+escapeHtml(p.away)+'</div>'+
 '<div class="pred-zh">'+escapeHtml(p.homeZh)+'　／　'+escapeHtml(p.awayZh)+'</div>'+
 '<div class="pred-choice"><strong>'+escapeHtml(p.market)+'</strong>'+(p.probability!==null&&Number.isFinite(p.probability)?'<span class="probability">'+p.probability+'%<small>估計'+escapeHtml(p.probabilityType)+'機率</small></span>':'')+'</div></article>'
 ).join('');
 const total=state.report?.matches.length||0;
 $('mPreds').textContent=total;$('mPredsHelp').textContent=state.report?'正式報告 '+state.report.date:'當日無正式報告';
}
function settlementPill(p){
 if(p.verified){if(/全贏|半贏/.test(p.settlement))return statusPill(p.settlement,'ok');
 if(/全輸|半輸/.test(p.settlement))return statusPill(p.settlement,'bad');return statusPill(p.settlement,'neutral')}
 if(/^參考/.test(p.settlement||''))return statusPill(p.settlement,'warn');
 return statusPill(p.settlement||'待核實','neutral')
}
function renderReview(){
 const rows=predsForView();
 $('reviewCount').textContent=rows.length;$('reviewEmpty').classList.toggle('hidden',rows.length>0);
 $('reviewTable').innerHTML=rows.map(p=>
 '<tr><td><strong>'+escapeHtml(p.time)+'</strong></td><td class="reviewmatch">'+escapeHtml(p.home)+' VS '+escapeHtml(p.away)+'<small>'+escapeHtml(p.league)+'</small></td>'+
 '<td>'+escapeHtml(p.market)+'</td><td><strong>'+(p.homeScore!==null&&p.awayScore!==null?escapeHtml(p.homeScore)+' : '+escapeHtml(p.awayScore):'—')+'</strong></td>'+
 '<td>'+settlementPill(p)+'</td><td>'+statusPill(p.verified?'雙來源已核實':p.status||'待核對',p.verified?'ok':'warn')+'</td></tr>').join('');
 const all=state.report?.matches||[];
 const verified=all.filter(x=>x.verified).length;
 $('mVerified').textContent=verified;
 $('mPending').textContent=all.length-verified;
}
function renderHistory(){
 const reports=state.feed?.reports||[],all=reports.flatMap(r=>r.matches||[]),v=all.filter(p=>p.verified&&p.settlement!=='待核實');
 const valid=v.filter(p=>/(全贏|半贏|全輸|半輸)/.test(p.settlement)),win=valid.filter(p=>/^(全贏|半贏)$/.test(p.settlement));
 $('historyTotal').textContent=all.length;$('historyVerified').textContent=v.length;
 $('historyWin').textContent=valid.length?String(win.length):'—';
 $('historyRate').textContent=valid.length?(Math.round(win.length/valid.length*1000)/10)+'%':'—';
 $('historyRows').innerHTML=reports.map(r=>{
  const total=r.matches.length,verified=r.matches.filter(p=>p.verified).length,ref=r.matches.filter(p=>!p.verified&&/^參考/.test(p.settlement)).length;
  return '<div class="history-item"><strong>'+escapeHtml(r.date)+'</strong><span>正式推薦 '+total+' 場</span><span>核實 '+verified+'</span><span>參考結果 '+ref+'</span><button class="mlauto" data-load-day="'+escapeHtml(r.date)+'">查看</button></div>'
 }).join('')||'<div class="empty">尚無歷史預測</div>';
}
function render(){
 $('nowDate').textContent=todayTaiwan().replaceAll('-','/');
 const names={schedule:['每日賽程','每日賽程','台灣日期・賽程、正式預測與資料狀態'],predictions:['分析預測','正式預測','已寄出正式串關・原始機率與選項'],reviews:['賽後復盤','賽後復盤','比分核對・結算與資料缺漏'],history:['歷史統計','歷史統計','正式紀錄・已核實結算統計']};
 const t=names[state.view];$('viewTitle').textContent=t[0];$('breadcrumb').textContent=t[1];$('viewSubtitle').textContent=t[2];
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
 $('schedulePanel').classList.toggle('hidden',state.view!=='schedule');
 $('predictionsPanel').classList.toggle('hidden',!['schedule','predictions'].includes(state.view));
 $('reviewPanel').classList.toggle('hidden',state.view!=='reviews');
 $('historyPanel').classList.toggle('hidden',state.view!=='history');
 updateFilter();renderSchedule();renderPredictions();renderReview();renderHistory()
}
function openModal(id){$(id).classList.remove('hidden')}
function closeModal(id){$(id).classList.add('hidden')}
function initLeagueOptions(){
 $('leagueOptions').innerHTML=LEAGUES.map(x=>'<label class="leagueoption"><input type="checkbox" value="'+escapeHtml(x[0])+'" '+(state.leagues.has(x[0])?'checked':'')+'>'+escapeHtml(x[1])+'</label>').join('');
 openModal('leaguesModal')
}
function getDailyExport(){
 const doc={date:state.day,timezone:'Asia/Taipei',exportedAt:new Date().toISOString(),
   sources:state.sources,fixtures:state.fixtures,report:state.report};
 const raw=JSON.stringify(doc,null,2),blob=new Blob([raw],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='football-'+state.day+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function init(){
 try{const saved=JSON.parse(localStorage.getItem('football-dashboard-leagues')||'null');if(Array.isArray(saved)&&saved.length)state.leagues=new Set(saved.filter(x=>KN[x]))}catch{}
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;render()}));
 $('selectedDay').onchange=e=>pickDay(e.target.value);
 $('prevDay').onclick=()=>pickDay(addDay(state.day,-1));
 $('nextDay').onclick=()=>pickDay(addDay(state.day,1));
 $('leagueFilter').onchange=render;$('statusFilter').onchange=render;
 $('leagueChooserBtn').onclick=initLeagueOptions;
 $('saveLeagues').onclick=()=>{
  const values=[...document.querySelectorAll('#leagueOptions input:checked')].map(x=>x.value);
  if(!values.length){toast('至少需選擇一個聯賽');return}
  state.leagues=new Set(values);
  localStorage.setItem('football-dashboard-leagues',JSON.stringify(values));
  closeModal('leaguesModal');state.fixtures=[];state.sources=[];loadFixtures(true);render()
 };
 document.querySelectorAll('[data-modal-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.closest('.modalback').id)));
 document.querySelectorAll('.modalback').forEach(m=>m.onclick=e=>{if(e.target===m)closeModal(m.id)});
 $('reloadFixtures').onclick=()=>loadFixtures(true);
 $('refreshAll').onclick=async()=>{await loadFeed();await loadFixtures(true);toast('公開資料已重新整理')};
 $('exportDaily').onclick=getDailyExport;
 $('showOriginal').onclick=()=>{if(!state.report)return;$('originalDate').textContent=state.report.date;$('originalArticle').textContent=state.report.article||'當天未提供可公開原始全文';openModal('originalModal')};
 $('historyRows').onclick=e=>{const b=e.target.closest('[data-load-day]');if(!b)return;pickDay(b.dataset.loadDay);state.view='predictions';render()};
 state.day=todayTaiwan();loadFeed().then(()=>loadFixtures(false));render();
}
document.addEventListener('DOMContentLoaded',init);