'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'public','analysis.js'),'utf8')
  .replace("document.addEventListener('DOMContentLoaded',init);",'');
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
 assert.match(context.goalDetailMarkup([]),/尚未提供可核實/);
});
