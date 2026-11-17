'use strict';
const LEAGUES=[
['uefa.nations','歐國聯'],['caf.nations','非洲盃'],['caf.nations_qual','非洲盃資格賽'],['fifa.friendly','國際友誼賽'],['eng.1','英超'],['eng.2','英冠'],
['esp.1','西甲'],['ger.1','德甲'],['ita.1','義甲'],['fra.1','法甲'],['ned.1','荷甲'],
['por.1','葡超'],['uefa.champions','歐冠'],['uefa.europa','歐霸'],['uefa.europa.conf','歐協聯'],
['bra.1','巴甲'],['arg.1','阿甲'],['usa.1','美職聯'],['ksa.1','沙職'],['jpn.1','日職'],
['kor.1','韓職'],['aus.1','澳甲'],['fifa.world','世界盃'],['fifa.worldq.uefa','世界盃歐洲區資格賽'],
['fifa.worldq.conmebol','世界盃南美區資格賽'],['concacaf.champions','中北美冠軍盃'],['afc.champions','亞冠'],
['mex.1','墨超'],['tur.1','土超'],['bel.1','比甲'],['sco.1','蘇超'],['chn.1','中超']
];
const KN=Object.fromEntries(LEAGUES);
const defaultLeagues=['uefa.nations','caf.nations','caf.nations_qual','fifa.friendly','eng.1','eng.2','esp.1','ger.1','ita.1','fra.1','bra.1','usa.1','ksa.1'];
const $=id=>document.getElementById(id);
const state={day:'',view:'schedule',feed:null,report:null,fixtures:[],sources:[],loading:false,
  leagues:new Set(defaultLeagues),cache:new Map(),scoreboardCache:new Map(),resultLookupCache:new Map(),verifiedResultsPromise:null,scheduleQueued:false,
  reviewFixtures:[],reviewErrors:[],reviewLoading:false,reviewUpdatedAt:0,reviewDate:'',
  fifaRanks:new Map(),fifaRanksBusy:false,fifaRankPubDate:'',livePolling:false,
  summaryCache:new Map(),activeMatchId:'',matchDetailPayload:null};

const SCOREBOARD_TTL=120000; // Standard full-day rechecks; live-only match summaries refresh faster
const LIVE=typeof window!=='undefined'?window.FootballLive:null;
const LIVE_DETAIL_TTL=35000;
const PRED_LEAGUE_CODES={
 '歐國聯':'uefa.nations','歐洲國家聯賽':'uefa.nations','國際友誼賽':'fifa.friendly',
 '非洲國家盃':'caf.nations','非洲盃':'caf.nations','AFCON':'caf.nations',
 '非洲國家盃資格賽':'caf.nations_qual','非洲盃資格賽':'caf.nations_qual','AFCON資格賽':'caf.nations_qual',
 '英超':'eng.1','英冠':'eng.2','西甲':'esp.1','德甲':'ger.1','義甲':'ita.1','法甲':'fra.1',
 '荷甲':'ned.1','葡超':'por.1','歐冠':'uefa.champions','歐霸':'uefa.europa',
 '歐協聯':'uefa.europa.conf','歐洲協會聯賽':'uefa.europa.conf',
 '巴甲':'bra.1','阿甲':'arg.1','美職聯':'usa.1','沙職':'ksa.1',
 '日職':'jpn.1','韓職':'kor.1','澳甲':'aus.1',
 '世界盃':'fifa.world','世歐預':'fifa.worldq.uefa','世南預':'fifa.worldq.conmebol',
 '亞冠':'afc.champions','中北美冠軍盃':'concacaf.champions'
};
const MATCH_GRACE_MS=15*60*1000;
const FINAL_GRACE_MS=135*60*1000;
const DAY_CACHE_MS=120000;
function scheduledKickoff(f){
 if(!f?.date||!/^\d{2}:\d{2}$/.test(f.time||''))return NaN;
 return Date.parse(f.date+'T'+f.time+':00+08:00');
}
function elapsedStatus(f,now=Date.now()){
 if(!f||f.status==='finished'||f.status==='inprogress'||f.status==='halftime'||f.status==='cancelled'||f.status==='postponed'||f.status==='conflict')return f?.status||'pending';
 const kickoff=scheduledKickoff(f);
 if(!Number.isFinite(kickoff))return 'pending';
 const elapsed=now-kickoff;
 if(elapsed>=FINAL_GRACE_MS)return 'stale';
 if(elapsed>=MATCH_GRACE_MS)return 'pending';
 return 'scheduled';
}
function displayFixtureStatus(f,now=Date.now()){
 const status=elapsedStatus(f,now);
 if(status==='conflict')return {text:'比分衝突，待核對',tone:'bad'};
 if(status==='finished'){
  if(f.scoreConflict)return {text:'比分衝突，待核對',tone:'bad'};
  if(f.scoreVerified)return {text:'已完賽·已核實',tone:'ok'};
  if(f.scoreSource==='TheSportsDB')return {text:'已完賽·待覆核',tone:'warn'};
  return {text:'已完賽',tone:'ok'};
 }
 if(status==='halftime')return {text:'中場休息',tone:'blue'};
 if(status==='inprogress'){
  const clock=String(f.liveClock||f.statusClock||'').trim();
  return {text:clock||'進行中',tone:'blue'};
 }
 if(status==='cancelled')return {text:'已取消',tone:'bad'};
 if(status==='postponed')return {text:'已延期',tone:'warn'};
 if(status==='stale')return {text:'比分待更新',tone:'warn'};
 if(status==='pending')return {text:'賽況待確認',tone:'warn'};
 return {text:'未開賽',tone:'neutral'};
}
async function getVerifiedResults(){
 if(!state.verifiedResultsPromise){
  state.verifiedResultsPromise=fetch('/data/verified-results.json',{cache:'no-store'})
   .then(r=>{if(!r.ok)throw Error('核對結果檔案無法讀取');return r.json()})
   .then(d=>Array.isArray(d.results)?d.results:[])
   .catch(()=>[]);
 }
 return state.verifiedResultsPromise;
}
function verifiedCorrection(f,rows){
 const hits=rows.filter(r=>r.date===f.date && r.league===f.leagueCode &&
   sameTeam(r.home,f.home)&&sameTeam(r.away,f.away)&&
   (!r.observedKickoffTaipei||Math.abs(Date.parse(r.date+'T'+r.observedKickoffTaipei+':00+08:00')-scheduledKickoff(f))<=2*3600000));
 return hits.length===1&&hits[0].verified===true&&Array.isArray(hits[0].sources)&&hits[0].sources.length>=2?hits[0]:null;
}
function matchLookupKey(f){return [f.date,f.home,f.away].join('|')}
async function getIndependentScore(f,force=false){
 const key=matchLookupKey(f),old=state.resultLookupCache.get(key);
 if(!force&&old&&old.expiresAt>Date.now())return old.promise;
 const promise=(async()=>{
  const url='/api/match-lookup?date='+encodeURIComponent(f.date)+
   '&home='+encodeURIComponent(f.home)+'&away='+encodeURIComponent(f.away);
  const response=await fetch(url,{cache:'no-store'}),payload=await response.json();
  if(!response.ok||payload.upstreamStatus!==200)throw Error(payload.error||'比對來源暫時無法回應');
  const candidates=payload.data?.event||payload.data?.events||[];
  if(!Array.isArray(candidates))throw Error('比對來源資料格式異常');
  const matched=candidates.filter(x=>{
   if(!sameTeam(x.strHomeTeam,f.home)||!sameTeam(x.strAwayTeam,f.away))return false;
   if(x.strTimestamp){
    const stamp=Date.parse(x.strTimestamp);
    if(Number.isFinite(stamp)&&Math.abs(stamp-scheduledKickoff(f))>3*3600000)return false;
   }else if(x.dateEvent&&Math.abs(Date.parse(x.dateEvent+'T00:00:00Z')-Date.parse(f.date+'T00:00:00Z'))>86400000)return false;
   return true
  });
  if(matched.length!==1)return null;
  const e=matched[0];
  const status=String(e.strStatus||'').toLowerCase();
  const final=/\b(finished|final|full.?time|ft|match ended|match finished|completed)\b/.test(status)&&!/aet|penalt|extra time/.test(status);
  const h=Number(e.intHomeScore),a=Number(e.intAwayScore);
  if(!final||e.intHomeScore===null||e.intHomeScore===''||e.intAwayScore===null||e.intAwayScore===''||
    !Number.isInteger(h)||!Number.isInteger(a)||h<0||a<0)return null;
  return {h,a,id:String(e.idEvent||''),source:'TheSportsDB',receivedAt:payload.receivedAt||'',url:'https://www.thesportsdb.com/event/'+String(e.idEvent||'')}
 })();
 state.resultLookupCache.set(key,{expiresAt:Date.now()+DAY_CACHE_MS,promise});
 try{return await promise}catch(err){state.resultLookupCache.delete(key);throw err}
}
async function enrichScoreResults(fixtures,force=false,skipLookups=false){
 const verified=await getVerifiedResults();
 const unresolved=[];
 for(const f of fixtures){
  const correction=verifiedCorrection(f,verified);
  if(correction){
   const conflict=f.status==='finished'&&(Number(f.scoreHome)!==correction.homeScore||Number(f.scoreAway)!==correction.awayScore);
   if(conflict){
    f.scoreConflict=true;f.scoreVerified=false;f.source='比分來源不一致';
    f.status='conflict';
    f.scoreHome=null;f.scoreAway=null;
   }else{
    f.status='finished';f.scoreHome=correction.homeScore;f.scoreAway=correction.awayScore;
    f.scoreVerified=true;f.scoreSource='獨立來源核對';
    f.source='兩來源核對';f.sourceLinks=correction.sources;
   }
   continue;
  }
  if(elapsedStatus(f)==='stale'||elapsedStatus(f)==='pending'){
   if(!f.scoreVerified)unresolved.push(f)
  }
 }
 // Verified snapshots are displayed immediately; independent live lookups follow asynchronously.
 if(skipLookups)return fixtures;
 // Free individual queries are bounded and only used for outdated or ambiguous cases.
 let cursor=0;
 const targets=unresolved.slice(0,8);
 async function worker(){
  for(;;){
   const i=cursor++;if(i>=targets.length)break;
   const f=targets[i];try{
    const confirmed=await getIndependentScore(f,force);
    if(confirmed){
     f.status='finished';f.scoreHome=confirmed.h;f.scoreAway=confirmed.a;
     f.scoreSource='TheSportsDB';f.source='TheSportsDB（參考）';
     f.scoreVerified=false;f.sourceLinks=[{name:'TheSportsDB',url:confirmed.url}];
    }
   }catch(err){f.lookupError=String(err.message||err)}
  }
 }
 await Promise.all(Array.from({length:Math.min(2,targets.length)},worker));
 return fixtures;
}

function safeLogo(url){
 try{
  if(!url)return '';
  const u=new URL(String(url));
  if(u.protocol!=='https:'||!(u.hostname==='espncdn.com'||u.hostname.endsWith('.espncdn.com')))return '';
  return u.href;
 }catch{return ''}
}
function nameKey(name){
 let s=String(name||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .replace(/&/g,'and').replace(/[^a-z0-9\u4e00-\u9fa5]+/g,' ')
  .replace(/\b(fc|cf|sc|afc|ac|club|football|soccer|the)\b/g,' ')
  .replace(/\s+/g,' ').trim();
 const aliases={
  'bayern munich':'bayern munchen','fc bayern munich':'bayern munchen',
  'czech republic':'czechia','turkiye':'turkey','türkiye':'turkey',
  'republic of ireland':'ireland','bosnia and herzegovina':'bosnia herzegovina',
  'northern ireland':'north ireland','north macedonia':'macedonia',
  'inter milan':'internazionale','psg':'paris saint germain',
  'manchester utd':'manchester united','atletico de madrid':'atletico madrid',
  'atletico mineiro':'atletico mg','1 koln':'koln','cologne':'koln'
 };
 return aliases[s]||s;
}
function sameTeam(a,b){
 const x=nameKey(a),y=nameKey(b);
 return !!x&&!!y&&(x===y||Math.min(x.length,y.length)>=7&&(x.includes(y)||y.includes(x)));
}
function compareEventTime(p,f){
 if(!/^\d\d:\d\d$/.test(String(p.time||'')))return false;
 const t=Date.parse(p.date+'T'+p.time+':00+08:00'),v=Date.parse(f.date+'T'+f.time+':00+08:00');
 return Number.isFinite(t)&&Number.isFinite(v)&&Math.abs(t-v)<=120*60000;
}
function eventForPrediction(p,list){
 const code=PRED_LEAGUE_CODES[p.league]||Object.keys(KN).find(k=>KN[k]===p.league);
 const matches=(list||[]).filter(f=>
  (!code||f.leagueCode===code)&&sameTeam(f.home,p.home)&&sameTeam(f.away,p.away)&&compareEventTime(p,f));
 // Selected-league and review checks may return the same ESPN event: count it only once.
 const distinct=[...new Map(matches.map(f=>[(f.id||f.leagueCode+'|'+f.home+'|'+f.away+'|'+f.time),f])).values()];
 return distinct.length===1?distinct[0]:null;
}
function predictionForEvent(f){
 const rows=state.report?.matches||[];
 const matches=rows.filter(p=>sameTeam(f.home,p.home)&&sameTeam(f.away,p.away)&&compareEventTime(p,f));
 return matches.length?matches[0]:null;
}

// All displayed team names are normalized to Taiwan Traditional Chinese.
// English ESPN/Gmail identifiers stay unmodified for event matching.
const TEAM_NAME_ENTRIES=Object.entries(window.FOOTBALL_TEAM_NAMES_ZH||{});
const TEAM_ZH_LOOKUP=new Map(TEAM_NAME_ENTRIES.map(([key,value])=>[nameKey(key),value]));
const TEAM_FLAG_ISO={
 'estonia':'EE','bulgaria':'BG','north macedonia':'MK','slovenia':'SI',
 'switzerland':'CH','scotland':'GB','tahiti':'PF','cook islands':'CK',
 'malaysia':'MY','yemen':'YE','singapore':'SG','brazil':'BR','china':'CN',
 'bahrain':'BH','kyrgyz republic':'KG','kyrgyzstan':'KG','vietnam':'VN',
 'lebanon':'LB','palestine':'PS','syria':'SY','japan':'JP','paraguay':'PY','qatar':'QA',
 'south korea':'KR','korea republic':'KR','united arab emirates':'AE',
 'saudi arabia':'SA','uzbekistan':'UZ','serbia':'RS','germany':'DE',
 'france':'FR','turkey':'TR','turkiye':'TR','spain':'ES','netherlands':'NL','portugal':'PT',
 'italy':'IT','england':'GB','northern ireland':'GB','wales':'GB',
 'ireland':'IE','republic of ireland':'IE','hungary':'HU','denmark':'DK',
 'norway':'NO','belgium':'BE','austria':'AT','finland':'FI','sweden':'SE',
 'poland':'PL','czechia':'CZ','czech republic':'CZ','croatia':'HR',
 'argentina':'AR','uruguay':'UY','australia':'AU','new zealand':'NZ',
 'united states':'US','usa':'US','canada':'CA','mexico':'MX',
 'taiwan':'TW','chinese taipei':'TW'
};
function readableChinese(value){
 const name=String(value||'').trim();
 return /[\u3400-\u9fff]/.test(name)&&!/[�\uFFFD]/.test(name)&&!/\?{2,}/.test(name);
}
function localizedTeamName(source,providedZh=''){
 const english=String(source||'').trim();
 const alias=TEAM_ZH_LOOKUP.get(nameKey(english));
 if(alias&&readableChinese(alias))return alias;
 if(readableChinese(providedZh))return String(providedZh).trim();
 if(readableChinese(english))return english;
 return '中文隊名待核對';
}
function sourceTeamName(english,short,primary){
 const full=String(english||'').trim();
 if(full&&full!==primary&&!/[�\uFFFD]/.test(full))return full;
 const abbreviated=String(short||'').trim();
 if(abbreviated&&abbreviated!==primary&&!/[�\uFFFD]/.test(abbreviated))return abbreviated;
 return '';
}
function teamFlag(name){
 const code=TEAM_FLAG_ISO[nameKey(name)]||'';
 if(!/^[A-Z]{2}$/.test(code))return '';
 return String.fromCodePoint(...code.split('').map(c=>127397+c.charCodeAt(0)));
}
function displayCleanText(text){
 // Keep the archived original unchanged; correct known damaged display strings only.
 return String(text||'').replace(/保加利令[�\uFFFD?]+/g,'保加利亞')
   .replace(/埃沙尼亞/g,'愛沙尼亞');
}

function onLogoError(event){
 if(event.target instanceof HTMLImageElement && event.target.closest('.team-crest'))
   event.target.classList.add('logo-unavailable');
}
function teamLogo(logo,name){
 const src=safeLogo(logo),flag=teamFlag(name)||'⚽';
 return '<span class="team-crest"><span class="crest-fallback">'+escapeHtml(flag)+'</span>'+
  (src?'<img src="'+escapeHtml(src)+'" alt="" loading="lazy" decoding="async">':'')+'</span>';
}

function nationalLeagueCode(league){
 return LIVE?.NATIONAL_LEAGUES?.has(league)===true;
}
function rankCode(league,name,abbr){
 if(!nationalLeagueCode(league)||!LIVE?.fifaCode)return null;
 return LIVE.fifaCode(name,abbr);
}
function fifaRankMarkup(league,name,abbr){
 const code=rankCode(league,name,abbr);
 if(!code)return '';
 const entry=state.fifaRanks.get(code),valid=entry&&Number.isInteger(entry.rank);
 const title=valid?'FIFA 男子世界排名 · 發布日期 '+entry.date+' · 資料提供：FotMob（依 FIFA 公布名次）':'FIFA 男子排名尚未查到有效名次';
 return '<span class="fifa-rank" title="'+escapeHtml(title)+'">'+(valid?'FIFA '+entry.rank:'FIFA —')+'</span>';
}
async function loadFifaRanks(fixtures){
 if(state.fifaRanksBusy||!LIVE)return;
 const codes=[...new Set((fixtures||[]).flatMap(f=>[
  rankCode(f.leagueCode,f.home,f.homeAbbr),
  rankCode(f.leagueCode,f.away,f.awayAbbr)
 ]).filter(Boolean))].filter(code=>!state.fifaRanks.has(code));
 if(!codes.length)return;
 state.fifaRanksBusy=true;
 try{
  const response=await fetch('/api/fifa-rankings',{cache:'no-store'});
  if(!response.ok)throw Error('FIFA 排名期別來源暫時無法取得');
  const data=await response.json();
  if(!Array.isArray(data.rows)||!/^20\d{2}-\d{2}-\d{2}$/.test(data.asOf||''))
   throw Error('FIFA 排名資料格式不完整');
  const byCode=new Map();
  for(const row of data.rows){
   const code=LIVE.fifaCode(row.name);
   const rank=Number(row.rank);
   if(code&&Number.isInteger(rank)&&rank>=1&&rank<=250){
    if(!byCode.has(code))byCode.set(code,{rank,date:data.asOf});
   }
  }
  for(const code of codes)state.fifaRanks.set(code,byCode.get(code)||null);
  state.fifaRankPubDate=data.asOf;
 }catch(err){
  for(const code of codes)state.fifaRanks.set(code,null);
  console.warn('FIFA ranking unavailable:',String(err.message||err));
 }finally{
  state.fifaRanksBusy=false;
  if(state.view==='schedule')renderSchedule();
 }
}

function teamLine(side,full,short,logo,translated,league='',abbr=''){
 const name=localizedTeamName(full,translated);
 const sub=sourceTeamName(full,short,name);
 return '<div class="match-team '+(side==='home'?'home-team':'away-team')+'">'+
  '<span class="team-position '+side+'">'+(side==='home'?'主':'客')+'</span>'+
  teamLogo(logo,full)+'<span class="team-names"><strong>'+escapeHtml(name)+'</strong>'+
  (sub?'<small>'+escapeHtml(sub)+'</small>':'')+
  fifaRankMarkup(league,full,abbr)+'</span></div>';
}
async function readScoreboard(league,date,force){
 const key=league+'|'+date,old=state.scoreboardCache.get(key);
 if(!force&&old&&Date.now()<old.expiresAt)return old.promise;
 const promise=(async()=>{
  const url='/api/fixtures?provider=espn&league='+encodeURIComponent(league)+'&date='+date;
  const resp=await fetch(url,{cache:'no-store'}),data=await resp.json();
  if(!resp.ok||data.upstreamStatus!==200)throw Error(data.error||'HTTP '+(data.upstreamStatus||resp.status));
  if(!data.data||!Array.isArray(data.data.events))throw Error('ESPN 回傳欄位不完整');
  return data.data.events.map(e=>({...e,_league:league}));
 })();
 state.scoreboardCache.set(key,{expiresAt:Date.now()+SCOREBOARD_TTL,promise});
 try{return await promise}catch(e){state.scoreboardCache.delete(key);throw e}
}
function referenceResult(p,h,a){
 if(!Number.isInteger(h)||!Number.isInteger(a))return '';
 const market=String(p.market||'').replace(/\s+/g,''),total=h+a;
 if(/雙方進球/.test(market)){
   const yes=/是|有/.test(market),has=h>0&&a>0;
   if(/是|否|有|無/.test(market))return (has===yes?'參考全贏':'參考全輸');
 }
 const totalMatch=market.match(/(?:全場)?(?:總進球)?(大|小)(\d+(?:\.\d+)?)/);
 if(totalMatch){
  const line=Number(totalMatch[2]);
  if(!Number.isFinite(line)||line%0.5!==0)return '';
  const won=totalMatch[1]==='大'?total>line:total<line;
  const draw=total===line;return draw?'參考走盤':won?'參考全贏':'參考全輸';
 }
 if(/不敗/.test(market)){
  if((p.homeZh&&market.includes(p.homeZh))||market.includes('主勝或和局'))return h>=a?'參考全贏':'參考全輸';
  if((p.awayZh&&market.includes(p.awayZh))||market.includes('客勝或和局'))return a>=h?'參考全贏':'參考全輸';
 }
 if(/獲勝|勝出|主勝|客勝/.test(market)){
  if((p.homeZh&&market.includes(p.homeZh))||market==='主勝')return h>a?'參考全贏':'參考全輸';
  if((p.awayZh&&market.includes(p.awayZh))||market==='客勝')return a>h?'參考全贏':'參考全輸';
 }
 return '';
}
async function loadReviewScores(force=false){
 if(state.reviewLoading||!state.report?.matches?.length){
   if(!state.report?.matches?.length){state.reviewFixtures=[];state.reviewUpdatedAt=0;renderReview()}
   return;
 }
 const day=state.day,prev=state.reviewDate===day;
 if(!force&&prev&&state.reviewUpdatedAt&&Date.now()-state.reviewUpdatedAt<SCOREBOARD_TTL){renderReview();return}
 const codes=[...new Set(state.report.matches.map(p=>PRED_LEAGUE_CODES[p.league]||Object.keys(KN).find(k=>KN[k]===p.league)).filter(Boolean))];
 if(!codes.length){state.reviewFixtures=[];state.reviewUpdatedAt=Date.now();state.reviewDate=day;renderReview();return}
 state.reviewLoading=true;
 $('refreshReview').disabled=true;
 $('reviewFreshness').textContent='查詢最新比分中…';
 const todo=codes.flatMap(league=>[addDay(day,-1),day].map(date=>({league,date})));
 let cursor=0,matched=[],errors=[];
 async function worker(){
  for(;;){
   const index=cursor++;if(index>=todo.length)break;
   const item=todo[index];
   try{
    const entries=await readScoreboard(item.league,item.date,force);
    for(const event of entries){
     const fixture=parseScore(event);
     if(fixture&&fixture.date===day)matched.push(fixture)
    }
   }catch(e){errors.push({league:item.league,date:item.date,error:String(e.message||e)})}
  }
 }
 await Promise.all(Array.from({length:Math.min(3,todo.length)},worker));
 const byId=new Map();matched.forEach(f=>byId.set(f.id||f.leagueCode+'|'+f.home+'|'+f.away+'|'+f.time,f));
 const fixtures=[...byId.values()];
 await enrichScoreResults(fixtures,force,true);
 if(state.day===day){
  state.reviewFixtures=fixtures;
  state.reviewErrors=errors;state.reviewUpdatedAt=Date.now();state.reviewDate=day;
 }
 state.reviewLoading=false;$('refreshReview').disabled=false;
 renderReview();
 enrichScoreResults(fixtures,force,false).then(()=>{
  if(state.day===day&&state.view==='reviews')renderReview();
 }).catch(err=>console.warn('Review score cross-check failed:',String(err.message||err)));
 if(state.day!==day&&state.view==='reviews')loadReviewScores(false);
}

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
function pickDay(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;state.day=day;$('selectedDay').value=day;setReport();state.fixtures=state.cache.get(cacheKey())?.fixtures||[];state.sources=state.cache.get(cacheKey())?.sources||[];state.reviewFixtures=[];state.reviewDate='';state.reviewUpdatedAt=0;render();if(state.view==='reviews')loadReviewScores(false);else loadFixtures(false)}
function cacheKey(){return state.day+'|'+[...state.leagues].sort().join(',')}
function getSelected(){const set=new Set(state.leagues);return LEAGUES.filter(x=>set.has(x[0]))}
function parseScore(item){
 const competition=item.competitions?.[0]||{},players=competition.competitors||[];
 const home=players.find(x=>x.homeAway==='home')||{},away=players.find(x=>x.homeAway==='away')||{};
 const titleHome=home.team?.displayName||home.team?.name||'',titleAway=away.team?.displayName||away.team?.name||'';
 const homeLogo=home.team?.logo||home.team?.logos?.[0]?.href||'';
 const awayLogo=away.team?.logo||away.team?.logos?.[0]?.href||'';
 const homeShort=home.team?.shortDisplayName||'',awayShort=away.team?.shortDisplayName||'';
 const homeAbbr=String(home.team?.abbreviation||''),awayAbbr=String(away.team?.abbreviation||'');
 const homeId=String(home.team?.id||''),awayId=String(away.team?.id||'');
 const stamp=fTaiwan(item.date||competition.date),sourceStatus=item.status||competition.status||{},type=sourceStatus.type||{};
 const liveStatus=LIVE?.getStatusFields(sourceStatus)||{halftime:false,clock:''};
 if(!stamp||!titleHome||!titleAway)return null;
 const statusRaw=String(type.name||'')+' '+String(type.description||'')+' '+String(type.shortDetail||'');
 const rawState=String(type.state||'').toLowerCase();
 const postponed=/postpon|suspend|delay/i.test(statusRaw);
 const cancelled=/cancel/i.test(statusRaw);
 const completed=type.completed===true||rawState==='post'||/final|full.?time|status_final/i.test(statusRaw);
 const progress=!completed&&(rawState==='in'||/in progress|halftime|half.?time|live/i.test(statusRaw));
 const halftime=liveStatus.halftime||/status_halftime|\bhalf.?time\b|^ht$/i.test(statusRaw.trim());
 let homeScore=home.score,awayScore=away.score;
 if(typeof homeScore==='object')homeScore=homeScore?.value;
 if(typeof awayScore==='object')awayScore=awayScore?.value;
 if(!Number.isFinite(Number(homeScore))||String(homeScore).trim()==='')homeScore=null;
 if(!Number.isFinite(Number(awayScore))||String(awayScore).trim()==='')awayScore=null;
 return {id:String(item.id||''),date:stamp.date,time:stamp.time,
  leagueCode:item._league||'',league:KN[item._league]||item._league||'',
  home:titleHome,away:titleAway,homeLogo,awayLogo,homeShort,awayShort,homeAbbr,awayAbbr,
  homeId:String(home.team?.id||''),awayId:String(away.team?.id||''),
  rawDetails:Array.isArray(competition.details)?competition.details:[],
  statusClock:liveStatus.clock,liveClock:liveStatus.clock,sourceStatus,homeId,awayId,
  scoreHome:completed||progress?homeScore:null,scoreAway:completed||progress?awayScore:null,
  status:cancelled?'cancelled':postponed?'postponed':completed?'finished':halftime?'halftime':progress?'inprogress':'scheduled',
  stateName:type.description||type.name||'',source:'ESPN',url:item.links?.[0]?.href||''};
}
async function loadFixtures(force){
 if(state.loading){state.scheduleQueued=true;return}
 const key=cacheKey(), day=state.day;
 if(!force&&state.cache.has(key)&&Date.now()<state.cache.get(key).expiresAt){const cached=state.cache.get(key);state.fixtures=cached.fixtures;state.sources=cached.sources;render();loadFifaRanks(cached.fixtures);pollLiveMatches();return}
 if(state.leagues.size===0){state.fixtures=[];state.sources=[];render();toast('請至少選擇一個查核聯賽');return}
 state.loading=true;$('reloadFixtures').disabled=true;$('refreshAll').disabled=true;
 $('fixtureNotice').textContent='正在取得賽程資料…';$('fixtureNotice').classList.remove('hidden');
 const queries=[];
 for(const league of state.leagues)for(const date of [addDay(state.day,-1),state.day])queries.push({league,date});
 let cursor=0,finished=0;const results=[],sources=[];
 async function worker(){
  for(;;){
   const ix=cursor++;if(ix>=queries.length)break;
   const q=queries[ix];
   try{
    const events=await readScoreboard(q.league,q.date,force);
    sources.push({league:q.league,date:q.date,status:'ok',count:events.length});
    for(const event of events)results.push(event)
   }catch(e){sources.push({league:q.league,date:q.date,status:'error',message:String(e.message||e)})}
   finished++;
   $('sourceSummary').textContent='賽程來源查詢 '+finished+' / '+queries.length;
  }
 }
 await Promise.all(Array.from({length:Math.min(3,queries.length)},worker));
 const seen=new Map();
 for(const e of results){const f=parseScore(e);if(!f||f.date!==day)continue;
  const identity=f.id||f.leagueCode+'|'+f.home+'|'+f.away+'|'+f.time;
  if(!seen.has(identity))seen.set(identity,f);
 }
 const fixtures=[...seen.values()].sort((a,b)=>a.time.localeCompare(b.time)||a.league.localeCompare(b.league,'zh-Hant'));
 await enrichScoreResults(fixtures,force,true);
 state.cache.set(key,{fixtures,sources,expiresAt:Date.now()+DAY_CACHE_MS});
 const active=state.day===day&&cacheKey()===key;
 if(active){state.fixtures=fixtures;state.sources=sources}
 state.loading=false;$('reloadFixtures').disabled=false;$('refreshAll').disabled=false;
 if(active){render();loadFifaRanks(fixtures);pollLiveMatches()}
 if(state.scheduleQueued||!active){
   state.scheduleQueued=false;
   if(state.view==='schedule')loadFixtures(false);
   return;
 }
 // Do not block the fixtures list while individual free source lookups are slow.
 enrichScoreResults(fixtures,force,false).then(()=>{
   if(state.day===day&&cacheKey()===key)render();
 }).catch(err=>console.warn('Result cross-check failed:',String(err.message||err)));
 const err=sources.filter(s=>s.status==='error').length;
 $('fixtureNotice').textContent=err?('有 '+err+' 筆資料來源查詢失敗，賽程可能不完整。請查看資料驗證。'):'';
 $('fixtureNotice').classList.toggle('hidden',err===0);
}
function fixturesForView(){
 const lc=$('leagueFilter').value,st=$('statusFilter').value;
 return state.fixtures.filter(x=>{
  if(lc&&x.leagueCode!==lc&&x.league!==lc)return false;
  if(!st)return true;
  const effective=elapsedStatus(x);
  if(st==='unverified')return !x.scoreVerified&&['stale','pending','conflict'].includes(effective);
  return effective===st;
 });
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
const MATCH_SUMMARY_CACHE_MS=LIVE_DETAIL_TTL;
const summaryCache=new Map();
let matchDialogRequest=0;
let matchReturnFocus=null;

function matchHero(f){
 const p=predictionForEvent(f);
 const home=localizedTeamName(f.home,p?.homeZh);
 const away=localizedTeamName(f.away,p?.awayZh);
 const fullScore=(f.status==='finished'||f.status==='inprogress'||f.status==='halftime')&&
  Number.isInteger(Number(f.scoreHome))&&f.scoreHome!==null&&
  Number.isInteger(Number(f.scoreAway))&&f.scoreAway!==null;
 const score=fullScore?escapeHtml(f.scoreHome)+' <span class="hero-dash">–</span> '+escapeHtml(f.scoreAway):'— <span class="hero-dash">–</span> —';
 const status=displayFixtureStatus(f);
 const nameBlock=(side,label,english,logo)=>'<div class="hero-team '+side+'">'+
  '<div class="hero-crest">'+teamLogo(logo,english)+'</div>'+
  '<strong>'+escapeHtml(label)+'</strong>'+
  '<span class="hero-english">'+escapeHtml(english===label?'':english)+'</span>'+
  '<span class="hero-side">'+(side==='home'?'主隊':'客隊')+'</span></div>';
 const statusClass=['ok','warn','bad','blue','neutral'].includes(status.tone)?status.tone:'neutral';
 return '<div class="match-hero">'+
  nameBlock('home',home,f.home,f.homeLogo)+
  '<div class="hero-center"><div class="hero-score">'+score+'</div>'+
  '<div class="hero-status '+statusClass+'">'+escapeHtml(status.text)+'</div>'+
  '<div class="hero-time">'+escapeHtml(f.date.replaceAll('-','/'))+'　'+escapeHtml(f.time)+'　台灣時間</div></div>'+
  nameBlock('away',away,f.away,f.awayLogo)+
  '</div>';
}
function goalEventsFromSummary(payload,fixture){
 if(!LIVE?.collectGoalEvents)return [];
 let plays=LIVE.collectGoalEvents(payload);
 if(!plays.length&&fixture?.rawDetails?.length)plays=LIVE.collectGoalEvents({details:fixture.rawDetails});
 const accepted=[],seen=new Set();
 for(const p of plays){
  const byId=p.teamId&&p.teamId===fixture.homeId?'home':
   p.teamId&&p.teamId===fixture.awayId?'away':'';
  const side=byId||(
   p.teamName&&sameTeam(p.teamName,fixture.home)?'home':
   p.teamName&&sameTeam(p.teamName,fixture.away)?'away':'unknown');
  const player=p.scorer||'進球者未提供',time=p.minute||'—';
  const key=[side,time,player].join('|');
  if(seen.has(key))continue;seen.add(key);
  accepted.push({side,player,time,ownGoal:p.kind==='烏龍球',kind:p.kind});
 }
 return accepted.slice(0,24);
}
function isGoalPlay(e){
 if(!e||typeof e!=='object')return false;
 if(e.scoringPlay===true&&e.type?.text){
  return /(^|[\s_-])(goal|own goal|penalty goal)([\s_-]|$)/i.test(String(e.type.text))&&!/disallow|no goal|goal kick/i.test(String(e.type.text));
 }
 const type=String(e.type?.text||e.type?.name||e.type?.displayName||e.playType?.text||'');
 return /(^|[\s_-])(goal|own goal|penalty goal)([\s_-]|$)/i.test(type)&&
  !/disallow|cancel|no goal|goal kick/i.test(type);
}
async function fetchMatchSummary(f){
 if(!/^\d{4,14}$/.test(String(f.id||''))||!f.leagueCode)return null;
 const key=f.leagueCode+'|'+f.id,older=summaryCache.get(key);
 if(older&&Date.now()<older.expires)return older.promise;
 const promise=(async()=>{
   const url='/api/match-summary?league='+encodeURIComponent(f.leagueCode)+'&event='+encodeURIComponent(f.id);
   const resp=await fetch(url,{cache:'no-store'}),json=await resp.json();
   if(!resp.ok||json.upstreamStatus!==200||!json.data)throw Error('ESPN 此場沒有可用的進球事件');
   return json.data;
 })();
 summaryCache.set(key,{expires:Date.now()+MATCH_SUMMARY_CACHE_MS,promise});
 try{return await promise}catch(err){summaryCache.delete(key);throw err}
}
function goalDetailMarkup(goals){
 if(!goals.length)return '<div class="match-detail-empty">ESPN 尚未提供這場比賽的可辨識進球事件；不代表沒有進球。</div>';
 const home=goals.filter(g=>g.side==='home'),
  away=goals.filter(g=>g.side==='away'),unknown=goals.filter(g=>g.side==='unknown');
 const format=entries=>entries.map(g=>'<div class="scorer">'+
  '<span class="scorer-ball">⚽</span>'+
  '<span class="scorer-person">'+escapeHtml(g.player)+
  (g.ownGoal?' <span class="scorer-og">烏龍球</span>':g.kind==='十二碼進球'?' <span class="scorer-og">十二碼</span>':'')+
  '</span><strong>'+escapeHtml(g.time)+'</strong></div>').join('');
 return '<div class="goal-columns"><div class="goal-side"><div class="goal-column-label">主隊</div>'+
  (format(home)||'<span class="no-goal-events">—</span>')+'</div>'+
  '<div class="goal-side"><div class="goal-column-label">客隊</div>'+
  (format(away)||'<span class="no-goal-events">—</span>')+'</div></div>'+
  (unknown.length?'<div class="goal-unassigned"><span>隊伍待核對</span>'+format(unknown)+'</div>':'')+
  '<p class="goal-source-hint">進球者與分鐘依 ESPN 賽事事件；來源缺漏時不補造資料。</p>';
}
function htmlToNode(markup){
 const wrap=document.createElement('div');
 wrap.innerHTML=markup;
 return wrap.firstElementChild;
}
function applySummaryToFixture(f,summary){
 if(!LIVE||!summary||!f)return false;
 const status=LIVE.summaryStatus(summary);
 const scores=LIVE.summaryScores(summary);
 let changed=false;
 if(status){
  const fields=LIVE.getStatusFields(status);
  const nextStatus=fields.finished?'finished':fields.halftime?'halftime':fields.playing?'inprogress':null;
  if(nextStatus&&nextStatus!==f.status){f.status=nextStatus;changed=true}
  if(fields.clock&&fields.clock!==f.liveClock){f.liveClock=fields.clock;changed=true}
  if(nextStatus)f.lastLiveFetchedAt=Date.now();
 }
 if(scores&&(f.status==='inprogress'||f.status==='halftime'||f.status==='finished')&&!f.scoreVerified&&!f.scoreConflict){
  if(f.scoreHome!==scores.home||f.scoreAway!==scores.away){
   f.scoreHome=scores.home;f.scoreAway=scores.away;changed=true;
  }
 }
 return changed;
}
async function pollLiveMatches(){
 if(state.livePolling||state.loading||!LIVE||document.visibilityState==='hidden')return;
 const day=state.day;
 const offset=Math.abs(Math.round((Date.parse(todayTaiwan()+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000));
 if(offset>1)return;
 const active=state.fixtures.filter(f=>{
  const elapsed=Date.now()-scheduledKickoff(f);
  return /^\d{4,14}$/.test(String(f.id||''))&&
    (f.status==='inprogress'||f.status==='halftime'||
      (elapsedStatus(f)==='pending'&&elapsed>0&&elapsed<=150*60000));
 }).slice(0,8);
 if(!active.length)return;
 state.livePolling=true;
 let cursor=0;
 async function worker(){
  while(cursor<active.length){
   const f=active[cursor++];try{
    const summary=await fetchMatchSummary(f);
    if(state.day!==day)continue;
    applySummaryToFixture(f,summary);
    if(state.activeMatchId===f.id && !$('matchModal').classList.contains('hidden')){
      const hero=$('matchDetailBody').querySelector('.match-hero');
      if(hero)hero.replaceWith(htmlToNode(matchHero(f)));
      const goals=$('matchGoals');
      if(goals)goals.innerHTML=goalDetailMarkup(goalEventsFromSummary(summary,f));
    }
   }catch(e){f.liveDetailError=String(e.message||e)}
  }
 }
 await Promise.all(Array.from({length:Math.min(2,active.length)},worker));
 state.livePolling=false;
 if(state.view==='schedule'&&state.day===day)renderSchedule();
}

async function openMatchDetail(f){
 if(!f)return;
 const request=++matchDialogRequest;
 state.activeMatchId=f.id;
 matchReturnFocus=document.activeElement;
 $('matchDetailLeague').textContent=f.league||'比賽詳情';
 $('matchDetailTitle').textContent='比賽詳情';
 $('matchDetailBody').innerHTML=matchHero(f)+
  '<div class="match-details-section"><h3>進球紀錄</h3>'+
  '<div id="matchGoals" class="match-goals"><div class="match-detail-empty">正在查詢進球資料…</div></div></div>'+
  '<div class="match-source-footer">比分：'+escapeHtml(f.source||'ESPN')+
  (f.scoreVerified?' · 已比對獨立來源':' · 未必經第二來源確認')+'</div>';
 openModal('matchModal');
 $('matchCloseBtn').focus();
 let summary;
 try{summary=await fetchMatchSummary(f)}catch{
  if(request!==matchDialogRequest||$('matchModal').classList.contains('hidden'))return;
  $('matchGoals').innerHTML='<div class="match-detail-empty">目前沒有可信的進球者與分鐘資料。</div>';
  return;
 }
 if(request!==matchDialogRequest||$('matchModal').classList.contains('hidden'))return;
 $('matchGoals').innerHTML=goalDetailMarkup(goalEventsFromSummary(summary,f));
 const updated=applySummaryToFixture(f,summary);
 if(updated){
   $('matchDetailBody').querySelector('.match-hero')?.replaceWith(htmlToNode(matchHero(f)));
   renderSchedule();
 }
}
function closeMatchDetail(){
 ++matchDialogRequest;
 state.activeMatchId='';
 closeModal('matchModal');
 if(matchReturnFocus&&typeof matchReturnFocus.focus==='function')matchReturnFocus.focus();
 matchReturnFocus=null;
}

function renderSchedule(){
 const rows=fixturesForView();$('fixtureCount').textContent=rows.length;$('fixtureEmpty').classList.toggle('hidden',rows.length>0);
 $('fixtureTable').innerHTML=rows.map((x,i)=>{
  const p=predictionForEvent(x),when=state.day.slice(5).replace('-','/'),
   effective=displayFixtureStatus(x),
   score=(x.status==='finished'||x.status==='inprogress'||x.status==='halftime')&&
        x.scoreHome!==null&&x.scoreHome!==undefined&&x.scoreAway!==null&&x.scoreAway!==undefined
      ?'<span class="match-score">'+escapeHtml(x.scoreHome)+' : '+escapeHtml(x.scoreAway)+'</span>'
      :elapsedStatus(x)==='scheduled'?'<span class="schedule-vs">VS</span>':'<span class="schedule-vs">— : —</span>';
  return '<tr class="clickable-match" tabindex="0" role="button" aria-label="查看'+escapeHtml(localizedTeamName(x.home))+'對'+escapeHtml(localizedTeamName(x.away))+'的比賽詳情" data-match-index="'+i+'"><td class="fixture-time"><span class="fixture-day">'+escapeHtml(when)+'</span><strong>'+escapeHtml(x.time)+'</strong></td>'+
   '<td class="fixture-league"><span class="league-token">'+escapeHtml(x.league)+'</span></td>'+
   '<td class="fixture-match"><div class="teams-stack">'+
   teamLine('home',x.home,x.homeShort,x.homeLogo,p?.homeZh,x.leagueCode,x.homeAbbr)+
   teamLine('away',x.away,x.awayShort,x.awayLogo,p?.awayZh,x.leagueCode,x.awayAbbr)+
   '</div></td>'+
   '<td class="fixture-outcome"><div>'+score+'</div>'+
   statusPill(effective.text,effective.tone)+
   '</td></tr>'
 }).join('');
 const failures=state.sources.filter(x=>x.status==='error').length;
 const staleCount=state.fixtures.filter(x=>['stale','pending','conflict'].includes(elapsedStatus(x))).length;
 if(!state.loading){
   $('fixtureNotice').textContent=[
     failures?failures+' 筆賽程來源查詢失敗':'',
     staleCount?staleCount+' 場已過開賽時間、賽況或比分仍待核對':''
   ].filter(Boolean).join('；');
 }
 $('fixtureNotice').classList.toggle('hidden',!state.loading&&failures===0&&staleCount===0);
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
 '<article class="prediction"><div class="pred-top"><span>第 '+p.order+' 關　'+escapeHtml(p.time)+'　·　'+escapeHtml(p.league)+(p.round?' · '+escapeHtml(p.round):'')+'</span>'+(p.group&&p.group!=='串關單'?'<span>'+escapeHtml(p.group)+'</span>':'')+'</div>'+
 '<div class="pred-team-stack">'+
  teamLine('home',p.home,'',eventForPrediction(p,state.fixtures.concat(state.reviewFixtures))?.homeLogo,p.homeZh,PRED_LEAGUE_CODES[p.league]||'')+
  teamLine('away',p.away,'',eventForPrediction(p,state.fixtures.concat(state.reviewFixtures))?.awayLogo,p.awayZh,PRED_LEAGUE_CODES[p.league]||'')+
 '</div>'+
 '<div class="pred-choice"><strong>'+escapeHtml(displayCleanText(p.market))+'</strong>'+(p.probability!==null&&Number.isFinite(p.probability)?'<span class="probability">'+p.probability+'%<small>估計'+escapeHtml(p.probabilityType)+'機率</small></span>':'')+'</div></article>'
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
 const rows=predsForView(),available=state.reviewFixtures.concat(state.fixtures);
 $('reviewCount').textContent=rows.length;$('reviewEmpty').classList.toggle('hidden',rows.length>0);
 const checked=state.reviewUpdatedAt?fTaiwan(state.reviewUpdatedAt).time:'';
 $('reviewFreshness').textContent=state.reviewLoading?'查詢最新比分中…':
  checked?'ESPN 比分查詢 '+checked+(state.reviewErrors.length?' · 部分失敗':''):'尚未查詢即時比分';
 $('reviewTable').innerHTML=rows.map(p=>{
  const live=eventForPrediction(p,available),
    liveScore=live&&(live.status==='finished'||live.status==='inprogress')&&
      live.scoreHome!==null&&live.scoreHome!==undefined&&live.scoreAway!==null&&live.scoreAway!==undefined;
  const recorded=p.homeScore!==null&&p.awayScore!==null;
  const inconsistent=p.verified&&recorded&&liveScore&&
    (Number(live.scoreHome)!==p.homeScore||Number(live.scoreAway)!==p.awayScore);
  const h=p.verified&&recorded?p.homeScore:liveScore?Number(live.scoreHome):recorded?p.homeScore:null;
  const a=p.verified&&recorded?p.awayScore:liveScore?Number(live.scoreAway):recorded?p.awayScore:null;
  const extraTime=Boolean(live&&/penalty|penalties|extra time|\bAET\b|PEN/i.test(live.stateName||''));
  const ref=(!p.verified&&live&&live.status==='finished'&&liveScore&&!extraTime)?
    referenceResult(p,Number(live.scoreHome),Number(live.scoreAway)):'';
  const outcome=p.verified?settlementPill(p):ref?statusPill(ref,'warn'):settlementPill(p);
  let status='';
  if(inconsistent||live?.scoreConflict)status=statusPill('比分有差異，需重核','bad');
  else if(p.verified)status=statusPill('雙來源已核實','ok');
  else if(live&&live.status==='finished')status=statusPill(extraTime?'含加時／點球，待核':live.scoreVerified?'雙來源比分一致':'終場比分待覆核',live.scoreVerified?'ok':'warn');
  else if(live&&live.status==='inprogress')status=statusPill('比賽進行中','blue');
  else if(live&&['stale','pending','conflict'].includes(elapsedStatus(live)))
   status=statusPill(elapsedStatus(live)==='conflict'?'比分衝突，待核對':'賽況待更新','warn');
  else status=statusPill(recorded?(p.status||'待覆核'):(state.reviewLoading?'正在查詢':'待核對'),'neutral');
  return '<tr><td class="review-time"><strong>'+escapeHtml(p.time)+'</strong></td>'+
    '<td class="review-match"><div class="review-teams">'+
    teamLine('home',p.home,'',live?.homeLogo,p.homeZh,PRED_LEAGUE_CODES[p.league]||'',live?.homeAbbr||'')+
    teamLine('away',p.away,'',live?.awayLogo,p.awayZh,PRED_LEAGUE_CODES[p.league]||'',live?.awayAbbr||'')+
    '</div><small>'+escapeHtml(p.league)+'</small></td>'+
    '<td class="review-market">'+escapeHtml(displayCleanText(p.market))+'</td>'+
    '<td class="review-score"><strong>'+(h!==null&&a!==null?escapeHtml(h)+' : '+escapeHtml(a):'—')+'</strong>'+
    (!p.verified&&liveScore?'<small>'+escapeHtml(live.scoreVerified?'兩來源核對':'單一來源參考')+'</small>':'')+'</td>'+
    '<td>'+outcome+'</td><td>'+status+'</td></tr>';
 }).join('');
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
 const names={schedule:['每日賽程','每日賽程'],predictions:['分析預測','正式預測'],reviews:['賽後復盤','賽後復盤'],history:['歷史統計','歷史統計']};
 const t=names[state.view];$('viewTitle').textContent=t[0];$('breadcrumb').textContent=t[1];
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
 // One-time migration: include both AFCON competitions for existing visitors.
 try{if(localStorage.getItem('football-afcon-migration-v1')!=='done'){
   state.leagues.add('caf.nations');state.leagues.add('caf.nations_qual');
   localStorage.setItem('football-dashboard-leagues',JSON.stringify([...state.leagues]));
   localStorage.setItem('football-afcon-migration-v1','done');
 }}catch{}
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
   state.view=b.dataset.view;render();
   if(state.view==='reviews')loadReviewScores(false);
   else if(state.view==='schedule')loadFixtures(false);
 }));
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
 $('refreshAll').onclick=async()=>{
   await loadFeed();
   if(state.view==='reviews')await loadReviewScores(true);else await loadFixtures(true);
   toast('資料已重新查詢，比分未經覆核前僅供參考');
 };
 $('refreshReview').onclick=async()=>{
   await loadFeed();await loadReviewScores(true);
   toast('已重新查詢 ESPN 終場比分；正式結算以雙來源核實為準');
 };
 // Live-only ESPN summary refresh; source-reported match minute is not locally fabricated.
 setInterval(()=>pollLiveMatches(),35000);
 // Refresh the visible review for recent matches without exceeding free API quotas.
 setInterval(()=>{
  if(document.visibilityState==='hidden'||state.reviewLoading||state.loading)return;
  const days=Math.round((Date.parse(todayTaiwan()+'T00:00:00Z')-Date.parse(state.day+'T00:00:00Z'))/86400000);
  if(days>=-1&&days<=3){
   if(state.view==='reviews'){
    loadFeed().then(()=>loadReviewScores(false)).catch(()=>loadReviewScores(false));
   }else if(state.view==='schedule'){
    loadFixtures(false);
   }
  }
  // Always recalculate elapsed statuses even if an upstream is unavailable.
  if(state.view==='schedule')renderSchedule();
 },120000);
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible')return;
  if(state.view==='schedule'){loadFixtures(false);pollLiveMatches()}
  if(state.view==='reviews')loadReviewScores(false);
 });
 $('exportDaily').onclick=getDailyExport;
 $('showOriginal').onclick=()=>{if(!state.report)return;$('originalDate').textContent=state.report.date;$('originalArticle').textContent=displayCleanText(state.report.article||'當天未提供可公開原始全文');openModal('originalModal')};
 $('historyRows').onclick=e=>{const b=e.target.closest('[data-load-day]');if(!b)return;pickDay(b.dataset.loadDay);state.view='predictions';render()};
 state.day=todayTaiwan();loadFeed().then(()=>loadFixtures(false));render();
 $('fixtureTable').addEventListener('click',event=>{
  const row=event.target.closest('tr[data-match-index]');
  if(!row)return;
  const f=fixturesForView()[Number(row.dataset.matchIndex)];
  if(f)openMatchDetail(f);
 });
 $('fixtureTable').addEventListener('keydown',event=>{
  if(event.key!=='Enter'&&event.key!==' ')return;
  const row=event.target.closest('tr[data-match-index]');
  if(!row)return;
  event.preventDefault();
  const f=fixturesForView()[Number(row.dataset.matchIndex)];
  if(f)openMatchDetail(f);
 });
 $('matchCloseBtn').addEventListener('click',closeMatchDetail);
 $('matchModal').addEventListener('click',event=>{
   if(event.target===$('matchModal'))closeMatchDetail();
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('matchModal').classList.contains('hidden'))closeMatchDetail();
 });
 $('fixtureTable').addEventListener('error',onLogoError,true);
 $('predictionsGrid').addEventListener('error',onLogoError,true);
 $('reviewTable').addEventListener('error',onLogoError,true);
}
document.addEventListener('DOMContentLoaded',init);