'use strict';

const leagues=require('./settlement-leagues.json');
const {teamKey}=require('./parlay-odds');
const {evaluate}=require('./public/history-engine');
const archive=require('./parlay-odds-archive.json');
const backfill=require('./history-results-archive.json');
const {compatible}=require('./public/team-identity');
const minute=60000;
const day=86400000;
const isoDay=t=>new Date(t).toISOString().slice(0,10);
const integer=v=>v!=null&&/^\d+$/.test(String(v))?Number(v):null;
const key=m=>[m.date,m.time,m.home,m.away].join('|');
function normalize(name){
 const n=teamKey(name).replace(/\b(?:fc|cf|cd|ud|sc|afc|ac|saf)\b/g,' ').replace(/\s+/g,' ').trim();
 const aliases={'bayern munich':'bayern munchen','man utd':'manchester united','inter':'inter','internazionale':'inter',
  'porto':'porto','1 koln':'cologne','koln':'cologne','cologne':'cologne','tottenham hotspur':'tottenham','western sydney wanderers fc':'western sydney',
  'western sydney wanderers':'western sydney','western sydney':'western sydney',
  'athletico pr':'athletico paranaense','vasco':'vasco da gama','saudi arabia':'saudi arabia','korea republic':'south korea',
  'republic of korea':'south korea','s korea':'south korea','china taipei':'chinese taipei','taiwan':'chinese taipei',
  'vitoria guimaraes':'vitoria','vitoria sc':'vitoria','atletico mineiro':'atletico mineiro',
  'mainz':'mainz 05','augsburg':'augsburg','deportivo alaves':'alaves','est rela amadora':'estrela da amadora',
  'cd artistico navalcarnero':'navalcarnero','artistico navalcarnero':'navalcarnero','cda navalcarnero':'navalcarnero','salamanca uds':'salamanca uds','salamanca uds cf':'salamanca uds'};
 return aliases[n]||n;
}
function espnEvent(e){
 const c=e.competitions?.[0],t=c?.status?.type||e.status?.type;
 const h=c?.competitors?.find(x=>x.homeAway==='home'),a=c?.competitors?.find(x=>x.homeAway==='away');
 if(!h||!a)return null;
 const cancelled=/CANCEL/.test(t?.name||''),postponed=/POSTPON/.test(t?.name||'');
 const ft=['STATUS_FULL_TIME','STATUS_FINAL','STATUS_FT','STATUS_FINAL_DRAW'].includes(t?.name);
 return {id:String(e.id),time:Date.parse(e.date||c.date),
  home:[h.team?.displayName,h.team?.name,h.team?.shortDisplayName],away:[a.team?.displayName,a.team?.name,a.team?.shortDisplayName],
  status:cancelled?'cancelled':postponed?'postponed':/AET|PEN/.test(t?.name||'')?'extended':ft?'final':'pending',h:integer(h.score),a:integer(a.score)};
}
function fotmobEvent(e){
 const t=e.status||{};
 const special=(t.reason?.short||'')+' '+(t.reason?.long||'');
 const final=t.finished===true&&!e.home?.penScore&&!e.away?.penScore&&!/AET|PEN|after extra|shootout/i.test(special);
 return {id:String(e.id),time:Date.parse(t.utcTime),home:[e.home?.name,e.home?.shortName],away:[e.away?.name,e.away?.shortName],
  status:t.cancelled?'cancelled':/postpon/i.test(special)?'postponed':final?'final':'pending',h:integer(e.home?.score),a:integer(e.away?.score)};
}
function select(events,m,at){
 const home=normalize(m.home),away=normalize(m.away);
 const equal=(arr,n,original)=>compatible(arr.find(Boolean),original)&&arr.some(v=>compatible(v,original)&&normalize(v)===n);
 const exact=new Map(events.filter(e=>e&&home&&away&&equal(e.home,home,m.home)&&equal(e.away,away,m.away)&&
  Math.abs(e.time-at)<=120*minute).map(e=>[e.id,e]));
 return exact.size===1?[...exact.values()][0]:null;
}
function verifiedResult(m,e,f){
 const record=archive[[m.date,m.time,m.home,m.away,m.market,m.group].join('|')];
 const archived=record?.score;
 const saved=backfill[key(m)];
 const evidence=[
  ...(e?.status==='final'&&e.h!==null&&e.a!==null?[{h:e.h,a:e.a,source:e.regulation?'ESPN（90 分鐘）':'ESPN',trusted:e.regulation===true}]:[]),
  ...(e?.status!=='extended'&&!saved?.regulation&&f?.status==='final'&&f.h!==null&&f.a!==null?[{h:f.h,a:f.a,source:'FotMob'}]:[]),
  ...(m.verified===true&&integer(m.homeScore)!==null&&integer(m.awayScore)!==null?[{h:Number(m.homeScore),a:Number(m.awayScore),source:'正式結算',trusted:true}]:[]),
  ...(saved?[{...saved,trusted:true}]:[]),
  ...(archived?[{h:archived[0],a:archived[1],source:'賠率歷史封存'}]:[])
 ];
 const first=evidence[0];
 if(first){
  if(evidence.some(x=>x.h!==first.h||x.a!==first.a))return {status:'conflict',source:evidence.map(x=>x.source).join(' / ')};
  const {h,a}=first;
  const grade=evaluate(m,h,a);
  const verified=evidence.length>=2||Boolean(first.trusted);
  return {h,a,grade,verified,status:grade?(verified?'settled':'reference'):'unsupported',
   source:evidence.map(x=>x.source).join(' / '),eventId:e?.id||saved?.eventId||'',...(saved?.url?{sourceUrl:saved.url}:{}),...(saved?.regulation?{regulation:true}:{})};
 }
 return {status:e?.status==='cancelled'||f?.status==='cancelled'?'cancelled':
  e?.status==='postponed'||f?.status==='postponed'?'postponed':e||f?'pending':'missing'};
}

async function resolveReport(report,get,now=Date.now()){
 const records=report.matches||[],espn=new Map(),fotmob=new Map();

 const prefetch=async(m)=>{
  const at=Date.parse(m.date+'T'+m.time+':00+08:00');
  if(!Number.isFinite(at))return {status:'missing'};
  if(at>now)return {status:'upcoming'};
  if(at>now-15*minute)return {status:'pending'};
  // Recent archived results must still be compared with current sources so a
  // corrected score cannot stay frozen indefinitely. Older corroborated
  // archives avoid repeated large historical lookups.
  if(backfill[key(m)]&&at<now-3*day)return verifiedResult(m,null,null);
  const league=Object.hasOwn(leagues,m.league)?leagues[m.league]:null;
  const utc=isoDay(at);
  if(league){
   const id=league+utc;
   if(!espn.has(id))espn.set(id,Promise.all([isoDay(at-day),utc].map(date=>
    get('https://site.api.espn.com/apis/site/v2/sports/soccer/'+league+
     '/scoreboard?dates='+date.replaceAll('-','')))).then(days=>days.flatMap(v=>(v?.events||[]).map(espnEvent))));
  }
  if(!fotmob.has(utc))fotmob.set(utc,get('https://www.fotmob.com/api/data/matches?date='+utc.replaceAll('-',''))
   .then(v=>(v?.leagues||[]).flatMap(l=>(l.matches||[]).map(fotmobEvent))));
  const [e,f]=await Promise.all([espn.get(league+utc)||[],fotmob.get(utc)]);
  const match=select(e,m,at);
  if(match?.status==='extended'&&!backfill[key(m)]&&/^\d+$/.test(match.id)){
   const s=await get('https://site.api.espn.com/apis/site/v2/sports/soccer/'+league+'/summary?event='+match.id);
   const teams=s?.header?.competitions?.[0]?.competitors||[];
   const regulation=side=>{
    const periods=teams.find(t=>t.homeAway===side)?.linescores;
    if(periods?.length<2)return null;
    const one=integer(periods?.[0]?.displayValue),two=integer(periods?.[1]?.displayValue);
    return one===null||two===null?null:one+two;
   };
   const h=regulation('home'),a=regulation('away');
   const completedRegularTime=s?.keyEvents?.some(event=>event.type?.type==='end-regular-time'&&event.period?.number===2);
   if(String(s?.header?.id)===match.id&&completedRegularTime&&h!==null&&a!==null){
    const result=verifiedResult(m,{...match,h,a,status:'final',regulation:true},null);
    return {...result,regulation:true};
   }
  }
  return verifiedResult(m,match,select(f,m,at));
 };
 const results=await Promise.all(records.map(async m=>[m.id,await prefetch(m)]));
 return Object.fromEntries(results);
}
module.exports={resolveReport,key};
