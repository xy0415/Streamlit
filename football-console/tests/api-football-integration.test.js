'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../public/analysis.js'),'utf8')
 .replace("document.addEventListener('DOMContentLoaded',init);",'');
function context(){
 const document={getElementById(){return {value:'',innerHTML:'',textContent:'',classList:{toggle(){}}}}};
 const ctx={window:{FOOTBALL_TEAM_NAMES_ZH:{},FXITeamIdentity:require('../public/team-identity')},document,URL,Date,Intl,console,
  setTimeout,clearTimeout,localStorage:{getItem(){return null},setItem(){}}};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 return {ctx, state:vm.runInContext('state',ctx), api:vm.runInContext('apiFixtureView',ctx),
  merge:vm.runInContext('mergeApiFootballFixtures',ctx),
  goals:vm.runInContext('goalEventsFromSummary',ctx)};
}
function fixture(code,options={}){
 return {id:'api-90210',apiFixtureId:90210,leagueCode:code,leagueName:'Premier League',
  date:'2026-11-18',time:'20:00',home:'Arsenal',away:'Chelsea',status:'finished',
  scoreHome:2,scoreAway:1,homeLogo:'https://media.api-sports.io/football/teams/42.png',
  awayLogo:'https://media.api-sports.io/football/teams/49.png',homeTeamId:'12',awayTeamId:'13',
  sourceStatus:'FT',statusText:'Full Time',minute:90,...options};
}
test('API supplements only a previously selected and allowed competition',()=>{
 const a=context();a.state.leagues=new Set(['eng.1']);
 assert.ok(a.api(fixture('eng.1')));
 assert.equal(a.api(fixture('ger.1')),null);
 assert.equal(a.api(fixture('not-approved-code')),null);
});
test('club logos and final score come from API only if ESPN is missing a fixture',()=>{
 const a=context();a.state.leagues=new Set(['eng.1']);
 const rows=[],result=a.merge(rows,[fixture('eng.1'),fixture('ger.1')],'2026-11-18');
 assert.equal(result.added,1);
 assert.equal(rows.length,1);
 assert.equal(rows[0].status,'finished');
 assert.equal(rows[0].scoreHome,2);
 assert.equal(rows[0].scoreAway,1);
 assert.ok(rows[0].homeLogo.includes('media.api-sports.io'));
});
test('do not overwrite conflicting final ESPN scores',()=>{
 const a=context();a.state.leagues=new Set(['eng.1']);
 const existing=[{id:'123456',leagueCode:'eng.1',date:'2026-11-18',time:'20:00',
  home:'Arsenal',away:'Chelsea',status:'finished',scoreHome:0,scoreAway:1,
  homeLogo:'',awayLogo:''}];
 const merged=a.merge(existing,[fixture('eng.1')],'2026-11-18');
 assert.equal(merged.conflicts,1);
 assert.equal(existing.length,1);
 assert.equal(existing[0].status,'conflict');
 assert.equal(existing[0].scoreHome,null);
});
test('goal details use actual event times, exclude non-goal events and preserve scorer',()=>{
 const a=context();const f={home:'Arsenal',away:'Chelsea',homeId:'12',awayId:'13'};
 const mapped=a.goals({apiFootballEvents:[
  {type:'Goal',detail:'Normal Goal',minute:23,extra:null,team:'Arsenal',teamId:12,player:'Player A'},
  {type:'Goal',detail:'Penalty',minute:45,extra:2,team:'Chelsea',teamId:13,player:'Player B'},
  {type:'Card',detail:'Yellow Card',minute:55,extra:null,team:'Chelsea',teamId:13,player:'Player C'}
 ]},f);
 assert.equal(mapped.length,2);
 assert.equal(mapped[0].time,'23′');
 assert.equal(mapped[1].time,'45+2′');
 assert.equal(mapped[1].kind,'十二碼進球');
});
