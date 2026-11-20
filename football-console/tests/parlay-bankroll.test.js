'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const window={};
vm.runInNewContext(fs.readFileSync(require.resolve('../public/history-charts'),'utf8'),{window});
const {bankrollBacktest,parlayPlot}=window.FootballHistoryCharts;

test('compounds returns by date and omits groups without verified returns',()=>{
 const win={date:'2026-11-18',net:1};
 const loss={date:'2026-11-19',net:-1};
 const pending={date:'2026-11-20',net:null};
 const result=bankrollBacktest([pending,loss,win],10000,5);
 assert.equal(result.bets.get(win).stake,500);
 assert.equal(result.bets.get(loss).stake,525);
 assert.equal(result.capital,9975);
 assert.equal(result.profit,-25);
 assert.equal(result.roi.toFixed(2),'-0.25');
 assert.equal(result.count,2);
 assert.equal(result.bets.has(pending),false);
 assert.match(parlayPlot(result.points),/<polyline /);
});

test('limits concurrent exposure and uses the same opening capital for all groups that day',()=>{
 const win={date:'2026-11-18',net:1};
 const loss={date:'2026-11-18',net:-1};
 const result=bankrollBacktest([win,loss],1000,80);
 assert.equal(result.bets.get(win).stake,500);
 assert.equal(result.bets.get(loss).stake,500);
 assert.equal(result.capital,1000);
 assert.equal(bankrollBacktest([loss],1000,100).capital,0);
 assert.equal(bankrollBacktest([win],1000,0).capital,1000);
});
