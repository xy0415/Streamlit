'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

test('OddsPapi collects multiple books for the exact prematch line',async()=>{
 const oldKey=process.env.ODDSPAPI_KEY,oldFetch=global.fetch;
 process.env.ODDSPAPI_KEY='test';
 const date=new Date(Date.now()+86400000+8*3600000).toISOString().slice(0,10);
 const kickoff=Date.parse(date+'T20:00:00+08:00');
 const changedAt=new Date(Date.now()-10000).toISOString();
 const seen=[];
 global.fetch=async url=>{
  const u=new URL(url);seen.push(u);
  let data;
  if(u.pathname.endsWith('/fixtures'))data=[{fixtureId:'fixture',startTime:new Date(kickoff).toISOString(),participant1Name:'Ajax',participant2Name:'Thun'}];
  else if(u.pathname.endsWith('/markets'))data=[{marketId:'m',period:'fulltime',marketType:'totals',handicap:2.5,outcomes:[{outcomeName:'Over',outcomeId:'o'}]}];
  else data={bookmakerOdds:Object.fromEntries([['1xbet',1.7],['pinnacle',1.8],['bad',1.9]].map(([b,price])=>[b,{markets:{m:{outcomes:{o:{players:{'0':{active:true,price,changedAt:b==='bad'?new Date(kickoff+1000).toISOString():changedAt}}}}}}}]))};
  return {ok:true,json:async()=>data};
 };
 try{
  const {reportQuotes}=require('../oddspapi');
  const result=await reportQuotes({date},[{id:'x',date,time:'20:00',home:'Ajax',away:'Thun'}],()=>({market:'totals',side:'over',line:2.5}));
  assert.deepEqual(result.x.map(q=>q.book).sort(),['1xbet','pinnacle']);
  assert.equal(result.x.find(q=>q.book==='pinnacle').price,1.8);
  assert.equal(seen.find(u=>u.pathname.endsWith('/odds')).searchParams.has('bookmakers'),false);
 }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.ODDSPAPI_KEY;else process.env.ODDSPAPI_KEY=oldKey;}
});
