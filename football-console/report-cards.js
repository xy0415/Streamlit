'use strict';

const crypto=require('node:crypto');
const NUMBERS='①②③④⑤⑥⑦⑧⑨⑩';

// Reports is written as soon as the authorized Gmail message is published.
// The slower Apps Script background task can add Predictions hours later; use
// the exact published cards in the meantime, never fabricated scores or picks.
function parsePublishedCards(article,date){
 const text=String(article||'').replace(/\r\n?/g,'\n');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!text.includes('分析日期：'+date)||!text.includes('🎯｜串關單'))return [];
 const lines=text.split('\n').map(x=>x.trim());
 const out=[];
 const head=/^([①②③④⑤⑥⑦⑧⑨⑩])\s+(\d{2}:\d{2})｜([^｜\n]+)(?:｜([^｜\n]+))?$/;
 const teams=/^\*\*(.+?)（(.+?)）\s*vs\s*(.+?)（(.+?)）\*\*$/i;
 const choice=/^(.+?)\s*｜\s*估計(命中|全贏)機率\s*(\d{1,3})%$/;
 let detected=0;
 for(let i=0;i<lines.length;i++){
  if(!/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(lines[i]))continue;
  detected++;
  const h=lines[i].match(head);
  if(!h||NUMBERS.indexOf(h[1])!==out.length)return [];
  const following=lines.slice(i+1).filter(Boolean);
  const t=following[0]?.match(teams),p=following[1]?.match(choice);
  if(!t||!p||+p[3]<1||+p[3]>99||!t[1].trim()||!t[3].trim())return [];
  const [time,league,round]=[h[2],h[3].trim(),(h[4]||'').trim()];
  const [home,homeZh,away,awayZh]=t.slice(1).map(x=>x.trim());
  const market=p[1].trim();
  const id=crypto.createHash('sha256').update([date,time,home,away,market].join('|'),'utf8').digest('base64url').slice(0,18);
  if(out.some(x=>x.id===id))return [];
  out.push({id,date,order:out.length+1,group:'串關單',time,league,round,
   home,homeZh,away,awayZh,market,probability:+p[3],probabilityType:p[2],
   status:'待核對',homeScore:null,awayScore:null,settlement:'待核實',verified:false,source:'已寄出正式原文'});
  i=lines.indexOf(following[1],i+1);
 }
 return detected&&out.length===detected?out:[];
}

function includePublishedCards(article,date,stored){
 const existing=Array.isArray(stored)?stored:[];
 const parsed=parsePublishedCards(article,date);
 if(!parsed.length)return existing;
 const key=x=>[date,String(x.time||'').replace(/^(\d):/,'0$1:'),x.home,x.away,x.market].join('|');
 const known=new Set(existing.map(key));
 const missing=parsed.filter(x=>!known.has(key(x)));
 return [...existing,...missing].sort((a,b)=>(Number(a.order)||99)-(Number(b.order)||99));
}

module.exports={parsePublishedCards,includePublishedCards};
