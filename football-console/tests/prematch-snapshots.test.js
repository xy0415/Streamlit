'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const {collectSnapshot}=require('../prematch-snapshots');

const report={publishedAt:'2026-11-20 16:00'};
const pick={date:'2026-11-20',time:'20:00',market:'全場大 2.5',probability:72};
const now=Date.parse('2026-11-20T21:00:00+08:00');
const quote=(time,price,book='1xbet')=>({capturedAt:'2026-11-20T'+time+'+08:00',price,source:book});
const collect=(quotes,previous=null,selection=pick)=>collectSnapshot(report,selection,previous,quotes,now);

test('separates quotes by provider and publication time and excludes in-play quotes',()=>{
 const result=collect([
  quote('14:00',1.96),quote('15:58',1.91),quote('17:11',1.80),quote('18:00',1.78),
  quote('19:00',1.90,'Pinnacle'),quote('20:00',1.30),quote('20:20',1.25),
 ]);
 assert.equal(result.original,null);
 assert.equal(result.books['1xbet'].baseline.price,1.91);
 assert.equal(result.books['1xbet'].first.price,1.80);
 assert.equal(result.books['1xbet'].latest.price,1.78);
 assert.equal(result.books.pinnacle.latest.price,1.90);
});

test('retains original pick and odds when adding later observations',()=>{
 const initial=collect([],null,{...pick,publishedOdds:1.96,publishedOddsSource:'1xBet',publishedOddsAt:'2026-11-20 15:58'});
 const updated=collect([quote('19:50',1.8)],initial,
  {...pick,probability:94,publishedOdds:1.86,publishedOddsSource:'1xBet',publishedOddsAt:'2026-11-20 15:59'});
 assert.equal(updated.probability,72);
 assert.equal(updated.original.price,1.96);
 assert.equal(updated.books['1xbet'].latest.price,1.8);
 assert.deepEqual(initial.books,{});
});

test('rejects reports and undated odds that cannot be verified as pre-match',()=>{
 assert.equal(collectSnapshot({publishedAt:'2026-11-20 20:00'},pick,null,[],now),null);
 assert.equal(collect([],null,{...pick,publishedOdds:1.96,publishedOddsSource:'1xBet'}).original,null);
});

test('restores saved pre-match quotes without replacing current providers or accepting in-play records',()=>{
 const {mergeArchivedQuotes,snapshotKey}=require('../prematch-snapshots');
 const match={...pick,id:'selection-1',home:'A',away:'B'};
 const saved={snapshots:{[snapshotKey(match)]:{books:{
  '1xbet':{latest:quote('19:30',1.9),first:quote('17:11',1.8)},
  'bet365':{latest:quote('20:30',2.0,'bet365')}
 }}}};
 const result=mergeArchivedQuotes({matches:[match]},{status:'partial',legs:{'selection-1':[
  {book:'pinnacle',source:'Pinnacle',price:1.8,capturedAt:quote('19:00',1.8).capturedAt}
 ]}},saved,now);
 assert.deepEqual(result.legs['selection-1'].map(q=>q.book),['pinnacle','1xbet']);
 assert.equal(result.legs['selection-1'][1].price,1.9);
 const existing={book:'1xbet',source:'1xBet',price:1.7};
 assert.equal(mergeArchivedQuotes({matches:[match]},{legs:{'selection-1':[existing]}},saved,now).legs['selection-1'][0],existing);
});


test('preserves verifiable provider and source URL through saved snapshots',()=>{
 const {collectSnapshot,mergeArchivedQuotes,snapshotKey}=require('../prematch-snapshots');
 const report={publishedAt:'2026-11-23T08:00:00Z'};
 const pick={id:'x',date:'2026-11-24',time:'04:00',home:'A',away:'B',market:'Over 1.5'};
 const quote={book:'1xbet',source:'1xBet',provider:'OddsPapi',url:'https://example.com/match',price:1.5,capturedAt:'2026-11-23T09:00:00Z'};
 const saved=collectSnapshot(report,pick,null,[quote],Date.parse('2026-11-23T10:00:00Z'));
 const restored=mergeArchivedQuotes({matches:[pick]},{legs:{}},{snapshots:{[snapshotKey(pick)]:saved}},Date.parse('2026-11-24T00:00:00Z'));
 assert.equal(restored.legs.x[0].provider,'OddsPapi');
 assert.equal(restored.legs.x[0].url,'https://example.com/match');
});
