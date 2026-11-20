'use strict';

const origin='https://www.fotmob.com';
const rows=value=>Array.isArray(value)?value:[];
const nameKey=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase()
 .replace(/\b(?:fc|afc|sc|saf)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
const cache=new Map();

function cached(key,ttl,load){
 const old=cache.get(key);
 if(old?.expires>Date.now())return old.value;
 const value=Promise.resolve().then(load).catch(()=>null);
 cache.set(key,{value,expires:Date.now()+ttl});
 if(cache.size>100)cache.delete(cache.keys().next().value);
 return value;
}

async function fetchPage(path){
 const response=await fetch(origin+path,{redirect:'error',signal:AbortSignal.timeout(6500)});
 if(!response.ok||!response.body)return '';
 const reader=response.body.getReader(),decoder=new TextDecoder();
 let html='',size=0;
 while(true){
  const {value,done}=await reader.read();
  if(done)return html+decoder.decode();
  size+=value.byteLength;
  if(size>2500000){await reader.cancel();return ''}
  html+=decoder.decode(value,{stream:true});
 }
}

function lineupFor(team,type,kickoff){
 const kinds={confirmed:'confirmed',predicted:'predicted',probable:'predicted',laststarting11:'previous'};
 const kind=kinds[String(type||'').toLowerCase()];
 if(!kind)return null;
 const starters=rows(team?.starters);
 if(starters.length!==11||starters.some(p=>!p.name||!/^\d+$/.test(String(p.id)))||
  new Set(starters.map(p=>p.id)).size!==11)return null;
 const last=team.lastMatch?.matchDate;
 const date=kind==='previous'&&last?(last+(last.endsWith('Z')?'':'Z')):kickoff;
 const shape=String(team.formation||'').split('-').map(Number);
 const positions=starters.every(p=>Number.isFinite(p.verticalLayout?.x)&&Number.isFinite(p.verticalLayout?.y));
 const matrix=positions&&shape.length>=2&&shape.every(n=>n>0&&n<=6)&&shape.reduce((a,b)=>a+b,0)===10?[1,...shape]:[];
 if(matrix.length)starters.sort((a,b)=>a.verticalLayout.y-b.verticalLayout.y||a.verticalLayout.x-b.verticalLayout.x);
 return {kind,date,matrix,formation:matrix.length?team.formation:'',source:'FotMob',
  players:starters.map(p=>({id:p.id,name:p.lastName||p.name,fullName:p.name,number:p.shirtNumber||'',
   photo:'https://images.fotmob.com/image_resources/playerimages/'+p.id+'.png'}))};
}

function parseMatch(html,match,kickoff){
 const script=html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
 if(!script)return null;
 const p=JSON.parse(script)?.props?.pageProps;
 if(String(p?.general?.matchId)!==String(match.id)||Date.parse(p.header?.status?.utcTime)!==kickoff||
  String(p.header?.teams?.[0]?.id)!==String(match.home.id)||String(p.header?.teams?.[1]?.id)!==String(match.away.id))return null;
 const ref=p.content?.matchFacts?.infoBox?.Referee;
 const stat=(type,valueType)=>rows(ref?.stats).find(s=>s.type===type&&s.valueType===valueType)?.value;
 const matches=stat('matches','total'),red=stat('redCards','total'),yellow=stat('yellowCards','perMatch'),fouls=stat('fouls','perMatch');
 const stats=matches>0?{matches,perMatch:true,league:ref.leagueName||'',
  yellow:Number.isFinite(yellow)?yellow:null,red:Number.isFinite(red)?red/matches:null,
  fouls:Number.isFinite(fouls)?fouls:null}:null;
 const l=p.content?.lineup;
 return {referee:ref?.text||'',refereeStats:stats,url:origin+'/match/'+match.id,
  home:lineupFor(l?.homeTeam,l?.lineupType,p.header.status.utcTime),
  away:lineupFor(l?.awayTeam,l?.lineupType,p.header.status.utcTime)};
}

async function findFotmobMatch(current,get){
 const kickoff=Date.parse(current?.date);
 if(!Number.isFinite(kickoff))return null;
 const day=new Date(kickoff).toISOString().slice(0,10).replaceAll('-','');
 const getTeam=side=>rows(current.competitors).find(p=>p.homeAway===side)?.team;
 const home=getTeam('home'),away=getTeam('away');
 if(!home?.displayName||!away?.displayName)return null;
 const names=(a,b)=>Boolean(nameKey(a?.name))&&[b.displayName,b.name,b.shortDisplayName].some(n=>nameKey(n)===nameKey(a.name));
 const daily=await get(origin+'/api/data/matches?date='+day,5*60000);
 const matches=rows(daily?.leagues).flatMap(l=>rows(l.matches)).filter(m=>/^\d{4,14}$/.test(String(m.id))&&
  Date.parse(m.status?.utcTime)===kickoff&&names(m.home,home)&&names(m.away,away));
 if(matches.length!==1)return null;
 const match=matches[0];
 return cached(match.id,45000,async()=>parseMatch(await fetchPage('/match/'+match.id),match,kickoff));
}

module.exports={findFotmobMatch,nameKey};
