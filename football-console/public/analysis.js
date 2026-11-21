'use strict';
const LEAGUES=[
['uefa.nations','歐國聯'],['caf.nations','非洲盃'],['caf.nations_qual','非洲盃資格賽'],['fifa.friendly','國際友誼賽'],
['eng.1','英超'],['eng.2','英冠'],['eng.3','英甲'],['eng.fa','英格蘭足總盃'],['eng.league_cup','英格蘭聯賽盃'],
['esp.1','西甲'],['esp.2','西乙'],['esp.copa_del_rey','西班牙國王盃'],
['ger.1','德甲'],['ger.dfb_pokal','德國盃'],['ita.1','義甲'],['ita.2','義乙'],['ita.coppa_italia','義大利盃'],
['fra.1','法甲'],['fra.coupe_de_france','法國盃'],['ned.1','荷甲'],['por.1','葡超'],['por.taca.portugal','葡萄牙盃'],
['uefa.champions','歐冠'],['uefa.europa','歐霸'],['uefa.europa.conf','歐協聯'],
['bra.1','巴甲'],['bra.2','巴乙'],['bra.copa_do_brazil','巴西盃'],['arg.1','阿甲'],['arg.copa','阿根廷盃'],
['conmebol.libertadores','南美自由盃'],['conmebol.sudamericana','南美俱樂部盃'],
['usa.1','美職聯'],['ksa.1','沙職'],['jpn.1','日職'],
['aus.1','澳甲'],['aus.w.1','澳洲女足甲級聯賽'],['fifa.world','世界盃'],['fifa.worldq.uefa','世界盃歐洲區資格賽'],
['fifa.worldq.conmebol','世界盃南美區資格賽'],['concacaf.champions','中北美冠軍盃'],['afc.champions','亞冠'],
['mex.1','墨超'],['tur.1','土超'],['bel.1','比甲'],['sco.1','蘇超'],['chn.1','中超']
];
const KN=Object.fromEntries(LEAGUES);
const INSIGHTS=window.FXIPredictionInsights;
// All supported sources are on by default. The unavailable K League feed is
// intentionally not in LEAGUES; never request or advertise broken coverage.
const defaultLeagues=LEAGUES.map(([code])=>code);
const $=id=>document.getElementById(id);
const state={day:'',view:'schedule',feed:null,feedStatus:'loading',report:null,fixtures:[],sources:[],loading:false,dayManuallyChosen:false,
  leagues:new Set(defaultLeagues),cache:new Map(),scoreboardCache:new Map(),resultLookupCache:new Map(),verifiedResultsPromise:null,scheduleQueued:false,
  reviewFixtures:[],reviewErrors:[],reviewLoading:false,reviewUpdatedAt:0,reviewDate:'',
  fifaRanks:new Map(),fifaRanksBusy:false,fifaRankPubDate:'',livePolling:false,
  summaryCache:new Map(),activeMatchId:'',matchDetailPayload:null,matchLinkedPrediction:null,
  historyScores:new Map(),historyLoading:false,historyChecks:0,historyErrors:0,
  historyRequired:0,historyCheckedAt:0,historyBatch:0,tsdbNextRequestAt:0,lastAutoRefresh:0};
const standingsLeagues=LEAGUES.filter(([code])=>new Set(['eng.1','eng.2','esp.1','ger.1','ita.1','fra.1','ned.1','por.1','bra.1','arg.1','usa.1','ksa.1','jpn.1','kor.1','mex.1','tur.1','bel.1','sco.1','chn.1','aus.1']).has(code));
const standingsState={league:'eng.1',snapshots:new Map(),errors:new Set(),busy:false,sequence:0};

const SCOREBOARD_TTL=45000; // Recent scoreboard refresh; older dates stay cached longer.
const LIVE=typeof window!=='undefined'?window.FootballLive:null;
const LIVE_DETAIL_TTL=35000;
const PRED_LEAGUE_CODES={
 '歐國聯':'uefa.nations','歐洲國家聯賽':'uefa.nations','國際友誼賽':'fifa.friendly',
 '非洲國家盃':'caf.nations','非洲盃':'caf.nations','AFCON':'caf.nations',
 '非洲國家盃資格賽':'caf.nations_qual','非洲盃資格賽':'caf.nations_qual','AFCON資格賽':'caf.nations_qual',
 '英超':'eng.1','英冠':'eng.2','英甲':'eng.3','英格蘭足總盃':'eng.fa',
 '英格蘭聯賽盃':'eng.league_cup','英聯盃':'eng.league_cup','西班牙國王盃':'esp.copa_del_rey',
 '西甲':'esp.1','西乙':'esp.2','德甲':'ger.1','德國盃':'ger.dfb_pokal',
 '義甲':'ita.1','義乙':'ita.2','義大利盃':'ita.coppa_italia',
 '法甲':'fra.1','法國盃':'fra.coupe_de_france',
 '荷甲':'ned.1','葡超':'por.1','葡萄牙盃':'por.taca.portugal',
 '巴西盃':'bra.copa_do_brazil','阿根廷盃':'arg.copa',
 '歐冠':'uefa.champions','歐霸':'uefa.europa',
 '歐協聯':'uefa.europa.conf','歐洲協會聯賽':'uefa.europa.conf',
 '巴甲':'bra.1','巴乙':'bra.2','阿甲':'arg.1','美職聯':'usa.1','沙職':'ksa.1',
 '南美自由盃':'conmebol.libertadores','南美俱樂部盃':'conmebol.sudamericana',
 '日職':'jpn.1','韓職':'kor.1','澳甲':'aus.1','澳職':'aus.1','澳洲甲級聯賽':'aus.1','澳洲職業聯賽':'aus.1','A-League':'aus.1',
 '澳洲女足甲級聯賽':'aus.w.1',
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


function displayPredictionText(p,text){
 const aliases=new Map();
 for(const [source,original] of [[p.home,p.homeZh],[p.away,p.awayZh]]){
  const name=String(original||'').trim();
  if(!readableChinese(name))continue;
  const translated=localizedTeamName(source,original);
  if(name===translated)continue;
  if(aliases.has(name)&&aliases.get(name)!==translated)aliases.set(name,null);
  else aliases.set(name,translated);
 }
 const names=[...aliases.keys()].filter(name=>aliases.get(name)).sort((a,b)=>b.length-a.length);
 if(!names.length)return displayCleanText(text);
 const pattern=new RegExp(names.map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
 return displayCleanText(text).replace(pattern,name=>aliases.get(name));
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

async function readBatchScoreboards(day,leagues,signal){
 const response=await fetch('/api/fixtures/batch',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({day,leagues}),cache:'no-store',signal
 });
 if(!response.ok)throw Error('批次賽程查詢 HTTP '+response.status);
 const payload=await response.json();
 if(payload.day!==day||!Array.isArray(payload.results))throw Error('批次賽程格式不正確');
 const expected=new Set(leagues.flatMap(league=>[addDay(day,-1),day].map(date=>league+'|'+date)));
 const delivered=new Set(),events=[],sources=[];
 for(const item of payload.results){
  const key=item.league+'|'+item.date;
  if(!expected.has(key)||delivered.has(key))throw Error('批次賽程來源重複或未知');
  delivered.add(key);
  if(item.upstreamStatus!==200||!Array.isArray(item.events)){
   sources.push({league:item.league,date:item.date,status:'error',message:item.error||'來源未正常回應'});
   continue;
  }
  const mapped=item.events.map(event=>({...event,_league:item.league}));
  events.push(...mapped);
  sources.push({league:item.league,date:item.date,status:'ok',count:mapped.length});
  const distance=Math.abs(Date.parse(item.date+'T00:00:00Z')-Date.parse(todayTaiwan()+'T00:00:00Z'));
  state.scoreboardCache.set(key,{
   expiresAt:Date.now()+(distance>2*86400000?6*3600000:SCOREBOARD_TTL),promise:Promise.resolve(mapped)
  });
 }
 if(delivered.size!==expected.size)throw Error('批次賽程回傳筆數不足');
 return {events,sources};
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
   market:m.market||'',probability:m.probability===null||m.probability===undefined||m.probability===''?null:Number(m.probability),probabilityType:m.probabilityType||'命中',
   status:m.status||m.scoreStatus||'待核對',homeScore:m.homeScore===null||m.homeScore===undefined||m.homeScore===''?null:Number(m.homeScore),
   awayScore:m.awayScore===null||m.awayScore===undefined||m.awayScore===''?null:Number(m.awayScore),
   settlement:m.settlement||'待核實',verified:m.verified===true||m.verified==='true',
   analysis:String(m.analysis||m.rationale||''),risk:String(m.risk||''),
   publishedOdds:INSIGHTS?.originalOdds(m,r.publishedAt||r.sentAt),
   source:m.source||'正式 Gmail',sourceUrl:m.sourceUrl||'',group:m.group||'串關單',groupPublished:Boolean(m.group),order:Number(m.order)||i+1
  }))};
}
let feedRequest=0;
async function loadFeed(){
 const request=++feedRequest;
 try{
  const response=await fetch('/api/reports',{cache:'no-store',signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data.reports))throw Error('回傳缺少 reports');
  if(request!==feedRequest)return;
  if(data.connected||!state.feed?.reports?.length)state.feed={...data,reports:data.reports.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)).map(normalizeReport).sort((a,b)=>b.date.localeCompare(a.date))};
  state.feedStatus=data.connected?'ready':'error';
  $('sideSync').textContent=data.connected?'正式預測同步已連接':state.feed.reports.length?'顯示已保留的預測':'正式預測來源未連線';
  $('sideTime').textContent=data.connected?'最後同步：'+(data.syncedAt||'尚未執行'):'來源暫時無法同步';
  $('dataFooter').textContent=data.connected?'正式 Gmail 預測 · 公開賽事資料':'正式預測來源暫時無法同步';
  if(!state.day||state.feed.reports.length&&!state.feed.reports.some(r=>r.date===state.day)){
   if(!state.day)state.day=state.feed.reports[0]?.date||todayTaiwan();
  }
  selectLatestOfficialPrediction();
  $('selectedDay').value=state.day;
 }catch{
  if(request!==feedRequest)return;
  state.feedStatus='error';
  $('sideSync').textContent='正式預測來源暫時無法同步';
  $('sideTime').textContent=state.feed?.reports?.length?'顯示上次取得的預測':'等待重新同步';
 }
 primeHistoryFromFeed();
 setReport();render();
 document.dispatchEvent(new Event('fxi-feed-updated'));
 if(state.matchDetailPayload&&['prediction','snapshot'].includes(state.matchTab))setMatchTab(state.matchTab);
 if(state.view==='history')loadHistoryResults(false);
}
function setReport(){
 state.report=state.feed?.reports.find(x=>x.date===state.day)||null;
 // Official recommendations must never disappear simply because an older
 // browser saved a narrower league selection.
 for(const match of state.report?.matches||[]){
  const code=PRED_LEAGUE_CODES[match.league]||LEAGUES.find(([,name])=>name===match.league)?.[0];
  if(code&&KN[code])state.leagues.add(code);
 }
}
function selectLatestOfficialPrediction(){
 if(state.view!=='predictions'||state.dayManuallyChosen)return;
 const latest=state.feed?.reports?.[0]?.date;
 if(latest&&latest>=todayTaiwan()&&latest>state.day){
  state.day=latest;
  state.fixtures=[];state.reviewFixtures=[];state.reviewDate='';state.reviewUpdatedAt=0;
 }
}
function pickDay(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;state.dayManuallyChosen=true;state.day=day;$('selectedDay').value=day;setReport();state.fixtures=state.cache.get(cacheKey())?.fixtures||[];state.sources=state.cache.get(cacheKey())?.sources||[];state.reviewFixtures=[];state.reviewDate='';state.reviewUpdatedAt=0;render();if(state.view==='reviews')loadReviewScores(false);else loadFixtures(false)}
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
 const leagues=[...state.leagues],queries=[];
 for(const league of leagues)for(const date of [addDay(day,-1),day])queries.push({league,date});
 const results=[],sources=[];
 try{
  const batch=await readBatchScoreboards(day,leagues);
  results.push(...batch.events);
  sources.push(...batch.sources);
  $('sourceSummary').textContent='賽程來源查詢 '+sources.length+' / '+queries.length;
 }catch(error){
  // Compatibility with an older deployment and fallback for a batch outage.
  console.warn('Batch scoreboard failed, retrying individual requests:',String(error.message||error));
  let cursor=0,finished=0;
  async function worker(){
   for(;;){
    const ix=cursor++;if(ix>=queries.length)break;
    const q=queries[ix];
    try{
     const events=await readScoreboard(q.league,q.date,force);
     sources.push({league:q.league,date:q.date,status:'ok',count:events.length});
     results.push(...events);
    }catch(e){sources.push({league:q.league,date:q.date,status:'error',message:String(e.message||e)})}
    finished++;
    $('sourceSummary').textContent='賽程來源查詢 '+finished+' / '+queries.length;
   }
  }
  await Promise.all(Array.from({length:Math.min(6,queries.length)},worker));
 }
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
 }).sort((a,b)=>String(a.time||'').localeCompare(String(b.time||''))||(Number(a.order)||0)-(Number(b.order)||0));
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

const matchTabs={facts:'賽況',preview:'賽前資訊',lineup:'先發陣容',h2h:'歷史交鋒',prediction:'賽前觀點',review:'賽後復盤',snapshot:'賽前快照'};
const gradeLabels={win:'全贏',halfwin:'半贏',loss:'全輸',halfloss:'半輸',push:'走盤'};
let predictionOpenRequest=0;

function matchReportRows(f){
 return (state.feed?.reports||[state.report]).filter(Boolean).flatMap(report=>
  (report.matches||[]).filter(p=>p===state.matchLinkedPrediction||
   (p.date===f.date&&sameTeam(p.home,f.home)&&sameTeam(p.away,f.away)&&compareEventTime(p,f)))
   .map(p=>({p,report})));
}
function matchFacts(rows){
 return '<dl>'+rows.map(([label,value])=>'<dt>'+escapeHtml(label)+'</dt><dd>'+escapeHtml(value)+'</dd>').join('')+'</dl>';
}
function snapshotStamp(value){
 return fTaiwan(INSIGHTS.oddsTimestamp(value))?.stamp||'未記錄';
}
function snapshotPrices(snapshot){
 const odds=snapshot?.original;
 const label=quote=>quote?escapeHtml(formatOdds(quote)+' · '+(quote.book==='manual'?'登錄 ':'')+snapshotStamp(quote.capturedAt)):'—';
 const books=Object.values(snapshot?.books||{});
 if(odds&&!books.some(book=>(book.baseline||book.first)?.book===odds.book))books.unshift({baseline:odds});
 const original=odds?odds.price.toFixed(2)+' · '+odds.source+' · '+snapshotStamp(odds.capturedAt):'原文未記錄';
 const details=matchFacts([['原文賠率',original]]);
 if(!books.length)return details+'<p class="search-meta">暫無可核對的賽前賠率。</p>';
 return details+'<div class="tablewrap"><table class="snapshot-prices"><thead><tr>'+
  '<th>莊家</th><th>起始報價</th><th>開賽前最後留存</th><th>變動</th></tr></thead><tbody>'+
  books.map(({baseline,first,latest})=>{
   const book=baseline||first;
   const start=odds?.book===book.book?odds:baseline||first;
   const end=latest&&latest.capturedAt>start.capturedAt?latest:null;
   const mark=start.book==='manual'?'使用者提供':start===odds?'原文列載':start===baseline?'發布前已擷取':'發布後擷取';
   return '<tr><th scope="row">'+escapeHtml(book.source)+'</th><td>'+label(start)+'<small>'+mark+
    '</small></td><td>'+label(end)+'</td><td>'+(end?signedUnits(end.price-start.price):'—')+'</td></tr>';
  }).join('')+'</tbody></table></div>';
}
async function showPrematchSnapshot(f){
 const host=$('matchInsightPanel');
 const request=sectionRequest;
 const show=(data,pending=false,partial=false)=>{
  if(request!==sectionRequest||state.matchDetailPayload!==f||state.matchTab!=='snapshot')return;
  host.innerHTML='<h3>'+matchTabs.snapshot+'</h3>'+matchPredictionContent(f,'snapshot',data,pending)+
   (partial?'<p class="search-meta" role="status">部分賽前報價暫時無法查詢。</p>':'');
 };
 const matches=matchReportRows(f);
 show(null,Boolean(matches.length));
 if(!matches.length)return;
 const reports=new Map();
 for(const {p,report} of matches){
  if(!reports.has(report.date))reports.set(report.date,[]);
  reports.get(report.date).push(p.id);
 }
 const results=await Promise.allSettled([...reports].map(async([date,ids])=>{
  const query=new URLSearchParams({date});
  for(const id of ids)query.append('id',id);
  const response=await fetch('/api/prematch-snapshots?'+query,{signal:AbortSignal.timeout(65000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  return response.json();
 }));
 show(Object.assign({},...results.map(result=>result.value?.snapshots)),false,
  results.some(result=>!result.value||result.value.partial));
}
function matchPredictionContent(f,tab,evidence=null,pending=false){
 const matches=matchReportRows(f);
 if(!matches.length){
  if(tab!=='prediction')return '<p>這場賽事沒有已發布的預測紀錄。</p>';
  const form=window.FXIPrematchAnalysis?.make(null,null,evidence,
   {home:localizedTeamName(f.home),away:localizedTeamName(f.away)});
  if(form)return '<article class="match-snapshot"><h4>賽前形勢</h4>'+
   matchFacts([['主要依據',form.analysis],['主要變數',form.risk],['資料來源','ESPN 歷史賽果']])+'</article>';
  return '<p>'+ (pending?'正在查核賽前資料…':'這場賽事沒有已發布的預測，亦缺少足夠的賽前比分資料。')+'</p>';
 }
 return matches.map(({p,report})=>{
  const live=resultScoreFromFixture(p,f);
  const final=state.historyScores.get(historyId(p));
  const verified=final?.verified&&Number.isInteger(final.h)&&Number.isInteger(final.a)?final:
   p.verified&&Number.isInteger(p.homeScore)&&Number.isInteger(p.awayScore)?
    {h:p.homeScore,a:p.awayScore,source:'已核實終場資料',grade:HISTORY?.settledFromString(p.settlement)}:null;
  const conflict=f.scoreConflict||final?.status==='conflict'||
   (verified&&live&&(verified.h!==live.h||verified.a!==live.a));
  const score=conflict?null:verified||live;
  const grade=score?(gradeHistory(p,score)||verified?.grade):null;
  const snapshot=tab==='snapshot'?evidence?.[p.id]:null;
  const pick=snapshot||p;
  const probability=Number.isFinite(pick.probability)?pick.probability+'%':'未記錄';
  const original=snapshot?snapshot.original:p.publishedOdds;
  const unit=original&&grade?INSIGHTS?.unitReturn(grade,original.price):null;
  const outcome=gradeLabels[grade]||(conflict?'來源比分不一致，待核對':score?'玩法尚待核對':'等待核對完場比分');
  const inputs=[['發布時間',tab==='snapshot'?snapshotStamp(snapshot?.publishedAt||report.publishedAt):report.publishedAt||'未記錄'],
   ['估計'+pick.probabilityType+'機率',probability]];
  if(tab==='snapshot')inputs.push(['串關組合',pick.group||'—']);
  if(tab==='prediction'){
   const originalAnalysis=p.analysis.trim(),originalRisk=p.risk.trim();
   const form=window.FXIPrematchAnalysis?.make(p,report,evidence,
    {home:p.homeZh||localizedTeamName(f.home),away:p.awayZh||localizedTeamName(f.away)});
   const unavailable=pending?'正在查核賽前資料…':'賽前資料不足';
   inputs.push(['主要依據',displayPredictionText(p,originalAnalysis||form?.analysis||unavailable)],['主要變數',displayPredictionText(p,originalRisk||form?.risk||unavailable)]);
   if(form)inputs.push(['FXI 補充分析','ESPN 歷史賽果 · 截止 '+(fTaiwan(form.cutoff)?.stamp||'—')+'（台灣時間）']);
  }else{
   inputs.push(['完場比分',score?score.h+' : '+score.a:'—'],['結算',outcome]);
   if(tab==='review')inputs.push(['原始推薦',displayPredictionText(p,p.market)],['賽前主要依據',displayPredictionText(p,p.analysis||'原文未記錄')],['賽前主要變數',displayPredictionText(p,p.risk||'原文未記錄')],['比分來源',score?.source||'待核對']);
   if(tab==='snapshot'){
    inputs.push(['比分來源',score?.source||'待核對']);
    if(unit!==null&&unit!==undefined)inputs.push(['依原文賠率計算的損益',signedUnits(unit)+' 單位']);
   }
  }
  const prices=tab!=='snapshot'?'':pending?'<p class="search-meta" role="status">正在查詢賽前賠率…</p>':
   '<p class="search-meta">賠率時間皆為台灣時間</p>'+snapshotPrices(snapshot||{original,books:{}});
  return '<article class="match-snapshot"><h4>'+escapeHtml(displayPredictionText(p,pick.market))+'</h4>'+matchFacts(inputs)+prices+'</article>';
 }).join('');
}
let sectionPoll;
let sectionRequest=0;
const matchSectionCache=new Map();
async function showMatchSection(f,tab,background=false){
 const host=$('matchInsightPanel');
 const prediction=tab==='prediction';
 const renderer=prediction?(data=>matchPredictionContent(f,tab,data)):window.FXIMatchSections[tab];
 const key=[f.leagueCode,f.id,tab].join('|');
 const prior=matchSectionCache.get(key);
 const active=()=>state.matchDetailPayload===f&&state.matchTab===tab;
 const show=(html,at)=>{if(active())host.innerHTML='<h3>'+matchTabs[tab]+'</h3>'+html+(at&&['preview','lineup','h2h'].includes(tab)?'<p class="pitch-meta">資料查詢時間 '+escapeHtml(fTaiwan(at)?.stamp||'—')+'（台灣時間）</p>':'')};
 if(prior)show(renderer(prior.data),prior.at);
 else if(!background)show(prediction?matchPredictionContent(f,tab,null,true):
  '<p class="match-detail-empty" role="status">正在查詢資料…</p>');
 if(!/^\d{4,14}$/.test(String(f.id))||!f.leagueCode){
  show(prediction?renderer(null):'<p class="match-detail-empty">這場比賽目前沒有可查詢的 ESPN 賽事資料。</p>');
  return;
 }
 if(prior&&Date.now()-prior.at<(tab==='lineup'?50000:180000))return;
 const request=++sectionRequest;
 try{
  const res=await fetch('/api/match-section?'+new URLSearchParams({league:f.leagueCode,event:f.id,section:tab}),
   {signal:AbortSignal.timeout(32000)});
  if(!res.ok)throw Error('HTTP '+res.status);
  const data=await res.json();
  if(request!==sectionRequest||!active())return;
  matchSectionCache.set(key,{data,at:Date.now()});
  if(matchSectionCache.size>80)matchSectionCache.delete(matchSectionCache.keys().next().value);
  show(renderer(data),Date.now());
 }catch{
  if(request===sectionRequest&&!prior)show(prediction?renderer(null):
   '<p class="match-detail-empty">資料暫時無法取得，請稍後重試。</p>');
 }
}
function setMatchTab(tab){
 const body=$('matchDetailBody'),f=state.matchDetailPayload;
 if(!f||!Object.hasOwn(matchTabs,tab))return;
 state.matchTab=tab;
 body.querySelectorAll('[data-match-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.matchTab===tab)));
 $('matchFactsPanel').hidden=tab!=='facts';
 $('matchInsightPanel').hidden=tab==='facts';
 clearInterval(sectionPoll);
 ++sectionRequest;
 const picks=tab==='prediction'?matchReportRows(f):[];
 const needsEvidence=tab==='prediction';
 if(tab==='snapshot')showPrematchSnapshot(f);
 else if(needsEvidence||window.FXIMatchSections?.[tab]){
  showMatchSection(f,tab);
  if(tab==='lineup'&&!['finished','cancelled'].includes(f.status)){
   sectionPoll=setInterval(()=>{
    if(!document.hidden&&!$('matchModal').classList.contains('hidden'))showMatchSection(f,tab,true);
   },60000);
  }
 }else if(tab!=='facts')$('matchInsightPanel').innerHTML='<h3>'+matchTabs[tab]+'</h3>'+matchPredictionContent(f,tab);
}
async function openMatchDetail(f,tab='facts',linkedPrediction=null,refresh=false){
 if(!f)return;
 ++predictionOpenRequest;
 const request=++matchDialogRequest;
 state.activeMatchId=f.id;
 state.matchDetailPayload=f;
 state.matchLinkedPrediction=linkedPrediction;
 if(!refresh)matchReturnFocus=document.activeElement;
 $('matchDetailLeague').textContent=f.league||'比賽詳情';
 $('matchDetailTitle').textContent='比賽詳情';
 $('matchShareStatus').textContent='';
 $('matchLinkFallback').hidden=true;
 $('matchDetailBody').innerHTML=matchHero(f)+
  '<div class="match-insight-tabs" role="group" aria-label="比賽詳情內容">'+Object.entries(matchTabs).map(([key,label])=>
   '<button type="button" class="btn secondary" data-match-tab="'+key+'">'+label+'</button>').join('')+'</div>'+
  '<section id="matchFactsPanel" class="match-detail-view"><div class="match-details-section"><h3>進球紀錄</h3>'+
  '<div id="matchGoals" class="match-goals" aria-live="polite"><div class="match-detail-empty">正在查詢進球資料…</div></div></div>'+
  '<div class="match-source-footer">比分：'+escapeHtml(f.source||'賽事來源')+
  (f.scoreVerified?' · 已比對獨立來源':' · 未必經第二來源確認')+'</div></section>'+
  '<section id="matchInsightPanel" class="match-detail-view" hidden></section>';
 setMatchTab(tab);
 openModal('matchModal');
 if(!refresh)$('matchCloseBtn').focus();
 try{
  const summary=await fetchMatchSummary(f);
  if(request!==matchDialogRequest||$('matchModal').classList.contains('hidden'))return;
  $('matchGoals').innerHTML=goalDetailMarkup(goalEventsFromSummary(summary,f));
  if(applySummaryToFixture(f,summary)){
   $('matchDetailBody').querySelector('.match-hero')?.replaceWith(htmlToNode(matchHero(f)));
   if(state.matchTab!=='facts')setMatchTab(state.matchTab);
   renderSchedule();
  }
 }catch{
  if(request!==matchDialogRequest||$('matchModal').classList.contains('hidden'))return;
  $('matchGoals').innerHTML='<div class="match-detail-empty">目前沒有可信的進球者與分鐘資料。</div>';
 }
}
async function openPredictionMatchDetail(p,tab='prediction'){
 if(!p)return;
 const fixture=eventForPrediction(p,state.reviewFixtures.concat(state.fixtures));
 if(fixture){openMatchDetail(fixture,tab,p);return}
 // Display the published information immediately, even if the scoreboard is slow.
 const recorded=p.verified&&Number.isInteger(p.homeScore)&&Number.isInteger(p.awayScore);
 const fallback={id:'',date:p.date,time:p.time,league:p.league,
  home:p.home,away:p.away,homeLogo:'',awayLogo:'',homeId:'',awayId:'',
  status:recorded?'finished':'scheduled',scoreHome:recorded?p.homeScore:null,
  scoreAway:recorded?p.awayScore:null,source:recorded?'已核實終場資料':'公開預測'};
 openMatchDetail(fallback,tab,p);
 const request=predictionOpenRequest;
 const code=PRED_LEAGUE_CODES[p.league]||Object.keys(KN).find(k=>KN[k]===p.league);
 if(!code)return;
 const days=[addDay(p.date,-1),p.date];
 const queries=await Promise.allSettled(days.map(day=>readScoreboard(code,day,false)));
 if(state.day!==p.date||request!==predictionOpenRequest)return;
 const candidates=queries.flatMap(result=>result.status==='fulfilled'?result.value.map(parseScore).filter(Boolean):[]);
 const resolved=eventForPrediction(p,candidates);
 if(resolved){
  state.reviewFixtures=[...state.reviewFixtures.filter(x=>x.id!==resolved.id),resolved];
  const currentTab=state.matchTab;
  const restoreTab=document.activeElement?.dataset?.matchTab;
  openMatchDetail(resolved,currentTab,p,true);
  if(restoreTab)$('matchDetailBody').querySelector('[data-match-tab="'+currentTab+'"]')?.focus();
  renderReview();
 }
}
function closeMatchDetail(){
 clearInterval(sectionPoll);
 ++sectionRequest;
 ++predictionOpenRequest;
 state.matchDetailPayload=null;
 state.matchLinkedPrediction=null;
 ++matchDialogRequest;
 state.activeMatchId='';
 closeModal('matchModal');
 if(matchReturnFocus&&typeof matchReturnFocus.focus==='function')matchReturnFocus.focus();
 matchReturnFocus=null;
}

const collapsedMatchLeagues={schedule:new Set(),reviews:new Set()};
function leagueGroupedRows(rows,rendered,leagueOf,view){
 const groups=new Map();
 rows.forEach((item,i)=>{
  const league=String(leagueOf(item)||'其他聯賽');
  if(!groups.has(league))groups.set(league,[]);
  groups.get(league).push(rendered[i]);
 });
 const collapsed=collapsedMatchLeagues[view];
 return [...groups].map(([league,matches])=>{
  const key=encodeURIComponent(league),shut=collapsed.has(league);
  return '<tr class="match-league-heading"><td colspan="'+(view==='schedule'?3:5)+'"><button type="button" class="match-league-toggle" data-league-toggle="'+escapeHtml(key)+'" data-match-view="'+view+'" aria-expanded="'+(!shut)+'"><span>'+escapeHtml(league)+'</span><span class="match-league-meta">'+matches.length+' 場</span><span class="match-league-arrow" aria-hidden="true">⌄</span></button></td></tr>'+
   matches.map(html=>html.replace('<tr class="clickable-match"','<tr'+(shut?' hidden':'')+' class="clickable-match league-match-row"')).join('');
 }).join('');
}
function renderSchedule(){
 const rows=fixturesForView();$('fixtureCount').textContent=rows.length;$('fixtureEmpty').classList.toggle('hidden',rows.length>0);
 const rendered=rows.map((x,i)=>{
  const p=predictionForEvent(x),when=state.day.slice(5).replace('-','/'),
   effective=displayFixtureStatus(x),
   score=(x.status==='finished'||x.status==='inprogress'||x.status==='halftime')&&
        x.scoreHome!==null&&x.scoreHome!==undefined&&x.scoreAway!==null&&x.scoreAway!==undefined
      ?'<span class="match-score">'+escapeHtml(x.scoreHome)+' : '+escapeHtml(x.scoreAway)+'</span>'
      :elapsedStatus(x)==='scheduled'?'<span class="schedule-vs">VS</span>':'<span class="schedule-vs">— : —</span>';
  return '<tr class="clickable-match" tabindex="0" role="button" aria-label="查看'+escapeHtml(localizedTeamName(x.home))+'對'+escapeHtml(localizedTeamName(x.away))+'的比賽詳情" data-match-index="'+i+'"><td class="fixture-time"><span class="fixture-day">'+escapeHtml(when)+'</span><strong>'+escapeHtml(x.time)+'</strong><span class="mobile-fixture-status">'+escapeHtml(effective.text)+'</span></td>'+
   '<td class="fixture-match"><div class="teams-stack">'+
   teamLine('home',x.home,x.homeShort,x.homeLogo,p?.homeZh,x.leagueCode,x.homeAbbr)+
   '<span class="inline-match-score">'+score+'</span>'+
   teamLine('away',x.away,x.awayShort,x.awayLogo,p?.awayZh,x.leagueCode,x.awayAbbr)+
   '</div></td>'+
   '<td class="fixture-outcome"><div>'+score+'</div>'+
   statusPill(effective.text,effective.tone)+
   '</td></tr>'
 });
 $('fixtureTable').innerHTML=leagueGroupedRows(rows,rendered,x=>x.league,'schedule');
 const failures=state.sources.filter(x=>x.status==='error').length;
 const staleCount=state.fixtures.filter(x=>['stale','pending','conflict'].includes(elapsedStatus(x))).length;
 if(!state.loading){
   $('fixtureNotice').textContent=failures?'部分賽程暫時無法載入':'';
 }
 $('fixtureNotice').classList.toggle('hidden',!state.loading&&failures===0);
 if(!state.loading)$('sourceSummary').textContent=state.sources.length?(state.sources.some(s=>s.provider==='api-football')?'ESPN + API-FOOTBALL':'ESPN')+' · '+(state.sources.length-failures)+' / '+state.sources.length+' 請求成功':'尚未查詢賽程';
}
const prematchChanges=new Map();
const prematchPrices=new Map();
const prematchFixtures=new Map();
let prematchLoading=false;

async function loadPrematchChanges(report){
 if(prematchLoading||document.visibilityState==='hidden'||!report?.matches?.length)return;
 const now=Date.now(),picks=report.matches.filter(p=>{
  const delta=scheduledKickoff(p)-now;
  return delta>0&&delta<=3*3600000;
 });
 if(!picks.length)return;
 prematchLoading=true;
 const json=async url=>{
  try{const res=await fetch(url,{signal:AbortSignal.timeout(22000)});return res.ok?await res.json():null}
  catch{return null}
 };
 try{
  const tasks=[];
  const last=prematchPrices.get(report.date);
  if(!last||now-last.at>=120000){
   tasks.push(json('/api/parlay-odds?'+new URLSearchParams({date:report.date,mode:'current'})).then(data=>{
    const earlier={...last?.earlier};
    for(const [id,quotes] of Object.entries(last?.legs||{}))if(!earlier[id]?.length)earlier[id]=quotes;
    prematchPrices.set(report.date,{at:now,legs:data?.legs||last?.legs||{},earlier});
   }));
  }
  const candidates=new Map();
  const find=p=>eventForPrediction(p,state.fixtures.concat(state.reviewFixtures));
  const missing=new Map();
  for(const p of picks){
   if(find(p)||prematchFixtures.has(parlayMatchKey(p)))continue;
   const league=PRED_LEAGUE_CODES[p.league]||Object.keys(KN).find(k=>KN[k]===p.league);
   const utc=utcDayForPrediction(p);
   if(league&&utc)missing.set(league+'|'+utc,[league,utc]);
  }
  const extra=(await Promise.allSettled([...missing.values()].flatMap(([league,utc])=>
   [utc,addDay(utc,-1)].map(d=>readScoreboard(league,d,false))))).flatMap(result=>
    result.status==='fulfilled'?result.value.map(parseScore).filter(Boolean):[]);
  for(const p of picks){
   const f=find(p)||prematchFixtures.get(parlayMatchKey(p))||eventForPrediction(p,extra);
   if(f?.leagueCode&&/^\d{4,14}$/.test(String(f.id))){
    prematchFixtures.set(parlayMatchKey(p),f);
    candidates.set(f.leagueCode+'|'+f.id,f);
   }
  }
  for(const [key,f] of candidates){
   const old=prematchChanges.get(key);
   if(old&&now-old.at<120000)continue;
   tasks.push(json('/api/match-section?'+new URLSearchParams({league:f.leagueCode,event:f.id,section:'changes'})).then(data=>{
    prematchChanges.set(key,{at:now,data:data||old?.data});
   }));
  }
  if(tasks.length){
   await Promise.all(tasks);
   if(state.report?.date===report.date&&state.view==='predictions'){
    renderPredictions();
    renderParlayPanel();
   }
  }
 }finally{prematchLoading=false}
}

function prematchAlert(p,event){
 const remaining=scheduledKickoff(p)-Date.now();
 if(!(remaining>0&&remaining<=3*3600000))return '';
 event=event||prematchFixtures.get(parlayMatchKey(p));
 const entry=prematchChanges.get(event?.leagueCode+'|'+event?.id)?.data;
 const confirmed=(entry?.lineups||[]).filter(x=>x.lineup?.kind==='confirmed');
 const headlines=[];
 if(confirmed.length){
  headlines.push(confirmed.length===2?'雙方官方先發已公布':localizedTeamName(confirmed[0].team)+'先發已公布');
  const absent=confirmed.flatMap(t=>{
   const names=new Set(t.lineup.players.map(player=>nameKey(player.fullName)));
   return (t.previousStarters||[]).filter(name=>!names.has(nameKey(name)));
  });
  const named=absent.filter(name=>String(p.analysis||'').toLowerCase().includes(name.toLowerCase()));
  if(named.length)headlines.push('分析提及球員未先發：'+named.slice(0,3).join('、'));
  else if(absent.length)headlines.push('較上一場先發名單更動 '+absent.length+' 人');
 }
 const latest=prematchPrices.get(p.date);
 const current=latest?.legs?.[p.id]||[];
 const base=parlayOddsByDate.get(p.date)?.legs?.[p.id]||[];
 const original=p.publishedOdds;
 const old=[...(original?[original]:[]),...base,...(latest?.earlier?.[p.id]||[])];
 const compare=current.map(q=>[q,old.find(prior=>String(prior.source).toLowerCase()===String(q.source).toLowerCase()&&
  INSIGHTS.oddsTimestamp(prior.capturedAt)<INSIGHTS.oddsTimestamp(q.capturedAt))])
  .find(([q,prior])=>prior&&prior.price!==q.price);
 if(compare)headlines.push('同盤賠率 '+compare[1].price.toFixed(2)+' → '+compare[0].price.toFixed(2)+' '+compare[0].source);
 if(!headlines.length)return '';
 const stamps=[confirmed.length?INSIGHTS.oddsTimestamp(entry?.checkedAt):NaN,
  compare?INSIGHTS.oddsTimestamp(compare[0].capturedAt):NaN].filter(Number.isFinite);
 const when=stamps.length?fTaiwan(Math.max(...stamps))?.stamp:'';
 return '<div class="prematch-alert">'+headlines.map(msg=>'<span>'+escapeHtml(msg)+'</span>').join('')+
  (when?'<small>更新 '+escapeHtml(when)+'</small>':'')+'</div>';
}

function renderPredictions(){
 const rows=predsForView(),pending=state.feedStatus==='loading',failed=state.feedStatus==='error';
 const originalOnly=Boolean(state.report?.article&&!state.report.matches.length);
 const emptyTitle=originalOnly?'已發布原始全文':pending?'正在同步預測':failed?'暫時無法同步預測':state.report?.matches.length?'目前篩選沒有相符的預測':'當日無正式預測';
 $('predictionCount').textContent=rows.length||(!pending&&!failed&&!originalOnly?0:'—');
 $('predictionEmpty').classList.toggle('hidden',rows.length>0);
 $('predictionEmptyTitle').textContent=emptyTitle;
 $('predictionEmptyNote').textContent=originalOnly?'這天的存檔可透過「查看原始全文」閱讀。':pending?'正在讀取正式預測紀錄。':failed?'請重新同步，或查閱其他日期的已保留紀錄。':'已發布的預測會保留原始方向與機率。';
 $('retryPredictions').classList.toggle('hidden',!failed);
 $('publishedStamp').textContent=failed&&rows.length?'同步暫時失敗 · 顯示已保留紀錄':
   state.report?.publishedAt?'發布：'+state.report.publishedAt:pending?'正在同步':'正式發布紀錄';
 $('showOriginal').disabled=!state.report;
 $('predictionsGrid').innerHTML=rows.map((p,i)=>{
  const event=eventForPrediction(p,state.fixtures.concat(state.reviewFixtures));
  const groups=[...new Set((state.report?.matches||[]).filter(other=>
   other.date===p.date&&other.time===p.time&&sameTeam(other.home,p.home)&&sameTeam(other.away,p.away))
   .map(other=>other.group).filter(Boolean))];
  const markup='<div class="clickable-match" tabindex="0" role="button" data-prediction-index="'+i+'" aria-label="查看'+escapeHtml(localizedTeamName(p.home,p.homeZh))+'對'+escapeHtml(localizedTeamName(p.away,p.awayZh))+'的比賽詳情">'+
   '<div class="pred-top"><span>'+escapeHtml(p.time)+' · '+escapeHtml(p.league)+(p.round?' · '+escapeHtml(p.round):'')+'</span>'+
   '<span>'+escapeHtml(p.group||'串關單')+' · 第 '+p.order+' 關</span></div>'+
   '<div class="pred-team-stack">'+
   teamLine('home',p.home,'',event?.homeLogo,p.homeZh,PRED_LEAGUE_CODES[p.league]||'')+
   teamLine('away',p.away,'',event?.awayLogo,p.awayZh,PRED_LEAGUE_CODES[p.league]||'')+'</div>'+
   '<div class="pred-choice"><strong>'+escapeHtml(displayPredictionText(p,p.market))+'</strong>'+(Number.isFinite(p.probability)?'<span class="probability">'+p.probability+'%<small>估計'+escapeHtml(p.probabilityType||'命中')+'機率</small></span>':'')+'</div></div>';
  return '<article class="prediction">'+markup+'<div class="pred-discussion">'+
   prematchAlert(p,event)+(p.analysis?'<p><strong>主要依據</strong> '+escapeHtml(displayPredictionText(p,p.analysis))+'</p>':'')+
   (p.risk?'<p><strong>主要變數</strong> '+escapeHtml(displayPredictionText(p,p.risk))+'</p>':'')+
   (groups.length>1?'<p>另見 '+escapeHtml(groups.filter(group=>group!==p.group).join('、'))+'</p>':'')+
   '<details><summary>展開原始紀錄</summary><p>發布：'+escapeHtml(state.report?.publishedAt||'未記錄')+'</p>'+
   (state.report?.cutoff?'<p>資料截止：'+escapeHtml(state.report.cutoff)+'</p>':'')+
   (!p.analysis?'<p>原始紀錄未提供單場分析理由。</p>':'')+'</details></div></article>';
 }).join('');
}
function reviewResultLabel(settlement){
 const value=String(settlement||'');
 if(/全贏|半贏/.test(value))return '贏';
 if(/全輸|半輸/.test(value))return '輸';
 if(/走盤|退款|退回本金|無效/.test(value))return '走盤';
 return '';
}
const parlayOddsByDate=new Map();
let parlayHistoryLoading=false;
let parlayRecheckTimer;
const parlayKind={published:'發布原價',beforePublication:'發布前可核對價',reference:'賽前回補價'};
const parlayMatchKey=p=>[p.date,nameKey(p.home),nameKey(p.away)].join('|');
const signedUnits=n=>(n>0?'+':'')+n.toFixed(2);
const formatOdds=q=>q?.book==='manual'?String(q.price):q.price.toFixed(2);
function groupParlays(report){
 const groups=new Map();
 for(const p of report?.matches||[]){
  if(!p.groupPublished)continue;
  if(!groups.has(p.group))groups.set(p.group,[]);
  groups.get(p.group).push(p);
 }
 return groups;
}
function recentParlayReports(){
 const from='2026-11-18';
 return (state.feed?.reports||[]).filter(r=>r.date>=from&&r.date<=todayTaiwan()&&groupParlays(r).size);
}
async function loadParlayOdds(report,force=false){
 if(!report?.matches?.length)return 'ready';
 const existing=parlayOddsByDate.get(report.date);
 if(existing?.loading)return existing.loading;
 if(!force&&existing?.retryAt>Date.now())return existing.status;
 const entry={...existing};
 const request=(async()=>{
  try{
   const res=await fetch('/api/parlay-odds?'+new URLSearchParams({date:report.date}),{signal:AbortSignal.timeout(45000)});
   if(!res.ok)throw Error('Odds HTTP '+res.status);
   const data=await res.json();
   entry.legs={...entry.legs,...data.legs};
   entry.scores={...entry.scores,...data.scores};
   entry.status=data.status;
   entry.complete=data.status==='outside_window'||(data.status==='ready'&&report.matches.filter(p=>p.groupPublished).every(p=>data.legs?.[p.id]?.length));
  }catch{
   entry.status='unavailable';
   entry.complete=false;
  }finally{
   entry.loading=null;
   entry.retryAt=Date.now()+(entry.complete?5*60*1000:60*1000);
   if(state.day===report.date&&['predictions','reviews'].includes(state.view))renderParlayPanel();
   if(state.view==='history')renderHistory();
  }
  return entry.status;
 })();
 entry.loading=request;
 parlayOddsByDate.set(report.date,entry);
 return request;
}
async function loadParlayHistory(force=false){
 if(parlayHistoryLoading)return;
 parlayHistoryLoading=true;
 clearTimeout(parlayRecheckTimer);
 parlayRecheckTimer=null;
 const detailsOpen=$('historyBetDetails')?.open;
 try{
  const reports=detailsOpen?(state.feed?.reports||[]).filter(r=>r.matches?.length):recentParlayReports();
  for(const report of reports){
   if(state.view!=='history')break;
   if(await loadParlayOdds(report,force)==='rate_limited'){
    parlayRecheckTimer=setTimeout(()=>{if(state.view==='history')loadParlayHistory()},65000);
    break;
   }
  }
 }finally{
  parlayHistoryLoading=false;
  if(state.view==='history'){
   renderParlayHistory();
   if($('historyBetDetails')?.open&&!detailsOpen&&!parlayRecheckTimer)loadParlayHistory();
  }
 }
}
function parlayValues(picks,report){
 const entry=parlayOddsByDate.get(report.date);
 const result=INSIGHTS.parlayPrices(picks,entry?.legs||{},report.publishedAt);
 const duplicate=new Set(picks.map(parlayMatchKey)).size!==picks.length;
 const product=duplicate?null:INSIGHTS.parlayProduct(result.prices);
 return {...result,product,duplicate};
}
const parlayCapitalSettings={initial:10000,percentage:5};
const parlayCapitalStorage='fxi.parlayCapitalSettings';
const capitalFormat=new Intl.NumberFormat('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2});
function validParlayCapital({initial,percentage}){
 return Number.isFinite(initial)&&initial>=0.01&&initial<=1e12&&Number.isFinite(percentage)&&percentage>=0&&percentage<=100;
}
function bindParlayBacktest(){
 const form=$('parlayBacktestForm');
 const initial=$('parlayInitialCapital'),percentage=$('parlayStakePercent');
 if(!form||!initial||!percentage)return;
 try{
  const saved=JSON.parse(localStorage.getItem(parlayCapitalStorage));
  if(saved&&validParlayCapital(saved))Object.assign(parlayCapitalSettings,saved);
 }catch{}
 initial.value=String(parlayCapitalSettings.initial);
 percentage.value=String(parlayCapitalSettings.percentage);
 const calculate=()=>{
  const values={initial:initial.valueAsNumber,percentage:percentage.valueAsNumber};
  if(!validParlayCapital(values)||!form.checkValidity())return;
  Object.assign(parlayCapitalSettings,values);
  try{localStorage.setItem(parlayCapitalStorage,JSON.stringify(values))}catch{}
  renderParlayHistory();
 };
 form.addEventListener('input',calculate);
 form.addEventListener('submit',event=>{event.preventDefault();calculate()});
}

function renderParlayHistory(){
 const host=$('parlayHistoryBody');
 if(!host||!INSIGHTS)return;
 const reports=recentParlayReports();
 const rows=reports.flatMap(report=>[...groupParlays(report)].map(([group,picks])=>{
  const odds=parlayValues(picks,report);
  const grades=picks.map(p=>{
   const score=state.historyScores.get(historyId(p));
   return score?.verified&&score.status==='settled'?score.grade:null;
  });
  const net=odds.product&&odds.commonBook?INSIGHTS.parlayNet(grades,odds.prices):null;
  const pendingKickoff=picks.some(p=>scheduledKickoff(p)>Date.now());
  const status=odds.duplicate?'同場多關':picks.length<2?'單場':!odds.product?(parlayOddsByDate.get(report.date)?.status==='rate_limited'?'賠率待查詢':'缺賠率'):
   !odds.commonBook?'缺同一莊家報價':net===null?(pendingKickoff?'尚未開賽':'比分待核實'):parlayKind[odds.kind];
  return {date:report.date,group,odds,net,status};
 }));
 const sample=rows.filter(row=>Number.isFinite(row.net)&&row.odds.kind==='reference');
 const charts=window.FootballHistoryCharts;
 const model=charts?.bankrollBacktest?.(sample,parlayCapitalSettings.initial,parlayCapitalSettings.percentage);
 if(!model)return;
 const amount=value=>capitalFormat.format(value);
 const profit=value=>(value>0?'+':'')+amount(value);
 const coverage=rows.filter(row=>row.odds.product&&row.odds.commonBook).length;
 const metric=(name,value,caption='')=>'<div><label>'+name+'</label><strong>'+value+'</strong>'+
  (caption?'<small>'+caption+'</small>':'')+'</div>';
 host.innerHTML='<div class="statgrid parlay-metrics">'+metric('回測後餘額',amount(model.capital))+
  metric('淨損益',model.count?profit(model.profit):'—')+
  metric('累計報酬率',model.count?signedUnits(model.roi)+'%':'—',model.count?model.count+' 組已計入':'無可用樣本')+
  '</div>'+charts.parlayPlot(model.points)+
  '<p class="history-explain">同莊家賠率齊全 '+coverage+'／'+rows.length+' 組'+(parlayHistoryLoading?' · 正在查詢':'')+'</p>'+
  (rows.length?'<div class="tablewrap"><table class="history-league-table"><thead><tr><th>日期</th><th>串關</th><th>綜合賠率</th><th>下注金額</th><th>損益</th><th>狀態</th></tr></thead><tbody>'+
   rows.map(r=>{
    const bet=model.bets.get(r);
    const status=r.status===parlayKind.reference?'已計入回測':r.status;
    return '<tr><td>'+escapeHtml(r.date)+'</td><td>'+escapeHtml(r.group)+'</td><td>'+
     (r.odds.product&&r.odds.commonBook?r.odds.product.toFixed(2):'—')+'</td><td>'+
     (bet?amount(bet.stake):'—')+'</td><td>'+(bet?profit(bet.profit):'—')+'</td><td>'+status+'</td></tr>';
   }).join('')+'</tbody></table></div>':'');

}
function renderParlayPanel(report=state.report,fixtures=state.reviewFixtures.concat(state.fixtures)){
 const review=state.view==='reviews';
 const host=$(review?'parlayReviewBody':'parlayPredictionBody');
 if(!host||!INSIGHTS)return;
 const groups=groupParlays(report),affected=new Map();
 for(const [group,picks] of groups){
  for(const p of picks){
   const key=parlayMatchKey(p);
   if(!affected.has(key))affected.set(key,new Set());
   affected.get(key).add(group);
  }
 }
 const entry=parlayOddsByDate.get(report?.date);
 const output=[...groups].map(([group,picks])=>{
  const odds=parlayValues(picks,report);
  const legs=picks.map(p=>{
   const event=review?eventForPrediction(p,fixtures):null;
   const eventScore=resultScoreFromFixture(p,event);
   const archived=review?entry?.scores?.[p.id]:null;
   const live=archived?{...archived,scoreVerified:true}:eventScore;
   const different=archived&&eventScore&&(archived.h!==eventScore.h||archived.a!==eventScore.a);
   const stored=p.verified&&Number.isInteger(p.homeScore)&&Number.isInteger(p.awayScore);
   const conflict=different||event?.scoreConflict||(stored&&live&&(live.h!==p.homeScore||live.a!==p.awayScore));
   const score=conflict?null:stored?{h:p.homeScore,a:p.awayScore}:live;
   return {p,score,verified:!conflict&&(stored||live?.scoreVerified),grade:gradeHistory(p,score)||
    (stored&&!conflict?HISTORY?.settledFromString(p.settlement):null)};
  });
  const status=review?' · '+INSIGHTS.parlayStatus(legs.map(leg=>leg.grade)):'';
  const net=review&&odds.product&&odds.commonBook?INSIGHTS.parlayNet(legs.map(leg=>leg.verified?leg.grade:null),odds.prices):null;
  const foot=odds.duplicate?'同場多關，無法以獨立賠率相乘':picks.length<2?'單場推薦':
   odds.product?odds.commonBook?'':'莊家不同或未確認，僅供參考':
   entry?.loading?'查詢賠率中…':entry?.status==='unavailable'?'賠率來源暫無資料':'賠率齊全後可計算（'+odds.priced+'／'+legs.length+' 關）';
  return '<article class="parlay-group"><header><h4>'+escapeHtml(group)+'</h4><span>'+legs.length+' 關'+status+'</span></header><ol>'+
   legs.map(({p,score,grade},index)=>{
    const quote=odds.prices[index];
    const shared=[...affected.get(parlayMatchKey(p))].filter(item=>item!==group);
    return '<li><div><a href="'+escapeHtml(INSIGHTS.matchLink(p,review?'reviews':'predictions',review?'review':'prediction'))+'"><strong>'+
     escapeHtml((index+1)+'. '+localizedTeamName(p.home,p.homeZh)+' vs '+localizedTeamName(p.away,p.awayZh))+
     '</strong></a>'+(!review?prematchAlert(p,eventForPrediction(p,fixtures)):'')+(shared.length?'<div class="search-meta">同場亦見於 '+escapeHtml(shared.join('、'))+'</div>':'')+
     '<a class="snapshot-link" href="'+escapeHtml(INSIGHTS.matchLink(p,review?'reviews':'predictions','snapshot'))+'">賽前快照</a>'+
     '</div><span class="parlay-market">'+escapeHtml(displayPredictionText(p,p.market))+'</span><div class="parlay-result"><strong>'+
     (quote?formatOdds(quote):'—')+'</strong>'+(review?'<small>'+(score?score.h+' : '+score.a+' · ':'')+
     (gradeLabels[grade]||'待結算')+'</small>':'')+'</div></li>';
   }).join('')+'</ol><footer><span>'+foot+'</span><strong>綜合賠率 '+(odds.product?odds.product.toFixed(2):'—')+
   (net===null?'':' · 損益 '+signedUnits(net)+' 單位')+'</strong></footer></article>';
 }).join('');
 host.innerHTML=output||'<p class="search-meta">此日沒有已發布的串關組合。</p>';
}
function renderReview(){
 const rows=predsForView(),available=state.reviewFixtures.concat(state.fixtures);
 $('reviewCount').textContent=rows.length;
 $('reviewEmpty').classList.toggle('hidden',rows.length>0);
 const checked=state.reviewUpdatedAt?fTaiwan(state.reviewUpdatedAt).time:'';
 $('reviewFreshness').textContent=state.reviewLoading?'更新比分中…':
   checked?'更新 '+checked+(state.reviewErrors.length?' · 部分賽事尚未更新':''):'尚未更新比分';
 const reviewRows=rows.map((p,i)=>{
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
    '<td class="review-market">'+escapeHtml(displayPredictionText(p,p.market))+'</td>'+
    '<td class="review-score"><strong>'+(h!==null&&a!==null?escapeHtml(h)+' : '+escapeHtml(a):'—')+'</strong></td>'+
    '<td class="review-result-cell"><strong class="review-result '+resultClass+'">'+escapeHtml(label)+'</strong></td></tr>';
 });
 $('reviewTable').innerHTML=leagueGroupedRows(rows,reviewRows,p=>p.league,'reviews');
 if(INSIGHTS&&state.view==='reviews')renderParlayPanel(state.report,available);
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
  if(stored&&f?.scoreConflict)continue;
  if(stored&&score&&(p.homeScore!==score.h||p.awayScore!==score.a))continue;
  const h=stored?p.homeScore:score?.h,a=stored?p.awayScore:score?.a;
  if(!Number.isInteger(h)||!Number.isInteger(a))continue;
  const grade=HISTORY?.evaluate(p,h,a);
  if(!grade)continue;
  settled.push({p,h,a,grade});
 }
 if(!settled.length){body.textContent='目前尚無可核實的終場結果，待實際賽果確認後更新檢討。';return}
 const won=settled.filter(x=>x.grade==='win'||x.grade==='halfwin');
 const losses=settled.filter(x=>x.grade==='loss'||x.grade==='halfloss');
 const push=settled.filter(x=>x.grade==='push');
 const pending=Math.max(0,rows.length-settled.length);
 const intro='本日已結算 '+settled.length+' 場推薦，贏 '+won.length+' 場、輸 '+losses.length+' 場、走盤 '+push.length+' 場。'+
  (pending?'另有 '+pending+' 場尚未取得可核實的結算結果，暫不納入檢討。':'');
 const lessons=[];
 for(const {p,h,a} of losses){
  const market=displayPredictionText(p,p.market),goals=h+a;
  const description=localizedTeamName(p.home,p.homeZh)+'對'+localizedTeamName(p.away,p.awayZh);
  const total=reviewTotalLine(market);
  if(total?.direction==='小'){
   const concentration=Math.max(h,a)>=4?'其中單隊高比分已足以突破盤線，':'';
   lessons.push(description+'的小 '+total.line+' 失利：實際總進球 '+goals+' 球，'+concentration+'往後應逐一估算高比分尾端情境，而非僅以場均進球支撐小球判斷。');
  }else if(total?.direction==='大'){
   lessons.push(description+'的大 '+total.line+' 失利：實際總進球 '+goals+' 球，顯示低進球情境仍不可忽略；需重估雙方的零至一球風險及進攻效率假設。');
  }else if(/不敗|勝或和局|勝或平局/.test(market)){
   lessons.push(description+'的不敗盤失利：不敗只防和局，無法防守選定球隊落敗；應重估對手贏球的機率及盤口容錯。');
  }else{
   lessons.push(description+'的'+market+'失利，需回查賽前選盤依據、失敗情境與實際盤線，而非用賽後比分倒推原先應選的方向。');
  }
 }
 const finding=losses.length?'失利檢討：'+lessons.join(' '):'失利檢討：本日已結算的推薦沒有失利，但命中並不能證明賽前機率估計完全正確。';
 const borderline=won.find(({p,h,a})=>{
  const total=reviewTotalLine(p.market);
  return !!total&&Math.abs((h+a)-total.line)===0.5;
 });
 let success='命中檢討：'+(won.length?'本日命中的選項仍須區分合理判斷與比分波動，避免將一次命中當作原有假設全數成立。':'沒有已核實的命中場次可用來評估成功理由。');
 if(borderline){
  const {p,h,a}=borderline;
  success+='例如'+localizedTeamName(p.home,p.homeZh)+'對'+localizedTeamName(p.away,p.awayZh)+'的'+displayPredictionText(p,p.market)+'雖然命中，實際總進球為 '+(h+a)+' 球，距盤線僅半球；這類接近邊界的勝出仍須檢查容錯。';
 }
 const calibrated=settled.filter(({p,grade})=>(grade==='win'||grade==='loss')&&Number.isFinite(p.probability)&&p.probability>0&&p.probability<100);
 const calibration=calibrated.length>=3?'機率檢查：'+calibrated.length+' 場有原始估計機率且可作全贏／全輸比較，平均預估 '+Math.round(calibrated.reduce((sum,x)=>sum+x.p.probability,0)/calibrated.length)+'%，實際全贏 '+Math.round(calibrated.filter(x=>x.grade==='win').length/calibrated.length*100)+'%。這只是一日落差，需和跨日同市場結果累積比較，不能直接當成機率校準結論。':'';
 const history=reviewHistoricalComparison(losses);
 const enduring='長期應保留的經驗：每次推薦都要對照歷史中相同盤口、聯賽及比分分布，重新檢查低進球、高比分尾端和熱門隊失利情境；再比較可核實盤線的全贏、走盤與全輸風險。對勝出的場次也檢查盤線是否過窄，將發現放入跨日樣本檢驗，不因單日輸贏固定選用某種盤口。';
 body.textContent=[intro,finding,success,calibration,history,enduring].filter(Boolean).join('\n\n');
}

function reviewTotalLine(market){
 const raw=String(market||'').replace(/\s+/g,'');
 const hit=raw.match(/(?:全場)?(?:總進球|進球數)(大|小)(\d+(?:[.,]\d+)?)/)||raw.match(/全場(大|小)(\d+(?:[.,]\d+)?)/);
 if(!hit)return null;
 const line=Number(hit[2].replace(',','.'));
 return Number.isFinite(line)?{direction:hit[1],line}:null;
}
function reviewHistoricalComparison(losses){
 if(!losses.length||!state.feed?.reports||!HISTORY)return '';
 const current=state.report?.date||state.day;
 const keys=new Set(),sentences=[];
 for(const {p} of losses){
  const market=displayCleanText(p.market).replace(/\s+/g,'');
  if(keys.has(market))continue;
  keys.add(market);
  const seen=new Set(),older=[];
  for(const report of state.feed.reports){
   if(!report.date||report.date>=current)continue;
   for(const old of report.matches||[]){
    if(!old.verified||displayCleanText(old.market).replace(/\s+/g,'')!==market)continue;
    if(!Number.isInteger(old.homeScore)||!Number.isInteger(old.awayScore))continue;
    const id=historyId(old);
    if(seen.has(id))continue;
    seen.add(id);
    const grade=HISTORY.evaluate(old,old.homeScore,old.awayScore);
    if(grade)older.push(grade);
   }
  }
  if(older.length<3)continue;
  const hits=older.filter(x=>x==='win'||x==='halfwin').length;
  const misses=older.filter(x=>x==='loss'||x==='halfloss').length;
  const pushes=older.filter(x=>x==='push').length;
  sentences.push(market+'過往已核實 '+older.length+' 場，贏 '+hits+'、輸 '+misses+'、走盤 '+pushes+'；');
  if(sentences.length===2)break;
 }
 return sentences.length?'歷史對照：'+sentences.join('')+'這是已發布推薦的選擇性樣本，僅用來找出應進一步核查的風險，不直接推論未來勝率。':'';
}

const HISTORY=window.FootballHistory||null;
const HIST_CACHE_KEY='football-history-finals-v3';
function historyId(p){
 return [p.date,p.league,p.time,p.home,p.away,p.market,p.order].join('|');
}
function historyReportRows(){
 const all=state.feed?.reports||[];
 return all.flatMap(r=>(r.matches||[]).map(p=>({p,reportDate:r.date,key:historyId(p)})));
}
function resultScoreFromFixture(p,f){
 if(!f||f.status!=='finished'||f.scoreConflict||f.scoreHome===null||f.scoreHome===''||f.scoreAway===null||f.scoreAway==='')return null;
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
 if(!s?.scoreVerified)return false;
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
const historyChecksByDate=new Map();
async function loadHistoryResults(force=false){
 if(state.historyLoading||!state.feed?.reports?.length||!HISTORY)return;
 state.historyLoading=true;
 const recent=todayTaiwan();
 const jobs=state.feed.reports.filter(r=>r.matches?.length&&r.date<=recent&&
  (force||Date.now()-(historyChecksByDate.get(r.date)||0)>120000&&r.matches.some(p=>
   !['settled','unsupported','cancelled'].includes(state.historyScores.get(historyId(p))?.status))));
 state.historyRequired=jobs.length;state.historyChecks=0;state.historyErrors=0;
 renderHistory();
 let index=0;
 async function worker(){
  while(index<jobs.length){
   const report=jobs[index++];
   try{
    const response=await fetch('/api/history-results?'+new URLSearchParams({date:report.date}),{signal:AbortSignal.timeout(42000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const data=await response.json();
    for(const p of report.matches){
     const result=data.results?.[p.id];
     if(!result)continue;
     const id=historyId(p),old=state.historyScores.get(id);
     if(old?.verified&&!result.verified&&result.status!=='conflict')continue;
     state.historyScores.set(id,{...result,grade:result.verified?result.grade:null,updatedAt:Date.now()});
    }
    historyChecksByDate.set(report.date,Date.now());
   }catch{state.historyErrors++}
   state.historyChecks++;
   if(state.view==='history')renderHistory();
  }
 }
 try{
  await Promise.all(Array.from({length:Math.min(4,jobs.length)},worker));
  if(jobs.length)state.historyCheckedAt=Date.now();
  saveHistoryCache();
 }finally{
  state.historyLoading=false;
  if(state.view==='history')renderHistory();
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

function renderHistoryBets(rows){
 const panel=$('historyBetDetails'),host=$('historyBetRows');
 if(!panel?.open||!host||!INSIGHTS)return;
 const status=$('historyBetStatus').value;
 const items=rows.map(({p,result,reportDate})=>{
  const entry=parlayOddsByDate.get(reportDate);
  const report=(state.feed?.reports||[]).find(r=>r.date===reportDate);
  const priced=INSIGHTS.parlayPrices([p],entry?.legs||{},report?.publishedAt);
  const quote=priced.prices[0],settled=result?.verified&&result.status==='settled';
  const upcoming=scheduledKickoff(p)>Date.now();
  const net=quote&&settled?INSIGHTS.unitReturn(result.grade,quote.price):null;
  return {p,result,quote,settled,upcoming,net,kind:priced.kind,loading:!entry||Boolean(entry.loading)};
 }).filter(x=>!status||(status==='missing'?(!x.quote&&!x.loading):
  status==='settled'?x.settled:!x.settled&&!x.upcoming));
 host.innerHTML='<div class="tablewrap"><table class="history-league-table bet-detail-table"><thead><tr>'+
  '<th>日期</th><th>比賽</th><th>原始選項</th><th>賠率</th><th>比分</th><th>結算</th><th>損益</th>'+
  '</tr></thead><tbody>'+items.map(({p,result,quote,settled,upcoming,net,kind,loading})=>
   '<tr><td>'+escapeHtml(p.date+' '+p.time)+'</td><td><a href="'+escapeHtml(INSIGHTS.matchLink(p,'reviews','review'))+'">'+
   escapeHtml(localizedTeamName(p.home,p.homeZh)+' – '+localizedTeamName(p.away,p.awayZh))+'</a><a class="snapshot-link" href="'+
   escapeHtml(INSIGHTS.matchLink(p,'history','snapshot'))+'">賽前快照</a></td><td>'+escapeHtml(displayPredictionText(p,p.market))+'</td><td>'+
   (quote?escapeHtml(formatOdds(quote)+' '+quote.source)+'<small>'+escapeHtml(parlayKind[kind])+'</small>':
    loading?'等待查詢':'缺賠率')+'</td><td>'+
   (Number.isInteger(result?.h)&&Number.isInteger(result?.a)?result.h+' : '+result.a:'—')+'</td><td>'+
   (settled?gradeLabels[result.grade]:upcoming?'未開賽':result?.status==='cancelled'?'取消':result?.status==='postponed'?'延期':'待核實')+
   '</td><td>'+(net===null?'—':signedUnits(net))+'</td></tr>').join('')+
  (items.length?'':'<tr><td colspan="7">目前沒有符合篩選的紀錄</td></tr>')+'</tbody></table></div>';
}

function renderHistory(){
 if(state.view==='history')renderParlayHistory();
 const all=historyReportRows();
 const leagueControl=$('historyLeague'),periodControl=$('historyPeriod'),marketControl=$('historyMarket');
 const previousMarket=marketControl.value;
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
 const leagueRows=inPeriod.filter(row=>!selectedLeague||leagueLabel(row.p.league)===selectedLeague)
  .map(row=>({...row,result:state.historyScores.get(row.key)||null,market:INSIGHTS?.marketType(row.p.market)}));
 const markets=new Map(leagueRows.filter(row=>row.market).map(row=>[row.market,INSIGHTS.marketLabel(row.market)]));
 const marketOptions=[...markets].sort((a,b)=>a[1].localeCompare(b[1],'zh-TW'));
 marketControl.innerHTML='<option value="">全部玩法</option>'+marketOptions.map(([id,label])=>
  '<option value="'+escapeHtml(id)+'">'+escapeHtml(label)+'</option>').join('');
 marketControl.value=markets.has(previousMarket)?previousMarket:'';
 const rows=leagueRows.filter(row=>!marketControl.value||row.market===marketControl.value);
 const missingFeed=!state.feed?.reports?.length&&state.feedStatus!=='ready';
 const count=value=>missingFeed?'—':String(value);
 let summary={total:rows.length,finished:0,win:0,loss:0,halfwin:0,halfloss:0,push:0,pending:rows.length,unsupported:0,rate:null};
 if(HISTORY)summary=HISTORY.summarize(rows.map(x=>x.result?.grade?x.result:{status:x.result?.status||'pending'}));
 $('historyTotal').textContent=count(summary.total);
 $('historyVerified').textContent=count(summary.finished);
 $('historyWin').textContent=count(summary.win+summary.halfwin);
 $('historyLoss').textContent=count(summary.loss+summary.halfloss);
 $('historyPush').textContent=count(summary.push);
 $('historyRate').textContent=summary.rate===null?'—':summary.rate.toFixed(1)+'%';
 const calibration=$('historyProbabilityRows');
 if(calibration){
  const groups=new Map();
  for(const {p,result} of rows){
   if(!Number.isFinite(p.probability)||p.probability<0||p.probability>100||!result?.verified||!result.grade||result.grade==='push')continue;
   const type=p.probabilityType||'命中';
   const start=Math.min(90,Math.floor(p.probability/10)*10);
   const key=type+'|'+start;
   if(!groups.has(key))groups.set(key,{type,start,grades:[]});
   groups.get(key).grades.push(result);
  }
  calibration.innerHTML=[...groups.values()].sort((a,b)=>b.start-a.start||a.type.localeCompare(b.type,'zh-Hant')).map(g=>{
   const st=HISTORY.summarize(g.grades);
   const n=st.finished-st.push;
   const wins=g.type==='全贏'?st.win:st.win+.5*st.halfwin;
   const actual=100*wins/n;
   return '<tr><td>'+escapeHtml(g.type)+'</td><td>'+g.start+'%～'+(g.start===90?100:g.start+9)+'%</td><td>'+st.finished+'</td><td><div class="history-market-meter"><meter min="0" max="100" value="'+actual+'" aria-label="實際比率"></meter><strong>'+actual.toFixed(1)+'%（'+wins+'/'+n+'）</strong></div></td></tr>';
  }).join('')||'<tr><td colspan="4">目前沒有可計算的已核實樣本</td></tr>';
 }

 const label=missingFeed?(state.feedStatus==='loading'?'正在同步預測紀錄…':'正式預測來源暫時無法同步'):
  state.historyLoading?
  '比對歷史比分 '+state.historyChecks+'/'+state.historyRequired+(state.historyErrors?' · 來源失敗 '+state.historyErrors:''):
  state.historyCheckedAt?'最近比對 '+fTaiwan(state.historyCheckedAt).stamp:
  summary.finished?'已取得部分終場資料':'尚未查核歷史比分';
 $('historyProgress').textContent=label;
 $('historyRefresh').disabled=state.historyLoading;
 const byLeague=new Map();
 for(const row of rows){
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
  '<tr><td colspan="7" class="history-no-data">'+(missingFeed?escapeHtml(label):'所選範圍尚無預測紀錄')+'</td></tr>';
 const marketRows=marketOptions.filter(([id])=>!marketControl.value||marketControl.value===id).flatMap(([id,title])=>{
  const group=rows.filter(row=>row.market===id);
  return group.length&&HISTORY?[{id,title,stats:HISTORY.summarize(group.map(row=>row.result||{}))}]:[];
 }).sort((a,b)=>(b.stats.finished-b.stats.push)-(a.stats.finished-a.stats.push)||a.title.localeCompare(b.title,'zh-TW'));
 $('historyMarketRows').innerHTML=marketRows.map(({id,title,stats})=>{
  const n=stats.finished-stats.push;
  const wins=stats.win+.5*stats.halfwin;
  return '<tr><td><button class="linkbtn history-market-link" type="button" data-bet-market="'+escapeHtml(id)+'">'+escapeHtml(title)+'</button></td><td>'+n+'</td><td><div class="history-market-meter">'+
   (stats.rate===null?'—':'<meter min="0" max="100" value="'+stats.rate+'" aria-label="'+escapeHtml(title)+'命中率"></meter><strong>'+
    stats.rate.toFixed(1)+'%（'+wins+'/'+n+'）</strong>')+'</div></td></tr>';
 }).join('')||'<tr><td colspan="3" class="history-no-data">'+(missingFeed?escapeHtml(label):'所選範圍尚無玩法紀錄')+'</td></tr>';
 renderHistoryBets(rows);
 const byDay=new Map();
 for(const row of rows){
  if(!byDay.has(row.reportDate))byDay.set(row.reportDate,[]);
  byDay.get(row.reportDate).push(row);
 }
 const daily=[...byDay].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,group])=>({
  day,
  stats:HISTORY?HISTORY.summarize(group.map(x=>x.result?.grade?x.result:{status:x.result?.status||'pending'})):{...summary,total:group.length}
 }));
 if(missingFeed){
  for(const id of ['historyMixChart','historyTrendChart','historyRollingChart'])$(id).innerHTML='<p class="history-chart-empty">'+escapeHtml(label)+'</p>';
 }else window.FootballHistoryCharts?.render($('historyMixChart'),$('historyTrendChart'),summary,daily,$('historyRollingChart'),rows);
 const date=$('historyDate').value;
 $('clearHistoryDate').disabled=!date;
 $('historyRows').innerHTML=daily.filter(item=>!date||item.day===date).reverse().map(({day,stats})=>{
  const win=stats.win+stats.halfwin;
  const loss=stats.loss+stats.halfloss;
  const items=byDay.get(day)||[];
  const upcoming=items.filter(({p})=>scheduledKickoff(p)>Date.now()).length;
  const unresolved=stats.total-stats.finished-upcoming;
  return '<div class="history-item"><strong>'+escapeHtml(day)+'</strong>'+
   '<span>推薦 '+stats.total+'</span>'+
   '<span class="history-done">結算 '+stats.finished+'</span>'+
   (upcoming?'<span>未開賽 '+upcoming+'</span>':'')+(unresolved>0?'<span>未結算 '+unresolved+'</span>':'')+
   '<span class="history-win">贏 '+win+'</span>'+
   '<span class="history-loss">輸 '+loss+'</span>'+
   '<span class="history-percentage">'+(stats.rate===null?'—':stats.rate.toFixed(1)+'%')+'</span>'+
   '<button class="mlauto" data-load-day="'+escapeHtml(day)+'">查看</button></div>';
 }).join('')||'<div class="empty">'+(missingFeed?escapeHtml(label):date?'所選日期在目前篩選範圍內沒有預測紀錄':'尚無歷史預測')+'</div>';
}
function renderStandings(){
 const select=$('standingsLeague'),content=$('standingsContent'),status=$('standingsUpdated');
 if(!select||!content)return;
 const cached=standingsState.snapshots.get(standingsState.league);
 if(!cached){content.innerHTML='<div class="standings-message">正在取得聯賽積分榜…</div>';status.textContent='';return}
 if(cached.error){content.innerHTML='<div class="standings-message">'+escapeHtml(cached.error)+'</div>';status.textContent='';return}
 const stamp=new Date(cached.checkedAt);
 status.textContent='ESPN · 查詢 '+(Number.isFinite(stamp.getTime())?stamp.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—')+(standingsState.errors.has(standingsState.league)?' · 更新暫時失敗':'');
 content.innerHTML='<div class="standings-season">'+escapeHtml(KN[standingsState.league]||standingsState.league)+(cached.season?' · '+escapeHtml(cached.season):'')+'</div>'+
 cached.groups.map(group=>'<section class="standings-group">'+(cached.groups.length>1?'<h3>'+escapeHtml(group.name||'分組')+'</h3>':'')+
 '<div class="standings-scroll"><table class="standings-table"><thead><tr><th>#</th><th>球隊</th><th>賽</th><th>勝</th><th>和</th><th>負</th><th>進–失</th><th>淨勝</th><th>積分</th></tr></thead><tbody>'+
 group.rows.map(row=>'<tr><td class="standing-rank">'+row.rank+'</td><td class="standing-team"><div class="standing-identity">'+teamLogo(row.logo,row.name)+'<strong>'+escapeHtml(localizedTeamName(row.name))+'</strong></div></td><td>'+row.played+'</td><td>'+row.won+'</td><td>'+row.drawn+'</td><td>'+row.lost+'</td><td>'+row.goalsFor+'–'+row.goalsAgainst+'</td><td>'+(row.goalDifference>0?'+':'')+row.goalDifference+'</td><td class="standing-points">'+row.points+'</td></tr>').join('')+'</tbody></table></div></section>').join('');
}
async function loadStandings(force=false){
 if(standingsState.busy)return;
 const league=standingsState.league,prior=standingsState.snapshots.get(league);
 if(!force&&prior&&!prior.error&&Date.now()-Date.parse(prior.checkedAt)<35000){renderStandings();return}
 standingsState.busy=true;const request=++standingsState.sequence;
 $('standingsRefresh').disabled=true;
 try{
  const response=await fetch('/api/standings?league='+encodeURIComponent(league),{cache:'no-store'});
  const data=await response.json();
  if(!response.ok||!data.groups?.length||data.groups.some(g=>!g.rows?.length))throw Error(data.error||'目前無法取得完整積分榜');
  standingsState.snapshots.set(league,data);
  standingsState.errors.delete(league);
 }catch(error){
  standingsState.errors.add(league);
  // Keep a previously verified snapshot rather than replacing it with broken rows.
  if(!prior||prior.error)standingsState.snapshots.set(league,{error:String(error.message||error)});
 }finally{
  standingsState.busy=false;$('standingsRefresh').disabled=false;
  if(request===standingsState.sequence&&standingsState.league===league)renderStandings();
  else if(state.view==='standings'&&standingsState.league!==league)loadStandings(false);
 }
}
function render(){
 $('nowDate').textContent=todayTaiwan().replaceAll('-','/');
 const names={schedule:['每日賽程','每日賽程'],predictions:['預測分析','預測分析'],reviews:['賽後復盤','賽後復盤'],history:['歷史統計','歷史統計'],standings:['聯賽積分榜','聯賽積分榜']};
 const t=names[state.view];$('viewTitle').textContent=t[0];$('breadcrumb').textContent=t[1];
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
 $('schedulePanel').classList.toggle('hidden',state.view!=='schedule');
 $('predictionsPanel').classList.toggle('hidden',state.view!=='predictions');
 $('reviewPanel').classList.toggle('hidden',state.view!=='reviews');
 $('historyPanel').classList.toggle('hidden',state.view!=='history');
 $('standingsPanel').classList.toggle('hidden',state.view!=='standings');
 const mainControls=document.querySelector?.('.controls');
 if(mainControls)mainControls.classList.toggle('hidden',state.view==='standings'||state.view==='history');
 $('exportDaily').classList.toggle('hidden',state.view==='standings');
 if(state.view==='standings')renderStandings();
 updateFilter();renderSchedule();renderPredictions();renderReview();renderHistory();
 if(['predictions','reviews'].includes(state.view)){
  if(state.view==='predictions'){renderParlayPanel();loadPrematchChanges(state.report)}
  loadParlayOdds(state.report);
 }
 if(state.view==='history')loadParlayHistory();

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
 $('standingsLeague').innerHTML=standingsLeagues.map(([code,name])=>'<option value="'+code+'">'+escapeHtml(name)+'</option>').join('');
 $('standingsLeague').value=standingsState.league;
 $('standingsLeague').onchange=event=>{standingsState.league=event.target.value;renderStandings();loadStandings(false)};
 $('standingsRefresh').onclick=()=>loadStandings(true);
 try{const saved=JSON.parse(localStorage.getItem('football-dashboard-leagues')||'null');if(Array.isArray(saved)&&saved.length)state.leagues=new Set(saved.filter(x=>KN[x]))}catch{}
 // One-time migration: include both AFCON competitions for existing visitors.
 try{if(localStorage.getItem('football-afcon-migration-v1')!=='done'){
   state.leagues.add('caf.nations');state.leagues.add('caf.nations_qual');
   localStorage.setItem('football-dashboard-leagues',JSON.stringify([...state.leagues]));
   localStorage.setItem('football-afcon-migration-v1','done');
 }}catch{}
 // Include the A-League for visitors with settings saved before its addition.
 try{if(localStorage.getItem('football-aus-migration-v1')!=='done'){
   state.leagues.add('aus.1');
   localStorage.setItem('football-dashboard-leagues',JSON.stringify([...state.leagues]));
   localStorage.setItem('football-aus-migration-v1','done');
 }}catch{}
 // Existing browsers once stored a narrow default set; upgrade it only once.
 // Later manual checkbox changes remain untouched across reloads.
 try{if(localStorage.getItem('football-dashboard-all-leagues-v1')!=='done'){
   state.leagues=new Set(defaultLeagues);
   localStorage.setItem('football-dashboard-leagues',JSON.stringify(defaultLeagues));
   localStorage.setItem('football-dashboard-all-leagues-v1','done');
 }}catch{}
 // Add newly source-verified cups/divisions on existing devices once. Keep
 // earlier manually disabled competitions disabled after this migration.
 try{if(localStorage.getItem('football-dashboard-expanded-cups-v2')!=='done'){
   for(const code of ['eng.3','eng.league_cup','esp.2','ger.dfb_pokal','ita.2',
      'ita.coppa_italia','fra.coupe_de_france','por.taca.portugal','bra.2',
      'bra.copa_do_brazil','arg.copa','conmebol.libertadores',
      'conmebol.sudamericana','aus.w.1'])state.leagues.add(code);
   localStorage.setItem('football-dashboard-leagues',JSON.stringify([...state.leagues]));
   localStorage.setItem('football-dashboard-expanded-cups-v2','done');
 }}catch{}
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
   state.view=b.dataset.view;
   if(state.view==='predictions'){
    selectLatestOfficialPrediction();
    $('selectedDay').value=state.day;
    setReport();
    loadFeed();
   }
   render();
   if(state.view==='reviews')loadReviewScores(false);
   else if(state.view==='schedule')loadFixtures(false);
   else if(state.view==='history')loadHistoryResults(false);
   else if(state.view==='standings')loadStandings(false);
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
   }else if(state.view==='standings'){
     await loadStandings(true);
   }else if(state.view==='reviews'){
     await loadReviewScores(true);
   }else{
     await loadFixtures(true);
   }
   toast('資料已重新查詢');
 };
 bindParlayBacktest();
 $('historyRefresh').onclick=()=>{loadHistoryResults(true);loadParlayHistory(true)};
 $('historyLeague').onchange=renderHistory;
 $('historyPeriod').onchange=renderHistory;
 $('historyMarket').onchange=renderHistory;
 $('historyBetStatus').onchange=renderHistory;
 $('historyBetDetails').ontoggle=()=>{
  if(!$('historyBetDetails').open)return;
  renderHistory();loadParlayHistory();
 };
 $('historyMarketRows').onclick=event=>{
  const button=event.target.closest('[data-bet-market]');
  if(!button)return;
  $('historyMarket').value=button.dataset.betMarket;
  $('historyBetDetails').open=true;
  renderHistory();
  $('historyBetDetails').scrollIntoView({block:'nearest'});
 };
 $('historyDate').onchange=renderHistory;
 $('clearHistoryDate').onclick=()=>{
  $('historyDate').value='';
  renderHistory();
  $('historyDate').focus();
 };
 $('refreshReview').onclick=async()=>{
   await loadFeed();await loadReviewScores(true);
   toast('比分已重新查詢');
 };
 // Live-only ESPN summary refresh; source-reported match minute is not locally fabricated.
 setInterval(()=>pollLiveMatches(),35000);
 // New Gmail reports may arrive while this tab is open. Keep predictions fresh
 // independently of fixture polling, which only refreshes scoreboard data.
 setInterval(()=>{
  if(document.visibilityState==='visible'&&state.view==='predictions')loadFeed();
 },45000);
 // Retry incomplete odds while the prediction view is open.
 setInterval(()=>{
  if(document.visibilityState==='visible'&&state.view==='predictions'&&state.report)loadParlayOdds(state.report);
 },60000);
 // The upstream shared cache is 45 seconds; refresh only while the table is visible.
 setInterval(()=>{if(document.visibilityState==='visible'&&state.view==='standings')loadStandings(false)},45000);
 // Review is independently refreshed while visible; finished fixtures settle from actual data.
 setInterval(()=>{
  if(document.visibilityState!=='visible'||state.view!=='reviews'||state.reviewLoading)return;
  const delta=Math.abs(Date.parse(state.day+'T00:00:00Z')-Date.parse(todayTaiwan()+'T00:00:00Z'));
  if(delta<=2*86400000)loadReviewScores(false);
 },60000);
 setInterval(()=>{
  if(document.visibilityState!=='visible'||state.view!=='history'||state.historyLoading)return;
  loadFeed();
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
  if(state.view==='predictions')loadFeed();
 });
 $('exportDaily').onclick=getDailyExport;
 $('retryPredictions').onclick=()=>{
  state.feedStatus='loading';renderPredictions();loadFeed();
 };
 $('showOriginal').onclick=()=>{if(!state.report)return;$('originalDate').textContent=state.report.date;$('originalArticle').textContent=displayCleanText(state.report.article||'當天未提供可公開原始全文');openModal('originalModal')};
 $('historyRows').onclick=e=>{const b=e.target.closest('[data-load-day]');if(!b)return;pickDay(b.dataset.loadDay);state.view='predictions';render()};
 const entryView=window.location.hash.slice(1);
 if(['schedule','predictions','reviews','history','standings'].includes(entryView))state.view=entryView;
 const entryQuery=new URLSearchParams(window.location.search);
 const entryDay=entryQuery.get('day');
 const validEntryDay=/^\d{4}-\d{2}-\d{2}$/.test(entryDay||'')&&Number.isFinite(Date.parse(entryDay+'T00:00:00Z'))&&addDay(entryDay,0)===entryDay;
 state.dayManuallyChosen=validEntryDay;
 state.day=validEntryDay?entryDay:todayTaiwan();
 $('selectedDay').value=state.day;
 loadFeed().then(async()=>{
  const entryMatch=validEntryDay&&INSIGHTS?.readMatchLink(entryQuery);
  const lookup=entryMatch&&state.day===entryDay;
  const samePair=row=>row.date===entryDay&&sameTeam(row.home,entryMatch.home)&&sameTeam(row.away,entryMatch.away)&&row.time===entryMatch.time;
  const prediction=lookup&&state.report?.matches.find(samePair);
  if(prediction)openPredictionMatchDetail(prediction,entryMatch.tab);
  if(state.view==='schedule'){
   await loadFixtures(false);
   if(lookup&&!prediction&&state.day===entryDay&&state.view==='schedule'&&!state.matchDetailPayload){
    const matches=state.fixtures.filter(samePair);
    if(matches.length===1)openMatchDetail(matches[0],entryMatch.tab);
    else toast('目前無法定位這場賽事');
   }
  }
  if(state.view==='reviews')loadReviewScores(false);
 });
 if(state.view==='standings')loadStandings(false);
 render();
 document.addEventListener('click',event=>{
  const toggle=event.target.closest('[data-league-toggle]');
  if(!toggle)return;
  const league=decodeURIComponent(toggle.dataset.leagueToggle||'');
  const collapsed=collapsedMatchLeagues[toggle.dataset.matchView];
  if(!collapsed)return;
  if(collapsed.has(league))collapsed.delete(league);else collapsed.add(league);
  const group=toggle.closest('tr');
  for(let row=group?.nextElementSibling;row&&!row.classList.contains('match-league-heading');row=row.nextElementSibling)row.hidden=collapsed.has(league);
  toggle.setAttribute('aria-expanded',String(!collapsed.has(league)));
 });
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
   if(!row||!container.contains(row)||event.target.closest('details'))return;
   if(event.type==='keydown'){
    if(event.key!=='Enter'&&event.key!==' ')return;
    event.preventDefault();
   }
   const p=items()[Number(row.getAttribute(indexAttr))];
   if(p)openPredictionMatchDetail(p,indexAttr==='data-review-index'?'review':'prediction');
  };
  container.addEventListener('click',open);
  container.addEventListener('keydown',open);
 };
 bindPredictionDetails($('predictionsGrid'),'data-prediction-index',predsForView);
 bindPredictionDetails($('reviewTable'),'data-review-index',predsForView);
 $('matchDetailBody').addEventListener('click',event=>{
  const button=event.target.closest('[data-match-tab]');
  if(button)setMatchTab(button.dataset.matchTab);
 });
 $('copyMatchLink').onclick=async()=>{
  const match=state.matchDetailPayload;
  if(!match||!INSIGHTS)return;
  const {p}=matchReportRows(match)[0]||{};
  const link=INSIGHTS.matchLink(p||match,p?'predictions':'schedule',state.matchTab);
  try{
   await navigator.clipboard.writeText(link);
   if(state.matchDetailPayload===match)$('matchShareStatus').textContent='已複製比賽連結';
  }catch{
   if(state.matchDetailPayload!==match)return;
   const field=$('matchLinkFallback');
   field.value=link;field.hidden=false;field.select();
   $('matchShareStatus').textContent='可直接複製已選取的連結';
  }
 };
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
