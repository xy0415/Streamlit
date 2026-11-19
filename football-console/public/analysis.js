'use strict';
const LEAGUES=[
['uefa.nations','歐國聯'],['caf.nations','非洲盃'],['caf.nations_qual','非洲盃資格賽'],['fifa.friendly','國際友誼賽'],['eng.1','英超'],['eng.2','英冠'],
['esp.1','西甲'],['esp.copa_del_rey','西班牙國王盃'],['eng.fa','英格蘭足總盃'],['ger.1','德甲'],['ita.1','義甲'],['fra.1','法甲'],['ned.1','荷甲'],
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
  summaryCache:new Map(),activeMatchId:'',matchDetailPayload:null,
  historyScores:new Map(),historyLoading:false,historyChecks:0,historyErrors:0,
  historyRequired:0,historyCheckedAt:0,historyBatch:0,tsdbNextRequestAt:0,lastAutoRefresh:0};

const SCOREBOARD_TTL=45000; // Recent scoreboard refresh; older dates stay cached longer.
const LIVE=typeof window!=='undefined'?window.FootballLive:null;
const LIVE_DETAIL_TTL=35000;
const PRED_LEAGUE_CODES={
 '歐國聯':'uefa.nations','歐洲國家聯賽':'uefa.nations','國際友誼賽':'fifa.friendly',
 '非洲國家盃':'caf.nations','非洲盃':'caf.nations','AFCON':'caf.nations',
 '非洲國家盃資格賽':'caf.nations_qual','非洲盃資格賽':'caf.nations_qual','AFCON資格賽':'caf.nations_qual',
 '英超':'eng.1','英冠':'eng.2','英格蘭足總盃':'eng.fa','西班牙國王盃':'esp.copa_del_rey',
 '西甲':'esp.1','德甲':'ger.1','義甲':'ita.1','法甲':'fra.1',
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
 if(status==='conflict')return {text:'已完賽',tone:'neutral'};
 if(status==='finished'){
  return {text:'已完賽',tone:'ok'};
 }
 if(status==='halftime')return {text:'中場休息',tone:'blue'};
 if(status==='inprogress'){
  const clock=String(f.liveClock||f.statusClock||'').trim();
  return {text:clock||'進行中',tone:'blue'};
 }
 if(status==='cancelled')return {text:'已取消',tone:'bad'};
 if(status==='postponed')return {text:'已延期',tone:'warn'};
 if(status==='stale')return {text:'已開賽',tone:'neutral'};
 if(status==='pending')return {text:'已開賽',tone:'neutral'};
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
async function getIndependentMatchInfo(f,force=false){
 const key=matchLookupKey(f),old=state.resultLookupCache.get(key);
 if(!force&&old&&old.expiresAt>Date.now())return old.promise;
 const promise=(async()=>{
  const kickoff=scheduledKickoff(f);
  const lookupDate=Number.isFinite(kickoff)?new Date(kickoff).toISOString().slice(0,10):f.date;
  const url='/api/match-lookup?date='+encodeURIComponent(lookupDate)+
   '&home='+encodeURIComponent(f.home)+'&away='+encodeURIComponent(f.away);
  // Share one pacing gate across schedule, history and review on this browser.
  const now=Date.now(),sendAfter=Math.max(now,state.tsdbNextRequestAt);
  state.tsdbNextRequestAt=sendAfter+2200;
  if(sendAfter>now)await new Promise(resolve=>setTimeout(resolve,sendAfter-now));
  const response=await fetch(url,{cache:'no-store'}),payload=await response.json();
  if(!response.ok||payload.upstreamStatus!==200)throw Error(payload.error||'備援資料來源暫時無法回應');
  const candidates=payload.data?.event||payload.data?.events||[];
  if(!Array.isArray(candidates))throw Error('備援來源資料格式異常');
  const matched=candidates.filter(x=>{
   if(!sameTeam(x.strHomeTeam,f.home)||!sameTeam(x.strAwayTeam,f.away))return false;
   if(x.strTimestamp){
    const stamp=Date.parse(x.strTimestamp);
    if(!Number.isFinite(stamp)||Math.abs(stamp-scheduledKickoff(f))>3*3600000)return false;
   }else{
    // No timestamp: do not trust for score settlement, but logos can still be
    // associated with exact team identities from the requested date.
    const d=String(x.dateEvent||'');
    const utcDate=Number.isFinite(scheduledKickoff(f))?new Date(scheduledKickoff(f)).toISOString().slice(0,10):f.date;
    if(d&&Math.abs(Date.parse(d+'T00:00:00Z')-Date.parse(utcDate+'T00:00:00Z'))>86400000)return false;
   }
   return true;
  });
  if(matched.length!==1)return null;
  const e=matched[0],status=String(e.strStatus||'').toLowerCase();
  const finished=/\b(finished|final|full.?time|ft|match ended|match finished|completed)\b/.test(status)&&
    !/aet|penalt|extra time/.test(status);
  const h=e.intHomeScore==null||e.intHomeScore===''?null:Number(e.intHomeScore);
  const a=e.intAwayScore==null||e.intAwayScore===''?null:Number(e.intAwayScore);
  const scoreValid=Number.isInteger(h)&&Number.isInteger(a)&&h>=0&&a>=0;
  return {
   final:finished&&scoreValid&&!!e.strTimestamp,
   h:scoreValid?h:null,a:scoreValid?a:null,
   homeLogo:safeLogo(e.strHomeTeamBadge||''),
   awayLogo:safeLogo(e.strAwayTeamBadge||''),
   id:String(e.idEvent||''),source:'TheSportsDB',
   receivedAt:payload.receivedAt||'',url:'https://www.thesportsdb.com/event/'+encodeURIComponent(String(e.idEvent||'')),
   exactKickoff:!!e.strTimestamp,eventTimestamp:String(e.strTimestamp||'')
  };
 })();
 state.resultLookupCache.set(key,{expiresAt:Date.now()+12*60*1000,promise});
 try{return await promise}catch(err){state.resultLookupCache.delete(key);throw err}
}
async function getIndependentScore(f,force=false){
 const item=await getIndependentMatchInfo(f,force);
 return item?.final?item:null;
}
function applyMatchBackup(f,backup){
 if(!backup)return false;
 let changed=false;
 if(!safeLogo(f.homeLogo)&&backup.homeLogo){f.homeLogo=backup.homeLogo;changed=true}
 if(!safeLogo(f.awayLogo)&&backup.awayLogo){f.awayLogo=backup.awayLogo;changed=true}
 if(!backup.final||f.scoreVerified)return changed;
 if(f.status==='finished'&&f.scoreHome!==null&&f.scoreAway!==null){
  if(Number(f.scoreHome)!==backup.h||Number(f.scoreAway)!==backup.a){
   f.scoreConflict=true;f.status='conflict';f.scoreHome=null;f.scoreAway=null;
   changed=true;
  }else{
   f.scoreVerified=true;f.source='ESPN + TheSportsDB';changed=true;
  }
 }else if(f.status!=='conflict'){
  f.status='finished';f.scoreHome=backup.h;f.scoreAway=backup.a;
  f.scoreSource='TheSportsDB';f.source='TheSportsDB';changed=true;
 }
 return changed;
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
   // Verified score can be retained while club badges are independently sourced.
   if(!f.scoreConflict&&!LIVE?.NATIONAL_LEAGUES?.has(f.leagueCode)&&
      (!safeLogo(f.homeLogo)||!safeLogo(f.awayLogo)))unresolved.push(f);
   continue;
  }
  if((elapsedStatus(f)==='stale'||elapsedStatus(f)==='pending'||(
    !LIVE?.NATIONAL_LEAGUES?.has(f.leagueCode)&&(!safeLogo(f.homeLogo)||!safeLogo(f.awayLogo))))
    &&!f.scoreVerified)unresolved.push(f);
 }
 // Verified snapshots are displayed immediately; independent live lookups follow asynchronously.
 if(skipLookups)return fixtures;
 // Free individual queries are bounded and only used for outdated or ambiguous cases.
 let cursor=0;
 const targets=unresolved.slice(0,12);
 async function worker(){
  for(;;){
   const i=cursor++;if(i>=targets.length)break;
   const f=targets[i];try{
    const backup=await getIndependentMatchInfo(f,force);
    if(backup){
     applyMatchBackup(f,backup);
     f.sourceLinks=[{name:'TheSportsDB',url:backup.url}];
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
  if(u.protocol!=='https:'||!(u.hostname==='espncdn.com'||u.hostname.endsWith('.espncdn.com')||u.hostname==='r2.thesportsdb.com'||u.hostname==='www.thesportsdb.com'||u.hostname==='thesportsdb.com'||u.hostname==='media.api-sports.io'))return '';
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
  'atletico mineiro':'atletico mg','1 koln':'koln','cologne':'koln',
  // ESPN often abbreviates Brazilian state names; Gmail uses the full club name.
  'athletico pr':'athletico paranaense','atletico pr':'athletico paranaense',
  'athletico paranaense':'athletico paranaense',
  'botafogo rj':'botafogo','flamengo rj':'flamengo',
  'corinthians sp':'corinthians','santos sp':'santos',
  'gremio porto alegre':'gremio','red bull bragantino':'bragantino'
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
 const samePair=f=>sameTeam(f.home,p.home)&&sameTeam(f.away,p.away);
 const eligible=(list||[]).filter(f=>f.date===p.date&&(!code||f.leagueCode===code)&&samePair(f));
 const near=eligible.filter(f=>compareEventTime(p,f));
 // Unique renamed/rescheduled fixtures remain matchable without guessing across teams.
 const matches=near.length?near:eligible.length===1&&
  Math.abs(Date.parse(eligible[0].date+'T'+eligible[0].time+':00+08:00')-
    Date.parse(p.date+'T'+p.time+':00+08:00'))<=6*3600000?eligible:[];
 const quality=f=>{
  if(f.scoreConflict)return 100; // A known disagreement must remain visible as unresolved.
  const scored=f.scoreHome!==null&&f.scoreHome!==undefined&&f.scoreAway!==null&&f.scoreAway!==undefined;
  return (f.scoreVerified?8:0)+(scored?4:0)+(f.status==='finished'?2:0);
 };
 // The review and schedule can hold different snapshots of the same event.
 // Keep the most complete one; an older review cache must never hide a final score.
 const dedup=new Map();
 for(const f of matches){
  const key=f.id||f.leagueCode+'|'+f.home+'|'+f.away+'|'+f.time;
  if(!dedup.has(key)||quality(f)>quality(dedup.get(key)))dedup.set(key,f);
 }
 const distinct=[...dedup.values()];
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
 const original=String(source||'').trim();
 const alias=TEAM_ZH_LOOKUP.get(nameKey(original));
 if(alias&&readableChinese(alias))return alias;
 if(readableChinese(providedZh))return String(providedZh).trim();
 if(readableChinese(original))return original;
 // An unknown team keeps its actual English source name; never invent a Chinese translation.
 if(original&&!/[�\uFFFD]/.test(original))return original;
 const alternative=String(providedZh||'').trim();
 if(alternative&&!/[�\uFFFD]/.test(alternative))return alternative;
 return '隊名未提供';
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
 if(!valid)return '';
 const title='FIFA 男子世界排名 · 發布日期 '+entry.date+' · 資料提供：FotMob（依 FIFA 公布名次）';
 return '<span class="fifa-rank" title="'+escapeHtml(title)+'">FIFA '+entry.rank+'</span>';
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
 const original=String(full||'').trim();
 const fallback=original&&!/[�\uFFFD]/.test(original)?original:short;
 const name=localizedTeamName(fallback,translated);
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
 const distance=Math.abs(Date.parse(date+'T00:00:00Z')-Date.parse(todayTaiwan()+'T00:00:00Z'));
 const ttl=distance>2*86400000?6*3600000:SCOREBOARD_TTL;
 state.scoreboardCache.set(key,{expiresAt:Date.now()+ttl,promise});
 try{return await promise}catch(e){state.scoreboardCache.delete(key);throw e}
}

const API_FOOTBALL_RECENCY_MS=18*86400000;
const apiFootballFetchedDays=new Map();
function apiFootballAllowedDay(date){
 const parsed=Date.parse(date+'T00:00:00Z');
 return Number.isFinite(parsed)&&Math.abs(Date.now()-parsed)<=API_FOOTBALL_RECENCY_MS;
}
function apiFootballTime(data){
 return String(data.date||'')+'T'+String(data.time||'')+':00+08:00';
}
function apiSourceLogo(s){
 return safeLogo(s||'');
}
function apiFixtureView(item,requireSelected=true){
 if(!item||!KN[item.leagueCode]||(requireSelected&&!state.leagues.has(item.leagueCode)))return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(item.date||'')||!item.home||!item.away)return null;
 const status=['scheduled','inprogress','halftime','finished','postponed','cancelled'].includes(item.status)?item.status:'scheduled';
 const id=Number(item.apiFixtureId);
 if(!Number.isInteger(id)||id<1)return null;
 return {
  id:'api-'+id,apiFixtureId:id,leagueCode:item.leagueCode,league:KN[item.leagueCode]||'',
  date:item.date,time:item.time,home:item.home,away:item.away,homeShort:'',awayShort:'',
  homeLogo:apiSourceLogo(item.homeLogo),awayLogo:apiSourceLogo(item.awayLogo),
  homeId:String(item.homeTeamId||''),awayId:String(item.awayTeamId||''),
  homeAbbr:'',awayAbbr:'',status,
  scoreHome:Number.isInteger(item.scoreHome)?item.scoreHome:null,
  scoreAway:Number.isInteger(item.scoreAway)?item.scoreAway:null,
  statusClock:Number.isInteger(item.minute)?item.minute+'′':'',liveClock:Number.isInteger(item.minute)?item.minute+'′':'',
  source:'API-FOOTBALL',scoreSource:'API-FOOTBALL',scoreVerified:false,
  sourceStatus:{type:{name:item.sourceStatus||'',description:item.statusText||''}},
  stateName:item.statusText||'',hasExtraTime:Boolean(item.hasExtraTime)
 }
}
function matchingFixture(primary,additional){
 const identityMatches=primary.filter(f=>{
  if(f.leagueCode!==additional.leagueCode||f.date!==additional.date)return false;
  const sameName=(a,b)=>sameTeam(a,b)||
    (readableChinese(localizedTeamName(a))&&localizedTeamName(a)===localizedTeamName(b));
  return sameName(f.home,additional.home)&&sameName(f.away,additional.away);
 });
 // A changed kickoff is not a new match. Only accept an extended time window
 // when the team pairing is unique on that day, preventing ambiguous merges.
 const near=identityMatches.filter(f=>Math.abs(scheduledKickoff(f)-scheduledKickoff(additional))<=90*60000);
 if(near.length===1)return near[0];
 if(near.length>1)return null;
 const rescheduled=identityMatches.filter(f=>Math.abs(scheduledKickoff(f)-scheduledKickoff(additional))<=6*3600000);
 return rescheduled.length===1?rescheduled[0]:null;
}
function mergeApiFootballFixtures(existing,received,selectedDay,requireSelected=true){
 let added=0,merged=0,conflicts=0;
 for(const item of received||[]){
  const a=apiFixtureView(item,requireSelected);
  if(!a||a.date!==selectedDay)continue;
  const old=matchingFixture(existing,a);
  if(!old){existing.push(a);added++;continue}
  old.apiFixtureId=a.apiFixtureId;
  if(!safeLogo(old.homeLogo)&&a.homeLogo)old.homeLogo=a.homeLogo;
  if(!safeLogo(old.awayLogo)&&a.awayLogo)old.awayLogo=a.awayLogo;
  const bothHaveFinal=old.status==='finished'&&a.status==='finished'&&
   Number.isInteger(Number(old.scoreHome))&&Number.isInteger(Number(old.scoreAway))&&
   old.scoreHome!==null&&old.scoreAway!==null&&a.scoreHome!==null&&a.scoreAway!==null;
  if(bothHaveFinal&&(Number(old.scoreHome)!==a.scoreHome||Number(old.scoreAway)!==a.scoreAway)){
   old.scoreConflict=true;old.scoreVerified=false;old.status='conflict';old.source='ESPN / API-FOOTBALL 差異';old.scoreHome=null;old.scoreAway=null;
   conflicts++;continue
  }
  if((old.status==='scheduled'||old.status==='pending'||old.status==='inprogress'||old.status==='halftime')&&
     (a.status==='finished'||a.status==='inprogress'||a.status==='halftime')){
   old.status=a.status;
   if(a.scoreHome!==null&&a.scoreAway!==null){old.scoreHome=a.scoreHome;old.scoreAway=a.scoreAway}
   old.scoreSource='API-FOOTBALL';
  }
  if(a.liveClock&&(old.status==='inprogress'||old.status==='halftime'))old.liveClock=a.liveClock;
  if(a.hasExtraTime)old.hasExtraTime=true;
  merged++;
 }
 existing.sort((x,y)=>x.time.localeCompare(y.time)||x.league.localeCompare(y.league,'zh-Hant'));
 return {added,merged,conflicts};
}
async function supplementFromApiFootball(fixtures,day,force=false,{requireSelected=true}={}){
 if(!apiFootballAllowedDay(day))return {added:0,merged:0,conflicts:0,skipped:'outside recent-date range'};
 const memo=apiFootballFetchedDays.get(day);
 if(!force&&memo&&memo.expires>Date.now()){
  return mergeApiFootballFixtures(fixtures,memo.fixtures,day,requireSelected)
 }
 const response=await fetch('/api/api-football/fixtures?date='+encodeURIComponent(day),{cache:'no-store'});
 const json=await response.json();
 if(!response.ok||!json.ok||!Array.isArray(json.fixtures)){
  return {added:0,merged:0,conflicts:0,skipped:json.reason||json.error||'API-FOOTBALL unavailable'};
 }
 apiFootballFetchedDays.set(day,{fixtures:json.fixtures,expires:Date.now()+8*60*1000});
 const merged=mergeApiFootballFixtures(fixtures,json.fixtures,day,requireSelected);
 return {...merged,source:'API-FOOTBALL',count:json.fixtures.length};
}

function referenceResult(p,h,a){
 // Only settle markets supported by the same strict grading rules as history.
 // A generic /大9.5/ match would misgrade corners or cards using goal totals.
 const result=HISTORY?.evaluate(p,h,a);
 return {win:'參考全贏',loss:'參考全輸',halfwin:'參考半贏',
  halfloss:'參考半輸',push:'參考走盤'}[result]||'';
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
 if(state.day===day)syncReviewedHistory(state.report?.matches||[],fixtures);
 if(state.day===day){
  state.reviewFixtures=fixtures;
  state.reviewErrors=errors;state.reviewUpdatedAt=Date.now();state.reviewDate=day;
 }
 state.reviewLoading=false;$('refreshReview').disabled=false;
 renderReview();
 Promise.allSettled([
  enrichScoreResults(fixtures,force,false),
  supplementFromApiFootball(fixtures,day,force,{requireSelected:false})
 ]).then(async()=>{
  await includeMissingClubPredictions(fixtures,force,day,false);
  if(state.day===day)syncReviewedHistory(state.report?.matches||[],fixtures);
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
 return {date:String(r.date||''),article:String(r.article||''),reviewArticle:String(r.reviewArticle||''),cutoff:String(r.cutoff||''),publishedAt:r.publishedAt||r.sentAt||'',
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
 primeHistoryFromFeed();
 setReport();render();
 if(state.view==='history')loadHistoryResults(false);
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
  const identity=f.leagueCode+'|'+f.date+'|'+nameKey(f.home)+'|'+nameKey(f.away)+'|'+f.time;
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
 Promise.allSettled([
   enrichScoreResults(fixtures,force,false),
   supplementFromApiFootball(fixtures,day,force)
 ]).then(async results=>{
   const api=results[1]?.status==='fulfilled'?results[1].value:null;
   if(api?.source){
    sources.push({provider:'api-football',status:'ok',count:api.count,sourceLabel:'API-FOOTBALL'});
   }
   await includeMissingClubPredictions(fixtures,force,day);
   if(state.day===day&&cacheKey()===key){
     state.fixtures=fixtures;
     state.cache.set(key,{fixtures,sources,expiresAt:Date.now()+DAY_CACHE_MS});
     render();
   }
 }).catch(err=>console.warn('Fixture cross-check failed:',String(err.message||err)));
 const err=sources.filter(s=>s.status==='error').length;
 $('fixtureNotice').textContent=err?'部分賽程暫時無法載入':'';
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
 return reports.filter(x=>{
  if(lc&&x.league!==lc&&KN[lc]!==x.league)return false;
  if(!st)return true;
  const fixture=eventForPrediction(x,state.reviewFixtures.concat(state.fixtures));
  if(st==='finished')return x.verified||fixture?.status==='finished';
  if(st==='scheduled')return !x.verified&&fixture?.status!=='finished';
  if(st==='inprogress')return fixture?.status==='inprogress'||fixture?.status==='halftime';
  return true;
 });
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
 if(Array.isArray(payload?.apiFootballEvents)){
  const out=[];
  const homeId=Number(fixture?.homeId),awayId=Number(fixture?.awayId);
  for(const e of payload.apiFootballEvents){
   if(!/^goal$/i.test(String(e.type||'')))continue;
   if(/miss|cancel|disallow|overturn/i.test(String(e.detail||'')+' '+String(e.comments||'')))continue;
   const team=String(e.team||''),id=Number(e.teamId);
   const side=id&&homeId&&id===homeId?'home':id&&awayId&&id===awayId?'away':
     sameTeam(team,fixture.home)?'home':sameTeam(team,fixture.away)?'away':'unknown';
   // An event without a confirmed participant must not be attributed to this fixture.
   if(side==='unknown')continue;
   const minute=Number(e.minute),extra=Number(e.extra);
   const time=Number.isInteger(minute)&&minute>0?
     String(minute)+(Number.isInteger(extra)&&extra>0?'+'+extra:'')+'′':'—';
   out.push({side,player:e.player||'進球者未提供',time,
    ownGoal:/own goal/i.test(String(e.detail||'')),
    kind:/penalty/i.test(String(e.detail||''))?'十二碼進球':'進球'});
  }
  return out.slice(0,30);
 }
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
  if(side==='unknown')continue;
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
 const isEspn=/^\d{4,14}$/.test(String(f.id||''))&&!!f.leagueCode;
 const isApi=Number.isInteger(Number(f.apiFixtureId))&&Number(f.apiFixtureId)>0;
 if(!isEspn&&!isApi)return null;
 const key=isEspn?'espn|'+f.leagueCode+'|'+f.id:'api-football|'+f.apiFixtureId,older=summaryCache.get(key);
 if(older&&Date.now()<older.expires)return older.promise;
 const promise=(async()=>{
  if(isEspn){
   try{
    const url='/api/match-summary?league='+encodeURIComponent(f.leagueCode)+'&event='+encodeURIComponent(f.id);
    const resp=await fetch(url,{cache:'no-store'}),json=await resp.json();
    if(resp.ok&&json.upstreamStatus===200&&json.data)return json.data;
   }catch(err){console.warn('ESPN match events unavailable:',String(err.message||err))}
  }
  if(isApi){
   const url='/api/api-football/events?fixture='+Number(f.apiFixtureId);
   const response=await fetch(url,{cache:'no-store'}),data=await response.json();
   if(response.ok&&data.ok&&Array.isArray(data.events))
    return {apiFootballEvents:data.events,source:'API-FOOTBALL'};
  }
  throw Error('目前沒有可用的進球事件');
 })();
 summaryCache.set(key,{expires:Date.now()+MATCH_SUMMARY_CACHE_MS,promise});
 try{return await promise}catch(err){summaryCache.delete(key);throw err}
}
function goalDetailMarkup(goals){
 if(!goals.length)return '<div class="match-detail-empty">資料來源尚未提供可辨識的進球事件；不代表沒有進球。</div>';
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
  '<p class="goal-source-hint">進球者與分鐘依實際賽事事件；來源缺漏時不補造資料。</p>';
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
  '<div class="match-source-footer">比分：'+escapeHtml(f.source||'賽事來源')+
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
async function openPredictionMatchDetail(p){
 if(!p)return;
 const selectedDay=state.day;
 let fixture=eventForPrediction(p,state.reviewFixtures.concat(state.fixtures));
 if(!fixture){
  const code=PRED_LEAGUE_CODES[p.league]||Object.keys(KN).find(k=>KN[k]===p.league);
  if(code){
   const days=[addDay(p.date,-1),p.date];
   const queries=await Promise.allSettled(days.map(day=>readScoreboard(code,day,false)));
   const candidates=queries.flatMap(result=>result.status==='fulfilled'?result.value.map(parseScore).filter(Boolean):[]);
   fixture=eventForPrediction(p,candidates);
   if(fixture&&state.day===selectedDay){
    state.reviewFixtures=[...state.reviewFixtures.filter(x=>x.id!==fixture.id),fixture];
    renderReview();
   }
  }
 }
 if(state.day!==selectedDay)return;
 if(!fixture){
  // Preserve the exact published fixture without inventing an upstream event ID.
  const recorded=p.verified&&Number.isInteger(p.homeScore)&&Number.isInteger(p.awayScore);
  fixture={id:'',date:p.date,time:p.time,league:p.league,
   home:p.home,away:p.away,homeLogo:'',awayLogo:'',homeId:'',awayId:'',
   status:recorded?'finished':'scheduled',scoreHome:recorded?p.homeScore:null,
   scoreAway:recorded?p.awayScore:null,source:recorded?'已核實終場資料':'公開預測'};
 }
 openMatchDetail(fixture);
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
   $('fixtureNotice').textContent=failures?'部分賽程暫時無法載入':'';
 }
 $('fixtureNotice').classList.toggle('hidden',!state.loading&&failures===0);
 if(!state.loading)$('sourceSummary').textContent=state.sources.length?(state.sources.some(s=>s.provider==='api-football')?'ESPN + API-FOOTBALL':'ESPN')+' · '+(state.sources.length-failures)+' / '+state.sources.length+' 請求成功':'尚未查詢賽程';
}
function renderPredictions(){
 const rows=predsForView();
 $('predictionCount').textContent=rows.length;$('predictionEmpty').classList.toggle('hidden',rows.length>0);
 $('publishedStamp').textContent=state.report?.cutoff?'資料截止：'+state.report.cutoff:'僅採已正式寄出的預測';
 $('showOriginal').disabled=!state.report;
 $('predictionsGrid').innerHTML=rows.map((p,i)=>
 '<article class="prediction clickable-match" tabindex="0" role="button" data-prediction-index="'+i+'" aria-label="查看'+escapeHtml(localizedTeamName(p.home,p.homeZh))+'對'+escapeHtml(localizedTeamName(p.away,p.awayZh))+'的進球詳情"><div class="pred-top"><span>第 '+p.order+' 關　'+escapeHtml(p.time)+'　·　'+escapeHtml(p.league)+(p.round?' · '+escapeHtml(p.round):'')+'</span>'+(p.group&&p.group!=='串關單'?'<span>'+escapeHtml(p.group)+'</span>':'')+'</div>'+
 '<div class="pred-team-stack">'+
  teamLine('home',p.home,'',eventForPrediction(p,state.fixtures.concat(state.reviewFixtures))?.homeLogo,p.homeZh,PRED_LEAGUE_CODES[p.league]||'')+
  teamLine('away',p.away,'',eventForPrediction(p,state.fixtures.concat(state.reviewFixtures))?.awayLogo,p.awayZh,PRED_LEAGUE_CODES[p.league]||'')+
 '</div>'+
 '<div class="pred-choice"><strong>'+escapeHtml(displayCleanText(p.market))+'</strong>'+(p.probability!==null&&Number.isFinite(p.probability)?'<span class="probability">'+p.probability+'%<small>估計'+escapeHtml(p.probabilityType)+'機率</small></span>':'')+'</div></article>'
 ).join('');
}
function reviewResultLabel(settlement){
 const value=String(settlement||'');
 if(/全贏|半贏/.test(value))return '贏';
 if(/全輸|半輸/.test(value))return '輸';
 if(/走盤|退款|退回本金|無效/.test(value))return '走盤';
 return '';
}
function renderReview(){
 const rows=predsForView(),available=state.reviewFixtures.concat(state.fixtures);
 $('reviewCount').textContent=rows.length;
 $('reviewEmpty').classList.toggle('hidden',rows.length>0);
 const checked=state.reviewUpdatedAt?fTaiwan(state.reviewUpdatedAt).time:'';
 $('reviewFreshness').textContent=state.reviewLoading?'更新比分中…':
   checked?'更新 '+checked+(state.reviewErrors.length?' · 部分賽事尚未更新':''):'尚未更新比分';
 $('reviewTable').innerHTML=rows.map((p,i)=>{
  const live=eventForPrediction(p,available);
  const liveScore=!!live&&['finished','inprogress','halftime'].includes(live.status)&&
    Number.isInteger(Number(live.scoreHome))&&live.scoreHome!==null&&live.scoreHome!==undefined&&
    Number.isInteger(Number(live.scoreAway))&&live.scoreAway!==null&&live.scoreAway!==undefined;
  const recorded=Number.isInteger(Number(p.homeScore))&&p.homeScore!==null&&p.homeScore!==undefined&&
    Number.isInteger(Number(p.awayScore))&&p.awayScore!==null&&p.awayScore!==undefined;
  const inconsistent=!!live?.scoreConflict||(p.verified&&recorded&&liveScore&&
    (Number(live.scoreHome)!==Number(p.homeScore)||Number(live.scoreAway)!==Number(p.awayScore)));
  const h=inconsistent?null:p.verified&&recorded?Number(p.homeScore):
    liveScore?Number(live.scoreHome):recorded?Number(p.homeScore):null;
  const a=inconsistent?null:p.verified&&recorded?Number(p.awayScore):
    liveScore?Number(live.scoreAway):recorded?Number(p.awayScore):null;
  const extraTime=!!live&&/penalt|extra.time|\bAET\b|\bPEN\b/i.test(live.stateName||'');
  // A win or loss is shown only for a confirmed stored settlement or a complete
  // 90-minute score. An in-progress match never receives an inferred result.
  let result='';
  if(!inconsistent){
   if(p.verified&&recorded){
     result=reviewResultLabel(p.settlement);
   }else if(live?.status==='finished'&&liveScore&&!extraTime){
     result=reviewResultLabel(referenceResult(p,Number(live.scoreHome),Number(live.scoreAway)));
   }
  }
  const label=result||'—';
  const resultClass=result==='贏'?'win':result==='輸'?'loss':'neutral';
  return '<tr class="clickable-match" tabindex="0" role="button" data-review-index="'+i+'" aria-label="查看'+escapeHtml(localizedTeamName(p.home,p.homeZh))+'對'+escapeHtml(localizedTeamName(p.away,p.awayZh))+'的進球詳情"><td class="review-time"><strong>'+escapeHtml(p.time)+'</strong></td>'+
    '<td class="review-match"><div class="review-teams">'+
    teamLine('home',p.home,'',live?.homeLogo,p.homeZh,PRED_LEAGUE_CODES[p.league]||'',live?.homeAbbr||'')+
    teamLine('away',p.away,'',live?.awayLogo,p.awayZh,PRED_LEAGUE_CODES[p.league]||'',live?.awayAbbr||'')+
    '</div><small>'+escapeHtml(p.league)+'</small></td>'+
    '<td class="review-market">'+escapeHtml(displayCleanText(p.market))+'</td>'+
    '<td class="review-score"><strong>'+(h!==null&&a!==null?escapeHtml(h)+' : '+escapeHtml(a):'—')+'</strong></td>'+
    '<td class="review-result-cell"><strong class="review-result '+resultClass+'">'+escapeHtml(label)+'</strong></td></tr>';
 }).join('');
 renderReviewArticle(state.report?.matches||[],available);
}
function renderReviewArticle(rows,fixtures){
 const body=$('reviewArticleBody');
 if(state.report?.reviewArticle){
  body.textContent=displayCleanText(state.report.reviewArticle);
  return;
 }
 const settled=[];
 for(const p of rows){
  const f=eventForPrediction(p,fixtures);
  const score=f?resultScoreFromFixture(p,f):null;
  const stored=p.verified&&Number.isInteger(p.homeScore)&&Number.isInteger(p.awayScore);
  const h=stored?p.homeScore:score?.h,a=stored?p.awayScore:score?.a;
  if(!Number.isInteger(h)||!Number.isInteger(a))continue;
  const grade=HISTORY?.evaluate(p,h,a);
  if(!grade)continue;
  settled.push({p,h,a,grade});
 }
 if(!settled.length){body.textContent='目前尚無可結算的終場賽果，復盤內容會隨實際比分更新。';return}
 const won=settled.filter(x=>x.grade==='win'||x.grade==='halfwin').length;
 const lost=settled.filter(x=>x.grade==='loss'||x.grade==='halfloss').length;
 const push=settled.filter(x=>x.grade==='push').length;
 const intro='本日已取得 '+settled.length+' 場可判定的賽果，贏 '+won+' 場、輸 '+lost+' 場、走盤 '+push+' 場。以下依正式發布的原始盤口與實際終場比分整理，不補造賽事判斷。';
 const details=settled.map(({p,h,a,grade})=>{
  const outcome=grade==='win'?'贏':grade==='halfwin'?'半贏':grade==='loss'?'輸':grade==='halfloss'?'半輸':'走盤';
  return p.time+'　'+localizedTeamName(p.home,p.homeZh)+' '+h+'：'+a+' '+localizedTeamName(p.away,p.awayZh)+'；'+displayCleanText(p.market)+'（'+outcome+'）';
 });
 body.textContent=intro+'\n\n'+details.join('\n');
}

const HISTORY=window.FootballHistory||null;
const HIST_CACHE_KEY='football-history-finals-v2';
function historyId(p){
 return [p.date,p.league,p.time,p.home,p.away,p.market,p.order].join('|');
}
function historyReportRows(){
 const all=state.feed?.reports||[];
 return all.flatMap(r=>(r.matches||[]).map(p=>({p,reportDate:r.date,key:historyId(p)})));
}
function resultScoreFromFixture(p,f){
 if(!f||f.status!=='finished'||f.scoreConflict)return null;
 const raw=String(f.sourceStatus?.type?.name||'')+' '+String(f.sourceStatus?.type?.description||'')+' '+String(f.stateName||'');
 if(/\bAET\b|\bPEN\b|penalt(?:y|ies)|extra[ -]?time|加時|十二碼大戰/i.test(raw))return null;
 const h=Number(f.scoreHome),a=Number(f.scoreAway);
 if(!Number.isInteger(h)||!Number.isInteger(a)||h<0||a<0)return null;
 return {h,a,source:f.scoreVerified?'兩來源核實':f.scoreSource||'ESPN',eventId:f.id||'',scoreVerified:!!f.scoreVerified};
}
function gradeHistory(p,score){
 if(!HISTORY||!score)return null;
 return HISTORY.evaluate(p,score.h,score.a);
}
function primeHistoryFromFeed(){
 if(!HISTORY)return;
 for(const {p,key} of historyReportRows()){
  if(!p.verified||!Number.isInteger(p.homeScore)||!Number.isInteger(p.awayScore))continue;
  const grade=gradeHistory(p,{h:p.homeScore,a:p.awayScore})||HISTORY.settledFromString(p.settlement);
  if(grade)state.historyScores.set(key,{grade,h:p.homeScore,a:p.awayScore,source:'Google 已核實',verified:true,updatedAt:Date.now(),status:'settled'});
 }
 try{
  const saved=JSON.parse(localStorage.getItem(HIST_CACHE_KEY)||'{}');
  if(saved.version!==2||!Array.isArray(saved.results))return;
  for(const entry of saved.results){
   if(!entry||typeof entry.key!=='string'||!entry.grade||!Number.isInteger(entry.h)||!Number.isInteger(entry.a))continue;
   if(!state.historyScores.has(entry.key))state.historyScores.set(entry.key,entry);
  }
 }catch{}
}
function saveHistoryCache(){
 try{
  const allowed=new Set(historyReportRows().map(x=>x.key));
  const out=[...state.historyScores.entries()].filter(([key,result])=>
   allowed.has(key)&&result.grade&&Number.isInteger(result.h)&&Number.isInteger(result.a))
   .map(([key,result])=>({key,...result})).slice(0,400);
  localStorage.setItem(HIST_CACHE_KEY,JSON.stringify({version:2,results:out,storedAt:Date.now()}));
 }catch{}
}
function utcDayForPrediction(p){
 if(!/^\d{2}:\d{2}$/.test(p.time||''))return null;
 return addDay(p.date,Number(p.time.slice(0,2))<8?-1:0);
}
function applyHistoricalResult(p,fixture){
 const key=historyId(p),s=resultScoreFromFixture(p,fixture);
 if(!s)return false;
 const grade=gradeHistory(p,s);
 const output={
  grade, h:s.h,a:s.a, source:s.source,eventId:s.eventId,
  verified:s.scoreVerified,status:grade?'settled':'unsupported',updatedAt:Date.now()
 };
 const existing=state.historyScores.get(key);
 if(existing?.verified&&!output.verified){
   // A single-source refresh can neither downgrade nor overwrite an existing
   // settlement confirmed by the Google background workflow.
   return existing.h===s.h&&existing.a===s.a;
 }
 if(existing?.grade&&(existing.h!==s.h||existing.a!==s.a)&&!s.scoreVerified){
  state.historyScores.set(key,{grade:null,status:'conflict',updatedAt:Date.now()});
  return false;
 }
 state.historyScores.set(key,output);
 return !!grade;
}
function syncReviewedHistory(predictions,fixtures){
 let updated=false;
 for(const p of predictions){
  const fixture=eventForPrediction(p,fixtures);
  if(!fixture||fixture.status!=='finished'||fixture.scoreConflict)continue;
  const key=historyId(p),old=state.historyScores.get(key);
  if(old?.verified)continue;
  const score=resultScoreFromFixture(p,fixture);
  if(!score||(!score.scoreVerified&&old?.grade&&old.h===score.h&&old.a===score.a))continue;
  if(applyHistoricalResult(p,fixture))updated=true;
 }
 if(updated){saveHistoryCache();if(state.view==='history')renderHistory()}
}
async function loadHistoryResults(force=false){
 if(state.historyLoading||!state.feed?.reports?.length||!HISTORY)return;
 state.historyLoading=true;state.historyBatch++;
 const batch=state.historyBatch;
 if(force){
  // Manual refresh must recheck live source matches without overwriting previously
  // verified settlements, but it should not erase historical evidence.
  for(const r of state.historyScores.values())if(r?.status==='pending')r.updatedAt=0;
 }
 const rows=historyReportRows(),currentDate=todayTaiwan();
 const todo=new Map();
 for(const {p,key} of rows){
  if(p.date>currentDate)continue;
  const kickoff=Date.parse(p.date+'T'+p.time+':00+08:00');
  if(!Number.isFinite(kickoff)||kickoff>Date.now()-120*60000)continue;
  const previous=state.historyScores.get(key);
  if(!force&&previous?.grade&&previous.updatedAt&&Date.now()-previous.updatedAt<24*3600000)continue;
  const league=PRED_LEAGUE_CODES[p.league]||Object.keys(KN).find(k=>KN[k]===p.league);
  const day=utcDayForPrediction(p);
  if(!league||!day){
   if(!previous?.grade)state.historyScores.set(key,{status:'pending',reason:'聯賽或時間缺漏'});
   continue;
  }
  const id=league+'|'+day;
  if(!todo.has(id))todo.set(id,{league,day,predictions:[]});
  todo.get(id).predictions.push(p);
 }
 state.historyRequired=todo.size;state.historyChecks=0;state.historyErrors=0;
 renderHistory();
 let index=0,backupCount=0;
 const maxBackupLookups=22;
 const jobs=[...todo.values()];
 async function worker(){
  while(index<jobs.length){
   const task=jobs[index++];
   try{
    const upstream=await readScoreboard(task.league,task.day,force);
    const fixtures=upstream.map(parseScore).filter(Boolean);
    await enrichScoreResults(fixtures,false,true);
    if(task.predictions.some(p=>!resultScoreFromFixture(p,eventForPrediction(p,fixtures)))){
      await supplementFromApiFootball(fixtures,task.predictions[0].date,false,{requireSelected:false});
    }
    for(const p of task.predictions){
     const f=eventForPrediction(p,fixtures);
     if(f){
       applyHistoricalResult(p,f);
       continue;
     }
     // ESPN may omit lower-tier club cups or some international friendlies.
     // Only attempt free, exact team-and-kickoff lookups; never invent a score.
     if(backupCount++>=maxBackupLookups)continue;
     const provisional={date:p.date,time:p.time,leagueCode:task.league,
       home:p.home,away:p.away,status:'scheduled',scoreHome:null,scoreAway:null};
     try{
       const alternative=await getIndependentMatchInfo(provisional,false);
       if(alternative?.final){
         applyHistoricalResult(p,{...provisional,status:'finished',scoreHome:alternative.h,
           scoreAway:alternative.a,scoreSource:'TheSportsDB',
           scoreVerified:false,id:alternative.id,sourceStatus:{type:{name:'STATUS_FINAL'}}});
       }
     }catch(e){console.warn('歷史備援查核未成功:',p.date,p.home,String(e.message||e))}
    }
   }catch(err){state.historyErrors++;console.warn('歷史賽程查核失敗:',task.league,task.day,String(err.message||err))}
   state.historyChecks++;
   if(batch===state.historyBatch)renderHistory();
  }
 }
 try{
  await Promise.all(Array.from({length:Math.min(3,jobs.length)},worker));
  state.historyCheckedAt=Date.now();
  saveHistoryCache();
 }finally{
  if(batch===state.historyBatch){state.historyLoading=false;renderHistory()}
 }
}

async function includeMissingClubPredictions(fixtures,force=false,selectedDay=state.day,requireSelection=true){
 const matches=(state.feed?.reports?.find(r=>r.date===selectedDay)?.matches)||[];
 const known=new Set(fixtures.map(f=>String(f.id)));
 let looked=0,added=0;
 for(const p of matches){
  const league=PRED_LEAGUE_CODES[p.league]||Object.keys(KN).find(k=>KN[k]===p.league);
  if(p.date!==selectedDay||!league||(requireSelection&&!state.leagues.has(league))||LIVE?.NATIONAL_LEAGUES?.has(league))continue;
  if(eventForPrediction(p,fixtures)||looked>=12)continue;
  looked++;
  const seed={date:p.date,time:p.time,leagueCode:league,home:p.home,away:p.away};
  try{
   const backup=await getIndependentMatchInfo(seed,force);
   if(!backup?.exactKickoff||!backup.id)continue;
   const actual=fTaiwan(backup.eventTimestamp);
   if(!actual||actual.date!==p.date)continue;
   const id='tsdb-'+backup.id;
   if(known.has(id))continue;
   const fixture={
    id,date:actual.date,time:actual.time,leagueCode:league,league:KN[league]||p.league,
    home:p.home,away:p.away,homeShort:'',awayShort:'',
    homeLogo:backup.homeLogo,awayLogo:backup.awayLogo,homeAbbr:'',awayAbbr:'',
    status:backup.final?'finished':'scheduled',scoreHome:backup.final?backup.h:null,
    scoreAway:backup.final?backup.a:null,
    scoreSource:'TheSportsDB',source:'TheSportsDB',scoreVerified:false,
    sourceLinks:[{name:'TheSportsDB',url:backup.url}]
   };
   known.add(id);fixtures.push(fixture);added++;
  }catch(error){console.warn('俱樂部賽事備援失敗:',p.home,p.away,String(error.message||error))}
 }
 if(added)fixtures.sort((a,b)=>a.time.localeCompare(b.time)||a.league.localeCompare(b.league,'zh-Hant'));
 return added;
}

function renderHistory(){
 const all=historyReportRows();
 const leagueControl=$('historyLeague'),periodControl=$('historyPeriod');
 const previousLeague=leagueControl.value;
 const leagueLabel=name=>KN[PRED_LEAGUE_CODES[name]]||String(name||'').trim();
 const leagues=[...new Set(all.map(row=>leagueLabel(row.p.league)).filter(Boolean))]
  .sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 leagueControl.innerHTML='<option value="">全部聯賽</option>'+leagues.map(name=>
  '<option value="'+escapeHtml(name)+'">'+escapeHtml(name)+'</option>').join('');
 leagueControl.value=leagues.includes(previousLeague)?previousLeague:'';
 const selectedLeague=leagueControl.value;
 const days=Number(periodControl.value);
 const limit=Number.isInteger(days)&&days>0?Date.parse(todayTaiwan()+'T00:00:00+08:00')-(days-1)*86400000:null;
 const inPeriod=all.filter(row=>limit===null||Date.parse(row.reportDate+'T00:00:00+08:00')>=limit);
 const source=inPeriod.filter(row=>!selectedLeague||leagueLabel(row.p.league)===selectedLeague);
 const rows=source.map(row=>({...row,result:state.historyScores.get(row.key)||null}));
 let summary={total:rows.length,finished:0,win:0,loss:0,halfwin:0,halfloss:0,push:0,pending:rows.length,unsupported:0,rate:null};
 if(HISTORY)summary=HISTORY.summarize(rows.map(x=>x.result?.grade?x.result:{status:x.result?.status||'pending'}));
 $('historyTotal').textContent=String(summary.total);
 $('historyVerified').textContent=String(summary.finished);
 $('historyWin').textContent=String(summary.win+summary.halfwin);
 $('historyLoss').textContent=String(summary.loss+summary.halfloss);
 $('historyPush').textContent=String(summary.push);
 $('historyRate').textContent=summary.rate===null?'—':summary.rate.toFixed(1)+'%';
 const label=state.historyLoading?
  '比對歷史比分 '+state.historyChecks+'/'+state.historyRequired+(state.historyErrors?' · 來源失敗 '+state.historyErrors:''):
  state.historyCheckedAt?'最近比對 '+fTaiwan(state.historyCheckedAt).stamp:
  summary.finished?'已取得部分終場資料':'尚未查核歷史比分';
 $('historyProgress').textContent=label;
 $('historyRefresh').disabled=state.historyLoading;
 const byLeague=new Map();
 for(const row of inPeriod){
  const league=leagueLabel(row.p.league)||'其他';
  if(!byLeague.has(league))byLeague.set(league,[]);
  byLeague.get(league).push(row);
 }
 $('historyLeagueRows').innerHTML=[...byLeague].filter(([name])=>!selectedLeague||name===selectedLeague)
  .map(([name,group])=>({name,stats:HISTORY?HISTORY.summarize(group.map(row=>state.historyScores.get(row.key)||{status:'pending'})):null}))
  .filter(item=>item.stats)
  .sort((a,b)=>(b.stats.finished-a.stats.finished)||a.name.localeCompare(b.name,'zh-Hant'))
  .map(({name,stats})=>'<tr><td><strong>'+escapeHtml(name)+'</strong></td><td>'+stats.total+'</td><td>'+stats.finished+'</td><td>'+(
   stats.win+stats.halfwin)+'</td><td>'+(stats.loss+stats.halfloss)+'</td><td>'+stats.push+'</td><td><strong>'+
   (stats.rate===null?'—':stats.rate.toFixed(1)+'%')+'</strong></td></tr>').join('')||
  '<tr><td colspan="7" class="history-no-data">所選範圍尚無預測紀錄</td></tr>';
 const byDay=new Map();
 for(const row of rows){
  if(!byDay.has(row.reportDate))byDay.set(row.reportDate,[]);
  byDay.get(row.reportDate).push(row);
 }
 $('historyRows').innerHTML=[...byDay].sort((a,b)=>b[0].localeCompare(a[0])).map(([day,group])=>{
  const stats=HISTORY?HISTORY.summarize(group.map(x=>x.result?.grade?x.result:{status:x.result?.status||'pending'})):null;
  const win=stats?stats.win+stats.halfwin:0;
  const loss=stats?stats.loss+stats.halfloss:0;
  return '<div class="history-item"><strong>'+escapeHtml(day)+'</strong>'+
   '<span>推薦 '+group.length+'</span>'+
   '<span class="history-done">結算 '+(stats?.finished||0)+'</span>'+
   '<span class="history-win">贏 '+win+'</span>'+
   '<span class="history-loss">輸 '+loss+'</span>'+
   '<span class="history-percentage">'+(stats?.rate===null||stats?.rate===undefined?'—':stats.rate.toFixed(1)+'%')+'</span>'+
   '<button class="mlauto" data-load-day="'+escapeHtml(day)+'">查看</button></div>';
 }).join('')||'<div class="empty">尚無歷史預測</div>';
}
function render(){
 $('nowDate').textContent=todayTaiwan().replaceAll('-','/');
 const names={schedule:['每日賽程','每日賽程'],predictions:['分析預測','正式預測'],reviews:['賽後復盤','賽後復盤'],history:['歷史統計','歷史統計']};
 const t=names[state.view];$('viewTitle').textContent=t[0];$('breadcrumb').textContent=t[1];
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
 $('schedulePanel').classList.toggle('hidden',state.view!=='schedule');
 $('predictionsPanel').classList.toggle('hidden',state.view!=='predictions');
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
   else if(state.view==='history')loadHistoryResults(false);
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
   if(state.view==='history'){
     if(!state.historyLoading)await loadHistoryResults(true);
   }else if(state.view==='reviews'){
     await loadReviewScores(true);
   }else{
     await loadFixtures(true);
   }
   toast('資料已重新查詢');
 };
 $('historyRefresh').onclick=()=>loadHistoryResults(true);
 $('historyLeague').onchange=renderHistory;
 $('historyPeriod').onchange=renderHistory;
 $('refreshReview').onclick=async()=>{
   await loadFeed();await loadReviewScores(true);
   toast('比分已重新查詢');
 };
 // Live-only ESPN summary refresh; source-reported match minute is not locally fabricated.
 setInterval(()=>pollLiveMatches(),35000);
 // Review is independently refreshed while visible; finished fixtures settle from actual data.
 setInterval(()=>{
  if(document.visibilityState!=='visible'||state.view!=='reviews'||state.reviewLoading)return;
  const delta=Math.abs(Date.parse(state.day+'T00:00:00Z')-Date.parse(todayTaiwan()+'T00:00:00Z'));
  if(delta<=2*86400000)loadReviewScores(false);
 },60000);
 setInterval(()=>{
  if(document.visibilityState!=='visible'||state.view!=='history'||state.historyLoading)return;
  loadHistoryResults(false);
 },120000);
 // Use a slower schedule outside live matches; background tabs do not poll.
 setInterval(()=>{
  if(document.visibilityState==='hidden'||state.reviewLoading||state.loading)return;
  const now=Date.now();
  const live=state.fixtures.some(f=>['inprogress','halftime','pending'].includes(elapsedStatus(f)));
  const soon=state.fixtures.some(f=>{
   const gap=scheduledKickoff(f)-now;
   return Number.isFinite(gap)&&gap>=0&&gap<=3600000;
  });
  const interval=live?120000:soon?5*60000:10*60000;
  if(now-state.lastAutoRefresh<interval)return;
  state.lastAutoRefresh=now;
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
 const bindPredictionDetails=(container,indexAttr,items)=>{
  const open=event=>{
   const row=event.target.closest('['+indexAttr+']');
   if(!row||!container.contains(row))return;
   if(event.type==='keydown'){
    if(event.key!=='Enter'&&event.key!==' ')return;
    event.preventDefault();
   }
   const p=items()[Number(row.getAttribute(indexAttr))];
   if(p)openPredictionMatchDetail(p);
  };
  container.addEventListener('click',open);
  container.addEventListener('keydown',open);
 };
 bindPredictionDetails($('predictionsGrid'),'data-prediction-index',predsForView);
 bindPredictionDetails($('reviewTable'),'data-review-index',predsForView);
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
