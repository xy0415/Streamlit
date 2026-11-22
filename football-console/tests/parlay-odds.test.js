'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {matchFixture,quotesFor}=require('../parlay-odds');
const {selection}=require('../public/history-engine');
global.window={};
require('../public/prediction-insights');
const {parlayPrices,parlayProduct,parlayNet}=global.window.FXIPredictionInsights;
delete global.window;

test('match the exact teams, orientation, local date and kickoff without guessing ambiguous fixtures',()=>{
 const p={date:'2026-11-20',time:'16:40',home:'Western Sydney Wanderers',away:'Adelaide United'};
 const f={date:p.date,utc:'2026-11-20T08:40:00Z',home:'Western Sydney',away:'Adelaide United FC'};
 assert.equal(matchFixture(p,[f]),f);
 assert.equal(matchFixture(p,[f,{...f}]),null);
 assert.equal(matchFixture(p,[{...f,home:f.away,away:f.home}]),null);
 assert.equal(matchFixture(p,[{...f,utc:'2026-11-20T11:40:00Z'}]),null);
});

test('extract the exact odds line and ignore prices with post-kickoff updates',()=>{
 const pick=selection({market:'全場總進球小 3.5'});
 const row={update:'2026-11-20T06:00:00Z',bookmakers:[{name:'Pinnacle',bets:[{
  name:'Goals Over/Under',values:[{value:'Under 2.5',odd:'1.99'},
   {value:'Over 3.5',odd:'2.35'},{value:'Under 3.5',odd:'1.60'}]
 }]}]};
 assert.deepEqual(quotesFor([row],pick,'2026-11-20T08:00:00Z'),[{
  book:'pinnacle',source:'Pinnacle',price:1.6,capturedAt:'2026-11-20T06:00:00.000Z',kind:'prematch'
 }]);
 assert.deepEqual(quotesFor([row],pick,'2026-11-20T06:00:00Z'),[]);
 assert.deepEqual(quotesFor([row],{...pick,line:4.5},'2026-11-20T08:00:00Z'),[]);
});

test('prefer 1xbet per leg, use other books, and account for fractional returns',()=>{
 const price=(book,price,capturedAt='2026-11-20T02:00:00Z')=>({book,price,capturedAt,kind:'prematch'});
 const prices=parlayPrices([{id:'a'},{id:'b'},{id:'c'}],{
  a:[price('1xbet',1.8),price('bet365',2)],b:[price('bet365',1.8)],c:[price('bet365',1.5)],
 },'2026-11-20 11:00:00');
 assert.equal(prices.commonBook,false);
 assert.equal(prices.kind,'beforePublication');
 assert.equal(parlayProduct(prices.prices).toFixed(2),'4.86');
 assert.ok(Math.abs(parlayNet(['halfwin','halfloss','push'],prices.prices)+.3)<1e-9);
 assert.equal(parlayNet(['win',null,'push'],prices.prices),null);
 assert.equal(parlayNet(['loss',null,'push'],[null,null,null]),-1);
 assert.equal(parlayNet(['halfloss',null,'push'],prices.prices),null);
 assert.equal(parlayNet(['loss'],[null]),null);
 assert.equal(parlayNet(['loss',null],[null]),null);
 assert.equal(parlayProduct([prices.prices[0],null]),null);
 const mixed=parlayPrices([{id:'a'},{id:'b'}],{a:[price('1xbet',1.8)],b:[price('bet365',1.8)]},'');
 assert.equal(mixed.commonBook,false);
 assert.equal(mixed.kind,'reference');
 const same=parlayPrices([{id:'a'},{id:'b'}],{a:[price('otherbook',1.8)],b:[price('otherbook',1.9)]},'');
 assert.equal(same.commonBook,true);
 assert.equal(same.prices[0].book,'otherbook');
 const published=parlayPrices([{id:'a',publishedOdds:{book:'bet365',source:'bet365',price:2}},{id:'b'}],{a:[price('1xbet',1.8)],b:[price('otherbook',1.9)]},'');
 assert.equal(published.prices[0].book,'1xbet');
});

test('accept exact-market prices from additional bookmakers',()=>{
 const pick=selection({market:'全場總進球大 1.5'});
 const rows=[{update:'2026-11-20T06:00:00Z',bookmakers:[{name:'Example Sports',bets:[{name:'Goals Over/Under',values:[{value:'Over 1.5',odd:'1.45'}]}]}]}];
 assert.equal(quotesFor(rows,pick,'2026-11-20T08:00:00Z')[0].book,'examplesports');
 assert.equal(quotesFor(rows,{...pick,line:2.5},'2026-11-20T08:00:00Z').length,0);
});

test('supplements another bookmaker with 1xbet when it becomes available',async()=>{
 const oddspapi=require('../oddspapi');
 const {reportOdds}=require('../parlay-odds');
 const original=oddspapi.reportQuotes;
 const now=new Date(Date.now()+86400000+8*3600000);
 const date=now.toISOString().slice(0,10),time=now.toISOString().slice(11,16);
 const pick={id:'x',date,time,home:'Team A',away:'Team B',market:'全場總進球大 1.5'};
 try{
  oddspapi.reportQuotes=async()=>({x:[{book:'1xbet',source:'1xBet',price:1.2}]});
  const result=await reportOdds({date,matches:[pick]}, {},async()=>[{book:'bet365',source:'Bet365',price:1.3}]);
  assert.deepEqual(result.legs.x.map(q=>q.book),['bet365','1xbet']);
 }finally{oddspapi.reportQuotes=original}
});

test('published public odds retain their market, signed kickoff and source timestamp',()=>{
 const {parsePage}=require('../tipster-odds');
 const html='<div itemprop="startDate" content="2026-11-19T22:30"></div>'+
  '<table class="odds"><tr><th class="odds-type" colspan="2">BTS</th></tr>'+
  '<tr><td><img class="bookie" alt="1xbet"></td><td class="center">&nbsp;</td>'+
  '<td class="odd odd-up">1.73</td><td class="odd odd-down">2.01</td></tr></table>'+
  '<p>Odds are accurate at last update 19.11.2026 16:00.</p>';
 const books=new Map([['1xbet','1xBet']]);
 const pick={market:'btts',side:'no'};
 const kickoff='2026-11-19T22:30:00Z';
 const quote=parsePage(html,'/match/example-1',pick,kickoff,books)[0];
 assert.equal(quote.price,2.01);
 assert.equal(quote.capturedAt,'2026-11-19T16:00:00Z');
 assert.equal(quote.url,'https://tipsterarea.com/match/example-1');
 assert.deepEqual(parsePage(html,'/match/example-1',pick,'2026-11-19T22:31:00Z',books),[]);
});

test('matches common public-provider club name variants',()=>{
 const {teamKey}=require('../parlay-odds');
 assert.equal(teamKey('Newcastle United'),teamKey('Newcastle'));
 assert.equal(teamKey('Ajax Amsterdam'),teamKey('Ajax'));
 assert.notEqual(teamKey('Ajax Amsterdam'),teamKey('Jong Ajax'));
 assert.equal(teamKey('1. FC Köln'),teamKey('FC Cologne'));
 assert.equal(teamKey('Bayern München'),teamKey('Bayern Munich'));
 assert.notEqual(teamKey('Köln'),teamKey('Fortuna Köln'));
});
