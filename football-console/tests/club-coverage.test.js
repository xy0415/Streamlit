'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../public');
const code=fs.readFileSync(path.join(root,'analysis.js'),'utf8')
 .replace("document.addEventListener('DOMContentLoaded',init);",'');
const liveCode=fs.readFileSync(path.join(root,'live-details.js'),'utf8');
function harness(entries=[]){
 const requests=[],elements={};
 const document={
  getElementById(id){return elements[id]||(elements[id]={
   innerHTML:'',textContent:'',value:'',classList:{toggle(){},contains(){return false}},
   disabled:false,addEventListener(){}
  })},
  querySelectorAll(){return []}
 };
 const fakeFetch=async url=>{
  requests.push(String(url));
  if(String(url).includes('/api/match-lookup')){
   return {ok:true,status:200,json:async()=>({
    upstreamStatus:200,data:{event:entries}
   })};
  }
  throw Error('Unexpected URL '+url);
 };
 const context={document,window:{FOOTBALL_TEAM_NAMES_ZH:{Arsenal:'兵工廠',Chelsea:'切爾西',Juventus:'尤文圖斯'}},
  URL,Date,Intl,console,fetch:fakeFetch,localStorage:{getItem(){return null},setItem(){}},
  setTimeout,clearTimeout};
 vm.createContext(context);
 vm.runInContext(liveCode,context);
 vm.runInContext(code,context);
 return {context,requests,elements,
  state:vm.runInContext('state',context),
  include:vm.runInContext('includeMissingClubPredictions',context),
  lookup:vm.runInContext('getIndependentMatchInfo',context),
  render:vm.runInContext('renderSchedule',context),
  safeLogo:vm.runInContext('safeLogo',context)};
}
const club={
 strHomeTeam:'Arsenal',strAwayTeam:'Chelsea',
 strTimestamp:'2026-11-10T12:00:00Z',strStatus:'Match Finished',
 intHomeScore:'2',intAwayScore:'1',idEvent:'123456',
 strHomeTeamBadge:'https://r2.thesportsdb.com/images/media/team/badge/arsenal123.png',
 strAwayTeamBadge:'https://r2.thesportsdb.com/images/media/team/badge/chelsea456.png'
};
test('club results and badges are recovered when ESPN omits a fixture',async()=>{
 const h=harness([club]),day='2026-11-10';
 h.state.day=day;
 h.state.leagues=new Set(['eng.1']);
 h.state.feed={reports:[{date:day,matches:[{
  date:day,time:'20:00',league:'英超',
  home:'Arsenal',away:'Chelsea',market:'兵工廠獲勝'
 }]}]};
 h.state.report=h.state.feed.reports[0];
 const fixtures=[];
 await h.include(fixtures,false,day);
 assert.equal(fixtures.length,1);
 assert.equal(fixtures[0].scoreHome,2);
 assert.equal(fixtures[0].scoreAway,1);
 assert.equal(fixtures[0].status,'finished');
 assert.match(fixtures[0].homeLogo,/r2\.thesportsdb\.com/);
 assert.match(fixtures[0].awayLogo,/r2\.thesportsdb\.com/);
 assert.equal(h.safeLogo('https://attacker.example/logo.png'),'');
 h.state.fixtures=fixtures;h.state.sources=[{status:'ok'}];
 h.render();
 assert.match(h.elements.fixtureTable.innerHTML,/2 : 1/);
 assert.match(h.elements.fixtureTable.innerHTML,/r2\.thesportsdb\.com/);
});
test('early Taiwan kickoff maps to correct previous UTC date for free backup lookup',async()=>{
 const early={...club,strTimestamp:'2026-11-09T17:00:00Z'};
 const h=harness([early]);
 const result=await h.lookup({date:'2026-11-10',time:'01:00',
  home:'Arsenal',away:'Chelsea',leagueCode:'eng.1'},false);
 assert.ok(result);
 assert.equal(result.final,true);
 assert.match(h.requests[0],/date=2026-11-09/);
});


test('prediction names match the display names while original selections remain intact',()=>{
 const {context}=harness();
 const display=vm.runInContext('displayPredictionText',context);
 const arsenal={home:'Newcastle United',homeZh:'紐卡素',away:'Arsenal',awayZh:'阿仙奴',market:'阿仙奴不敗（客勝或和局）'};
 const juventus={home:'Juventus',homeZh:'祖雲達斯',away:'Venezia',awayZh:'威尼斯',market:'祖雲達斯不敗（主勝或和局）'};
 assert.equal(display(arsenal,arsenal.market),'兵工廠不敗（客勝或和局）');
 assert.equal(display(juventus,juventus.market),'尤文圖斯不敗（主勝或和局）');
 assert.equal(arsenal.market,'阿仙奴不敗（客勝或和局）');
});
