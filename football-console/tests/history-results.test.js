'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveReport}=require('../history-results');
const {evaluate}=require('../public/history-engine');

test('historical reconciliation looks up both dates and only settles corroborated finals',async()=>{
 const m={id:'test',date:'2026-12-02',time:'08:30',home:'Example Home',away:'Example Away',
  league:'巴甲',market:'全場總進球大 1.5'};
 const date='2026-12-02T00:30:00Z',calls=[];
 const get=async url=>{
  calls.push(url);
  if(url.includes('fotmob'))return {leagues:[{matches:[{id:10001,
   status:{utcTime:date,finished:true},home:{name:m.home,score:2},away:{name:m.away,score:0}}]}]};
  if(!url.endsWith('20261201'))return {events:[]};
  return {events:[{id:10002,date,competitions:[{
   status:{type:{name:'STATUS_FULL_TIME'}},
   competitors:[{homeAway:'home',team:{displayName:m.home},score:'2'},
    {homeAway:'away',team:{displayName:m.away},score:'0'}]}]}]};
 };
 const now=Date.parse('2026-12-02T10:00:00Z');
 const result=await resolveReport({matches:[m]},get,now);
 assert.ok(calls.some(url=>url.endsWith('20261201')));
 assert.ok(calls.some(url=>url.endsWith('20261202')));
 assert.equal(result.test.grade,'win');
 assert.equal(result.test.status,'settled');
 assert.equal((await resolveReport({matches:[m]},get,Date.parse(date)-1)).test.status,'upcoming');
});

test('settles team totals and common published team name variants',()=>{
 assert.equal(evaluate({home:'Mainz 05',away:'Bayern Munich',awayZh:'拜仁慕尼黑',
  market:'拜仁慕尼黑球隊進球大1.5'},1,2),'win');
 assert.equal(evaluate({home:'Trival',away:'Leganés',awayZh:'萊加內斯足球俱樂部',
  market:'萊加內斯獲勝'},0,1),'win');
});

test('settles Bayern vs Cologne when the two sources use different club names',async()=>{
 const m={id:'bayern',date:'2026-11-21',time:'03:30',league:'德甲',home:'Bayern München',homeZh:'拜仁慕尼黑',away:'1. FC Köln',awayZh:'科隆',market:'拜仁慕尼黑獲勝'};
 const date='2026-11-20T19:30:00Z';
 const get=async url=>url.includes('fotmob')?{leagues:[{matches:[{id:12,status:{utcTime:date,finished:true},home:{name:'Bayern München',score:1},away:{name:'1. FC Köln',score:1}}]}]}:
 {events:url.endsWith('20261120')?[{id:'401884736',date,competitions:[{status:{type:{name:'STATUS_FULL_TIME'}},competitors:[{homeAway:'home',team:{displayName:'Bayern Munich'},score:'1'},{homeAway:'away',team:{displayName:'FC Cologne'},score:'1'}]}]}]:[]};
 const result=(await resolveReport({matches:[m]},get,Date.parse('2026-11-22T00:00:00Z'))).bayern;
 assert.equal(result.verified,true);assert.equal(result.status,'settled');assert.equal(result.grade,'loss');
 assert.equal(result.h,1);assert.equal(result.a,1);assert.match(result.source,/ESPN.*FotMob/);
});

test('a conflicting final score remains unresolved instead of corrupting backtests',async()=>{
 const m={id:'conflict',date:'2026-11-21',time:'03:30',league:'德甲',home:'Bayern München',homeZh:'拜仁慕尼黑',away:'1. FC Köln',awayZh:'科隆',market:'拜仁慕尼黑獲勝'};
 const date='2026-11-20T19:30:00Z';
 const get=async url=>url.includes('fotmob')?{leagues:[{matches:[{id:12,status:{utcTime:date,finished:true},home:{name:m.home,score:2},away:{name:m.away,score:1}}]}]}:
 {events:[{id:'401884736',date,competitions:[{status:{type:{name:'STATUS_FULL_TIME'}},competitors:[{homeAway:'home',team:{displayName:'Bayern Munich'},score:'1'},{homeAway:'away',team:{displayName:'FC Cologne'},score:'1'}]}]}]};
 const result=(await resolveReport({matches:[m]},get,Date.parse('2026-11-22T00:00:00Z'))).conflict;
 assert.equal(result.status,'conflict');assert.equal(result.grade,undefined);
});

test('recent archived results are checked again and conflicting corrections are not settled',async()=>{
 const m={id:'archived',date:'2026-11-20',time:'06:30',league:'巴甲',home:'Vasco da Gama',away:'Internacional',market:'全場總進球大 1.5'};
 const date='2026-11-19T22:30:00Z',calls=[];
 const get=async url=>{
  calls.push(url);
  if(url.includes('fotmob'))return {leagues:[{matches:[{id:99,status:{utcTime:date,finished:true},home:{name:m.home,score:1},away:{name:m.away,score:1}}]}]};
  return {events:[{id:'401841308',date,competitions:[{status:{type:{name:'STATUS_FULL_TIME'}},competitors:[{homeAway:'home',team:{displayName:m.home},score:'1'},{homeAway:'away',team:{displayName:m.away},score:'1'}]}]}]};
 };
 const result=(await resolveReport({matches:[m]},get,Date.parse('2026-11-21T18:00:00Z'))).archived;
 assert.equal(result.status,'conflict');assert.ok(calls.length>0);
});
