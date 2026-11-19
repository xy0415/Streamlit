'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseStandings}=require('../standings');
const stats=(rank,played,w,d,l,gf,ga,points)=>[
 ['rank',rank],['gamesPlayed',played],['wins',w],['ties',d],['losses',l],
 ['pointsFor',gf],['pointsAgainst',ga],['pointDifferential',gf-ga],['points',points]
].map(([name,value])=>({name,value}));
const team=(id,rank,pts)=>({team:{id,displayName:'Club '+id},stats:stats(rank,3,2,0,1,5,2,pts)});
test('standings retain source rank and points, including point penalties',()=>{
 const data=parseStandings({season:{year:2026,displayName:'2026'},children:[{name:'League',standings:{entries:[team('a',2,5),team('b',1,6)]}}]});
 assert.deepEqual(data.groups[0].rows.map(r=>[r.rank,r.name,r.points]),[[1,'Club b',6],[2,'Club a',5]]);
 assert.equal(data.seasonYear,2026);
});
test('rejects incomplete and arithmetically inconsistent upstream standings',()=>{
 const entry=team('a',1,6);
 entry.stats=entry.stats.filter(s=>s.name!=='pointsAgainst');
 assert.throws(()=>parseStandings({standings:{entries:[entry]}}),/缺少/);
 entry.stats=stats(1,4,2,0,1,5,2,6);
 assert.throws(()=>parseStandings({standings:{entries:[entry]}}),/不一致/);
});
test('keeps separate groups rather than merging group stage rankings',()=>{
 const data=parseStandings({children:[{name:'Group A',standings:{entries:[team('a',1,6)]}},{name:'Group B',standings:{entries:[team('b',1,6)]}}]});
 assert.equal(data.groups.length,2);
 assert.equal(data.groups[1].name,'Group B');
});
