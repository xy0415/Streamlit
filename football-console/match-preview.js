'use strict';

const {findFotmobMatch,nameKey}=require('./fotmob-match');

const summaryUrl=(league,id)=>'https://site.api.espn.com/apis/site/v2/sports/soccer/'+league+'/summary?event='+id;
const idOk=id=>/^\d{4,14}$/.test(String(id));
const score=v=>v!==''&&v!=null&&Number.isInteger(Number(v))&&Number(v)>=0?Number(v):null;
const list=v=>Array.isArray(v)?v:[];
const comp=s=>s?.header?.competitions?.[0];
const fullTime=c=>c?.status?.type?.name==='STATUS_FULL_TIME';
const official=s=>list(s?.gameInfo?.officials).find(x=>/^(referee|head referee|main referee)$/i.test(x.position?.name||x.position?.displayName||x.role||'')||
 x.order===1&&!x.position&&!x.role);
const officialName=s=>official(s)?.fullName||official(s)?.displayName||'';
const normalize=s=>String(s||'').normalize('NFKD').replace(/\p{M}/gu,'').trim().toLowerCase();
const image=u=>/^https:\/\/a\.espncdn\.com\//.test(u||'')?u:'';

function rosterFor(summary,teamId,kind){
 const r=list(summary?.rosters).find(row=>String(row.team?.id)===String(teamId));
 if(!r)return null;
 const players=list(r.roster).filter(p=>p.starter===true&&p.athlete?.displayName).map(p=>({
  id:String(p.athlete.id||p.athlete.displayName),name:p.athlete.shortName||p.athlete.displayName,fullName:p.athlete.displayName,
  number:p.jersey||'',position:p.position?.abbreviation||'',place:Number(p.formationPlace)||0,
  photo:image(p.media?.headshot?.href||p.athlete.headshot?.href)
 })).sort((a,b)=>(a.place||99)-(b.place||99));
 if(players.length!==11||new Set(players.map(p=>p.id)).size!==11)return null;
 const shape=String(r.formation||'').split('-').map(Number);
 const matrix=shape.length>=2&&shape.every(n=>n>0&&n<=6)&&shape.reduce((a,b)=>a+b,0)===10&&
  players.every((p,i)=>p.place===i+1)?[1,...shape]:[];
 return {kind,formation:matrix.length?r.formation:'',matrix,players,date:comp(summary)?.date||''};
}

function headToHead(summary){
 const current=comp(summary);
 const teams=list(current?.competitors).map(c=>String(c.team?.id||'')).filter(Boolean).sort().join('|');
 if(!teams.includes('|'))return [];
 const rows=new Map();
 for(const event of list(summary.seasonseries).filter(s=>s.type==='head-to-head').flatMap(s=>list(s.events))){
  if(!idOk(event.id)||String(event.id)===String(current.id)||event.statusType?.completed!==true||
    !(Date.parse(event.date)<Date.parse(current.date)))continue;
  if(list(event.competitors).map(c=>String(c.team?.id||'')).sort().join('|')!==teams)continue;
  const sides=['home','away'].map(side=>{
   const c=list(event.competitors).find(x=>x.homeAway===side);
   return {name:c?.team?.displayName||'',logo:image(c?.team?.logo||c?.team?.logos?.[0]?.href),score:score(c?.score)};
  });
  if(sides.every(s=>s.name&&s.score!==null))rows.set(event.id,{date:event.date,timeValid:event.timeValid!==false,
   competition:event.competitionName||'',status:event.statusType.shortDetail||'',home:sides[0],away:sides[1]});
 }
 return [...rows.values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,10);
}

function priorEvents(summary,teamId){
 return list(list(summary.lastFiveGames).find(x=>String(x.team?.id)===String(teamId))?.events)
  .filter(e=>idOk(e.id)&&e.id!==summary.header?.id&&e.gameResult&&Date.parse(e.gameDate)<Date.parse(comp(summary)?.date))
  .sort((a,b)=>Date.parse(b.gameDate)-Date.parse(a.gameDate));
}

async function weatherFor(venue,kickoff,get){
 const ts=Date.parse(kickoff);
 const days=(ts-Date.now())/86400000;
 if(!Number.isFinite(days)||days>14||days< -7||!venue?.address?.city||!venue.address.country)return null;
 const query=new URLSearchParams({name:venue.address.city,count:'20',language:'en',format:'json'});
 const geo=await get('https://geocoding-api.open-meteo.com/v1/search?'+query,7*86400000);
 const countries={england:'United Kingdom',scotland:'United Kingdom',wales:'United Kingdom','northern ireland':'United Kingdom',usa:'United States'};
 const city=normalize(venue.address.city),country=normalize(venue.address.country);
 const place=list(geo?.results).find(p=>normalize(p.name)===city&&normalize(p.country)===normalize(countries[country]||country)&&
  Number.isFinite(p.latitude)&&Number.isFinite(p.longitude));
 if(!place)return null;
 const day=new Date(ts).toISOString().slice(0,10);
 const params=new URLSearchParams({latitude:place.latitude,longitude:place.longitude,hourly:'temperature_2m,weather_code',
  timezone:'GMT',start_date:day,end_date:day});
 const model=await get('https://api.open-meteo.com/v1/forecast?'+params,30*60000);
 const hour=new Date(ts).toISOString().slice(0,13)+':00';
 const index=list(model?.hourly?.time).indexOf(hour);
 const celsius=model?.hourly?.temperature_2m?.[index],code=model?.hourly?.weather_code?.[index];
 return Number.isFinite(celsius)?{celsius,code,hour:hour+'Z',place:place.name,source:'Open-Meteo',past:days<0}:null;
}

function refereeStats(samples,name){
 const counts={matches:0,yellow:0,red:0,fouls:0};
 for(const s of samples){
  if(!fullTime(comp(s))||normalize(officialName(s))!==normalize(name))continue;
  const teams=list(s.boxscore?.teams);
  if(teams.length!==2)continue;
  const fields=['yellowCards','redCards','foulsCommitted'].map(key=>teams.map(t=>score(list(t.statistics)
   .find(x=>x.name===key)?.displayValue)));
  if(fields.some(row=>row.includes(null)))continue;
  counts.matches++;
  fields.forEach(([a,b],i)=>{counts[['yellow','red','fouls'][i]]+=a+b});
 }
 return counts.matches?counts:null;
}

async function matchSection(league,event,section,get){
 const s=await get(summaryUrl(league,event),45000);
 if(!s||String(s.header?.id)!==event||!comp(s))return null;
 const current=comp(s);
 if(section==='h2h')return {matches:headToHead(s)};
 const sides=list(current.competitors).filter(p=>['home','away'].includes(p.homeAway)&&p.team?.id);
 const prior=(id)=>priorEvents(s,id);
 const history=(entry)=>get(summaryUrl(league,String(entry.id)),2*86400000);
 if(section==='lineup'){
  const fotmob=await findFotmobMatch(current,get).catch(()=>null);
  const quality={confirmed:4,reported:3,predicted:2,previous:1};
  const lineups=await Promise.all(sides.map(async side=>{
   const id=side.team.id;
   const roster=list(s.rosters).find(row=>String(row.team?.id)===String(id));
   const predicted=roster?.predicted===true||/predict|project/i.test(roster?.lineupType||'');
   const kind=predicted?'predicted':roster?.confirmed===true||['in','post'].includes(current.status?.type?.state)?'confirmed':'reported';
   let lineup=rosterFor(s,id,kind);
   const alternative=fotmob?.[side.homeAway];
   if(alternative&&(!lineup||quality[alternative.kind]>quality[lineup.kind]))lineup=alternative;
   if(!lineup){
    const previous=await Promise.all(prior(id).slice(0,3).map(history));
    lineup=previous.filter(old=>fullTime(comp(old))).map(old=>rosterFor(old,id,'previous')).find(Boolean)||null;
   }
   if(lineup&&alternative&&lineup!==alternative){
    const photos=new Map();
    for(const player of alternative.players){
     const key=nameKey(player.fullName);
     photos.set(key,photos.has(key)?'':player.photo);
    }
    lineup.players=lineup.players.map(player=>({...player,photo:player.photo||photos.get(nameKey(player.fullName))||''}));
   }
   return {side:side.homeAway,team:side.team.displayName||side.team.name,logo:image(side.team.logo||side.team.logos?.[0]?.href),lineup};
  }));
  return {lineups,checkedAt:new Date().toISOString()};
 }
 const v=s.gameInfo?.venue;
 const [weather,fotmob]=await Promise.all([weatherFor(v,current.date,get),findFotmobMatch(current,get).catch(()=>null)]);
 const espnRef=officialName(s),referee=espnRef||fotmob?.referee||'';
 const fotmobStats=referee&&normalize(referee)===normalize(fotmob?.referee)?fotmob.refereeStats:null;
 const candidates=referee&&!fotmobStats?[...new Map(sides.flatMap(side=>prior(side.team.id).slice(0,3)).map(e=>[e.id,e])).values()]:[];
 const previous=await Promise.all(candidates.map(history));
 return {venue:v?.fullName||v?.shortName||'',city:v?.address?.city||'',country:v?.address?.country||'',weather,referee,
  refereeStats:fotmobStats||refereeStats(previous,referee),refereeSource:espnRef?'ESPN':referee?'FotMob':'',
  refereeSourceUrl:referee&&!espnRef?fotmob.url:'',
  broadcast:list(s.broadcasts).map(b=>b.media?.name).filter(Boolean)};
}
module.exports={matchSection,headToHead,rosterFor,refereeStats};
