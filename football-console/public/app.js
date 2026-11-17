'use strict';
const LEAGUES=[
{id:'eng.1',name:'英格蘭超級聯賽',short:'英超',group:'歐洲聯賽',fd:'PL',tsdb:['English Premier League','Premier League']},
{id:'eng.2',name:'英格蘭冠軍聯賽',short:'英冠',group:'歐洲聯賽',fd:'ELC',tsdb:['English League Championship','English Championship']},
{id:'esp.1',name:'西班牙甲級聯賽',short:'西甲',group:'歐洲聯賽',fd:'PD',tsdb:['Spanish La Liga','Spanish Primera Division']},
{id:'ger.1',name:'德國甲級聯賽',short:'德甲',group:'歐洲聯賽',fd:'BL1',tsdb:['German Bundesliga','Bundesliga']},
{id:'ita.1',name:'義大利甲級聯賽',short:'義甲',group:'歐洲聯賽',fd:'SA',tsdb:['Italian Serie A']},
{id:'fra.1',name:'法國甲級聯賽',short:'法甲',group:'歐洲聯賽',fd:'FL1',tsdb:['French Ligue 1']},
{id:'ned.1',name:'荷蘭甲級聯賽',short:'荷甲',group:'歐洲聯賽',fd:'DED',tsdb:['Dutch Eredivisie']},
{id:'por.1',name:'葡萄牙超級聯賽',short:'葡超',group:'歐洲聯賽',fd:'PPL',tsdb:['Portuguese Primeira Liga']},
{id:'sco.1',name:'蘇格蘭超級聯賽',short:'蘇超',group:'歐洲聯賽',tsdb:['Scottish Premier League']},
{id:'bel.1',name:'比利時甲級聯賽',short:'比甲',group:'歐洲聯賽',tsdb:['Belgian Pro League']},
{id:'tur.1',name:'土耳其超級聯賽',short:'土超',group:'歐洲聯賽',tsdb:['Turkish Super Lig']},
{id:'uefa.champions',name:'歐洲冠軍聯賽',short:'歐冠',group:'洲際與國家隊',fd:'CL',tsdb:['UEFA Champions League','Champions League']},
{id:'uefa.europa',name:'歐洲聯賽',short:'歐霸',group:'洲際與國家隊',tsdb:['UEFA Europa League']},
{id:'uefa.europa.conf',name:'歐洲協會聯賽',short:'歐協',group:'洲際與國家隊',tsdb:['UEFA Europa Conference League','UEFA Conference League']},
{id:'uefa.nations',name:'歐洲國家聯賽',short:'歐國聯',group:'洲際與國家隊',tsdb:['UEFA Nations League']},
{id:'caf.nations',name:'非洲國家盃',short:'非洲盃',group:'洲際與國家隊',tsdb:['Africa Cup of Nations','African Nations Cup']},
{id:'caf.nations_qual',name:'非洲國家盃資格賽',short:'非洲盃資格賽',group:'洲際與國家隊',tsdb:['Africa Cup of Nations Qualification','Africa Cup of Nations Qualifying','African Cup of Nations Qualifying']}, 
{id:'fifa.worldq.uefa',name:'世界盃歐洲區資格賽',short:'世歐預',group:'洲際與國家隊',tsdb:['FIFA World Cup Qualifying UEFA']},
{id:'fifa.worldq.conmebol',name:'世界盃南美區資格賽',short:'世南預',group:'洲際與國家隊',tsdb:['FIFA World Cup Qualifying CONMEBOL']},
{id:'fifa.world',name:'世界盃',short:'世界盃',group:'洲際與國家隊',fd:'WC',tsdb:['FIFA World Cup']},
{id:'fifa.friendly',name:'國際友誼賽',short:'友誼賽',group:'洲際與國家隊',tsdb:['International Friendly','International Friendlies']},
{id:'conmebol.libertadores',name:'南美自由盃',short:'自由盃',group:'洲際與國家隊',tsdb:['Copa Libertadores']},
{id:'concacaf.champions',name:'中北美冠軍盃',short:'中北美冠軍盃',group:'洲際與國家隊',tsdb:['CONCACAF Champions Cup']},
{id:'afc.champions',name:'亞洲冠軍聯賽',short:'亞冠',group:'洲際與國家隊',tsdb:['AFC Champions League']},
{id:'bra.1',name:'巴西甲級聯賽',short:'巴甲',group:'美洲與亞洲',fd:'BSA',tsdb:['Brazilian Serie A','Brazil Serie A']},
{id:'arg.1',name:'阿根廷甲級聯賽',short:'阿甲',group:'美洲與亞洲',tsdb:['Argentinian Primera Division','Argentine Primera Division']},
{id:'usa.1',name:'美國職業足球大聯盟',short:'美職聯',group:'美洲與亞洲',tsdb:['American Major League Soccer','Major League Soccer']},
{id:'mex.1',name:'墨西哥甲級聯賽',short:'墨超',group:'美洲與亞洲',tsdb:['Mexican Primera League','Mexican Liga MX']},
{id:'ksa.1',name:'沙烏地職業聯賽',short:'沙職',group:'美洲與亞洲',tsdb:['Saudi Professional League','Saudi Pro League']},
{id:'jpn.1',name:'日本職業足球聯賽',short:'日職',group:'美洲與亞洲',tsdb:['Japanese J1 League','Japanese J League']},
{id:'kor.1',name:'韓國職業足球聯賽',short:'韓職',group:'美洲與亞洲',tsdb:['South Korean K League 1','Korean K League 1']},
{id:'aus.1',name:'澳洲甲級聯賽',short:'澳甲',group:'美洲與亞洲',tsdb:['Australian A-League']},
{id:'chn.1',name:'中國超級聯賽',short:'中超',group:'美洲與亞洲',tsdb:['Chinese Super League']}
];
const LN=Object.fromEntries(LEAGUES.map(x=>[x.id,x]));
const PROVIDERS={espn:'ESPN',tsdb:'TheSportsDB',fd:'football-data.org',import:'匯入資料'};
const STORE='football-console-v1';
const defaults=['eng.1','eng.2','esp.1','ger.1','ita.1','fra.1','uefa.champions','uefa.nations','fifa.friendly','bra.1','usa.1','ksa.1'];
let selected=new Set(defaults);
let draftSelected=new Set();
let page='fixtures',running=false,stopped=false,dirty=false;
const state={requests:[],raw:[],fixtures:[],issues:[],manual:{},lastAt:'',history:[],runId:''};
const $=(id)=>document.getElementById(id);
function html(s){return String(s===null||s===undefined?'':s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function ymd(d){return new Date(d).toISOString().slice(0,10)}
function dayAdd(s,n){const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return ymd(d)}
function daySpan(a,b){return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)}
function tzParts(input){const d=new Date(input);if(!Number.isFinite(d.getTime()))return null;const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);const p={};parts.forEach(x=>{if(x.type!=='literal')p[x.type]=x.value});return {day:p.year+'-'+p.month+'-'+p.day,stamp:p.year+'/'+p.month+'/'+p.day+' '+p.hour+':'+p.minute,time:p.hour+':'+p.minute}}
function taiwanToday(){return tzParts(new Date()).day}
function stampDate(d){return d?d.replaceAll('-','/'):'—'}
function shortStamp(s){const p=tzParts(s);return p?p.stamp:'—'}
function getConfig(){return {dateFrom:$('dateFrom').value,dateTo:$('dateTo').value,leagues:[...selected],providers:{espn:$('useEspn').checked,tsdb:$('useTsdb').checked,fd:$('useFd').checked}}}
function validPeriod(){const a=$('dateFrom').value,b=$('dateTo').value;if(!a||!b)return '請設定起始與結束日期';const span=daySpan(a,b);if(!Number.isFinite(span)||span<0)return '結束日期不得早於起始日期';if(span>13)return '單次最多檢查連續 14 天';if(selected.size===0)return '請選擇至少一個聯賽';if(!$('useEspn').checked&&!$('useTsdb').checked&&!$('useFd').checked)return '請選擇至少一個資料來源';return ''}
function daysIn(a,b){const out=[];for(let d=a;d<=b;d=dayAdd(d,1))out.push(d);return out}
function plan(){const cfg=getConfig();if(validPeriod())return [];const utcDays=daysIn(dayAdd(cfg.dateFrom,-1),cfg.dateTo);const out=[];let seq=1;
 if(cfg.providers.espn)for(const league of cfg.leagues)for(const day of utcDays)out.push({id:'E'+seq++,provider:'espn',league,date:day,status:'pending',url:'https://site.api.espn.com/apis/site/v2/sports/soccer/'+league+'/scoreboard?dates='+day.replaceAll('-',''),note:'UTC 查詢日 '+day});
 if(cfg.providers.tsdb)for(const day of utcDays)out.push({id:'T'+seq++,provider:'tsdb',league:'',date:day,status:'pending',url:'https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d='+day+'&s=Soccer',note:'涵蓋多聯賽（免費來源非完整覆蓋）'});
 if(cfg.providers.fd)for(const league of cfg.leagues){const code=LN[league]&&LN[league].fd;if(code)out.push({id:'F'+seq++,provider:'fd',league,date:cfg.dateFrom,dateFrom:dayAdd(cfg.dateFrom,-1),dateTo:cfg.dateTo,competition:code,status:'pending',url:'https://api.football-data.org/v4/competitions/'+code+'/matches?dateFrom='+dayAdd(cfg.dateFrom,-1)+'&dateTo='+cfg.dateTo,note:'選用 API 金鑰'})}
 return out}
function bindOverview(){const cfg=getConfig();$('selectedLeaguesLabel').textContent=selected.size+' 個聯賽已選';$('fdSettings').classList.toggle('hidden',!cfg.providers.fd&&!$('fdSettings').dataset.open);$('kpiExpected').textContent=(dirty?plan().length:state.requests.length)||plan().length;$('kpiExpectedMeta').textContent=dirty?'條件已調整，請重新檢查':(state.requests.length?'已產生實際請求清單':'依日期與聯賽建立清單');$('kpiSuccess').textContent=state.requests.filter(x=>x.status==='ok').length;$('kpiSuccessMeta').textContent='失敗 '+state.requests.filter(x=>x.status==='error').length+' · 未執行 '+state.requests.filter(x=>x.status==='pending'||x.status==='skipped').length;$('kpiFixtures').textContent=state.fixtures.length;$('kpiFixturesMeta').textContent='合併 '+state.raw.length+' 筆來源賽事';$('kpiIssues').textContent=state.issues.length;$('kpiIssuesMeta').textContent='含缺漏與欄位驗證紀錄';$('navRequestCount').textContent=state.requests.length;$('navIssueCount').textContent=state.issues.length;$('lastCheck').textContent=state.lastAt?'上次執行：'+shortStamp(state.lastAt):'尚無執行紀錄';$('systemStatus').textContent=running?'資料抓取中':state.lastAt?'查核紀錄已保存':'系統待命中';$('footerStatus').textContent=running?'正在查核資料':state.lastAt?'最近查核 '+shortStamp(state.lastAt):'未執行資料抓取'}
function sourceCard(provider,title,initial){
 const data=state.requests.filter(r=>r.provider===provider),done=data.filter(r=>r.status==='ok').length,bad=data.filter(r=>r.status==='error').length;
 const enabled=provider==='import'?data.length>0:$(provider==='espn'?'useEspn':provider==='tsdb'?'useTsdb':'useFd').checked;
 const label=!enabled?'未啟用':!data.length?'等待執行':bad?'部分異常':done===data.length?'已完成':done?'處理中':'待驗證';
 const status=!enabled||!data.length?'pending':bad?'error':done===data.length?'ok':'warn';
 const count=data.reduce((n,r)=>n+(r.count||0),0);
 return '<div class="source-card"><div class="source-card-main"><span class="source-mark">'+html(initial)+'</span><div><strong>'+html(title)+'</strong><small>'+(data.length?'成功 '+done+' / '+data.length+' · 回傳 '+count+' 筆':'尚無實際回應')+'</small></div></div><span class="status '+status+'">'+label+'</span></div>';
}
function renderSources(){$('sourceCards').innerHTML=sourceCard('espn','ESPN','E')+sourceCard('tsdb','TheSportsDB','T')+sourceCard('fd','football-data.org','F')+(state.requests.some(r=>r.provider==='import')?sourceCard('import','外部匯入','＋'):'')}
function providerName(p){return PROVIDERS[p]||p}
function sourcePills(v){return (v||[]).map(p=>'<span class="source-pill">'+html(providerName(p))+'</span>').join('')}
function leagueName(id){return LN[id]?LN[id].short:id||'未識別聯賽'}
function statusBadge(status,manual){const labels={ok:'完整',warn:'待確認',error:'異常',pending:'未執行',skipped:'未執行',duplicate:'重複',missing:'缺漏'};return '<span class="status '+html(status)+'">'+html(manual||labels[status]||status)+'</span>'}
function getFilters(){return {league:$('filterLeague').value,date:$('filterDate').value,source:$('filterSource').value,status:$('filterStatus').value,text:$('searchText').value.trim().toLowerCase()}}
function relevant(f,v){if(f.league&&f.league!==v.league)return false;if(f.date&&f.date!==v.date)return false;if(f.source&&!(v.sources||[v.provider]).includes(f.source))return false;if(f.status&&f.status!==v.status)return false;if(f.text&&!String([v.id,v.eventId,v.home,v.away,v.league,v.url,v.note,v.message,v.kind].join(' ')).toLowerCase().includes(f.text))return false;return true}
function updateFilterOptions(){
 const l=$('filterLeague'),d=$('filterDate'),lv=l.value,dv=d.value;
 const ids=new Set([...selected,...state.fixtures.map(x=>x.league),...state.requests.map(x=>x.league).filter(Boolean),...state.issues.map(x=>x.league).filter(Boolean)]);
 l.innerHTML='<option value="">全部聯賽</option>'+[...ids].sort((a,b)=>leagueName(a).localeCompare(leagueName(b),'zh-Hant')).map(id=>'<option value="'+html(id)+'">'+html(leagueName(id))+'</option>').join('');
 const dates=new Set([...state.fixtures.map(x=>x.date),...state.issues.map(x=>x.date).filter(Boolean),...daysIn($('dateFrom').value,$('dateTo').value).slice(0,14)]);
 d.innerHTML='<option value="">全部日期</option>'+[...dates].sort().map(v=>'<option value="'+html(v)+'">'+stampDate(v)+'</option>').join('');
 l.value=[...ids].includes(lv)?lv:'';d.value=dates.has(dv)?dv:'';
}
function renderFixtures(){
 const f=getFilters(),items=state.fixtures.filter(r=>relevant(f,r)).sort((a,b)=>String(a.dateTime||'').localeCompare(String(b.dateTime||'')));
 $('fixtureRows').innerHTML=items.map(r=>{
 const st=r.status,when=tzParts(r.dateTime);
 return '<tr><td class="time-primary">'+html(when?when.stamp:'日期待確認')+'</td><td class="league-cell">'+html(leagueName(r.league))+'</td><td><span class="team-pair">'+html(r.home||'主隊缺漏')+'<small>VS</small>'+html(r.away||'客隊缺漏')+'</span></td><td class="id-cell">'+html(r.eventIds.slice(0,2).join(' · ')||'缺漏')+'</td><td><div class="source-pills">'+sourcePills(r.sources)+'</div></td><td><div class="completeness"><div class="meter'+(r.completeness<80?' low':'')+'"><div style="width:'+r.completeness+'%"></div></div><span>'+r.completeness+'%</span></div></td><td>'+statusBadge(st)+'</td><td><button class="table-action" data-fixture="'+html(r.key)+'">查看</button></td></tr>';
 }).join('');
 $('fixtureEmpty').classList.toggle('hidden',items.length>0);$('tableCount').textContent=items.length;$('tableFooter').textContent='顯示 '+items.length+' / '+state.fixtures.length+' 筆去重賽事';
}
function renderRequests(){
 const all=state.requests.length?state.requests:plan(),f=getFilters();
 const items=all.filter(x=>relevant(f,{league:x.league,date:x.date,provider:x.provider,status:x.status,id:x.id,url:x.url}));
 $('requestRows').innerHTML=items.map(r=>'<tr><td><strong>'+html(providerName(r.provider))+'</strong></td><td>'+html(r.league?leagueName(r.league):'多聯賽')+'<br><span class="muted">'+html(r.dateFrom?r.dateFrom+'～'+r.dateTo:r.date||'匯入')+'</span></td><td class="id-cell">'+html(r.url||'本地檔案')+'</td><td>'+html(r.http||'—')+'</td><td>'+html(r.count===undefined?'—':r.count)+(r.accepted!==undefined?'<span class="muted">（採用 '+r.accepted+'）</span>':'')+'</td><td>'+html(r.duration===undefined?'—':r.duration+' ms')+'</td><td>'+statusBadge(r.status,r.status==='error'?'失敗':undefined)+'</td><td><button class="table-action" data-request="'+html(r.id)+'">查看</button></td></tr>').join('');
 $('requestEmpty').classList.toggle('hidden',items.length>0);$('tableCount').textContent=items.length;$('tableFooter').textContent='顯示 '+items.length+' / '+all.length+' 筆預期請求';
}
function renderIssues(){
 const f=getFilters(),items=state.issues.filter(x=>relevant(f,x));
 $('issueRows').innerHTML=items.map(x=>'<tr><td>'+statusBadge(x.status||'warn',html(x.kind))+'</td><td>'+html(stampDate(x.date))+'</td><td>'+html(leagueName(x.league))+'</td><td class="id-cell">'+html(x.eventId||x.requestId||'—')+'</td><td>'+html(providerName(x.provider))+'</td><td style="white-space:normal;min-width:190px">'+html(x.message)+'</td><td>'+statusBadge(x.status||'warn',x.ack?'已確認':'待處理')+'</td></tr>').join('');
 $('issueEmpty').classList.toggle('hidden',items.length>0);$('tableCount').textContent=items.length;$('tableFooter').textContent='顯示 '+items.length+' / '+state.issues.length+' 筆異常紀錄';
}
function renderResponses(){
 const sel=$('responseSelect'),previous=sel.value;
 const available=state.requests.filter(r=>r.payload!==undefined||r.error);
 sel.innerHTML='<option value="">請選擇請求</option>'+available.map(r=>'<option value="'+html(r.id)+'">'+html(providerName(r.provider))+' · '+html(r.league?leagueName(r.league):'多聯賽')+' · '+html(r.date||'匯入')+' · '+r.id+'</option>').join('');
 sel.value=available.some(x=>x.id===previous)?previous:(available.length?available[0].id:'');
 const current=state.requests.find(x=>x.id===sel.value);
 $('responseMeta').textContent=current?'來源：'+providerName(current.provider)+'　·　HTTP：'+(current.http||'—')+'　·　回傳時間：'+shortStamp(current.receivedAt)+'　·　回傳筆數：'+(current.count||0):'尚無實際回應';
 $('responseBody').textContent=current?JSON.stringify(current.payload!==undefined?current.payload:{error:current.error,note:current.note},null,2):'尚無原始回傳內容。';
}
function render(){
 bindOverview();renderSources();updateFilterOptions();['fixtures','requests','issues','responses'].forEach(p=>$(p+'View').classList.toggle('hidden',p!==page));
 const titles={fixtures:'去重後賽程清單',requests:'預期請求與實際回應',issues:'異常與缺漏紀錄',responses:'來源原始資料'};
 const idx={fixtures:'03',requests:'04',issues:'05',responses:'06'};
 $('tableTitle').textContent=titles[page];$('tableIndex').textContent=idx[page];$('crumbName').textContent={fixtures:'賽程總覽',requests:'請求紀錄',issues:'驗證異常',responses:'原始回應'}[page];
 document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===page));
 $('revalidateBtn').style.display=page==='fixtures'||page==='issues'?'':'none';
 if(page==='fixtures')renderFixtures();else if(page==='requests')renderRequests();else if(page==='issues')renderIssues();else renderResponses();
}
function toast(msg,isError){const el=$('toast');el.textContent=msg;el.classList.toggle('error',!!isError);el.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),3700)}
function markConfigChange(){dirty=true;render()}
function initLeagues(){
 draftSelected=new Set(selected);$('leagueSearch').value='';renderLeagueList();$('leagueModal').classList.remove('hidden');
}
function renderLeagueList(){
 const q=$('leagueSearch').value.toLowerCase().trim(),subset=LEAGUES.filter(x=>(x.name+' '+x.short+' '+x.id).toLowerCase().includes(q));let group='';
 $('leagueList').innerHTML=subset.map(x=>{let heading='';if(x.group!==group){group=x.group;heading='<div class="league-group">'+html(group)+'</div>'}return heading+'<label class="league-item"><input type="checkbox" data-league="'+html(x.id)+'" '+(draftSelected.has(x.id)?'checked':'')+'><span>'+html(x.name)+'</span><small>'+html(x.id)+'</small></label>'}).join('')||'<div class="empty">找不到聯賽</div>';
 $('leagueSelectedCount').textContent='已選 '+draftSelected.size+' 個聯賽';
}
function openModal(id){$(id).classList.remove('hidden')}
function closeModal(id){$(id).classList.add('hidden')}
function dateAndTimeGuess(date,time){if(!date)return null;if(time){let t=String(time).trim();if(t.match(/^\d\d:\d\d$/))t+=':00';if(t.match(/^\d\d:\d\d:\d\d$/))return date+'T'+t+'Z'}return date+'T00:00:00Z'}
function guessLeague(source,e,fallback){
 if(fallback&&LN[fallback])return fallback;
 if(source==='fd'){const code=e.competition&&e.competition.code;const l=LEAGUES.find(x=>x.fd===code);return l?l.id:(e.competition&&e.competition.name)||'未知聯賽'}
 if(source==='tsdb'){const league=String(e.strLeague||'').trim().toLowerCase(),found=LEAGUES.find(x=>x.tsdb&&x.tsdb.some(n=>n.toLowerCase()===league));return found?found.id:null}
 const name=e.league||e.leagueId||e.competition||e.strLeague; if(LN[name])return name;const match=LEAGUES.find(x=>x.name===name||x.short===name||x.fd===name||x.tsdb&&x.tsdb.includes(name));return match?match.id:(String(name||'')||null)
}
function extract(provider,data,req){
 let rows=[];
 if(provider==='espn'){if(!data||!Array.isArray(data.events))throw Error('ESPN 回應缺少 events 陣列');rows=data.events.map(e=>{const c=e.competitions&&e.competitions[0]||{},teams=c.competitors||[];const home=teams.find(t=>t.homeAway==='home'),away=teams.find(t=>t.homeAway==='away');return {eventId:e.id??null,league:req.league,dateTime:e.date||c.date||null,home:home&&home.team&&(home.team.displayName||home.team.name),away:away&&away.team&&(away.team.displayName||away.team.name),status:e.status&&e.status.type&&(e.status.type.name||e.status.type.description)||null,raw:e}})}
 else if(provider==='tsdb'){if(!data||!(data.events===null||Array.isArray(data.events)))throw Error('TheSportsDB 回應缺少 events 欄位');rows=(data.events||[]).map(e=>({eventId:e.idEvent??null,league:guessLeague('tsdb',e,null),dateTime:e.strTimestamp||dateAndTimeGuess(e.dateEvent,e.strTime),home:e.strHomeTeam||null,away:e.strAwayTeam||null,status:e.strStatus||null,raw:e})).filter(x=>x.league&&selected.has(x.league))}
 else if(provider==='fd'){if(!data||!Array.isArray(data.matches))throw Error('football-data.org 回應缺少 matches 陣列');rows=data.matches.map(e=>({eventId:e.id??null,league:guessLeague('fd',e,req.league),dateTime:e.utcDate||null,home:e.homeTeam&&(e.homeTeam.name||e.homeTeam.shortName),away:e.awayTeam&&(e.awayTeam.name||e.awayTeam.shortName),status:e.status||null,raw:e}))}
 else if(provider==='import'){
  let entries=Array.isArray(data)?data:data&&(data.matches||data.events||data.fixtures||data.rows||data.data&&data.data.events);
  if(!Array.isArray(entries))throw Error('無法識別賽程陣列（需要 events、matches、fixtures 或陣列）');
  rows=entries.map((e,i)=>{
    if(e.competitions&&Array.isArray(e.competitions))return extract('espn',{events:[e]},{league:guessLeague('import',e,null)})[0];
    if(e.strHomeTeam!==undefined)return extract('tsdb',{events:[e]},{})[0]||{eventId:e.idEvent||null,league:guessLeague('tsdb',e,null),dateTime:e.strTimestamp||dateAndTimeGuess(e.dateEvent,e.strTime),home:e.strHomeTeam,away:e.strAwayTeam,status:e.strStatus,raw:e};
    if(e.utcDate&&e.homeTeam&&typeof e.homeTeam==='object')return extract('fd',{matches:[e]},{league:guessLeague('fd',e,null)})[0];
    return {eventId:e.eventId??e.id??e.event_id??e.match_id??null,league:guessLeague('import',e,null),dateTime:e.dateTime||e.utcDate||e.kickoff||e.timestamp||e.startTime||e.datetime||e.date||null,home:e.home||e.homeTeam||e.home_team||e.home_name||null,away:e.away||e.awayTeam||e.away_team||e.away_name||null,status:e.status||null,raw:e};
  })}
 return rows.map((x,i)=>({...x,provider,requestId:req.id,rowId:req.id+':'+i,home:typeof x.home==='object'?(x.home&&x.home.name)||'':x.home,away:typeof x.away==='object'?(x.away&&x.away.name)||'':x.away,league:x.league||null,eventId:x.eventId===null?null:String(x.eventId)}))
}
function sourceIssue(req,kind,msg,status){return {id:'I'+Math.random().toString(36).slice(2),kind,status:status||'error',provider:req.provider,league:req.league||'',date:req.date||'',requestId:req.id,eventId:'',message:msg,scope:'request',ack:false}}
async function perform(req){
 req.status='loading';req.error='';req.payload=undefined;req.count=undefined;req.receivedAt='';req.duration=undefined;const started=performance.now();
 try{
   if(req.provider==='fd'&&!$('fdToken').value.trim()){req.status='skipped';req.error='未填入 football-data.org API 金鑰';return}
   const options=req.provider==='fd'?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({competition:req.competition,dateFrom:req.dateFrom,dateTo:req.dateTo,token:$('fdToken').value.trim()})}:{};
   const endpoint=req.provider==='fd'?'/api/football-data':'/api/fixtures?provider='+req.provider+'&date='+encodeURIComponent(req.date)+(req.provider==='espn'?'&league='+encodeURIComponent(req.league):'');
   const response=await fetch(endpoint,options);let body=await response.json();
   req.http=body.upstreamStatus||response.status;req.receivedAt=body.receivedAt||new Date().toISOString();req.url=body.requestUrl||req.url;
   req.payload=body.data!==undefined?body.data:body;
   if(!response.ok||req.http!==200)throw Error(body.error||body.data&&body.data.message||'HTTP '+req.http);
   const entries=extract(req.provider,body.data,req);
   req.count=req.provider==='tsdb'?(Array.isArray(body.data.events)?body.data.events.length:0):entries.length;
   req.accepted=entries.length;req.status='ok';
   state.raw.push(...entries);
 }catch(err){req.status='error';req.error=String(err.message||err)}
 finally{req.duration=Math.round(performance.now()-started)}
}
function normTeam(name){
 let s=String(name||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,'and').replace(/[^a-z0-9\u4e00-\u9fa5 ]/g,' ').replace(/\b(football|soccer|club|fc|cf|afc|sc|ac|de|the|calcio)\b/g,' ').replace(/\s+/g,' ').trim();
 const aliases={'manchester utd':'manchester united','man united':'manchester united','man city':'manchester city','psg':'paris saint germain','inter milan':'internazionale','internazionale milano':'internazionale','atletico de madrid':'atletico madrid','bayern munchen':'bayern munich','bayern muenchen':'bayern munich','spurs':'tottenham hotspur','newcastle utd':'newcastle united','wolves':'wolverhampton wanderers'};
 return aliases[s]||s
}
function teamsEqual(a,b){const x=normTeam(a),y=normTeam(b);return !!x&&!!y&&(x===y||x.length>=8&&y.length>=8&&(x.includes(y)||y.includes(x)))}
function recordCompleteness(x){
 let count=0;if(x.eventId)count++;if(x.league)count++;if(x.home)count++;if(x.away)count++;if(x.dateTime&&Number.isFinite(Date.parse(x.dateTime)))count++;return count*20
}
function makeIssue(raw,kind,message,status){return {id:'V'+raw.rowId+kind,kind,status:status||'warn',provider:raw.provider,league:raw.league||'',date:tzParts(raw.dateTime)?.day||'',eventId:raw.eventId||'',requestId:raw.requestId,message,scope:'event',ack:false}}
function fixtureIdentity(r){return r.league+'|'+normTeam(r.home)+'|'+normTeam(r.away)+'|'+String(r.dateTime||'').slice(0,16)}
function sameFixture(a,b){
 if(a.league!==b.league)return false;
 if(a.provider===b.provider&&a.eventId&&b.eventId&&a.eventId===b.eventId)return true;
 if(!teamsEqual(a.home,b.home)||!teamsEqual(a.away,b.away))return false;
 const ta=Date.parse(a.dateTime),tb=Date.parse(b.dateTime);
 return Number.isFinite(ta)&&Number.isFinite(tb)&&Math.abs(ta-tb)<=2*3600000
}
function revalidate(silent){
 const base=state.requests.filter(x=>x.status==='error'||x.status==='skipped').map(r=>sourceIssue(r,r.status==='skipped'?'MISSING_CREDENTIAL':'FETCH_FAILED',r.error||'來源回應失敗',r.status==='skipped'?'warn':'error'));
 const cfg=getConfig(),lo=cfg.dateFrom,hi=cfg.dateTo;
 const issues=[...base],groups=[],seenRowIds=new Set();
 const recs=state.raw.slice().sort((a,b)=>{const p={espn:0,fd:1,tsdb:2,import:3};return (p[a.provider]||0)-(p[b.provider]||0)});
 for(const r of recs){
  if(seenRowIds.has(r.rowId))continue;seenRowIds.add(r.rowId);
  const time=tzParts(r.dateTime);if(time&&(time.day<lo||time.day>hi))continue;
  if(!r.eventId)issues.push(makeIssue(r,'FIELD_MISSING','事件識別碼缺漏','warn'));
  if(!r.league||r.league==='未知聯賽')issues.push(makeIssue(r,'FIELD_MISSING','聯賽欄位無法辨識','warn'));
  if(!r.home||!r.away)issues.push(makeIssue(r,'FIELD_MISSING','主隊或客隊欄位缺漏','error'));
  if(!time)issues.push(makeIssue(r,'FIELD_INVALID','開賽時間缺漏或格式無效','error'));
  if(r.home&&r.away&&teamsEqual(r.home,r.away))issues.push(makeIssue(r,'FIELD_INVALID','主客隊名稱相同','error'));
  let group=groups.find(g=>sameFixture(g[0],r));
  if(group){
   if(group.some(x=>x.provider===r.provider)){
     issues.push(makeIssue(r,'DUPLICATE','同一來源重複回傳相同賽事','warn'));
   }
   const matched=group[0];const ta=Date.parse(matched.dateTime),tb=Date.parse(r.dateTime);
   if(Number.isFinite(ta)&&Number.isFinite(tb)&&Math.abs(ta-tb)>15*60000)issues.push(makeIssue(r,'TIME_CONFLICT','不同資料來源的開賽時間差超過 15 分鐘','warn'));
   group.push(r);
  }else groups.push([r]);
 }
 const list=groups.map(group=>{
  const main=group[0],key=fixtureIdentity(main),sources=[...new Set(group.map(x=>x.provider))],recordIssues=issues.filter(x=>group.some(r=>r.rowId&&x.id.startsWith('V'+r.rowId)));
  const hasDuplicate=recordIssues.some(i=>i.kind==='DUPLICATE');
  let status=recordIssues.some(x=>x.status==='error')?'error':hasDuplicate?'duplicate':recordIssues.length?'warn':'ok';
  const manual=state.manual[key];
  if(manual==='missing'){issues.push({...makeIssue(main,'MANUAL_MISSING','使用者標記：資料缺漏待補','warn'),id:'M'+key});status='missing'}
  if(manual==='ack'&&status!=='error'&&status!=='missing')status='ok';
  const ids=[...new Set(group.map(x=>x.eventId).filter(Boolean))];
  return {key,league:main.league,date:tzParts(main.dateTime)?.day||'',dateTime:main.dateTime,home:main.home||'',away:main.away||'',eventIds:ids,sources,status,completeness:Math.max(...group.map(recordCompleteness)),records:group};
 });
 // Only compare with a fully returned supplementary competition response.
 for(const fixture of list){
  if(!fixture.sources.includes('espn')||fixture.sources.includes('fd'))continue;
  const available=state.requests.find(q=>q.provider==='fd'&&q.league===fixture.league&&q.status==='ok');
  if(!available)continue;
  const raw=fixture.records[0];
  issues.push({...makeIssue(raw,'SOURCE_GAP','football-data.org 未找到對應賽事；可能是來源授權或覆蓋差異，需人工確認','warn'),id:'G'+fixture.key});
  if(fixture.status==='ok')fixture.status='missing';
 }
 state.fixtures=list;state.issues=issues; if(!silent){render();toast('已重新執行欄位驗證與去重')}
}
function setProgress(done,total){$('progressContainer').classList.remove('hidden');$('progressTitle').textContent=running?'正在查詢資料來源':'查核完成';$('progressLabel').textContent=done+' / '+total;$('progressBar').style.width=(total?Math.round(done/total*100):0)+'%'}
async function runCheck(){
 if(running){stopped=true;toast('停止建立後續請求，已發出的請求會完成');return}
 const problem=validPeriod();if(problem){toast(problem,true);return}
 if($('useFd').checked&&!$('fdToken').value.trim())toast('football-data.org 未填入金鑰，相關請求將標記為未執行');
 state.requests=plan();state.raw=[];state.fixtures=[];state.issues=[];state.manual={};state.runId='run-'+Date.now();dirty=false;stopped=false;running=true;
 $('runText').textContent='停止檢查';$('runGlyph').textContent='■';
 let cursor=0,done=0;const total=state.requests.length;setProgress(0,total);page='requests';render();
 async function worker(){
  while(!stopped){const i=cursor++;if(i>=total)break;const request=state.requests[i];await perform(request);done++;setProgress(done,total);if(done%2===0||done===total)render()}
 }
 await Promise.all(Array.from({length:Math.min(3,total)},worker));
 if(stopped)for(const r of state.requests)if(r.status==='pending'){r.status='skipped';r.error='使用者中止檢查'}
 running=false;state.lastAt=new Date().toISOString();$('runText').textContent='開始檢查';$('runGlyph').textContent='↻';setProgress(done,total);revalidate(true);saveHistory();render();toast('完成 '+done+' 筆請求；去重賽事 '+state.fixtures.length+' 場，異常 '+state.issues.length+' 筆');
}
async function retryRequest(id){
 if(running)return toast('檢查進行中，請稍後再重試',true);
 const req=state.requests.find(x=>x.id===id);if(!req||req.provider==='import')return toast('本地匯入需重新選擇檔案');
 state.raw=state.raw.filter(x=>x.requestId!==id);
 await perform(req);state.lastAt=new Date().toISOString();revalidate(true);saveHistory();render();toast('單筆請求重查完成：'+providerName(req.provider));
}
function openRequest(id){
 const r=state.requests.find(x=>x.id===id);if(!r)return;
 $('detailEyebrow').textContent='REQUEST / '+r.id;$('detailTitle').textContent=providerName(r.provider)+' · '+(r.league?leagueName(r.league):'多聯賽');
 $('detailBody').innerHTML='<div class="detail-grid">'+[['預期請求',r.url||'本地檔案'],['執行狀態',r.status],['HTTP 狀態',r.http||'—'],['回傳 / 採用筆數',(r.count||0)+' / '+(r.accepted||0)],['耗時',r.duration===undefined?'—':r.duration+' ms'],['實際回傳時間',shortStamp(r.receivedAt)]].map(v=>'<div class="detail-field"><small>'+v[0]+'</small><strong>'+html(v[1])+'</strong></div>').join('')+'</div>'+(r.error?'<div class="issue-note">'+html(r.error)+'</div>':'')+'<h3>原始回傳內容</h3><pre>'+html(JSON.stringify(r.payload===undefined?{status:r.status,note:r.error||'未執行'}:r.payload,null,2))+'</pre>';
 $('detailActions').innerHTML='<button class="btn ghost" data-close="detailModal">關閉</button>'+(r.provider!=='import'?'<button class="btn primary" id="retryOne">重新檢查此請求</button>':'');
 if($('retryOne'))$('retryOne').addEventListener('click',()=>{closeModal('detailModal');retryRequest(id)});
 openModal('detailModal');
}
function openFixture(key){
 const v=state.fixtures.find(x=>x.key===key);if(!v)return;
 $('detailEyebrow').textContent='FIXTURE VALIDATION';$('detailTitle').textContent=(v.home||'主隊缺漏')+' vs '+(v.away||'客隊缺漏');
 const concerns=state.issues.filter(i=>v.records.some(r=>i.eventId&&i.eventId===r.eventId)||i.id==='M'+v.key||i.id==='G'+v.key);
 $('detailBody').innerHTML='<div class="detail-grid">'+[['台灣開賽時間',shortStamp(v.dateTime)],['聯賽',leagueName(v.league)],['事件識別碼',v.eventIds.join('、')||'缺漏'],['來源',v.sources.map(providerName).join('、')],['欄位完整性',v.completeness+'%'],['資料狀態',v.status]].map(x=>'<div class="detail-field"><small>'+x[0]+'</small><strong>'+html(x[1])+'</strong></div>').join('')+'</div>'+(concerns.length?'<h3>異常與人工標記</h3>'+concerns.map(x=>'<div class="issue-note">'+html(x.kind)+'：'+html(x.message)+'</div>').join(''):'')+'<h3>來源對照紀錄</h3>'+v.records.map(r=>'<div class="issue-note" style="background:#f8fafd;color:#62738c">'+html(providerName(r.provider))+' · ID '+html(r.eventId||'缺漏')+' · '+html(shortStamp(r.dateTime))+' · '+html(r.home)+' vs '+html(r.away)+'</div>').join('')+'<h3>主來源資料</h3><pre>'+html(JSON.stringify(v.records[0].raw||v.records[0],null,2))+'</pre>';
 $('detailActions').innerHTML='<button class="btn ghost" data-close="detailModal">關閉</button><button class="btn ghost" id="markAck">標記已確認</button><button class="btn primary" id="markMissing">標記缺漏</button>';
 $('markAck').onclick=()=>{state.manual[key]=state.manual[key]==='ack'?'':'ack';revalidate(true);saveHistory();render();closeModal('detailModal');toast('人工確認標記已更新')};
 $('markMissing').onclick=()=>{state.manual[key]=state.manual[key]==='missing'?'':'missing';revalidate(true);saveHistory();render();closeModal('detailModal');toast('缺漏標記已更新')};
 openModal('detailModal');
}
function csvParse(text){
 const lines=[];let row=[],v='',quote=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){v+='"';i++}else quote=!quote}else if(c===','&&!quote){row.push(v);v=''}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(v);if(row.some(x=>x.trim()))lines.push(row);row=[];v=''}else v+=c}
 if(v||row.length){row.push(v);lines.push(row)}
 if(lines.length<2)throw Error('CSV 缺少標題列或內容');const keys=lines.shift().map(s=>s.trim().replace(/^\uFEFF/,''));
 return lines.map(cols=>Object.fromEntries(keys.map((k,i)=>[k,cols[i]||''])))
}
async function ingestFile(file){
 if(!file)return;
 const text=await file.text();let data;try{data=file.name.toLowerCase().endsWith('.csv')?csvParse(text):JSON.parse(text)}catch(e){return toast('檔案解析失敗：'+e.message,true)}
 const provider=$('importSource').value,req={id:'U'+Date.now(),provider:'import',league:'',date:'',url:'本地匯入：'+file.name,status:'ok',http:'LOCAL',receivedAt:new Date().toISOString(),payload:data,count:0,duration:0};
 try{
  let rows;
  if(provider==='import')rows=extract('import',data,req);
  else rows=extract(provider,data,req);
  rows=rows.map(x=>({...x,provider,requestId:req.id,rowId:req.id+':'+x.rowId}));
  req.count=rows.length;req.accepted=rows.length;state.raw.push(...rows);state.requests.push(req);
  state.lastAt=new Date().toISOString();revalidate(true);saveHistory();render();closeModal('importModal');toast('匯入 '+rows.length+' 筆賽程，已執行資料驗證與去重');
 }catch(e){toast('匯入失敗：'+e.message,true)}
}
function download(name,mime,data){const blob=new Blob(['\uFEFF',data],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function csv(rows,cols){const cell=(x)=>'"'+String(x===null||x===undefined?'':x).replaceAll('"','""')+'"';return cols.map(x=>cell(x[0])).join(',')+'\r\n'+rows.map(r=>cols.map(col=>cell(r[col[1]])).join(',')).join('\r\n')}
function exportFiles(type){
 const date=taiwanToday();
 if(type==='json'){
  const data={title:'足球賽程資料驗證與分析控制台',exportedAt:new Date().toISOString(),timezone:'Asia/Taipei',config:getConfig(),lastCheckedAt:state.lastAt,requests:state.requests,normalizedFixtures:state.fixtures,issues:state.issues,manualMarks:state.manual};
  download('football-audit-'+date+'.json','application/json;charset=utf-8',JSON.stringify(data,null,2));
 }else if(type==='csv'){
  const f=getFilters(),rows=state.fixtures.filter(r=>relevant(f,r)).map(x=>({date:x.date,datetime:shortStamp(x.dateTime),league:leagueName(x.league),home:x.home,away:x.away,event_ids:x.eventIds.join('|'),sources:x.sources.map(providerName).join('|'),completeness:x.completeness,status:x.status}));
  download('football-fixtures-'+date+'.csv','text/csv;charset=utf-8',csv(rows,[['台灣日期','date'],['台灣時間','datetime'],['聯賽','league'],['主隊','home'],['客隊','away'],['事件識別碼','event_ids'],['資料來源','sources'],['資料完整性','completeness'],['處理狀態','status']]));
 }else{
  const rows=state.issues.map(x=>({type:x.kind,date:x.date,league:leagueName(x.league),provider:providerName(x.provider),id:x.eventId||x.requestId,message:x.message,status:x.status,ack:x.ack?'已確認':'待處理'}));
  download('football-issues-'+date+'.csv','text/csv;charset=utf-8',csv(rows,[['類別','type'],['台灣日期','date'],['聯賽','league'],['來源','provider'],['事件或請求ID','id'],['異常說明','message'],['狀態','status'],['人工確認','ack']]));
 }
 closeModal('exportModal');toast('匯出檔案已建立');
}
function saveHistory(){
 if(!state.lastAt)return;
 const slim={at:state.lastAt,config:getConfig(),requests:state.requests.map(({payload,...rest})=>rest),raw:state.raw.map(({raw,...rest})=>rest).slice(0,1800),issues:state.issues,manual:state.manual,stats:{fixtures:state.fixtures.length,requests:state.requests.length,issues:state.issues.length}};
 state.history=[slim,...state.history.filter(x=>x.at!==slim.at)].slice(0,7);
 try{localStorage.setItem(STORE,JSON.stringify({selected:[...selected],config:getConfig(),history:state.history}))}
 catch{try{state.history=state.history.slice(0,2);localStorage.setItem(STORE,JSON.stringify({selected:[...selected],config:getConfig(),history:state.history}))}catch{toast('瀏覽器儲存空間不足，請匯出完整 JSON 保存紀錄',true)}}
}
function restoreHistory(x){
 if(!x)return;state.lastAt=x.at;state.requests=x.requests||[];state.raw=x.raw||[];state.manual=x.manual||{};const cfg=x.config||{};
 if(cfg.dateFrom)$('dateFrom').value=cfg.dateFrom;if(cfg.dateTo)$('dateTo').value=cfg.dateTo;
 if(cfg.providers){$('useEspn').checked=cfg.providers.espn;$('useTsdb').checked=cfg.providers.tsdb;$('useFd').checked=cfg.providers.fd}
 if(Array.isArray(cfg.leagues))selected=new Set(cfg.leagues);
 revalidate(true);dirty=false;render();
}
function openHistory(){
 const list=$('historyList');
 list.innerHTML=state.history.length?state.history.map((h,i)=>'<div class="history-row"><div><strong>'+html(shortStamp(h.at))+'</strong><small>請求 '+h.stats.requests+' · 賽事 '+h.stats.fixtures+' · 異常 '+h.stats.issues+'</small></div><button data-history="'+i+'">載入紀錄</button></div>').join(''):'<div class="empty"><strong>尚無歷次查核資料</strong><span>每次檢查後自動保留請求結果與異常標記摘要。</span></div>';
 openModal('historyModal');
}
function init(){
 const today=taiwanToday(),tomorrow=dayAdd(today,1);$('dateFrom').value=tomorrow;$('dateTo').value=tomorrow;
 $('todayLabel').textContent=stampDate(today);
 try{const saved=JSON.parse(localStorage.getItem(STORE)||'null');if(saved){state.history=saved.history||[];if(Array.isArray(saved.selected))selected=new Set(saved.selected);restoreHistory(state.history[0]);}}catch{}
 $('rangePreset').value='custom';
 document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',()=>{page=n.dataset.page;render()}));
 $('leaguePicker').onclick=initLeagues;$('leagueSearch').oninput=renderLeagueList;
 $('leagueList').onchange=e=>{if(e.target.dataset.league){if(e.target.checked)draftSelected.add(e.target.dataset.league);else draftSelected.delete(e.target.dataset.league);$('leagueSelectedCount').textContent='已選 '+draftSelected.size+' 個聯賽'}};
 $('selectAllLeagues').onclick=()=>{draftSelected=new Set(LEAGUES.map(x=>x.id));renderLeagueList()};
 $('clearLeagues').onclick=()=>{draftSelected.clear();renderLeagueList()};
 $('saveLeagues').onclick=()=>{selected=new Set(draftSelected);closeModal('leagueModal');markConfigChange()};
 document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
 document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));
 $('dateFrom').addEventListener('change',()=>{if($('dateTo').value<$('dateFrom').value)$('dateTo').value=$('dateFrom').value;$('rangePreset').value='custom';markConfigChange()});
 $('dateTo').addEventListener('change',()=>{$('rangePreset').value='custom';markConfigChange()});
 $('rangePreset').addEventListener('change',()=>{const n=+$('rangePreset').value;if(n)$('dateTo').value=dayAdd($('dateFrom').value,n-1);markConfigChange()});
 ['useEspn','useTsdb','useFd'].forEach(id=>$(id).addEventListener('change',markConfigChange));
 $('moreSettingsBtn').onclick=()=>{$('fdSettings').dataset.open=$('fdSettings').dataset.open?'':'yes';$('fdSettings').classList.toggle('hidden',!$('fdSettings').dataset.open)};
 $('runBtn').onclick=runCheck;$('revalidateBtn').onclick=()=>revalidate(false);
 ['filterLeague','filterDate','filterSource','filterStatus','searchText'].forEach(id=>$(id).addEventListener(id==='searchText'?'input':'change',render));
 $('resetFilters').onclick=()=>{['filterLeague','filterDate','filterSource','filterStatus','searchText'].forEach(id=>$(id).value='');render()};
 $('fixtureRows').onclick=e=>{const btn=e.target.closest('[data-fixture]');if(btn)openFixture(btn.dataset.fixture)};
 $('requestRows').onclick=e=>{const btn=e.target.closest('[data-request]');if(btn)openRequest(btn.dataset.request)};
 $('responseSelect').onchange=renderResponses;
 $('importBtn').onclick=()=>openModal('importModal');
 $('fileInput').onchange=e=>ingestFile(e.target.files&&e.target.files[0]);
 const drop=$('dropZone');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag')});drop.addEventListener('dragleave',()=>drop.classList.remove('drag'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag');ingestFile(e.dataTransfer.files[0])});
 $('exportBtn').onclick=()=>openModal('exportModal');
 $('exportJson').onclick=()=>exportFiles('json');$('exportCsv').onclick=()=>exportFiles('csv');$('exportIssues').onclick=()=>exportFiles('issues');
 $('historyBtn').onclick=openHistory;$('historyList').onclick=e=>{const b=e.target.closest('[data-history]');if(b){restoreHistory(state.history[+b.dataset.history]);closeModal('historyModal');toast('歷次查核摘要已載入。原始回應請使用先前匯出的 JSON。')}};
 $('clearHistory').onclick=()=>{if(!confirm('確定清除本機歷次查核摘要？'))return;state.history=[];localStorage.removeItem(STORE);openHistory();toast('歷史摘要已清除')};
 render();
}
document.addEventListener('DOMContentLoaded',init);