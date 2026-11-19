'use strict';

const crypto=require('node:crypto');
const NUMBERS='①②③④⑤⑥⑦⑧⑨⑩';

// Reports is written as soon as the authorized Gmail message is published.
// The slower Apps Script background task can add Predictions hours later; use
// the exact published cards in the meantime, never fabricated scores or picks.
function parsePublishedCards(article,date){
 const text=String(article||'').replace(/\r\n?/g,'\n');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!text.includes('分析日期：'+date))return [];
 const lines=text.split('\n').map(x=>x.trim().replace(/^#{1,6}\s+/,''));
 const out=[];
 const head=/^([①②③④⑤⑥⑦⑧⑨⑩])\s*(?:(?:\d{1,2}\/\d{1,2})\s+)?(\d{2}:\d{2})｜([^｜\n]+)(?:｜([^｜\n]+))?$/;
 const teams=/^(?:\*\*)?(.+?)（(.+?)）\s*vs\s*(.+?)（(.+?)）(?:\*\*)?$/i;
 const choice=/^(.+?)\s*｜\s*估計(命中|全贏)機率\s*(\d{1,3})%$/;
 const labels=new Set();
 let detected=0,group='',groupOrder=0;
 for(let i=0;i<lines.length;i++){
  if(lines[i].startsWith('💬｜'))break;
  if(lines[i].startsWith('🎯｜')){
   group=lines[i].slice('🎯｜'.length).trim();
   if(!group||labels.has(group))return [];
   labels.add(group);groupOrder=0;
   continue;
  }
  if(!group||!NUMBERS.includes(lines[i][0]||' '))continue;
  detected++;
  const h=lines[i].match(head);
  if(!h||![groupOrder,out.length].includes(NUMBERS.indexOf(h[1])))return [];
  groupOrder++;
  const following=lines.slice(i+1).filter(line=>line&&!/^=+$/.test(line));
  const t=following[0]?.match(teams),p=following[1]?.match(choice);
  if(!t||!p||+p[3]<1||+p[3]>99||!t[1].trim()||!t[3].trim())return [];
  const [time,league,round]=[h[2],h[3].trim(),(h[4]||'').trim()];
  const [home,homeZh,away,awayZh]=t.slice(1).map(x=>x.trim());
  const market=p[1].trim();
  const id=crypto.createHash('sha256').update([date,time,home,away,market,...(group==='串關單'?[]:[group])].join('|'),'utf8').digest('base64url').slice(0,18);
  if(out.some(x=>x.id===id))return [];
  const choiceIndex=lines.indexOf(following[1],i+1);
  const detail={};
  for(const line of lines.slice(choiceIndex+1)){
   if(/^(?:[①②③④⑤⑥⑦⑧⑨⑩]|🎯｜|💬｜)/.test(line))break;
   const note=line.match(/^(主要依據|主要變數)[：:]\s*(.+)$/);
   if(note)detail[note[1]==='主要依據'?'analysis':'risk']=note[2].trim();
   const odds=line.match(/^發布賠率[：:]\s*(\d+(?:\.\d+)?)\s*｜\s*來源[：:]\s*([^｜]+)｜\s*擷取時間[：:]\s*(.+)$/);
   if(odds&&Number(odds[1])>1)Object.assign(detail,{publishedOdds:Number(odds[1]),publishedOddsSource:odds[2].trim(),publishedOddsAt:odds[3].trim()});
  }
  out.push({...detail,id,date,order:out.length+1,group,time,league,round,
   home,homeZh,away,awayZh,market,probability:+p[3],probabilityType:p[2],
   status:'待核對',homeScore:null,awayScore:null,settlement:'待核實',verified:false,source:'已寄出正式原文'});
  i=choiceIndex;
 }
 return detected&&out.length===detected?out:[];
}

function includePublishedCards(article,date,stored){
 const existing=Array.isArray(stored)?stored:[];
 const parsed=parsePublishedCards(article,date);
 if(!parsed.length)return existing;
 const key=x=>[date,String(x.time||'').replace(/^(\d):/,'0$1:'),x.home,x.away,x.market,x.group||'串關單'].join('|');
 const known=new Set(existing.map(key));
 const original=new Map(parsed.map(x=>[key(x),x]));
 const fields=['analysis','risk','publishedOdds','publishedOddsSource','publishedOddsAt'];
 const enriched=existing.map(entry=>{
  const originalEntry=original.get(key(entry));
  if(!originalEntry)return entry;
  const details=Object.fromEntries(fields.filter(k=>originalEntry[k]!==undefined&&!entry[k]).map(k=>[k,originalEntry[k]]));
  return {...entry,...details};
 });
 const missing=parsed.filter(x=>!known.has(key(x)));
 return [...enriched,...missing].sort((a,b)=>(Number(a.order)||99)-(Number(b.order)||99));
}

module.exports={parsePublishedCards,includePublishedCards};
