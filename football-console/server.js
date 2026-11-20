const http = require('node:http');
const apiFootball = require('./api-football');
const {parseStandings} = require('./standings');
const {reportOdds} = require('./parlay-odds');
const {includePublishedCards} = require('./report-cards');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const BASE = path.join(__dirname, 'public');
const MAX_BODY = 4096;
// Only competition slugs verified to return a valid ESPN scoreboard belong here.
// Include supported cups and lower divisions, otherwise their match days disappear.
const ALLOWED = new Set([
 'eng.1','eng.2','eng.3','eng.fa','eng.league_cup','esp.1','esp.2','esp.copa_del_rey',
 'ger.1','ger.dfb_pokal','ita.1','ita.2','ita.coppa_italia','fra.1','fra.coupe_de_france',
 'ned.1','por.1','por.taca.portugal','usa.1','bra.1','bra.2','bra.copa_do_brazil',
 'arg.1','arg.copa','ksa.1','jpn.1','mex.1','uefa.champions','uefa.europa',
 'uefa.europa.conf','uefa.nations','fifa.world','fifa.friendly',
 'conmebol.libertadores','conmebol.sudamericana','concacaf.champions','afc.champions',
 'aus.1','aus.w.1','sco.1','bel.1','tur.1','chn.1','fifa.worldq.uefa',
 'fifa.worldq.conmebol','caf.nations','caf.nations_qual'
]);
const FD_ALLOWED = new Set(['PL','ELC','PD','BL1','SA','FL1','DED','PPL','BSA','CL','WC']);
const STANDINGS_ALLOWED = new Set(['eng.1','eng.2','esp.1','ger.1','ita.1','fra.1','ned.1','por.1','bra.1','arg.1','usa.1','ksa.1','jpn.1','mex.1','tur.1','bel.1','sco.1','chn.1','aus.1']);
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.txt':'text/plain; charset=utf-8'};
const counters = new Map();
// Shared upstream cache across visitors. A rejected request is never cached as valid data.
const UPSTREAM_CACHE = new Map();
const UPSTREAM_INFLIGHT = new Map();
const SOURCE_HEALTH = new Map();
const SYNC_STATUS = {fixtures:{},scores:{},predictions:{}};
function recordSync(key,ok,at=new Date().toISOString()){
 const entry=SYNC_STATUS[key];
 entry.checkedAt=at;
 entry.ok=ok;
 if(ok)entry.lastSuccess=at;
}
function recordScoreboard(target,response){
 const url=new URL(target);
 if(url.hostname!=='site.api.espn.com'||!url.pathname.endsWith('/scoreboard'))return;
 const valid=response?.status===200&&Array.isArray(response.data?.events);
 recordSync('fixtures',valid);
 if(!valid){recordSync('scores',false);return}
 const hasScore=response.data.events.some(event=>{
  const teams=event.competitions?.[0]?.competitors;
  return ['in','post'].includes(event.status?.type?.state)&&teams?.length===2&&
   teams.every(team=>/^\d+$/.test(String(team.score)));
 });
 if(hasScore)recordSync('scores',true);
}
async function cachedRemoteGet(target,ttlMs,headers={}) {
 const now=Date.now(),cached=UPSTREAM_CACHE.get(target);
 if(cached&&cached.expires>now)return cached.response;
 if(UPSTREAM_INFLIGHT.has(target))return UPSTREAM_INFLIGHT.get(target);
 const job=(async()=>{
  let response;
  try{
   response=await remoteGet(target,headers);
   if([502,503,504].includes(response.status))response=await remoteGet(target,headers);
   SOURCE_HEALTH.set(new URL(target).hostname,{ok:response.status===200,checkedAt:Date.now()});
   recordScoreboard(target,response);
  }catch(error){
   SOURCE_HEALTH.set(new URL(target).hostname,{ok:false,checkedAt:Date.now()});
   recordScoreboard(target,null);
   throw error;
  }
  if(response.status===200){
   response.fetchedAt=new Date().toISOString();
   UPSTREAM_CACHE.set(target,{response,expires:Date.now()+ttlMs});
   if(UPSTREAM_CACHE.size>500){
    for(const [key,value] of UPSTREAM_CACHE)if(value.expires<Date.now())UPSTREAM_CACHE.delete(key);
    while(UPSTREAM_CACHE.size>500)UPSTREAM_CACHE.delete(UPSTREAM_CACHE.keys().next().value);
   }
  }
  return response;
 })().finally(()=>UPSTREAM_INFLIGHT.delete(target));
 UPSTREAM_INFLIGHT.set(target,job);
 return job;
}
function scoreboardTtl(date){
 const dateMs=Date.parse(date+'T00:00:00Z');
 const distance=Date.now()-dateMs;
 if(distance>36*3600000)return 8*3600000;
 if(distance< -36*3600000)return 6*3600000;
 return 40*1000;
}
const FIFA_RANK_SNAPSHOT={data:null,expires:0};
async function currentFifaRankingSnapshot(){
 if(FIFA_RANK_SNAPSHOT.data && FIFA_RANK_SNAPSHOT.expires>Date.now())return FIFA_RANK_SNAPSHOT.data;
 // FotMob reproduces FIFA's published men's ranking and includes period + team rank.
 // FIFA's older per-country public endpoint can lag behind published editions.
 const periods=await remoteGet('https://www.fotmob.com/api/data/fifarankings/period?gender=men');
 if(periods.status!==200||!Array.isArray(periods.data))
  throw Error('免費 FIFA 排名期別來源暫時無法取得');
 const current=Number(new Date().toISOString().slice(0,10).replace(/-/g,''));
 const editions=periods.data.filter(x=>/^\d{8}$/.test(String(x.periodId||''))&&
   Number(x.periodId)<=current).sort((a,b)=>Number(b.periodId)-Number(a.periodId));
 if(!editions.length)throw Error('找不到已公布的 FIFA 男子排名期別');
 const edition=String(editions[0].periodId);
 const asOf=edition.slice(0,4)+'-'+edition.slice(4,6)+'-'+edition.slice(6,8);
 // Do not silently label a many-month-old ranking as current.
 if(Date.now()-Date.parse(asOf+'T00:00:00Z')>125*86400000)
  throw Error('最新可用 FIFA 排名期別過舊，需等待來源更新');
 const ranks=await remoteGet('https://www.fotmob.com/api/data/fifarankings/ranking?gender=men&periodId='+edition);
 if(ranks.status!==200||!Array.isArray(ranks.data))
  throw Error('免費 FIFA 排名表暫時無法取得');
 const rows=ranks.data
  .filter(x=>typeof x.name==='string'&&x.name.length<90&&Number.isInteger(Number(x.rank))&&
     Number(x.rank)>=1&&Number(x.rank)<=250)
  .slice(0,250).map(x=>({name:x.name,rank:Number(x.rank)}));
 if(rows.length<150)throw Error('FIFA 排名資料筆數不足，避免呈現不完整名次');
 const snapshot={source:'FotMob — FIFA Men World Ranking',asOf,edition,rows,
  checkedAt:new Date().toISOString()};
 FIFA_RANK_SNAPSHOT.data=snapshot;
 FIFA_RANK_SNAPSHOT.expires=Date.now()+6*60*60*1000;
 console.log('[fifa] current ranking period:',asOf,'teams:',rows.length,
   'top:',rows[0].name,rows[0].rank);
 return snapshot;
}

const FEED_CACHE = { time:0, data:null };
const ALLOWED_FEED_REDIRECT_HOSTS = new Set(['script.google.com','script.googleusercontent.com']);
function fetchScriptJson(url,remaining=4) {
 return new Promise((resolve,reject)=>{
  const u=new URL(url);
  if(u.protocol!=='https:' || !ALLOWED_FEED_REDIRECT_HOSTS.has(u.hostname))return reject(Error('Google Apps Script 來源不在允許清單'));
  const request=https.get(u,{headers:{accept:'application/json','user-agent':'FootballAnalyticsConsole/1.0'},timeout:14000},response=>{
    if(response.statusCode>=300&&response.statusCode<400&&response.headers.location){
      response.resume();
      if(!remaining)return reject(Error('Google Apps Script 轉址次數過多'));
      const location=new URL(response.headers.location,u).toString();
      return fetchScriptJson(location,remaining-1).then(resolve,reject);
    }
    const chunks=[];let size=0;
    response.on('data',chunk=>{
      size+=chunk.length;if(size>3*1024*1024){request.destroy(Error('資料來源回應過大'));return}
      // UTF-8 code points can span TCP chunks. Decode the complete byte stream
      // only once; per-chunk toString('utf8') inserts U+FFFD into Chinese text.
      chunks.push(chunk);
    });
    response.on('end',()=>{
      if(response.statusCode!==200)return reject(Error('Google Apps Script HTTP '+response.statusCode));
      try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{return reject(Error('Google Apps Script 回傳非 JSON'))}
    });
  });
  request.on('timeout',()=>request.destroy(Error('Apps Script 連線逾時')));
  request.on('error',reject);
 });
}
function canonicalReportDate(value,article){
 const fromArticle=String(article||'').match(/分析日期[：:]\s*(\d{4}-\d{2}-\d{2})/);
 if(fromArticle)return fromArticle[1];
 const str=String(value==null?'':value).trim();
 if(/^\d{4}-\d{2}-\d{2}$/.test(str))return str;
 let match=str.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
 if(match)return match[1]+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0');
 match=str.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
 if(match)return match[3]+'-'+match[1].padStart(2,'0')+'-'+match[2].padStart(2,'0');
 if(/^\d{5}(\.\d+)?$/.test(str)){
  const d=new Date(Date.UTC(1899,11,30)+Number(str)*86400000);
  if(Number.isFinite(d.getTime()))return d.toISOString().slice(0,10);
 }
 return '';
}
function canonicalClock(value){
 const str=String(value==null?'':value).trim();
 const match=str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
 if(match)return match[1].padStart(2,'0')+':'+match[2];
 if(/^0?\.\d+$/.test(str)){
  const minutes=Math.round(Number(str)*24*60);
  if(minutes>=0&&minutes<1440)return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
 }
 return str;
}
function sanitizePublicReports(payload){
 const reports=payload.reports.slice(0,120).map(report=>{
  const date=canonicalReportDate(report.date,report.article);
  if(!date)return null;
  const stored=Array.isArray(report.matches)?report.matches.map(m=>({...m,date,time:canonicalClock(m.time)})):[];
  const matches=includePublishedCards(report.article,date,stored);
  return {...report,date,matches};
 }).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
 return {version:1,connected:true,syncedAt:payload.syncedAt||'',scoresCheckedAt:payload.scoresCheckedAt||'',reports};
}
function fallbackReports(error){
 let payload={version:1,reports:[]};
 try{payload=JSON.parse(fs.readFileSync(path.join(BASE,'data','predictions.json'),'utf8'))}catch{}
 return {...payload,connected:false,syncedAt:'',scoresCheckedAt:'', ...(error?{syncError:String(error.message||error)}:{})};
}
function send(res,code,data,extra={}) {res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}); res.end(JSON.stringify(data));}
function dateOk(v){return /^\d{4}-\d{2}-\d{2}$/.test(v||'') && !Number.isNaN(Date.parse(v+'T00:00:00Z'));}
function rateOk(req) {
 const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
 const t=Date.now(), entry=counters.get(ip)||{count:0,t};
 if(t-entry.t>60000){entry.count=0;entry.t=t;}
 entry.count++;counters.set(ip,entry);
 return entry.count<=100;
}
function remoteGet(target, headers={}) {
 return new Promise((resolve,reject)=>{
   const url=new URL(target);const request=https.get(url,{headers:{'accept':'application/json','user-agent':'FixtureValidationConsole/1.0',...headers},timeout:14000},r=>{
     let bytes=0; const pieces=[];
     r.on('data',b=>{bytes+=b.length;if(bytes>3*1024*1024){request.destroy(new Error('回應內容超過 3 MB'));return;}pieces.push(b)});
     r.on('end',()=>{const body=Buffer.concat(pieces).toString('utf8');let parsed;try{parsed=JSON.parse(body)}catch{parsed={message:'回傳格式不是有效 JSON',excerpt:body.slice(0,500)}}resolve({status:r.statusCode,data:parsed,bytes,contentType:r.headers['content-type']||''})});
   });request.on('timeout',()=>request.destroy(new Error('上游連線逾時（14秒）')));request.on('error',reject);
 });
}
let feedRequest=null;
let feedFailure=null;
async function currentReports(){
 const target=String(process.env.FOOTBALL_REPORT_FEED_URL||'').trim();
 if(!target)return fallbackReports();
 if(feedRequest)return feedRequest;
 if(feedFailure&&Date.now()-feedFailure.time<15000)return feedFailure.response;
 if(FEED_CACHE.data&&Date.now()-FEED_CACHE.time<30000)return FEED_CACHE.data;
 feedRequest=(async()=>{
  try{
   if(!/^https:\/\/script\.google\.com\/macros\/s\/[-\w]+\/exec(?:\?.*)?$/.test(target))throw Error('Google Apps Script 部署網址格式不正確');
   const payload=await fetchScriptJson(target);
   if(!payload||!Array.isArray(payload.reports)||payload.connected!==true)throw Error(payload&&payload.error||'來源未完成初始化');
   const data=sanitizePublicReports(payload);
   FEED_CACHE.time=Date.now();FEED_CACHE.data=data;feedFailure=null;
   recordSync('predictions',true);
   return data;
  }catch(error){
   recordSync('predictions',false);
   const response=FEED_CACHE.data?{...FEED_CACHE.data,connected:false,syncError:String(error.message||error)}:fallbackReports(error);
   feedFailure={time:Date.now(),response};
   return response;
  }
 })().finally(()=>{feedRequest=null});
 return feedRequest;
}
async function api(req,res,route){
 if(!rateOk(req))return send(res,429,{error:'請求過於頻繁，請稍後再試'});
 if(route.pathname==='/api/health')return send(res,200,{ok:true,serverTime:new Date().toISOString(),sources:['ESPN','TheSportsDB','football-data.org',...(process.env.API_FOOTBALL_KEY?['API-FOOTBALL']:[])],apiFootball:apiFootball.publicQuota(),reportSyncConfigured:Boolean(process.env.FOOTBALL_REPORT_FEED_URL),upstreamHealth:Object.fromEntries(SOURCE_HEALTH),sharedCacheEntries:UPSTREAM_CACHE.size});
 if(route.pathname==='/api/standings'&&req.method==='GET'){
  const league=route.searchParams.get('league');
  if(!STANDINGS_ALLOWED.has(league))return send(res,400,{error:'不支援該聯賽積分榜'});
  const target='https://site.api.espn.com/apis/v2/sports/soccer/'+encodeURIComponent(league)+'/standings';
  try{
   const upstream=await cachedRemoteGet(target,45*1000);
   if(upstream.status!==200)return send(res,502,{error:'積分榜資料來源暫時無法取得',source:'ESPN',upstreamStatus:upstream.status});
   const normalized=parseStandings(upstream.data);
   return send(res,200,{source:'ESPN',league,checkedAt:upstream.fetchedAt||new Date().toISOString(),...normalized});
  }catch(error){return send(res,503,{source:'ESPN',error:String(error.message||error)})}
 }
 if(route.pathname==='/api/api-football/fixtures'&&req.method==='GET'){
  const date=route.searchParams.get('date');
  if(!dateOk(date))return send(res,400,{error:'日期無效'});
  try{
   const data=await apiFootball.getFixtures(date);
   return send(res,data.ok?200:503,data);
  }catch(error){return send(res,502,{ok:false,error:String(error.message||error),fixtures:[]})}
 }
 if(route.pathname==='/api/api-football/events'&&req.method==='GET'){
  const fixture=String(route.searchParams.get('fixture')||'');
  if(!/^\d{1,12}$/.test(fixture))return send(res,400,{error:'賽事識別碼錯誤'});
  try{
   const data=await apiFootball.getEvents(Number(fixture));
   return send(res,data.ok?200:503,data);
  }catch(error){return send(res,502,{ok:false,error:String(error.message||error),events:[]})}
 }
 if(route.pathname==='/api/parlay-odds'&&req.method==='GET'){
  const date=route.searchParams.get('date');
  if(!dateOk(date))return send(res,400,{error:'日期無效'});
  const feed=await currentReports();
  const report=feed.reports.find(item=>item.date===date);
  if(!report)return send(res,404,{status:'no_report',legs:{}});
  return send(res,200,await reportOdds(report));
 }
 if(route.pathname==='/api/reports'&&req.method==='GET')return send(res,200,await currentReports());
 if(route.pathname==='/api/sync-status'&&req.method==='GET'){
  const feed=await currentReports();
  return send(res,200,{
   timezone:'Asia/Taipei',
   fixtures:SYNC_STATUS.fixtures,
   predictions:{...SYNC_STATUS.predictions,publishedAt:FEED_CACHE.data?.syncedAt||'',configured:Boolean(process.env.FOOTBALL_REPORT_FEED_URL)},
   scores:{...SYNC_STATUS.scores,upstreamCheckedAt:FEED_CACHE.data?.scoresCheckedAt||feed.scoresCheckedAt||''},
  });
 }
 if(route.pathname==='/api/match-lookup'&&req.method==='GET'){
   const date=route.searchParams.get('date'),home=String(route.searchParams.get('home')||''),away=String(route.searchParams.get('away')||'');
   // Fixed upstream hostname and strict bounded input; no arbitrary user URL.
   const safeName=x=>/^[\p{L}\p{M}\p{N} .&'’\-]{2,80}$/u.test(x)&&!/[<>]/.test(x);
   if(!dateOk(date)||!safeName(home)||!safeName(away))return send(res,400,{error:'查詢日期或球隊名稱無效'});
   const fixtureName=home.trim().replace(/\s+/g,'_')+'_vs_'+away.trim().replace(/\s+/g,'_');
   const target='https://www.thesportsdb.com/api/v1/json/123/searchevents.php?e='+encodeURIComponent(fixtureName)+'&d='+encodeURIComponent(date);
   try{
     const up=await cachedRemoteGet(target,5*60*1000);
     return send(res,up.status===200?200:502,{
       provider:'tsdb_search',upstreamStatus:up.status,requestUrl:target,
       receivedAt:new Date().toISOString(),data:up.data
     });
   }catch(e){return send(res,502,{provider:'tsdb_search',error:String(e.message||e)})}
 }
 if(route.pathname==='/api/fifa-rankings'&&req.method==='GET'){
  try{return send(res,200,await currentFifaRankingSnapshot())}
  catch(error){return send(res,503,{error:String(error.message||error),
    source:'FotMob — FIFA Men World Ranking',ranksUnavailable:true})}
 }
 if(route.pathname==='/api/match-section'&&req.method==='GET'){
  const league=route.searchParams.get('league'),event=route.searchParams.get('event')||'';
  const section=route.searchParams.get('section');
  if(!ALLOWED.has(league)||!/^\d{4,14}$/.test(event)||!['preview','lineup','h2h','prediction'].includes(section))
   return send(res,400,{error:'比賽詳情參數不正確'});
  const get=async(target,ttl)=>{
   try{const upstream=await cachedRemoteGet(target,ttl);return upstream.status===200?upstream.data:null}
   catch{return null}
  };
  const data=await require('./match-preview').matchSection(league,event,section,get);
  return send(res,data?200:502,data||{error:'賽事資料暫時無法取得'});
 }
 if(route.pathname==='/api/match-summary'&&req.method==='GET'){
   const league=route.searchParams.get('league');
   const event=String(route.searchParams.get('event')||'');
   if(!ALLOWED.has(league)||!/^\d{4,14}$/.test(event))
     return send(res,400,{error:'賽事識別碼或聯賽代碼不正確'});
   const target='https://site.api.espn.com/apis/site/v2/sports/soccer/'+encodeURIComponent(league)+'/summary?event='+event;
   try{
     const up=await cachedRemoteGet(target,45*1000);
     return send(res,up.status===200?200:502,{
       provider:'ESPN',upstreamStatus:up.status,receivedAt:new Date().toISOString(),
       data:up.data
     });
   }catch(error){
     return send(res,502,{provider:'ESPN',error:String(error.message||error)});
   }
 }
 // A single browser request replaces 2 x N scoreboard requests. This prevents
 // the per-visitor rate limiter from dropping matches on broad schedule dates.
 if(route.pathname==='/api/fixtures/batch'&&req.method==='POST'){
   let raw='';
   try{
     for await(const chunk of req){
       raw+=chunk;
       if(raw.length>MAX_BODY)throw Error('查詢清單過大');
     }
   }catch{return send(res,413,{error:'查詢清單過大'})}
   let input;
   try{input=JSON.parse(raw)}catch{return send(res,400,{error:'JSON 格式錯誤'})}
   const day=input?.day,leagues=input?.leagues;
   if(!dateOk(day)||!Array.isArray(leagues)||leagues.length<1||leagues.length>60||
      new Set(leagues).size!==leagues.length||leagues.some(code=>typeof code!=='string'||!ALLOWED.has(code)))
     return send(res,400,{error:'日期或聯賽查詢清單不正確'});
   const prior=new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10);
   const queries=leagues.flatMap(league=>[prior,day].map(date=>({league,date})));
   const results=new Array(queries.length);
   let cursor=0;
   async function worker(){
     for(;;){
       const index=cursor++;
       if(index>=queries.length)break;
       const {league,date}=queries[index];
       const target='https://site.api.espn.com/apis/site/v2/sports/soccer/'+encodeURIComponent(league)+'/scoreboard?dates='+date.replaceAll('-','');
       try{
         const up=await cachedRemoteGet(target,scoreboardTtl(date));
         results[index]={league,date,upstreamStatus:up.status,
           events:up.status===200&&Array.isArray(up.data?.events)?up.data.events:[],
           ...(up.status!==200?{error:'來源 HTTP '+up.status}:{})};
       }catch(error){results[index]={league,date,upstreamStatus:0,events:[],error:String(error.message||error)}}
     }
   }
   await Promise.all(Array.from({length:Math.min(8,queries.length)},worker));
   return send(res,200,{day,results});
 }
 if(route.pathname==='/api/fixtures'&&req.method==='GET'){
   const provider=route.searchParams.get('provider'),league=route.searchParams.get('league'),date=route.searchParams.get('date');
   if(!dateOk(date))return send(res,400,{error:'日期無效'});
   let target;
   if(provider==='espn'&&ALLOWED.has(league))target='https://site.api.espn.com/apis/site/v2/sports/soccer/'+encodeURIComponent(league)+'/scoreboard?dates='+date.replaceAll('-','');
   else if(provider==='tsdb')target='https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d='+encodeURIComponent(date)+'&s=Soccer';
   else return send(res,400,{error:'不支援的來源或聯賽'});
   try{const up=await cachedRemoteGet(target,scoreboardTtl(date));return send(res,up.status===200?200:502,{provider,requestUrl:target,upstreamStatus:up.status,bytes:up.bytes,receivedAt:new Date().toISOString(),data:up.data})}catch(e){return send(res,502,{provider,requestUrl:target,error:String(e.message||e)})}
 }
 if(route.pathname==='/api/football-data'&&req.method==='POST'){
   let raw='';try{for await(const chunk of req){raw+=chunk;if(raw.length>MAX_BODY)throw Error('輸入資料過大')}}catch(e){return send(res,413,{error:String(e.message||e)})}
   let p;try{p=JSON.parse(raw)}catch{return send(res,400,{error:'JSON 格式錯誤'})}
   if(!FD_ALLOWED.has(p.competition)||!dateOk(p.dateFrom)||!dateOk(p.dateTo)||typeof p.token!=='string'||p.token.length<6||p.token.length>300)return send(res,400,{error:'請求參數或 API 金鑰不正確'});
   const target='https://api.football-data.org/v4/competitions/'+p.competition+'/matches?dateFrom='+p.dateFrom+'&dateTo='+p.dateTo;
   try{const up=await remoteGet(target,{'X-Auth-Token':p.token});return send(res,up.status===200?200:502,{provider:'fd',requestUrl:target,upstreamStatus:up.status,bytes:up.bytes,receivedAt:new Date().toISOString(),data:up.data})}catch(e){return send(res,502,{provider:'fd',requestUrl:target,error:String(e.message||e)})}
 }
 return send(res,404,{error:'找不到 API 路徑'});
}
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/'))return await api(req,res,url);
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
  const safePath=path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]*\.\.[/\\])+/, '');
  const file=path.resolve(BASE,'.'+(safePath==='/'?'/home.html':safePath));
  if(!file.startsWith(BASE+path.sep))return send(res,403,{error:'Forbidden'});
  fs.readFile(file,(err,buf)=>{if(err)return send(res,404,{error:'Not found'});res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cache-control':/\.(?:html|css|js|json)$/i.test(file)?'no-cache, max-age=0, must-revalidate':'public, max-age=3600'});res.end(buf)});
 }catch(e){send(res,500,{error:'伺服器處理失敗',detail:String(e.message||e)})}
});
server.listen(PORT,'0.0.0.0',()=>{
 console.log('Fixture console listening on '+PORT);

 currentFifaRankingSnapshot().catch(err=>
  console.warn('[fifa] ranking data unavailable:',String(err.message||err)));
 if(process.env.FOOTBALL_REPORT_FEED_URL)currentReports().then(feed=>{
  if(feed.connected)console.log('[football] Google Apps Script sync confirmed:',JSON.stringify({reports:feed.reports.length,newestDate:feed.reports[0]?.date||null}));
  else console.warn('[football] Google Apps Script sync not confirmed:',feed.syncError||'來源未連線');
 });
});
