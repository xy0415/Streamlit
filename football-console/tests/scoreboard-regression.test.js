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
function setup(){
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
  fetch:async url=>{
   requests.push(String(url));
   if(String(url).includes('verified-results.json'))
    return {ok:true,status:200,json:async()=>corrections};
   const u=new URL(String(url),'https://test.invalid');
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
test('Final scores recovered in review also update historical hit-rate immediately',()=>{
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
 assert.equal(document.getElementById('historyVerified').textContent,'1');
 assert.equal(document.getElementById('historyWin').textContent,'1');
 assert.equal(document.getElementById('historyRate').textContent,'100.0%');
});
