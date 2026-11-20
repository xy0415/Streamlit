'use strict';

function timestamp(value){
 const clock=String(value||'').trim().replace(' ','T').replace(/T(\d):/,'T0$1:');
 return clock?Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(clock)?clock:clock+'+08:00'):NaN;
}

function snapshotKey(pick){
 return JSON.stringify([pick.date,pick.time,pick.home,pick.away,pick.market,pick.group||'串關單']);
}

function kickoffTime(pick){
 return timestamp(pick.date+'T'+pick.time);
}

function priceQuote(row,kickoff,now){
 const time=timestamp(row.capturedAt),price=Number(row.price);
 const source=String(row.source||'').trim();
 if(!Number.isFinite(time)||!(time<kickoff)||time>now||!Number.isFinite(price)||price<=1||!source)return null;
 const book=String(row.book||source).toLowerCase().replace(/[^a-z0-9]/g,'')||source.toLowerCase();
 return {book,source,price,capturedAt:new Date(time).toISOString()};
}

function collectSnapshot(report,pick,previous,quotes,now=Date.now()){
 const kickoff=kickoffTime(pick);
 const released=timestamp(report.publishedAt||report.sentAt);
 if(!previous&&!(released<kickoff&&released<=now))return null;
 const rawProbability=pick.probability;
 const probability=rawProbability==null||rawProbability===''?null:Number(rawProbability);
 const row=previous?{...previous,books:{...previous.books}}:{
  market:pick.market,group:pick.group||'串關單',probability:Number.isFinite(probability)&&probability>=0&&probability<=100?probability:null,
  probabilityType:pick.probabilityType||'命中',publishedAt:new Date(released).toISOString(),
  original:null,books:{}
 };
 const published=Date.parse(row.publishedAt);
 const original=priceQuote({price:pick.publishedOdds,source:pick.publishedOddsSource,capturedAt:pick.publishedOddsAt},kickoff,now);
 if(!row.original&&original&&Date.parse(original.capturedAt)<=published)row.original=original;
 for(const value of quotes){
  const quote=priceQuote(value,kickoff,now);
  if(!quote)continue;
  const {capturedAt,book}=quote;
  const current=Object.hasOwn(row.books,book)?{...row.books[book]}:{};
  if(capturedAt<=row.publishedAt&&(!current.baseline||capturedAt>current.baseline.capturedAt))current.baseline=quote;
  if(capturedAt>row.publishedAt&&(!current.first||capturedAt<current.first.capturedAt))current.first=quote;
  if(capturedAt>row.publishedAt&&(!current.latest||capturedAt>current.latest.capturedAt))current.latest=quote;
  Object.defineProperty(row.books,book,{value:current,enumerable:true,writable:true,configurable:true});
 }
 return row;
}

module.exports={snapshotKey,kickoffTime,collectSnapshot};
