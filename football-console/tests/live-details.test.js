'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'../public/live-details.js'),'utf8');
function load(){
 const context={window:{}};
 vm.createContext(context);
 vm.runInContext(source,context,{filename:'live-details.js'});
 return context.window.FootballLive;
}
test('HALFTIME should not be shown as running minute or final',()=>{
 const api=load();
 const halftime=api.getStatusFields({type:{name:'STATUS_HALFTIME',state:'in',shortDetail:'HT'},displayClock:"45'"});
 assert.equal(halftime.halftime,true);
 assert.equal(halftime.finished,false);
 assert.equal(halftime.playing,false);
 const live=api.getStatusFields({type:{name:'STATUS_IN_PROGRESS',state:'in',shortDetail:"68'"}});
 assert.equal(live.playing,true);
 assert.equal(live.clock,"68′");
});
test('Goals preserve stoppage time, player and penalty distinction without invented records',()=>{
 const api=load();
 const event={keyEvents:[
  {id:'1',scoringPlay:true,type:{text:'Goal'},clock:{displayValue:"23'"},team:{id:'A',displayName:'Japan'},athletesInvolved:[{displayName:'Player One'}]},
  {id:'2',type:{text:'Penalty - Scored'},clock:{displayValue:"45+2'"},team:{id:'B',displayName:'Brazil'},athletesInvolved:[{displayName:'Player Two'}]},
  {id:'3',type:{text:'Goal - Disallowed'},clock:{displayValue:"55'"},team:{id:'A',displayName:'Japan'}},
  {id:'4',type:{text:'Goal'},clock:{displayValue:"63'"},team:{id:'B',displayName:'Brazil'}}
 ]};
 const out=Array.from(api.collectGoalEvents(event));
 assert.equal(out.length,3);
 assert.equal(out[0].minute,'23′');
 assert.equal(out[1].minute,'45+2′');
 assert.equal(out[1].kind,'十二碼進球');
 assert.equal(out[1].scorer,'Player Two');
 assert.equal(out[2].scorer,'進球者未提供');
});
test('FIFA ranks are limited to verified national team codes',()=>{
 const api=load();
 assert.equal(api.fifaCode('Scotland'),'SCO');
 assert.equal(api.fifaCode('Japan'),'JPN');
 assert.equal(api.fifaCode('Switzerland','SWI'),'SUI');
 assert.equal(api.fifaCode('Unknown Premier League FC'),null);
 assert.equal(api.NATIONAL_LEAGUES.has('fifa.friendly'),true);
 assert.equal(api.NATIONAL_LEAGUES.has('ger.1'),false);
});
test('Cannot claim score when summary has missing or invalid scores',()=>{
 const api=load();
 const x={header:{competitions:[{competitors:[
  {homeAway:'home',score:null},{homeAway:'away',score:1}
 ]}]}};
 assert.equal(api.summaryScores(x),null);
 const y={header:{competitions:[{competitors:[
  {homeAway:'home',score:'2'},{homeAway:'away',score:'1'}
 ]}]}};
 const s=api.summaryScores(y);
 assert.equal(s.home,2);assert.equal(s.away,1);
});
