'use strict';
/* Free-source football events and official ranking country identifiers.
   Only source-reported clocks, goals and rankings are displayed. */
(function(root){
 const COUNTRY_CODES={
  'afghanistan':'AFG','albania':'ALB','algeria':'ALG','american samoa':'ASA',
  'andorra':'AND','angola':'ANG','anguilla':'AIA','antigua and barbuda':'ATG',
  'argentina':'ARG','armenia':'ARM','aruba':'ARU','australia':'AUS',
  'austria':'AUT','azerbaijan':'AZE','bahamas':'BAH','bahrain':'BHR',
  'bangladesh':'BAN','barbados':'BRB','belarus':'BLR','belgium':'BEL','belize':'BLZ',
  'benin':'BEN','bermuda':'BER','bhutan':'BHU','bolivia':'BOL',
  'bosnia and herzegovina':'BIH','bosnia herzegovina':'BIH',
  'botswana':'BOT','brazil':'BRA','british virgin islands':'VGB',
  'brunei':'BRU','bulgaria':'BUL','burkina faso':'BFA','burundi':'BDI',
  'cabo verde':'CPV','cape verde':'CPV','cambodia':'CAM','cameroon':'CMR',
  'canada':'CAN','central african republic':'CTA','chad':'CHA',
  'chile':'CHI','china':'CHN','china pr':'CHN','chinese taipei':'TPE',
  'colombia':'COL','comoros':'COM','congo':'CGO','congo dr':'COD',
  'cook islands':'COK','costa rica':'CRC','cote d ivoire':'CIV',
  'ivory coast':'CIV','croatia':'CRO','cuba':'CUB','curacao':'CUW',
  'cyprus':'CYP','czech republic':'CZE','czechia':'CZE','denmark':'DEN',
  'djibouti':'DJI','dominica':'DMA','dominican republic':'DOM',
  'ecuador':'ECU','egypt':'EGY','el salvador':'SLV','england':'ENG',
  'equatorial guinea':'EQG','eritrea':'ERI','estonia':'EST','eswatini':'SWZ',
  'ethiopia':'ETH','faroe islands':'FRO','fiji':'FIJ','finland':'FIN',
  'france':'FRA','french guiana':'GUF','gabon':'GAB','gambia':'GAM',
  'georgia':'GEO','germany':'GER','ghana':'GHA','gibraltar':'GIB',
  'greece':'GRE','grenada':'GRN','guam':'GUM','guatemala':'GUA',
  'guinea':'GUI','guinea bissau':'GNB','guyana':'GUY','haiti':'HAI',
  'honduras':'HON','hong kong':'HKG','hungary':'HUN','iceland':'ISL',
  'india':'IND','indonesia':'IDN','iran':'IRN','iraq':'IRQ','ireland':'IRL',
  'israel':'ISR','italy':'ITA','jamaica':'JAM','japan':'JPN',
  'jordan':'JOR','kazakhstan':'KAZ','kenya':'KEN','korea dpr':'PRK',
  'north korea':'PRK','south korea':'KOR','korea republic':'KOR',
  'kosovo':'KVX','kuwait':'KUW','kyrgyz republic':'KGZ',
  'kyrgyzstan':'KGZ','laos':'LAO','latvia':'LVA','lebanon':'LBN',
  'lesotho':'LES','liberia':'LBR','libya':'LBY','liechtenstein':'LIE',
  'lithuania':'LTU','luxembourg':'LUX','macao':'MAC','macau':'MAC',
  'madagascar':'MAD','malawi':'MWI','malaysia':'MAS','maldives':'MDV',
  'mali':'MLI','malta':'MLT','mauritania':'MTN','mauritius':'MRI',
  'mexico':'MEX','moldova':'MDA','mongolia':'MNG','montenegro':'MNE',
  'morocco':'MAR','mozambique':'MOZ','myanmar':'MYA',
  'namibia':'NAM','nepal':'NEP','netherlands':'NED',
  'new caledonia':'NCL','new zealand':'NZL','nicaragua':'NCA',
  'niger':'NIG','nigeria':'NGA','north macedonia':'MKD',
  'northern ireland':'NIR','norway':'NOR','oman':'OMA','pakistan':'PAK',
  'palestine':'PLE','panama':'PAN','papua new guinea':'PNG',
  'paraguay':'PAR','peru':'PER','philippines':'PHI','poland':'POL',
  'portugal':'POR','puerto rico':'PUR','qatar':'QAT','romania':'ROU',
  'russia':'RUS','rwanda':'RWA','saint kitts and nevis':'SKN',
  'saint lucia':'LCA','saint vincent and the grenadines':'VIN',
  'samoa':'SAM','san marino':'SMR','sao tome and principe':'STP',
  'saudi arabia':'KSA','scotland':'SCO','senegal':'SEN','serbia':'SRB',
  'seychelles':'SEY','sierra leone':'SLE','singapore':'SGP',
  'slovakia':'SVK','slovenia':'SVN','solomon islands':'SOL',
  'somalia':'SOM','south africa':'RSA','south sudan':'SSD',
  'spain':'ESP','sri lanka':'SRI','sudan':'SDN','suriname':'SUR',
  'sweden':'SWE','switzerland':'SUI','syria':'SYR','tahiti':'TAH',
  'tajikistan':'TJK','tanzania':'TAN','thailand':'THA',
  'timor leste':'TLS','togo':'TOG','tonga':'TGA',
  'trinidad and tobago':'TRI','tunisia':'TUN','turkey':'TUR','turkiye':'TUR',
  'turkmenistan':'TKM','uganda':'UGA','ukraine':'UKR',
  'united arab emirates':'UAE','united states':'USA','usa':'USA',
  'uruguay':'URU','uzbekistan':'UZB','vanuatu':'VAN',
  'venezuela':'VEN','vietnam':'VIE','viet nam':'VIE',
  'wales':'WAL','yemen':'YEM','zambia':'ZAM','zimbabwe':'ZIM'
 };
 const NATIONAL_LEAGUES=new Set(['uefa.nations','fifa.friendly','caf.nations','caf.nations_qual','fifa.world','fifa.worldq.uefa','fifa.worldq.conmebol','fifa.worldq.caf','fifa.worldq.afc','fifa.worldq.concacaf','fifa.worldq.ofc','uefa.euro','uefa.euroq','afc.asian.cup','concacaf.gold','conmebol.america']);
 function normalizedName(value){
  return String(value||'').trim().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
 }
 const ABBREVIATION_ALIASES={GER:'GER',SUI:'SUI',SWI:'SUI',MKD:'MKD',NMA:'MKD',KSA:'KSA',SAU:'KSA',UAE:'UAE',KOR:'KOR',SKR:'KOR',CIV:'CIV',TAH:'TAH',COK:'COK',CHN:'CHN',PRC:'CHN',NED:'NED',HOL:'NED',PAR:'PAR',PYG:'PAR',VIE:'VIE',VNM:'VIE',KGZ:'KGZ',KYR:'KGZ',USA:'USA',ENG:'ENG',SCO:'SCO',WAL:'WAL',NIR:'NIR',TPE:'TPE',PAL:'PLE'};
 const validCodes=new Set(Object.values(COUNTRY_CODES));
 function fifaCode(name,abbr){
  const fromName=COUNTRY_CODES[normalizedName(name)];
  if(fromName)return fromName;
  const short=String(abbr||'').trim().toUpperCase();
  const aliased=ABBREVIATION_ALIASES[short];
  if(aliased)return aliased;
  return validCodes.has(short)?short:null;
 }
 function halftimeName(raw){
  return /\b(?:halftime|half.time|half time|ht|half-time|interval)\b|status_halftime/i.test(String(raw||''));
 }
 function clockTextFromSource(status){
  const raw=String(status?.displayClock||status?.type?.shortDetail||status?.type?.detail||'').trim();
  if(/^\d{1,3}(?:\+\d{1,2})?['′]?$/.test(raw))
   return raw.replace(/['′]$/,'')+'′';
  const clock=Number(status?.clock);
  if(Number.isFinite(clock)&&clock>0&&clock<=120*60)
   return Math.floor(clock/60)+'′';
  return '';
 }
 function getStatusFields(status){
  const type=status?.type||{};
  const blob=[type.name,type.description,type.shortDetail,type.detail,type.state,status?.displayClock].filter(Boolean).join(' ');
  const halftime=halftimeName(blob);
  const state=String(type.state||'').toLowerCase();
  const finished=type.completed===true||state==='post'||/\b(?:final|full.time|ft)\b|status_final|status_full_time/i.test(blob);
  const playing=!finished&&!halftime&&(state==='in'||/\bin progress\b|\blive\b/i.test(blob));
  return {halftime,finished,playing,clock:playing?clockTextFromSource(status):'',
   observedClock:clockTextFromSource(status),
   detail:String(type.shortDetail||type.description||status?.displayClock||'').trim()};
 }
 function cleanMinute(value){
  const str=String(value??'').trim().replace(/[′’]/g,"'").replace(/^(?:MIN|Minute)\s*/i,'');
  const m=str.match(/(?:^|\s)(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*['"]?(?:$|\s)/);
  return m?(m[1]+(m[2]?'+'+m[2]:''))+'′':'';
 }
 function playMinute(play){
  const fromClock=play?.clock?.displayValue||play?.clock?.displayClock||play?.time?.displayValue||
    play?.time?.display||play?.minute||play?.displayMinute||play?.matchMinute||'';
  const direct=cleanMinute(fromClock);
  if(direct)return direct;
  // ESPN clock.value can be match elapsed seconds; never infer minute from kickoff time.
  const sec=Number(play?.clock?.value);
  return Number.isFinite(sec)&&sec>0&&sec<150*60?Math.floor(sec/60)+'′':'';
 }
 function scorerName(play){
  const involved=play?.athletesInvolved?.[0]||play?.participants?.[0]||play?.players?.[0]||play?.athlete||play?.player;
  if(typeof involved==='string'&&involved.trim())return involved.trim();
  if(involved&&typeof involved==='object'){
   const athlete=involved.athlete||involved.player||involved;
   const name=athlete.displayName||athlete.fullName||athlete.name;
   if(typeof name==='string'&&name.trim())return name.trim();
  }
  const candidate=play?.scorer?.displayName||play?.scorer?.name;
  return typeof candidate==='string'?candidate.trim():'';
 }
 function isGoal(play){
  const type=String(play?.type?.text||play?.type?.displayName||play?.type?.name||play?.type?.description||play?.playType?.text||play?.eventType||'');
  const text=String(play?.shortText||play?.text||play?.description||'');
  if(/disallow|ruled out|no goal|missed|saved|not scored|overturned|var.?cancel/i.test(type+' '+text))return false;
  if(play?.scoringPlay===true || play?.isGoal===true)return true;
  return /\bgoal\b|penalty.scored/i.test(type)&&!/\bgoal kick\b|\bgoalkeeper\b/i.test(type);
 }
 function collectGoalEvents(data){
  const nodes=[
   ...(Array.isArray(data?.keyEvents)?data.keyEvents:[]),
   ...(Array.isArray(data?.scoringPlays)?data.scoringPlays:[]),
   ...(Array.isArray(data?.plays)?data.plays:[]),
   ...(Array.isArray(data?.details)?data.details:[]),
   ...(Array.isArray(data?.header?.competitions?.[0]?.details)?data.header.competitions[0].details:[]),
   ...(Array.isArray(data?.gameInfo?.details)?data.gameInfo.details:[]),
   ...(Array.isArray(data?.boxscore?.keyEvents)?data.boxscore.keyEvents:[])
  ];
  const seen=new Set(),goals=[];
  for(const event of nodes){
   if(!event||!isGoal(event))continue;
   const minute=playMinute(event),scorer=scorerName(event);
   const text=String(event.shortText||event.text||event.description||'');
   const kind=String(event.type?.text||event.type?.description||event.type?.name||text);
   const ownGoal=/own goal|o\.g\.|og$/i.test(kind)||event.ownGoal===true;
   const penalty=/penalty|pen\./i.test(kind);
   const teamId=String(event.team?.id||event.teamId||event.team?.team?.id||'');
   const teamName=String(event.team?.displayName||event.team?.name||event.team?.team?.displayName||'');
   const key=event.id?String(event.id):[minute,scorer,teamId||teamName].join('|');
   if(seen.has(key))continue;
   seen.add(key);
   goals.push({minute,scorer:scorer||'進球者未提供',teamId,teamName,
    kind:ownGoal?'烏龍球':penalty?'十二碼進球':'進球',sourceText:text,
    sort:Number((minute.match(/^\d+/)||[])[0]||999)});
  }
  return goals.sort((a,b)=>a.sort-b.sort);
 }
 function summaryStatus(data){
  const h=data?.header||{};
  const competition=h.competitions?.[0]||{};
  return competition.status||h.status||data?.status||null;
 }
 function summaryScores(data){
  const competition=data?.header?.competitions?.[0]||{};
  const teams=competition.competitors||[];
  const home=teams.find(x=>x.homeAway==='home'),away=teams.find(x=>x.homeAway==='away');
  if(!home||!away)return null;
  const extract=x=>{const v=x?.score?.value??x?.score;return v===null||v===''||v===undefined?null:Number(v)};
  const h=extract(home),a=extract(away);
  if(!Number.isInteger(h)||!Number.isInteger(a)||h<0||a<0)return null;
  return {home:h,away:a};
 }
 const api={fifaCode,NATIONAL_LEAGUES,getStatusFields,clockTextFromSource,collectGoalEvents,summaryStatus,summaryScores};
 root.FootballLive=Object.freeze(api);
})(window);
