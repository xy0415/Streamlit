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
 assert.equal(insights.marketType('全場角球大 8.5'),'corners');
 assert.equal(insights.marketType('拜仁慕尼黑球隊進球大1.5'),'teamTotals');
 assert.equal(insights.marketType('雙方都有進球：是'),'both');
 assert.equal(insights.marketLabel(insights.marketType('兩隊各至少一張黃牌')),'牌數');
 assert.equal(insights.marketLabel(insights.marketType('下半場最先進球')),'下半場最先進球');
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

test('Parlay settlement does not turn unresolved, refunded or partial legs into wins',()=>{
 assert.equal(insights.parlayStatus(['win',null]),'待結算');
 assert.equal(insights.parlayStatus(['loss',null]),'未全中');
 assert.equal(insights.parlayStatus(['win','push']),'其餘關卡全贏');
 assert.equal(insights.parlayStatus(['push','push']),'全走盤');
 assert.equal(insights.parlayStatus(['win','halfloss']),'含半贏／半輸');
 assert.equal(insights.parlayStatus(['win','win']),'全中');
});

test('The same selection in two explicit parlay groups stays visible in each group',()=>{
 const leg=['① 06:30｜巴甲','**Coritiba（科里蒂巴）vs Santos（桑托斯）**','全場總進球小 3.5｜估計命中機率 79%'];
 const article=['分析日期：'+date,'### 🎯｜組合一',...leg,'### 🎯｜組合二',...leg].join('\n');
 const parsed=parsePublishedCards(article,date);
 assert.deepEqual(parsed.map(entry=>entry.group),['組合一','組合二']);
 assert.notEqual(parsed[0].id,parsed[1].id);
 assert.equal(includePublishedCards(article,date,[{...parsed[0],verified:true}]).length,2);
});

test('probability reciprocal is explicitly an estimate and absent probabilities remain unknown',()=>{
 const q=insights.estimatedOdds({probability:80,probabilityType:'全贏'});
 assert.equal(q.price,1.075);
 assert.equal(q.kind,'estimate');
 assert.equal(insights.estimatedOdds({probability:null}),null);
 assert.equal(insights.estimatedOdds({probability:100}),null);
 assert.equal(insights.estimatedOdds({probability:90}),null);
 assert.equal(insights.estimatedOdds({probability:86}),null);
 const selected=insights.parlayPrices([{id:'a',probability:80}],{},'2026-11-26 16:00');
 assert.equal(selected.priced,0);
});

test('shared display retains real quotes and uses a labelled estimate only for missing quotes',()=>{
 const legs=[{id:'a',probability:80},{id:'b',probability:50},{id:'c'}];
 const actual={price:1.3,book:'1xbet',source:'1xBet'};
 const shown=insights.displayOdds(legs,[actual,null,null]);
 assert.equal(shown[0],actual);
 assert.equal(shown[1].price,1.72);
 assert.equal(shown[1].kind,'estimate');
 assert.equal(shown[2],null);
 assert.equal(insights.parlayProduct(shown),null);
});
