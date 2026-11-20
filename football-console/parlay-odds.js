'use strict';

const apiFootball=require('./api-football');
const {selection}=require('./public/history-engine');
const {tipsterQuotes}=require('./tipster-odds');
const archive=require('./parlay-odds-archive.json');
const oddspapi=require('./oddspapi');

const books=new Map([
 ['1xbet','1xBet'],['pinnacle','Pinnacle'],['bet365','Bet365'],
 ['williamhill','William Hill'],['betfair','Betfair'],['unibet','Unibet']
]);
const aliases={
 'western sydney wanderers':'western sydney','ws wanderers':'western sydney',
 'atletico mg':'atletico mineiro','atletico pr':'athletico paranaense','athletico pr':'athletico paranaense',
 'czechia':'czech republic','turkiye':'turkey','republic of ireland':'ireland',
 'north macedonia':'macedonia','northern ireland':'north ireland',
 'inter milan':'inter','internazionale':'inter','paris saint germain':'psg',
 'manchester utd':'manchester united'
};

function teamKey(name){
 const clean=String(name||'').normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'')
  .replace(/[^a-z0-9]+/g,' ').trim();
 const stripped=clean.replace(/^(?:fc|cr|sc|ec) | (?:fc|cr|sc|ec|rj|sp|rs|pa|pr|mg|ba)$/g,'');
 return aliases[clean]||aliases[stripped]||stripped;
}

function matchFixture(pick,fixtures){
 const target=Date.parse(pick.date+'T'+pick.time+':00+08:00');
 const home=teamKey(pick.home),away=teamKey(pick.away);
 if(!home||!away)return null;
 const matches=fixtures.filter(f=>f.date===pick.date&&teamKey(f.home)===home&&teamKey(f.away)===away&&
  Math.abs(Date.parse(f.utc)-target)<=60*60*1000);
 return matches.length===1?matches[0]:null;
}

function matchPrice(bet,pick){
 const names={
  winner:['match winner'],double:['double chance'],handicap:['asian handicap'],
  totals:['goals over/under'],btts:['both teams score','both teams to score']
 };
 if(!names[pick.market].includes(String(bet.name||'').trim().toLowerCase()))return null;
 const values={home:['home'],away:['away'],draw:['draw'],yes:['yes'],no:['no'],over:['over'],under:['under']};
 const sides=pick.market==='double'?
  pick.side==='home'?['home/draw','home or draw','1x']:['draw/away','draw or away','away/draw','x2']:
  values[pick.side];
 const prices=new Set();
 for(const row of bet.values||[]){
  const value=String(row.value||'').trim().toLowerCase().replace(/\s*\/\s*/g,'/');
  const match=value.match(/^(.+?)\s+([+-]?\d+(?:\.\d+)?)$/);
  if(pick.line===undefined?!sides.includes(value):(!match||!sides.includes(match[1])||Number(match[2])!==pick.line))continue;
  const price=Number(row.odd);
  if(Number.isFinite(price)&&price>1)prices.add(price);
 }
 return prices.size===1?[...prices][0]:null;
}

function quotesFor(rows,pick,kickoff,latest=false){
 const chosen=new Map();
 for(const row of rows){
  const observed=Date.parse(row.update);
  if(!Number.isFinite(observed)||observed>=Date.parse(kickoff))continue;
  for(const book of row.bookmakers||[]){
   const key=String(book.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
   if(!books.has(key))continue;
   const matches=(book.bets||[]).map(bet=>matchPrice(bet,pick)).filter(x=>x!==null);
   if(new Set(matches).size!==1)continue;
   const old=chosen.get(key);
   if(!old||(latest?observed>Date.parse(old.capturedAt):observed<Date.parse(old.capturedAt)))chosen.set(key,{
    book:key,source:books.get(key),price:matches[0],capturedAt:new Date(observed).toISOString(),kind:'prematch'
   });
  }
 }
 return [...books.keys()].map(key=>chosen.get(key)).filter(Boolean);
}

function taiwanDay(){
 return new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10);
}

function archiveKey(p){
 return [p.date,p.time,p.home,p.away,p.market,p.group].join('|');
}

async function reportOdds(report,provider=apiFootball,publicQuotes=tipsterQuotes,latest=false){
 const days=(Date.parse(taiwanDay())-Date.parse(report.date))/86400000;
 const picks=(report.matches||[]).filter(p=>p.id&&selection(p)&&(!latest||Date.parse(p.date+'T'+p.time+':00+08:00')>Date.now()));
 const legs={},scores={};
 for(const pick of picks){
  const record=latest?null:archive[archiveKey(pick)];
  if(!record)continue;
  legs[pick.id]=[...books.keys()].filter(book=>record.prices[book]).map(book=>({
   book,source:books.get(book),price:record.prices[book],capturedAt:record.capturedAt,kind:'prematch',url:record.url
  }));
  if(record.score)scores[pick.id]={h:record.score[0],a:record.score[1]};
 }
 if(days< -2)return {status:'outside_window',legs,scores};
 const liveQuotes=await oddspapi.reportQuotes(report,picks.filter(p=>!legs[p.id]?.length),selection);
 for(const [id,quotes] of Object.entries(liveQuotes))legs[id]=quotes;
 const missing=picks.filter(p=>!legs[p.id]?.length);
 for(let i=0;i<missing.length;i+=4){
  await Promise.all(missing.slice(i,i+4).map(async pick=>{
   const quotes=await publicQuotes(pick,selection(pick),teamKey,books,latest);
   if(quotes.length)legs[pick.id]=quotes;
  }));
 }
 const unmatched=picks.filter(p=>!legs[p.id]?.length);
 if(!unmatched.length)return {status:'ready',legs,scores};
 if(days>7)return {status:'ready',legs,scores};
 const fixtures=await provider.getFixtures(report.date);
 if(!fixtures.ok)return {
  status:fixtures.reason==='free_quota_reserved_or_rate_limited'?'rate_limited':
   Object.keys(legs).length?'partial':'unavailable',legs,scores
 };
 let rateLimited=false,incomplete=false;
 for(let i=0;i<unmatched.length;i+=3){
  await Promise.all(unmatched.slice(i,i+3).map(async p=>{
   const fixture=matchFixture(p,fixtures.fixtures);
   if(!fixture)return;
   const odds=await provider.getFixtureOdds(fixture.apiFixtureId);
   if(!odds.ok)incomplete=true;
   if(odds.reason==='quota')rateLimited=true;
   const quotes=quotesFor(odds.rows,selection(p),fixture.utc,latest);
   if(quotes.length)legs[p.id]=quotes;
  }));
  if(rateLimited)break;
 }
 return {status:rateLimited?'rate_limited':incomplete?'partial':'ready',legs,scores};
}

module.exports={reportOdds,matchFixture,quotesFor,teamKey};
