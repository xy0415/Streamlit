'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{FootballHistory:require('../public/history-engine')}};
vm.runInNewContext(fs.readFileSync(require.resolve('../public/prematch-analysis'),'utf8'),context);
const make=context.window.FXIPrematchAnalysis.make;

test('filters data at report cutoff and preserves market home/away perspective',()=>{
 const report={cutoff:'2026-11-19 16:00:00（台灣時間）',publishedAt:'2026-11-19 16:15:00'};
 const pick={home:'主隊',away:'客隊',market:'客隊不敗'};
 const data={kickoff:'2026-11-20T08:40Z',form:{
  home:[{date:'2026-11-19T07:00Z',gf:7,ga:0},{date:'2026-11-18T12:00Z',gf:2,ga:0}],
  away:[{date:'2026-11-18T10:00Z',gf:2,ga:2}]
 }};
 const result=make(pick,report,data,{home:'主隊',away:'客隊'});
 assert.match(result.analysis,/主隊近 1 場.*0／1 場全贏/);
 assert.match(result.analysis,/客隊近 1 場.*1／1 場全贏/);
 assert.doesNotMatch(result.analysis,/進 7 球/);
 assert.match(result.risk,/2–0，代入後為全輸/);
 assert.equal(result.cutoff,'2026-11-19T08:00:00.000Z');
});

test('has a neutral preview without a pick and withholds analysis without earlier results',()=>{
 const names={home:'主隊',away:'客隊'};
 const kickoff='2026-11-20T08:40Z';
 assert.equal(make(null,null,{kickoff,form:{home:[{date:kickoff,gf:3,ga:0}]}},names),null);
 const result=make(null,null,{kickoff,form:{home:[{date:'2026-11-18T09:00Z',gf:3,ga:0}]}},names);
 assert.match(result.analysis,/3 球/);
 assert.doesNotMatch(result.analysis,/全贏/);
 assert.ok(result.risk);
});
