'use strict';

const searchAliases={arsenal:'阿森納 阿仙奴 兵工廠','manchester united':'曼聯 曼徹斯特聯',
 'manchester city':'曼城 曼徹斯特城','real madrid':'皇馬 皇家馬德里',barcelona:'巴薩 巴塞隆納 巴塞羅那'};
let searchRequest=0;
let currentSearch=null;

function searchMatches(row, terms) {
 const values=[row.home,row.away,row.homeZh,row.awayZh,row.homeShort,row.awayShort];
 for(const team of [row.home,row.away]){
  const key=nameKey(team);
  values.push(localizedTeamName(team),searchAliases[key]);
 }
 const text=values.map(nameKey).join(' ');
 return terms.every(term=>text.includes(term));
}

function showSearchResults() {
 if(!currentSearch)return;
 const {day,league,terms,fixtures,scheduleMessage}=currentSearch;
 const match=row=>searchMatches(row,terms);
 const archive=(state.feed?.reports||[]).flatMap(report=>report.matches||[]).filter(row=>
  (!day||row.date===day)&&(!league||(PRED_LEAGUE_CODES[row.league]||row.leagueCode)===league||row.league===KN[league])&&match(row));
 const makeRow=(row,archived)=>{
  const facts=archived?row.market:displayFixtureStatus(row).text;
  const meta=[row.date,row.time,row.league,facts].filter(Boolean).join(' · ');
  const link=(view,tab,label)=>'<a href="'+escapeHtml(INSIGHTS.matchLink(row,view,tab))+'">'+label+'</a>';
  let actions=archived?link('predictions','prediction','預測分析'):link('schedule','facts','賽程');
  if(archived&&row.date<=todayTaiwan())actions+=link('reviews','review','賽後復盤');
  return '<div class="search-row"><strong>'+escapeHtml(localizedTeamName(row.home,row.homeZh)+' vs '+localizedTeamName(row.away,row.awayZh))+
   '</strong><span class="search-meta">'+escapeHtml(meta)+'</span><div class="search-actions">'+actions+'</div></div>';
 };
 const section=(title,rows,limit,archived,empty)=>'<section class="search-group"><h3>'+title+
  (rows.length?' · '+rows.length+' 筆':'')+'</h3>'+(rows.length?rows.slice(0,limit).map(row=>makeRow(row,archived)).join('')+
  (rows.length>limit?'<p class="search-hint">僅列前 '+limit+' 筆，可用日期或聯賽縮小範圍。</p>':''):'<p>'+empty+'</p>')+'</section>';
 const archiveMessage=state.feedStatus==='loading'?'正在同步預測存檔…':state.feedStatus==='error'?'預測來源暫時無法同步':'沒有符合的預測紀錄';
 $('siteSearchStatus').textContent=[scheduleMessage,state.feedStatus==='error'&&archive.length?'預測同步異常，顯示已保留紀錄':''].filter(Boolean).join(' · ');
 $('siteSearchResults').innerHTML=section((day||todayTaiwan())+' 賽程',fixtures,30,false,scheduleMessage||'沒有符合的賽程')+
  section('預測與復盤',archive,50,true,archiveMessage);
}

async function runSiteSearch(event) {
 event.preventDefault();
 const terms=nameKey($('siteSearchQuery').value).split(' ').filter(Boolean);
 if(!terms.length){$('siteSearchStatus').textContent='請輸入球隊名稱';return}
 const day=$('siteSearchDate').value,league=$('siteSearchLeague').value;
 const target=day||todayTaiwan();
 const request=++searchRequest;
 currentSearch={day,league,terms,fixtures:[],scheduleMessage:'查詢賽程中…'};
 showSearchResults();
 try{
  const result=await readBatchScoreboards(target,league?[league]:defaultLeagues,AbortSignal.timeout(22000));
  if(request!==searchRequest)return;
  const matched=new Map();
  for(const event of result.events){
   const row=parseScore(event);
   if(row?.date===target&&searchMatches(row,terms))matched.set(row.id||[row.leagueCode,row.home,row.away,row.time].join('|'),row);
  }
  currentSearch.fixtures=[...matched.values()].sort((a,b)=>a.time.localeCompare(b.time));
  const failures=result.sources.filter(source=>source.status!=='ok').length;
  currentSearch.scheduleMessage=failures===result.sources.length?'賽程來源暫時無法取得':
   failures?'部分賽程來源未回應':'';
 }catch{
  if(request!==searchRequest)return;
  currentSearch.scheduleMessage='賽程來源暫時無法取得';
 }
 showSearchResults();
}

document.addEventListener('DOMContentLoaded',()=>{
 const dialog=$('siteSearch');
 $('siteSearchLeague').innerHTML+=[...LEAGUES].map(([id,label])=>'<option value="'+id+'">'+escapeHtml(label)+'</option>').join('');
 const open=()=>{if(!dialog.open){dialog.showModal();$('siteSearchQuery').focus()}};
 $('openSiteSearch').onclick=open;
 $('searchForm').addEventListener('submit',runSiteSearch);
 dialog.addEventListener('close',()=>{
  const query=new URLSearchParams(window.location.search);
  if(query.has('search')){
   const url=new URL(window.location.href);url.searchParams.delete('search');
   window.history.replaceState(null,'',url.href);
  }
 });
 document.addEventListener('fxi-feed-updated',()=>{if(dialog.open)showSearchResults()});
 if(new URLSearchParams(window.location.search).has('search'))open();
});
