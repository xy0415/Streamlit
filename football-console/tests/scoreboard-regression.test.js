'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'public','analysis.js'),'utf8')
  .replace("document.addEventListener('DOMContentLoaded',init);",'');
const liveSource=fs.readFileSync(path.join(root,'public','live-details.js'),'utf8');
const historySource=fs.readFileSync(path.join(root,'public','history-engine.js'),'utf8');
const corrections=JSON.parse(fs.readFileSync(path.join(root,'public','data','verified-results.json'),'utf8'));
function setup(batchReply=null){
 const nodes={};
 const document={
  getElementById(id){
   return nodes[id]||(nodes[id]={value:'',innerHTML:'',textContent:'',disabled:false,style:{},
    classList:{toggle(){},add(){},remove(){}},addEventListener(){}});
  },
  querySelectorAll(){return []}
 };
 const requests=[];
 const context={document,window:{FOOTBALL_TEAM_NAMES_ZH:{}},URL,Date,Intl,console,
  setTimeout,clearTimeout,
  fetch:async (url,options={})=>{
   requests.push(String(url));
   if(String(url).includes('verified-results.json'))
    return {ok:true,status:200,json:async()=>corrections};
   const u=new URL(String(url),'https://test.invalid');
   if(u.pathname==='/api/fixtures/batch'&&batchReply){
    const input=JSON.parse(options.body);
    return {ok:true,status:200,json:async()=>batchReply(input)};
   }
   if(u.pathname==='/api/fixtures')return {
    ok:true,status:200,json:async()=>({
     upstreamStatus:200,data:{events:[
      fixtureEvent('Tahiti','Cook Islands','2026-11-17T05:30:00Z'),
      fixtureEvent('Malaysia','Yemen','2026-11-17T06:00:00Z')
     ]}
    })
   };
   return {ok:false,status:503,json:async()=>({error:'無法查核備援來源'})};
  }
 };
 vm.createContext(context);
 vm.runInContext(liveSource,context,{filename:'live-details.js'});
 vm.runInContext(historySource,context,{filename:'history-engine.js'});
 vm.runInContext(source,context,{filename:'analysis.js'});
 return {context,requests,document,state:vm.runInContext('state',context)};
}
function fixtureEvent(home,away,utc){
 return {id:home+'-'+away,date:utc,_league:'fifa.friendly',
  status:{type:{name:'STATUS_SCHEDULED',state:'pre',completed:false}},
  competitions:[{competitors:[
   {homeAway:'home',team:{displayName:home}},
   {homeAway:'away',team:{displayName:away}}
  ]}]
 };
}
test('Every available league is selected by default, while broken K League feed stays hidden',()=>{
 const {context,state}=setup();
 const codes=vm.runInContext('LEAGUES.map(([code])=>code)',context);
 assert.equal(state.leagues.size,codes.length);
 assert.ok(codes.every(code=>state.leagues.has(code)));
 assert.ok(!codes.includes('kor.1'));
 assert.ok(!state.leagues.has('kor.1'));
});
test('Every visible scoreboard competition is supported by the server allowlist',()=>{
 const {context}=setup();
 const visible=vm.runInContext('LEAGUES.map(([code])=>code)',context);
 const backend=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const list=backend.match(/const ALLOWED = new Set\(\[([\s\S]*?)\]\);/);
 assert.ok(list,'Backend competition allowlist must be present');
 const allowed=new Set([...list[1].matchAll(/'([^']+)'/g)].map(match=>match[1]));
 assert.ok(visible.every(code=>allowed.has(code)),'One or more frontend competitions have no working backend route');
 for(const cup of ['por.taca.portugal','eng.league_cup','ger.dfb_pokal','ita.coppa_italia',
  'fra.coupe_de_france','bra.copa_do_brazil','arg.copa','conmebol.sudamericana'])
  assert.ok(visible.includes(cup),'Cup coverage missing: '+cup);
});
test('Grouped schedule uses three visible columns without a phantom league column',()=>{
 const {context,state,document}=setup();
 state.day='2026-11-17';
 state.fixtures=[context.parseScore(fixtureEvent('France','Turkey','2026-11-17T05:30:00Z'))];
 state.sources=[{status:'ok'}];
 context.renderSchedule();
 const html=document.getElementById('fixtureTable').innerHTML;
 assert.match(html,/colspan="3"/);
 assert.equal((html.match(/<td\b/g)||[]).length,4);
 assert.doesNotMatch(html,/class="fixture-league"/);
 assert.match(html,/class="inline-match-score"/);
});
test('One batch loads the full Taiwan day across two provider dates, without duplicating fixtures',async()=>{
 const h=setup(input=>({day:input.day,results:input.leagues.flatMap(league=>[
  {league,date:'2026-11-20',upstreamStatus:200,events:[fixtureEvent('Porto','Boavista','2026-11-20T22:00:00Z')]},
  {league,date:'2026-11-21',upstreamStatus:200,events:[
   fixtureEvent('Braga','Nacional','2026-11-21T14:00:00Z'),
   fixtureEvent('Late Team','Next Day','2026-11-21T23:00:00Z')
  ]}
 ])}));
 h.state.day='2026-11-21';h.state.view='schedule';
 h.state.leagues=new Set(['por.taca.portugal']);
 await h.context.loadFixtures(false);
 assert.equal(h.state.fixtures.length,2);
 assert.ok(h.state.fixtures.every(f=>f.date==='2026-11-21'));
 assert.equal(h.state.fixtures[0].leagueCode,'por.taca.portugal');
 assert.equal(h.state.sources.length,2);
 assert.equal(h.requests.filter(url=>url==='/api/fixtures/batch').length,1);
 assert.equal(h.requests.filter(url=>url.startsWith('/api/fixtures?')).length,0);
});
test('Past kickoff with stale ESPN pre status never appears as not started',()=>{
 const {context}=setup();
 const f=context.parseScore(fixtureEvent('Tahiti','Cook Islands','2026-11-17T05:30:00Z'));
 const now=Date.parse('2026-11-17T12:35:00Z');
 assert.equal(context.elapsedStatus(f,now),'stale');
 assert.equal(context.displayFixtureStatus(f,now).text,'已開賽');
 assert.equal(context.elapsedStatus(f,Date.parse('2026-11-17T04:00:00Z')),'scheduled');
});
test('Strictly sourced two-match Nov 17 corrections display actual results without inventing others',async()=>{
 const {context,state,document}=setup();
 const fixtures=[
  context.parseScore(fixtureEvent('Tahiti','Cook Islands','2026-11-17T05:30:00Z')),
  context.parseScore(fixtureEvent('Malaysia','Yemen','2026-11-17T06:00:00Z')),
  context.parseScore(fixtureEvent('Unknown United','Unknown City','2026-11-17T06:30:00Z'))
 ];
 await context.enrichScoreResults(fixtures,false,true);
 assert.deepEqual(fixtures.map(f=>[f.scoreHome,f.scoreAway]),[[3,3],[2,1],[null,null]]);
 assert.equal(fixtures[0].scoreVerified,true);
 assert.equal(fixtures[1].status,'finished');
 state.fixtures=fixtures;state.sources=[{status:'ok'}];state.day='2026-11-17';
 document.getElementById('leagueFilter').value='';
 document.getElementById('statusFilter').value='';
 context.renderSchedule();
 const output=document.getElementById('fixtureTable').innerHTML;
 assert.match(output,/3 : 3/);
 assert.match(output,/2 : 1/);
 assert.match(output,/已開賽/);
 assert.doesNotMatch(output,/未開賽/);
 assert.equal(context.fixturesForView().length,3);
});
test('Day-level cached schedule expires and refetches instead of persisting stale ESPN status',async()=>{
 const {context,state,document,requests}=setup();
 state.day='2026-11-17';state.view='schedule';
 state.leagues=new Set(['fifa.friendly']);
 document.getElementById('leagueFilter').value='';
 document.getElementById('statusFilter').value='';
 state.cache.set('2026-11-17|fifa.friendly',{
  fixtures:[context.parseScore(fixtureEvent('Dummy FC','Old Result','2026-11-17T06:00:00Z'))],
  sources:[],expiresAt:Date.now()-1000
 });
 await context.loadFixtures(false);
 assert.equal(state.fixtures.length,2);
 assert.ok(requests.filter(x=>x.includes('/api/fixtures')).length>=2);
 assert.equal(state.fixtures.find(f=>f.home==='Tahiti').scoreHome,3);
});
test('ESPN terminal state is recognized even when completed flag is absent',()=>{
 const {context}=setup();
 const e=fixtureEvent('Aston Villa','Chelsea','2026-11-17T05:30:00Z');
 e.status.type.state='post';e.status.type.completed=false;
 e.competitions[0].competitors[0].score='1';
 e.competitions[0].competitors[1].score='2';
 const f=context.parseScore(e);
 assert.equal(f.status,'finished');
 assert.equal(f.scoreAway,'2');
});

test('Match detail preserves official home/away orientation and large score',()=>{
 const {context}=setup();
 const e=fixtureEvent('France','Turkey','2026-11-17T18:00:00Z');
 e.id='12345678';e.status.type={name:'STATUS_FINAL',state:'post',completed:true};
 e.competitions[0].competitors[0].score='2';e.competitions[0].competitors[1].score='1';
 e.competitions[0].competitors[0].team.id='7';
 e.competitions[0].competitors[1].team.id='8';
 const f=context.parseScore(e);
 const html=context.matchHero(f);
 assert.match(html,/hero-team home/);
 assert.match(html,/hero-team away/);
 assert.match(html,/hero-score/);
 assert.match(html,/2 <span class="hero-dash">–<\/span> 1/);
 assert.match(html,/主隊/);
 assert.match(html,/客隊/);
 assert.match(html,/已完賽/);
});
test('Only confirmed goal events with matching team identities appear as scorers',()=>{
 const {context}=setup();
 const fixture={
  homeId:'7',awayId:'8',
  home:'France',away:'Turkey',league:'國際友誼賽',
  date:'2026-11-17',time:'20:00'
 };
 const summary={header:{competitions:[{details:[
  {type:{text:'Goal'},athletesInvolved:[{displayName:'Kroupi'}],clock:{displayValue:"80'"},team:{id:'7'}},
  {type:{text:'Goal'},athletesInvolved:[{displayName:'Bardakci'}],clock:{displayValue:"90'"},team:{id:'8'}},
  {type:{text:'Goal Kick'},athletesInvolved:[{displayName:'Not a scorer'}],clock:{displayValue:"25'"},team:{id:'7'}},
  {type:{text:'Goal'},athletesInvolved:[{displayName:'Unknown team'}],clock:{displayValue:"40'"},team:{id:'999'}}
 ]}]}};
 const goals=context.goalEventsFromSummary(summary,fixture);
 assert.equal(goals.length,2);
 assert.equal(goals[0].side,'home');
 assert.equal(goals[1].side,'away');
 assert.doesNotMatch(context.goalDetailMarkup(goals),/Not a scorer|Unknown team/);
 assert.match(context.goalDetailMarkup([]),/尚未提供可辨識的進球事件/);
});
test('Reference review does not grade corners or cards using the goal score',()=>{
 const {context}=setup();
 const p={home:'France',away:'Turkey',homeZh:'法國',awayZh:'土耳其'};
 assert.equal(context.referenceResult({...p,market:'總角球大 9.5'},3,2),'');
 assert.equal(context.referenceResult({...p,market:'總黃牌小 4.5'},1,0),'');
 assert.equal(context.referenceResult({...p,market:'全場總進球小 3.5'},2,1),'參考全贏');
 assert.equal(context.referenceResult({...p,market:'法國亞洲讓球 -0.75'},2,1),'參考半贏');
});
test('History combines equivalent league names without changing archived predictions',()=>{
 const {context,state,document}=setup();
 state.feed={reports:[{date:'2026-11-13',matches:[
  {date:'2026-11-13',league:'歐國聯',time:'03:00',home:'France',away:'Turkey',market:'全場總進球小 3.5',order:1},
  {date:'2026-11-13',league:'歐洲國家聯賽',time:'04:00',home:'Norway',away:'Denmark',market:'全場總進球小 3.5',order:2}
 ]}]};
 document.getElementById('historyPeriod').value='all';
 context.renderHistory();
 const options=document.getElementById('historyLeague').innerHTML;
 const table=document.getElementById('historyLeagueRows').innerHTML;
 assert.equal((options.match(/<option /g)||[]).length,2);
 assert.doesNotMatch(options,/歐洲國家聯賽/);
 assert.match(table,/歐國聯/);
 assert.match(table,/<td>2<\/td>/);
 assert.equal(state.feed.reports[0].matches[1].league,'歐洲國家聯賽');
});
test('Review article uses verified results and keeps unsupported results out',()=>{
 const {context,state,document}=setup();
 state.report={date:'2026-11-18',matches:[]};
 const p={date:'2026-11-18',time:'03:45',league:'歐國聯',
  home:'France',homeZh:'法國',away:'Turkey',awayZh:'土耳其',
  market:'全場總進球小 3.5',verified:true,homeScore:2,awayScore:1};
 context.renderReviewArticle([p],[]);
 assert.match(document.getElementById('reviewArticleBody').textContent,/已結算 1 場/);
 assert.doesNotMatch(document.getElementById('reviewArticleBody').textContent,/2：1/);
 assert.match(document.getElementById('reviewArticleBody').textContent,/贏/);
 assert.match(document.getElementById('reviewArticleBody').textContent,/長期應保留的經驗/);
 context.renderReviewArticle([{...p,market:'總角球大 9.5'}],[]);
 assert.match(document.getElementById('reviewArticleBody').textContent,/尚無可核實/);
});
test('Review commentary names actual losing markets without duplicating score lists',()=>{
 const {context,state,document}=setup();
 state.report={date:'2026-11-19',matches:[]};
 const base={date:'2026-11-19',league:'巴甲',verified:true,time:'08:30'};
 context.renderReviewArticle([
  {...base,home:'Corinthians',away:'Botafogo',market:'全場總進球小 3.5',homeScore:4,awayScore:0},
  {...base,home:'Gremio',away:'Bahia',market:'全場總進球大 1.5',homeScore:0,awayScore:0}
 ],[]);
 const article=document.getElementById('reviewArticleBody').textContent;
 assert.match(article,/輸 2 場/);
 assert.match(article,/單隊高比分/);
 assert.match(article,/零至一球/);
 assert.doesNotMatch(article,/08:30.*4：0/);
});
test('Review checks borderline wins, original probabilities and earlier verified market results',()=>{
 const {context,state,document}=setup();
 state.day='2026-11-19';state.report={date:state.day,matches:[]};
 const base={league:'巴甲',market:'全場總進球小 3.5',verified:true,probability:76,probabilityType:'全贏'};
 state.feed={reports:[{date:'2026-11-18',matches:[
  {...base,date:'2026-11-18',time:'02:00',home:'A',away:'B',homeScore:1,awayScore:1,order:1},
  {...base,date:'2026-11-18',time:'04:00',home:'C',away:'D',homeScore:0,awayScore:1,order:2},
  {...base,date:'2026-11-18',time:'06:00',home:'E',away:'F',homeScore:2,awayScore:2,order:3}
 ]}]};
 const current=[
  {...base,date:state.day,time:'08:30',home:'Corinthians',away:'Botafogo',homeScore:4,awayScore:0,order:1},
  {...base,date:state.day,time:'07:00',home:'G',away:'H',homeScore:2,awayScore:1,order:2},
  {...base,date:state.day,time:'06:30',home:'I',away:'J',homeScore:1,awayScore:0,order:3}
 ];
 context.renderReviewArticle(current,[]);
 const article=document.getElementById('reviewArticleBody').textContent;
 assert.match(article,/失利檢討/);
 assert.match(article,/命中檢討/);
 assert.match(article,/距盤線僅半球/);
 assert.match(article,/平均預估 76%/);
 assert.match(article,/歷史對照/);
 assert.match(article,/過往已核實 3 場，贏 2、輸 1、走盤 0/);
 assert.match(article,/選擇性樣本/);
});
test('Review does not publish a result while stored and live final scores conflict',()=>{
 const {context,state,document}=setup();
 state.report={date:'2026-11-19',matches:[]};
 const p={date:'2026-11-19',time:'08:30',league:'巴甲',home:'Corinthians',away:'Botafogo',market:'全場總進球小 3.5',verified:true,homeScore:4,awayScore:0};
 const f={id:'score-conflict',date:p.date,time:p.time,leagueCode:'bra.1',home:p.home,away:p.away,status:'finished',scoreHome:1,scoreAway:1};
 context.renderReviewArticle([p],[f]);
 assert.match(document.getElementById('reviewArticleBody').textContent,/尚無可核實/);
});
test('Prediction and review entries expose accessible clickable detail targets',()=>{
 const {context,state,document}=setup();
 const p={date:'2026-11-18',time:'03:45',order:1,league:'歐國聯',
  home:'France',homeZh:'法國',away:'Turkey',awayZh:'土耳其',
  market:'全場總進球小 3.5',probability:70,verified:false};
 state.day='2026-11-18';state.report={date:state.day,matches:[p]};
 document.getElementById('leagueFilter').value='';document.getElementById('statusFilter').value='';
 context.renderPredictions();context.renderReview();
 assert.match(document.getElementById('predictionsGrid').innerHTML,/data-prediction-index="0"/);
 assert.match(document.getElementById('reviewTable').innerHTML,/data-review-index="0"/);
});
test('Review reuses newer final score from schedule when its own snapshot is stale',()=>{
 const {context,state,document}=setup();
 const p={date:'2026-11-18',time:'03:45',order:1,league:'歐國聯',
  home:'France',homeZh:'法國',away:'Turkey',awayZh:'土耳其',
  market:'全場總進球小 3.5',verified:false};
 const base={id:'12345678',date:p.date,time:p.time,leagueCode:'uefa.nations',
  home:p.home,away:p.away,scoreHome:null,scoreAway:null,status:'scheduled'};
 state.day=p.date;state.report={date:p.date,matches:[p]};
 state.reviewFixtures=[base];state.fixtures=[{...base,status:'finished',scoreHome:2,scoreAway:1}];
 document.getElementById('leagueFilter').value='';document.getElementById('statusFilter').value='';
 assert.equal(context.eventForPrediction(p,state.reviewFixtures.concat(state.fixtures)).scoreHome,2);
 context.renderReview();
 assert.match(document.getElementById('reviewTable').innerHTML,/2 : 1/);
 assert.match(document.getElementById('reviewTable').innerHTML,/review-result win/);
 assert.equal(context.predsForView().length,1);
 // The old condition accidentally excluded verified picks with the default filter.
 state.report.matches[0].verified=true;
 assert.equal(context.predsForView().length,1);
});
test('Brazilian shortened ESPN club names match formal predictions for Nov 19',()=>{
 const {context}=setup();
 const p={date:'2026-11-19',time:'07:30',league:'巴甲',
  home:'Flamengo',away:'Athletico Paranaense'};
 const fixture={id:'401841313',date:p.date,time:p.time,leagueCode:'bra.1',
  home:'Flamengo',away:'Athletico-PR',status:'finished',scoreHome:2,scoreAway:1};
 assert.equal(context.eventForPrediction(p,[fixture]),fixture);
 assert.equal(context.sameTeam('Botafogo-RJ','Botafogo'),true);
 assert.equal(context.sameTeam('Flamengo-RJ','Flamengo'),true);
 // Different sides or fixture date must not be treated as a match.
 assert.equal(context.eventForPrediction(p,[{...fixture,away:'Palmeiras'}]),null);
});
test('Only verified final scores recovered in review update historical hit-rate',()=>{
 const {context,state,document}=setup();
 const p={date:'2026-11-19',time:'07:30',order:1,league:'巴甲',
  home:'Flamengo',away:'Athletico Paranaense',market:'全場總進球大 1.5'};
 const f={id:'401841313',date:p.date,time:p.time,leagueCode:'bra.1',
  home:'Flamengo',away:'Athletico-PR',status:'finished',scoreHome:2,scoreAway:1,
  scoreVerified:false,sourceStatus:{type:{name:'STATUS_FULL_TIME'}}};
 state.feed={reports:[{date:p.date,matches:[p]}]};
 document.getElementById('historyPeriod').value='all';
 context.syncReviewedHistory([p],[f]);
 context.renderHistory();
 assert.equal(document.getElementById('historyVerified').textContent,'0');
 context.syncReviewedHistory([p],[{...f,scoreVerified:true}]);
 context.renderHistory();
 assert.equal(document.getElementById('historyVerified').textContent,'1');
 assert.equal(document.getElementById('historyWin').textContent,'1');
 assert.equal(document.getElementById('historyRate').textContent,'100.0%');
});

test('history fetch loads verified results into the statistics without replacing them from a stale feed',async()=>{
 const {context,state}=setup();
 const day=vm.runInContext('todayTaiwan()',context);
 const pick={id:'finished',date:day,time:'00:01',league:'德甲',home:'Bayern München',homeZh:'拜仁慕尼黑',away:'1. FC Köln',awayZh:'科隆',market:'拜仁慕尼黑獲勝',order:1};
 state.view='history';state.feed={reports:[{date:day,matches:[pick]}]};
 context.renderHistory=()=>{};context.saveHistoryCache=()=>{};context.AbortSignal=AbortSignal;context.URLSearchParams=URLSearchParams;
 context.fetch=async()=>({ok:true,json:async()=>({results:{finished:{h:1,a:1,grade:'loss',verified:true,status:'settled',source:'ESPN / FotMob'}}})});
 await context.loadHistoryResults();
 const id=context.historyId(pick);assert.equal(state.historyScores.get(id).grade,'loss');
 Object.assign(pick,{verified:true,homeScore:3,awayScore:0});
 context.primeHistoryFromFeed();
 assert.equal(state.historyScores.get(id).grade,'loss');assert.equal(state.historyScores.get(id).h,1);
});
