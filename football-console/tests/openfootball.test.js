'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {selectRows,supplement}=require('../openfootball');
const current={date:'2026-11-22T16:00:00Z',competitors:[
 {homeAway:'home',team:{id:'1',displayName:'Arsenal',name:'Arsenal FC'}},
 {homeAway:'away',team:{id:'2',displayName:'Chelsea',name:'Chelsea FC'}}]};
const data={matches:[{date:'2025-05-01',team1:'Arsenal FC',team2:'Chelsea FC',score:{ft:[2,1]}},
 {date:'2025-04-01',team1:'Arsenal FC',team2:'Chelsea Women',score:{ft:[4,0]}},
 {date:'2026-12-01',team1:'Arsenal FC',team2:'Chelsea FC',score:{ft:[3,0]}},
 {date:'2025-03-01',team1:'Chelsea FC',team2:'Arsenal FC',score:{ft:[null,1]}},
 {date:'2025-02-01',team1:'Chelsea FC',team2:'Arsenal FC',score:[1,2]}]};
test('openfootball adds only exact teams and explicit prior full-time scores',()=>{
 const rows=selectRows(data,current,'eng.1');assert.equal(rows.length,1);assert.equal(rows[0].home.score,2);
 assert.equal(rows[0].timeValid,false);assert.equal(rows[0].source,'OpenFootball');
});
test('openfootball preserves the original source and suppresses duplicate calendar dates',async()=>{
 const existing=[{date:'2025-05-01T16:00:00Z',home:{id:'1'},away:{id:'2'}}];
 const rows=await supplement(current,'eng.1',async()=>data,existing);assert.equal(rows.length,1);assert.equal(rows[0],existing[0]);
});
test('openfootball unavailable, wrong league or ambiguous identities never generate data',async()=>{
 assert.deepEqual(await supplement(current,'fifa.friendly',async()=>data),[]);
 assert.deepEqual(await supplement(current,'eng.1',async()=>{throw Error('offline')}),[]);
 const ambiguous={...current,competitors:current.competitors.map(x=>({...x,team:{...x.team,shortDisplayName:'London'}}))};
 assert.equal(selectRows({matches:[{date:'2025-01-01',team1:'London',team2:'Chelsea',score:{ft:[1,0]}}]},ambiguous,'eng.1').length,0);
});
