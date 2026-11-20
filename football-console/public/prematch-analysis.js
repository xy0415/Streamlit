'use strict';

(function(root){
 function dateValue(value){
  const text=String(value||'').trim().replace(/（台灣時間）$|\(台灣時間\)$/,'').trim().replace(' ','T');
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(text))return NaN;
  return Date.parse(/Z$|[+-]\d\d:\d\d$/.test(text)?text:text+'+08:00');
 }
 function make(pick,report,data,names){
  const kickoff=dateValue(data?.kickoff);
  if(!Number.isFinite(kickoff))return null;
  const cutoff=Math.min(kickoff,...[report?.cutoff,report?.publishedAt].map(dateValue).filter(Number.isFinite));
  // ESPN lists the kickoff for prior games, so leave a completion buffer.
  const before=row=>dateValue(row.date)<=cutoff-3*60*60*1000;
  const groups=['home','away'].map(side=>({
   side,name:names[side],games:(data.form?.[side]||[]).filter(before)
  })).filter(g=>g.games.length);
  const knownMarket=pick&&root.FootballHistory?.selection(pick);
  const note=[];
  const risks=[];
  for(const {side,name,games} of groups){
   const sums=games.reduce((t,g)=>[t[0]+g.gf,t[1]+g.ga],[0,0]);
   const wins=games.filter(g=>g.gf>g.ga).length,draws=games.filter(g=>g.gf===g.ga).length;
   const trend=name+'近 '+games.length+' 場 '+wins+' 勝 '+draws+' 和 '+(games.length-wins-draws)+' 負，進 '+sums[0]+' 球、失 '+sums[1]+' 球';
   if(!knownMarket){note.push(trend+'。');continue}
   const grades=games.map(g=>root.FootballHistory.evaluate(pick,...(side==='home'?[g.gf,g.ga]:[g.ga,g.gf])));
   if(grades.every(g=>g===null)){
    note.push(trend+'。');
    continue;
   }
   const full=grades.filter(g=>g==='win').length;
   note.push(trend+'。將比分按本場主客角色代入所選盤口，'+full+'／'+games.length+' 場全贏。');
   const i=grades.findIndex(g=>['loss','halfloss','push','halfwin'].includes(g));
   if(i>=0){
    const g=games[i];
    const outcomes={loss:'全輸',halfloss:'半輸',push:'走盤',halfwin:'半贏'};
    const partial=grades.filter(g=>['loss','halfloss','push','halfwin'].includes(g)).length;
    risks.push(name+'有 '+partial+'／'+games.length+' 場未達全贏，例如該隊的進失球 '+g.gf+'–'+g.ga+'，代入後為'+outcomes[grades[i]]+'。');
   }
  }
  const h2h=(data.h2h||[]).filter(before);
  if(h2h.length){
   const last=h2h[0];
   const description='最近一次交手，'+last.home.name+' '+last.home.score+'–'+last.away.score+' '+last.away.name+'。';
   const reversed=last.away.id===data.homeId;
   const comparable=data.homeId&&(reversed||last.home.id===data.homeId);
   const grade=knownMarket&&comparable?root.FootballHistory.evaluate(pick,
    reversed?last.away.score:last.home.score,reversed?last.home.score:last.away.score):null;
   if(['loss','halfloss','push','halfwin'].includes(grade))risks.push(description+'該比分代入本場盤口未達全贏。');
   else note.push(description);
  }
  if(!note.length&&!risks.length)return null;
  if(!note.length)note.push('可比較的近期戰績不足，目前只有一筆可核對的交手比分。');
  if(!risks.length)risks.push('當天先發與對手強度可能改變比賽節奏，現有交手及近期比分樣本有限。');
  if(knownMarket)risks.push('樣本來自各自的對手及賽場，僅用於檢視本場盤口，不能推算命中率。');
  return {analysis:note.join(' '),risk:risks.join(' '),cutoff:new Date(cutoff).toISOString()};
 }
 root.FXIPrematchAnalysis={make};
})(window);
