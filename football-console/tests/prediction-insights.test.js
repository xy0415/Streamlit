'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parsePublishedCards,includePublishedCards}=require('../report-cards');

const ctx={window:{location:{origin:'https://example.test'}},URL};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/prediction-insights.js'),'utf8'),ctx);
const insights=ctx.window.FXIPredictionInsights;
const date='2026-11-19';
const match={date,home:'Coritiba',away:'Santos',time:'06:30'};

test('FXI match links preserve the match identity and selected tab',()=>{
 const url=new URL(insights.matchLink(match,'predictions','snapshot'));
 const decoded=insights.readMatchLink(url.searchParams);
 assert.equal(url.hash,'#predictions');
 assert.equal(url.searchParams.get('day'),date);
 assert.equal(decoded.home,match.home);
 assert.equal(decoded.away,match.away);
 assert.equal(decoded.time,match.time);
 assert.equal(decoded.tab,'snapshot');
 assert.equal(insights.readMatchLink(new URLSearchParams({match:'["Coritiba","Santos","46:00"]'})),null);
});

test('Market grouping preserves the difference between totals, handicaps and double chance',()=>{
 assert.equal(insights.marketType('西悉尼流浪者不敗（主勝或和局）'),'double');
 assert.equal(insights.marketType('主隊亞洲讓球 -0.25'),'handicap');
 assert.equal(insights.marketType('全場 小 3.5'),'totals');
 assert.equal(insights.marketType('雙方進球：否'),'both');
 assert.equal(insights.marketType('全場角球大 8.5'),'other');
});

test('Only an observed price no later than publication produces a return',()=>{
 const row={publishedOdds:1.92,publishedOddsSource:'原始來源',publishedOddsAt:'2026-11-19 12:10:00'};
 assert.equal(insights.originalOdds(row,'2026-11-19 12:11:00').price,1.92);
 assert.equal(insights.originalOdds(row,'2026-11-19 04:11:00Z').price,1.92);
 assert.equal(insights.originalOdds(row,'2026-11-19 12:00:00'),null);
 assert.equal(insights.originalOdds({...row,publishedOddsSource:''},'2026-11-19 12:11:00'),null);
 assert.equal(insights.unitReturn('push',1.92),0);
 assert.equal(insights.unitReturn('halfloss',1.92),-.5);
 assert.equal(insights.unitReturn('halfwin',1.8),.4);
});

test('Structured details from the published card augment an already imported forecast',()=>{
 const text=[
  '分析日期：'+date,'### 🎯｜串關單','① 06:30｜巴甲','**Coritiba（科里蒂巴）vs Santos（桑托斯）**',
  '全場總進球小 3.5｜估計命中機率 79%','主要依據：已發布內容','主要變數：已發布變數',
  '發布賠率：1.92｜來源：原始來源｜擷取時間：2026-11-19 04:10:00+08:00'
 ].join('\n');
 const [original]=parsePublishedCards(text,date);
 const [withFinal]=includePublishedCards(text,date,[{...match,market:original.market,verified:true}]);
 assert.equal(withFinal.analysis,'已發布內容');
 assert.equal(withFinal.risk,'已發布變數');
 assert.equal(withFinal.publishedOdds,1.92);
 assert.equal(withFinal.verified,true);
});
