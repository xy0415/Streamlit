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
