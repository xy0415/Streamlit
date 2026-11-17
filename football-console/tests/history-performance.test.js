'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../public/history-engine.js'),'utf8');
function load(){const ctx={window:{}};vm.createContext(ctx);vm.runInContext(code,ctx);return ctx.window.FootballHistory;}
const fixture={home:'Bayern Munich',homeZh:'拜仁慕尼黑',away:'FC Köln',awayZh:'科隆'};
test('totals, push, draw, double chance and outright settle properly',()=>{
 const {evaluate:e}=load();
 assert.equal(e({...fixture,market:'全場總進球小 3.5'},2,1),'win');
 assert.equal(e({...fixture,market:'全場總進球小 3.5'},3,1),'loss');
 assert.equal(e({...fixture,market:'全場總進球小 4.0'},2,2),'push');
 assert.equal(e({...fixture,market:'全場總進球大1.5'},2,0),'win');
 assert.equal(e({...fixture,market:'雙方進球：是'},2,0),'loss');
 assert.equal(e({...fixture,market:'雙方進球：否'},2,0),'win');
 assert.equal(e({...fixture,market:'拜仁慕尼黑獲勝'},2,1),'win');
 assert.equal(e({...fixture,market:'科隆不敗（客勝或和局）'},2,1),'loss');
 assert.equal(e({...fixture,market:'科隆不敗（客勝或和局）'},1,1),'win');
});
test('Asian handicap and split-quarter stakes settle with fractional results',()=>{
 const {evaluate:e}=load();
 assert.equal(e({...fixture,market:'拜仁慕尼黑亞洲讓球 -1.5'},3,1),'win');
 assert.equal(e({...fixture,market:'拜仁慕尼黑亞洲讓球 -1.5'},2,1),'loss');
 assert.equal(e({...fixture,market:'拜仁慕尼黑讓球 -1'},2,1),'push');
 assert.equal(e({...fixture,market:'拜仁慕尼黑亞洲讓球 -0.75'},2,1),'halfwin');
 assert.equal(e({...fixture,market:'拜仁慕尼黑亞洲讓球 -1.25'},2,1),'halfloss');
 assert.equal(e({...fixture,market:'未知隊伍亞洲讓球 -1'},2,1),null);
});
test('never grade absent, unsupported or malformed results as losses',()=>{
 const {evaluate:e}=load();
 assert.equal(e({...fixture,market:'總角球大 9.5'},2,0),null);
 assert.equal(e({...fixture,market:'全場總進球大 2.5'},null,0),null);
 assert.equal(e({...fixture,market:'全場總進球小 3.5'},2,NaN),null);
});
test('rates exclude pushes and pending picks; half wins have fractional weights',()=>{
 const {summarize}=load();
 const s=summarize([
  {grade:'win'},{grade:'win'},{grade:'loss'},{grade:'halfwin'},
  {grade:'push'},{status:'pending'},{status:'unsupported'}
 ]);
 assert.equal(s.total,7);
 assert.equal(s.finished,5);
 assert.equal(s.pending,1);
 assert.equal(s.unsupported,1);
 assert.equal(s.rate,62.5);
});
