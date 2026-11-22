'use strict';

// OpenFootball publishes local calendar dates without an explicit time zone.
// Treat dates as date-only and require an exact match of both team identities.
const {nameKey}=require('./fotmob-match');
const {compatible}=require('./public/team-identity');
const files={'eng.1':['en.1','英超'],'eng.2':['en.2','英冠'],'esp.1':['es.1','西甲'],
 'ger.1':['de.1','德甲'],'ita.1':['it.1','義甲'],'fra.1':['fr.1','法甲']};
const norm=value=>nameKey(value).replace(/\b(?:cf|cd|ud|ac)\b/g,' ').replace(/\s+/g,' ').trim();
const list=value=>Array.isArray(value)?value:[];
const localDate=date=>String(date||'').slice(0,10);
function selectRows(payload,current,league){
 const teams=list(current.competitors).filter(x=>['home','away'].includes(x.homeAway));
 if(teams.length!==2||!files[league]||!Number.isFinite(Date.parse(current.date)))return [];
 const names=teams.map(x=>({id:String(x.team?.id||''),name:x.team?.displayName||x.team?.name||'',
  logo:x.team?.logo||x.team?.logos?.[0]?.href||'',keys:new Set([x.team?.displayName,x.team?.name,x.team?.shortDisplayName].filter(Boolean).map(norm).filter(Boolean))}));
 if(names.some(x=>!x.id||!x.name||!x.keys.size)||names[0].id===names[1].id)return [];
 return list(payload?.matches).flatMap(match=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(match.date||'')||match.date>=localDate(current.date))return [];
  const home=norm(match.team1),away=norm(match.team2);
  const left=names.filter(t=>compatible(t.name,match.team1)&&t.keys.has(home)),right=names.filter(t=>compatible(t.name,match.team2)&&t.keys.has(away));
  if(left.length!==1||right.length!==1||left[0].id===right[0].id)return [];
  const ft=match.score?.ft;
  if(!Array.isArray(ft)||ft.length!==2||ft.some(n=>!Number.isInteger(n)||n<0||n>30))return [];
  const side=(team,n)=>({id:team.id,name:team.name,logo:/^https:\/\/a\.espncdn\.com\//.test(team.logo)?team.logo:'',score:n});
  return [{date:match.date+'T12:00:00Z',timeValid:false,competition:files[league][1],status:'FT',source:'OpenFootball',
   home:side(left[0],ft[0]),away:side(right[0],ft[1])}];
 });
}
async function supplement(current,league,get,existing=[]){
 const file=files[league]?.[0];const kickoff=new Date(current?.date||'');
 if(!file||!Number.isFinite(kickoff.getTime()))return existing;
 const year=kickoff.getUTCFullYear()-(kickoff.getUTCMonth()<6?1:0);
 const seasons=Array.from({length:4},(_,i)=>{const y=year-i;return y+'-'+String(y+1).slice(-2)});
 const request=s=>get('https://raw.githubusercontent.com/openfootball/football.json/master/'+s+'/'+file+'.json',12*3600000).catch(()=>null);
 // Never make an existing ESPN answer wait for a slow supplementary source.
 const payloads=await Promise.all(seasons.map(s=>new Promise(resolve=>{
  const timeout=setTimeout(()=>resolve(null),2500);
  request(s).then(value=>{clearTimeout(timeout);resolve(value)});
 })));
 const known=new Set(existing.map(row=>localDate(row.date)+'|'+row.home.id+'|'+row.away.id));
 const added=[];
 for(const row of payloads.flatMap(data=>selectRows(data,current,league))){
  const key=localDate(row.date)+'|'+row.home.id+'|'+row.away.id;
  const near=existing.some(e=>e.home.id===row.home.id&&e.away.id===row.away.id&&
   Math.abs(Date.parse(e.date)-Date.parse(row.date))<36*3600000);
  if(!known.has(key)&&!near){known.add(key);added.push(row)}
 }
 return [...existing,...added].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,10);
}
module.exports={selectRows,supplement};
