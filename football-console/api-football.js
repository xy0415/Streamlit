'use strict';
/**
 * API-FOOTBALL secondary source. 100/day free tier; our server conservatively
 * reserves quota and does not enlarge the user-approved competition universe.
 * Only normalized data is returned. No API key can reach the browser.
 */
const https=require('node:https');
const {URL}=require('node:url');
const DAY_MS=86400000;
const MAX_DAY=65;            // leave free-tier capacity unused
const MAX_PER_MIN=8;          // below provider 10/min ceiling
const ACTIVE_CACHE=10*60*1000;
const HISTORIC_CACHE=8*60*60*1000;
const NEGATIVE_CACHE=35*60*1000;
const countryMap={england:'England',spain:'Spain',germany:'Germany',italy:'Italy',france:'France',
 netherlands:'Netherlands',portugal:'Portugal',belgium:'Belgium',turkey:'Turkey',brazil:'Brazil',
 argentina:'Argentina',usa:'USA',mexico:'Mexico','saudi-arabia':'Saudi-Arabia',japan:'Japan',
 'south-korea':'South-Korea',australia:'Australia'};
function norm(s){return String(s||'').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'')
 .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
const definitions=[
 // Names and provider league IDs are matched together when IDs are known.
 // For unknown or reissued IDs, exact normalized official competition names
 // and countries are required; wildcard league searches are prohibited.
 ['eng.1',[39],['Premier League'],'England'],
 ['eng.2',[40],['Championship'],'England'],
 ['esp.1',[140],['La Liga','Primera División'],'Spain'],
 ['ger.1',[78],['Bundesliga'],'Germany'],
 ['ita.1',[135],['Serie A'],'Italy'],
 ['fra.1',[61],['Ligue 1'],'France'],
 ['ned.1',[88],['Eredivisie'],'Netherlands'],
 ['por.1',[94],['Primeira Liga'],'Portugal'],
 ['bel.1',[144],['Jupiler Pro League'],'Belgium'],
 ['tur.1',[203],['Süper Lig','Super Lig'],'Turkey'],
 ['bra.1',[71],['Serie A','Brasileiro Série A'],'Brazil'],
 ['arg.1',[128],['Liga Profesional Argentina','Primera División'],'Argentina'],
 ['usa.1',[253],['Major League Soccer'],'USA'],
 ['mex.1',[262],['Liga MX'],'Mexico'],
 ['ksa.1',[307],['Pro League','Saudi Pro League'],'Saudi-Arabia'],
 ['jpn.1',[98],['J1 League'],'Japan'],
 ['aus.1',[188],['A-League','A-League Men'],'Australia'],
 ['uefa.champions',[2],['UEFA Champions League','Champions League'],'World'],
 ['uefa.europa',[3],['UEFA Europa League','Europa League'],'World'],
 ['uefa.europa.conf',[848],['UEFA Europa Conference League','UEFA Conference League'],'World'],
 ['conmebol.libertadores',[13],['CONMEBOL Libertadores','Copa Libertadores'],'World'],
 ['conmebol.sudamericana',[11],['CONMEBOL Sudamericana','Copa Sudamericana'],'World'],
 ['afc.champions',[],['AFC Champions League Elite'],'World'],
 ['concacaf.champions',[],['CONCACAF Champions Cup','CONCACAF Champions League'],'World'],
 ['fifa.clubworld',[15],['FIFA Club World Cup'],'World'],
 ['eng.fa',[45],['FA Cup'],'England'],
 ['eng.league_cup',[48],['League Cup','EFL Cup'],'England'],
 ['esp.copa_del_rey',[143],['Copa del Rey'],'Spain'],
 ['ger.cup',[81],['DFB Pokal'],'Germany'],
 ['ita.cup',[137],['Coppa Italia'],'Italy'],
 ['fra.cup',[66],['Coupe de France'],'France'],
 ['bra.cup',[73],['Copa Do Brasil','Copa do Brasil'],'Brazil'],
 ['fifa.world',[1],['World Cup','FIFA World Cup'],'World'],
 ['fifa.worldq.uefa',[],['World Cup - Qualification Europe'],'World'],
 ['fifa.worldq.conmebol',[],['World Cup - Qualification South America'],'World'],
 ['uefa.euro',[4],['Euro Championship','UEFA European Championship'],'World'],
 ['uefa.euroq',[],['Euro Championship - Qualification'],'World'],
 ['uefa.nations',[5],['UEFA Nations League'],'World'],
 ['conmebol.america',[9],['Copa America'],'World'],
 ['afc.asian.cup',[7],['Asian Cup'],'World'],
 ['caf.nations',[6],['Africa Cup of Nations'],'World'],
 ['caf.nations_qual',[],['Africa Cup of Nations - Qualification','Africa Cup of Nations Qualification'],'World'],
 ['concacaf.gold',[22],['CONCACAF Gold Cup'],'World'],
 ['fifa.friendly',[10],['Friendlies','International Friendlies'],'World']
];
const APPROVED=new Map(definitions.map(([code,ids,names,country])=>[
 code,{ids,names:names.map(norm),country:norm(country)}
]));
const safeCodes=new Set(APPROVED.keys());
const excluded=/(?:^|[\s-])(?:women|woman|female|youth|reserves?|u\s*\d{2}|under\s*\d{2}|academy|friendly\s*clubs?)(?:$|[\s-])/i;
function competitionCode(league){
 if(!league||typeof league.name!=='string')return null;
 const name=norm(league.name),country=norm(league.country);
 if(excluded.test(league.name)||excluded.test(league.country||''))return null;
 const leagueId=Number(league.id);
 for(const [code,config]of APPROVED){
  if(code==='fifa.friendly' && /club/i.test(league.name))continue;
  const countryFits=country===config.country||config.country==='world'&&
   ['world','international','europe','africa','asia','south america','north america'].includes(country);
  if(!countryFits)continue;
  if(config.names.includes(name))return code;
  // League IDs are only accepted together with a known official name family;
  // avoid accidentally mapping an unrelated competition with a reused ID.
  if(config.ids.includes(leagueId)&&config.names.some(n=>name.includes(n)||n.includes(name)))return code;
 }
 return null;
}
const statuses=new Map([
 ['NS','scheduled'],['TBD','scheduled'],['1H','inprogress'],['2H','inprogress'],['ET','inprogress'],
 ['LIVE','inprogress'],['HT','halftime'],['BT','halftime'],
 ['FT','finished'],['AET','finished'],['PEN','finished'],
 ['PST','postponed'],['SUSP','postponed'],['CANC','cancelled'],['ABD','cancelled']
]);
function normalizedFixture(item){
 const e=item?.fixture,t=item?.teams,g=item?.goals,l=item?.league;
 if(!e||!t?.home?.name||!t?.away?.name||!l)return null;
 const code=competitionCode(l);
 if(!code)return null;
 const date=new Date(e.date);
 if(!Number.isFinite(date.getTime())||!Number.isInteger(Number(e.id)))return null;
 const st=e.status||{},short=String(st.short||'');
 const scoreHome=g?.home===null||g?.home===undefined?null:Number(g.home);
 const scoreAway=g?.away===null||g?.away===undefined?null:Number(g.away);
 const scoreValid=Number.isInteger(scoreHome)&&scoreHome>=0&&Number.isInteger(scoreAway)&&scoreAway>=0;
 const status=statuses.get(short)||'pending';
 const elapsed=st.elapsed==null?null:Number(st.elapsed);
 const minute=Number.isInteger(elapsed)&&elapsed>0&&elapsed<=130?elapsed:null;
 const dateParts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const p=Object.fromEntries(dateParts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return {id:'api-'+e.id,apiFixtureId:Number(e.id),leagueCode:code,leagueName:l.name,
  date:p.year+'-'+p.month+'-'+p.day,time:p.hour+':'+p.minute,utc:e.date,
  home:t.home.name,away:t.away.name,homeLogo:t.home.logo||'',awayLogo:t.away.logo||'',
  homeTeamId:String(t.home.id||''),awayTeamId:String(t.away.id||''),
  scoreHome:scoreValid?scoreHome:null,scoreAway:scoreValid?scoreAway:null,
  status,sourceStatus:short,statusText:String(st.long||''),minute,
  normalTimeOnly:short==='FT',hasExtraTime:short==='AET'||short==='PEN'};
}
const cache=new Map();
const inflight=new Map();
const seenFixtureIds=new Set();
const limiter={date:'',count:0,minuteStart:0,minuteCount:0,providerRemaining:null};
function todayUTC(){return new Date().toISOString().slice(0,10)}
function budgetPermit(){
 const now=Date.now(),day=todayUTC();
 if(limiter.date!==day){limiter.date=day;limiter.count=0;limiter.minuteCount=0;limiter.minuteStart=now;limiter.providerRemaining=null;}
 if(now-limiter.minuteStart>=60000){limiter.minuteStart=now;limiter.minuteCount=0}
 if(limiter.providerRemaining!==null&&limiter.providerRemaining<=8)return false;
 if(limiter.count>=MAX_DAY||limiter.minuteCount>=MAX_PER_MIN)return false;
 limiter.count++;limiter.minuteCount++;return true;
}
function providerFetch(path,secret){
 return new Promise((resolve,reject)=>{
  const req=https.get(new URL('https://v3.football.api-sports.io'+path),{
   headers:{'x-apisports-key':secret,'accept':'application/json'},timeout:14000
  },res=>{
   const chunks=[];let size=0;
   res.on('data',b=>{size+=b.length;if(size>4500000)req.destroy(Error('Provider response too large'));else chunks.push(b)});
   res.on('end',()=>{
    const h=res.headers;
    const rem=Number(h['x-ratelimit-requests-remaining']);
    if(Number.isFinite(rem)&&rem>=0)limiter.providerRemaining=rem;
    let body=null;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{}
    if(res.statusCode!==200)return reject(Error('API-FOOTBALL HTTP '+res.statusCode));
    if(!body||!Array.isArray(body.response))return reject(Error('API-FOOTBALL returned unavailable response'));
    if(body.errors&&Object.keys(body.errors).length){
     const plan=String(body.errors.plan||'');
     const reason=/Free plan|Free plans|season|subscription/i.test(plan)?
       '免費方案可能不支援所查賽季':'API-FOOTBALL 上游回報查詢限制';
     return reject(Error(reason));
    }
    resolve(body.response);
   });
  });
  req.on('timeout',()=>req.destroy(Error('API-FOOTBALL timeout')));
  req.on('error',reject);
 });
}
function publicQuota(){
 return {configured:Boolean(process.env.API_FOOTBALL_KEY),usedByServer:limiter.count,
  maxByServer:MAX_DAY,providerRemaining:limiter.providerRemaining,
  scope:'Existing adult men competitions only'};
}
async function getFixtures(date){
 if(!process.env.API_FOOTBALL_KEY)return {ok:false,reason:'not_configured',fixtures:[],quota:publicQuota()};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z')))
  throw Error('Invalid date');
 const dayOffset=Math.abs(Date.now()-Date.parse(date+'T00:00:00Z'));
 if(dayOffset>48*86400000)throw Error('Date is outside the limited API backup window');
 const key='fixtures:'+date,now=Date.now();
 if(cache.has(key)&&cache.get(key).until>now)return {...cache.get(key).result,cacheHit:true,quota:publicQuota()};
 if(inflight.has(key))return inflight.get(key);
 if(!budgetPermit())return {ok:false,reason:'free_quota_reserved_or_rate_limited',fixtures:[],quota:publicQuota()};
 const promise=providerFetch('/fixtures?date='+date+'&timezone=Asia%2FTaipei',process.env.API_FOOTBALL_KEY)
  .then(rows=>{
   const fixtures=rows.map(normalizedFixture).filter(Boolean).filter(f=>f.date===date);
   for(const f of fixtures)seenFixtureIds.add(f.apiFixtureId);
   if(seenFixtureIds.size>3500)seenFixtureIds.clear();
   const result={ok:true,fixtures,receivedAt:new Date().toISOString(),quota:publicQuota()};
   const past=Date.parse(date+'T00:00:00Z')<Date.now()-DAY_MS;
   cache.set(key,{result,until:Date.now()+(past?HISTORIC_CACHE:ACTIVE_CACHE)});
   if(cache.size>100){const first=cache.keys().next().value;cache.delete(first)}
   return result;
  }).catch(error=>{
   const result={ok:false,reason:String(error.message||error),fixtures:[],quota:publicQuota()};
   cache.set(key,{result,until:Date.now()+NEGATIVE_CACHE});
   return result;
  }).finally(()=>inflight.delete(key));
 inflight.set(key,promise);
 return promise;
}
async function getEvents(id){
 if(!process.env.API_FOOTBALL_KEY)return {ok:false,reason:'not_configured',events:[]};
 const n=Number(id);if(!Number.isInteger(n)||n<1||!seenFixtureIds.has(n))throw Error('Fixture ID is not in the approved competition data');
 const key='events:'+n,old=cache.get(key);
 if(old&&old.until>Date.now())return {...old.result,cacheHit:true,quota:publicQuota()};
 if(inflight.has(key))return inflight.get(key);
 if(!budgetPermit())return {ok:false,reason:'free_quota_reserved_or_rate_limited',events:[],quota:publicQuota()};
 const promise=providerFetch('/fixtures/events?fixture='+n,process.env.API_FOOTBALL_KEY)
  .then(rows=>{
   const events=rows.slice(0,150).map(ev=>({
    type:String(ev.type||''),detail:String(ev.detail||''),comments:String(ev.comments||''),
    minute:Number(ev.time?.elapsed)||null,extra:Number(ev.time?.extra)||null,
    team:String(ev.team?.name||''),teamId:Number(ev.team?.id)||null,
    player:String(ev.player?.name||''),assist:String(ev.assist?.name||'')
   }));
   const result={ok:true,events,quota:publicQuota()};
   cache.set(key,{result,until:Date.now()+20*60*1000});
   return result;
  }).catch(err=>({ok:false,events:[],reason:String(err.message||err),quota:publicQuota()}))
  .finally(()=>inflight.delete(key));
 inflight.set(key,promise);return promise;
}
module.exports={getFixtures,getEvents,competitionCode,normalizedFixture,safeCodes,publicQuota};
