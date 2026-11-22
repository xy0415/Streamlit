'use strict';
const {compatible}=require('./public/team-identity');

const https=require('node:https');
const origin='https://tipsterarea.com';
const requests=new Map();
const decode=text=>String(text||'').replace(/<[^>]+>/g,'').replace(/&(?:amp|#38);/g,'&')
 .replace(/&(?:apos|#39);/g,"'").replace(/&nbsp;/g,' ').trim();

function page(path,ttl,refresh=false){
 const key=(refresh?'recent:':'')+path;
 const now=Date.now();
 const cached=requests.get(key);
 if(cached?.until>now)return cached.promise;
 const promise=new Promise((resolve,reject)=>{
  const request=https.get(origin+path,{timeout:6500,headers:{'user-agent':'FXI football data lookup'}},response=>{
   if(response.statusCode!==200){
    response.resume();
    reject(Error('Odds source HTTP '+response.statusCode));
    return;
   }
   let body='';
   response.setEncoding('utf8');
   response.on('data',chunk=>{
    body+=chunk;
    if(body.length>1500000)request.destroy(Error('Odds source page too large'));
   });
   response.on('end',()=>resolve(body));
   response.on('error',reject);
  });
  request.on('timeout',()=>request.destroy(Error('Odds source timeout')));
  request.on('error',reject);
 }).catch(()=>{
  requests.delete(key);
  return '';
 });
 requests.set(key,{until:now+ttl,promise});
 if(requests.size>140)requests.delete(requests.keys().next().value);
 return promise;
}

function matchingPath(html,pick,kickoff,teamKey){
 const matches=new Set();
 for(const [,path,body] of html.matchAll(/<a class="game" href="(\/match\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g)){
  const home=decode(body.match(/<span class="home">([\s\S]*?)<span class="(?:score|away)"/)?.[1]);
  const away=decode(body.match(/<span class="away">([\s\S]*?)<\/span>\s*<\/span>\s*<\/span>/)?.[1]);
  if(compatible(home,pick.home)&&compatible(away,pick.away)&&teamKey(home)===teamKey(pick.home)&&teamKey(away)===teamKey(pick.away)&&
   body.match(/<span class="time[^"]*"[^>]*>\s*(\d{2}:\d{2})/)?.[1]===kickoff.slice(11,16))matches.add(path);
 }
 return matches.size===1?[...matches][0]:null;
}

function parsePage(html,path,pick,kickoff,books){
 if(html.match(/itemprop="startDate" content="([^"]+)"/)?.[1]!==kickoff.slice(0,16))return [];
 const stamp=html.match(/last update (\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2})/);
 if(!stamp)return [];
 const capturedAt=stamp[3]+'-'+stamp[2]+'-'+stamp[1]+'T'+stamp[4]+':00Z';
 if(!(Date.parse(capturedAt)<Date.parse(kickoff)))return [];
 const chosen=new Map(),conflicts=new Set();
 const labels={totals:'Over/Under',double:'Double Chance',winner:'Standard 1X2',btts:'BTS'};
 const oddsSection=html.slice(0,stamp.index);
 for(const [,table] of oddsSection.matchAll(/<table class="odds">([\s\S]*?)<\/table>/g)){
  const label=decode(table.match(/<th class="odds-type"[^>]*>([^<]+)<\/th>/)?.[1]);
  if(!labels[pick.market]||label!==labels[pick.market])continue;
  for(const [,row] of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)){
   const source=decode(row.match(/class="bookie"[^>]*alt="([^"]+)"/)?.[1]);
   const key=source.toLowerCase().replace(/[^a-z0-9]/g,'');
   if(!key)continue;
   const values=[...row.matchAll(/<td class="(center|odd)(?: [^"]*)?"[^>]*>([\s\S]*?)<\/td>/g)];
   if(pick.market==='totals'&&Number(decode(values.find(value=>value[1]==='center')?.[2]))!==pick.line)continue;
   const columns={over:1,under:0,home:0,away:2,draw:1,yes:0,no:1};
   const price=Number(decode(values.filter(value=>value[1]==='odd')[columns[pick.side]]?.[2]));
   if(!Number.isFinite(price)||price<=1)continue;
   const old=chosen.get(key);
   if(old&&old.price!==price)conflicts.add(key);
   else chosen.set(key,{book:key,source:books.get(key)||source,price,capturedAt,kind:'prematch',url:origin+path});
  }
 }
 return [...chosen.values()].filter(q=>!conflicts.has(q.book)).sort((a,b)=>Number(b.book==='1xbet')-Number(a.book==='1xbet'));
}

async function tipsterQuotes(pick,selection,teamKey,books,refresh=false){
 if(selection.market==='handicap')return [];
 const local=Date.parse(pick.date+'T'+pick.time+':00+08:00');
 if(!Number.isFinite(local))return [];
 const kickoff=new Date(local).toISOString();
 const day=kickoff.slice(0,10).split('-').reverse().join('-');
 const ttl=refresh?120000:local<Date.now()-4*60*60*1000?8*60*60*1000:2*60*1000;
 const listing=await page('/matches-hour/date-'+day,ttl,refresh);
 const path=matchingPath(listing,pick,kickoff,teamKey);
 return path?parsePage(await page(path,ttl,refresh),path,selection,kickoff,books):[];
}

module.exports={tipsterQuotes,matchingPath,parsePage};
