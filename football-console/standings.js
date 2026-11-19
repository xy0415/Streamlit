'use strict';

// The ESPN standings feed is not versioned as a public schema. Validate each
// row by named statistics; do not infer missing statistics from other columns.
const FIELDS={
 played:['gamesPlayed','matchesPlayed','played','GP','PL'],
 won:['wins','win','W'],
 drawn:['ties','draws','draw','D','T'],
 lost:['losses','loss','L'],
 goalsFor:['pointsFor','goalsFor','goalsScored','F','GF'],
 goalsAgainst:['pointsAgainst','goalsAgainst','goalsConceded','A','GA'],
 goalDifference:['pointDifferential','goalDifference','goalDifferential','GD'],
 points:['points','totalPoints','PTS','P'],
 rank:['rank','ranking','position','RANK']
};
function numericStat(stats,names){
 for(const name of names){
  const item=stats.find(s=>s.name===name||s.type===name||s.abbreviation===name);
  if(!item)continue;
  const value=item.value??item.displayValue;
  if(value===null||value===undefined||String(value).trim()==='')continue;
  const n=Number(value);
  if(Number.isFinite(n))return n;
 }
 return null;
}
function extractStandingGroups(payload){
 const roots=Array.isArray(payload.children)&&payload.children.length?payload.children:[payload];
 return roots.flatMap(group=>{
  const candidates=Array.isArray(group.children)&&group.children.length?group.children:[group];
  return candidates.map(section=>({name:section.name||group.name||'',entries:section.standings?.entries||[]}));
 }).filter(group=>group.entries.length);
}
function parseStandings(payload){
 if(!payload||typeof payload!=='object')throw Error('積分榜回應無效');
 const rawGroups=extractStandingGroups(payload);
 if(!rawGroups.length)throw Error('來源沒有公布積分榜');
 const groups=rawGroups.map(group=>{
  const rows=group.entries.map((entry,index)=>{
   const team=entry.team||{},stats=Array.isArray(entry.stats)?entry.stats:[];
   const values=Object.fromEntries(Object.entries(FIELDS).map(([field,aliases])=>[field,numericStat(stats,aliases)]));
   const name=String(team.displayName||team.name||'').trim();
   if(!team.id||!name||Object.entries(values).some(([key,value])=>key!=='rank'&&value===null))
    throw Error('積分榜缺少球隊或必要統計欄位');
   if(!['played','won','drawn','lost','goalsFor','goalsAgainst','points'].every(k=>Number.isInteger(values[k])&&values[k]>=0))
    throw Error('積分榜數值異常');
   if(values.played!==values.won+values.drawn+values.lost||values.goalDifference!==values.goalsFor-values.goalsAgainst)
    throw Error('積分榜勝和負或進失球數據不一致');
   const rank=values.rank??index+1;
   if(!Number.isInteger(rank)||rank<1)throw Error('積分榜名次無效');
   const logo=team.logos?.find(x=>/^https:\/\//.test(x.href||''))?.href||'';
   return {id:String(team.id),name,logo,rank,...values};
  });
  if(new Set(rows.map(x=>x.id)).size!==rows.length)throw Error('積分榜球隊重複');
  rows.sort((a,b)=>a.rank-b.rank);
  return {name:group.name,rows};
 });
 return {season:payload.season?.displayName||String(payload.season?.year||''),seasonYear:payload.season?.year??null,groups};
}
module.exports={parseStandings};
