'use strict';

const cache=new Map();
let quotaBlockedUntil=0;
async function request(path,params,ttl){
 const key=process.env.ODDSPAPI_KEY;
 if(!key||Date.now()<quotaBlockedUntil)return null;
 const id=path+JSON.stringify(params), old=cache.get(id);
 if(old&&old.until>Date.now())return old.promise;
 const url=new URL('https://api.oddspapi.io/v4/'+path);
 for(const [name,value] of Object.entries({...params,apiKey:key}))url.searchParams.set(name,String(value));
 const promise=fetch(url,{signal:AbortSignal.timeout(12000)}).then(async response=>{
  if(response.status===429){quotaBlockedUntil=Date.now()+60*60*1000;return null}
  if(!response.ok)throw Error('OddsPapi HTTP '+response.status);
  return response.json();
 }).catch(()=>{cache.delete(id);return null});
 cache.set(id,{until:Date.now()+ttl,promise});
 return promise;
}
function nameKey(value){
 const name=String(value||'').normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/[^a-z0-9]+/g,' ').trim()
  .replace(/^(?:fc|sc|afc|rcd|1 fc) /,'').replace(/ (?:fc|sc|afc)$/,'');
 const aliases={'athletic club':'athletic bilbao','espanyol barcelona':'espanyol','tottenham hotspur':'tottenham',
  'newcastle united':'newcastle','ajax amsterdam':'ajax',
  'bayern munchen':'bayern munich','koln':'cologne','ipswich town':'ipswich'};
 return aliases[name]||name;
}
async function reportQuotes(report,picks,selection){
 const now=Date.now(), upcoming=picks.filter(p=>Date.parse(p.date+'T'+p.time+':00+08:00')>now);
 if(!upcoming.length||!process.env.ODDSPAPI_KEY)return {};
 const from=new Date(report.date+'T00:00:00+08:00').toISOString();
 const to=new Date(Date.parse(from)+86400000).toISOString();
 const [fixtures,markets]=await Promise.all([
  request('fixtures',{sportId:10,from,to},5*60000),request('markets',{sportId:10,language:'en'},24*3600000)
 ]);
 if(!Array.isArray(fixtures)||!Array.isArray(markets))return {};
 const result={};
 const events=new Map();
 for(const pick of upcoming){
  const kickoff=Date.parse(pick.date+'T'+pick.time+':00+08:00');
  const matches=fixtures.filter(f=>Math.abs(Date.parse(f.startTime)-kickoff)<=3600000&&
   [f.participant1Name,f.participant1ShortName].some(n=>nameKey(n)===nameKey(pick.home))&&
   [f.participant2Name,f.participant2ShortName].some(n=>nameKey(n)===nameKey(pick.away)));
  if(matches.length!==1)continue;
  const id=matches[0].fixtureId;
  if(!events.has(id))events.set(id,[]);
  events.get(id).push(pick);
 }
 // OddsPapi allows one odds request per 500 ms.
 for(const [id,items] of events){
  const data=await request('odds',{fixtureId:id,bookmakers:'1xbet',verbosity:3},60000);
  const book=data?.bookmakerOdds?.['1xbet'];
  if(book){
   for(const pick of items){
    const wanted=selection(pick);
    const types={winner:'1x2',double:'doublechance',totals:'totals',btts:'bothteamsscore',handicap:'spreads'};
    const names={winner:{home:'1',draw:'X',away:'2'},double:{home:'1X',away:'2X'},totals:{over:'Over',under:'Under'},btts:{yes:'Yes',no:'No'},handicap:{home:'1',away:'2'}};
    const expected=names[wanted?.market]?.[wanted?.side];
    const candidates=markets.filter(m=>m.period==='fulltime'&&m.marketType===types[wanted?.market]&&
     (wanted.line===undefined||Number(m.handicap)===(wanted.market==='handicap'&&wanted.side==='away'?-wanted.line:wanted.line)));
    const quotes=[];
    for(const market of candidates){
     const outcome=market.outcomes?.find(o=>o.outcomeName===expected);
     const value=book.markets?.[market.marketId]?.outcomes?.[outcome?.outcomeId]?.players?.['0'];
     const at=Date.parse(value?.changedAt), kickoff=Date.parse(pick.date+'T'+pick.time+':00+08:00');
     if(value?.active!==true||!Number.isFinite(at)||at>=kickoff||at>now||!(Number(value.price)>1))continue;
     quotes.push({book:'1xbet',source:'1xBet',price:Number(value.price),capturedAt:new Date(at).toISOString(),kind:'prematch',provider:'OddsPapi'});
    }
    if(quotes.length===1)result[pick.id]=quotes;
   }
  }
  await new Promise(resolve=>setTimeout(resolve,520));
 }
 return result;
}
module.exports={reportQuotes,nameKey};
