'use strict';
(function(root){
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const missing='<p class="match-detail-empty">資料來源尚未提供此項資訊。</p>';
 const timestamp=(value,time=true)=>{
  const date=new Date(value);
  if(!value||!Number.isFinite(date.getTime()))return '';
  return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',
   ...(time?{timeStyle:'short',hourCycle:'h23'}:{})}).format(date);
 };
 const photo=(url,cls)=>/^https:\/\/a\.espncdn\.com\//.test(url||'')?
  '<img class="'+cls+'" src="'+esc(url)+'" alt="" loading="lazy">':'';
 function weatherName(code){
  if(code===0)return '晴朗';
  if([1,2].includes(code))return '局部多雲';
  if(code===3)return '陰天';
  if([45,48].includes(code))return '起霧';
  if([51,53,55,56,57].includes(code))return '毛毛雨';
  if([61,63,65,66,67,80,81,82].includes(code))return '下雨';
  if([71,73,75,77,85,86].includes(code))return '降雪';
  if([95,96,99].includes(code))return '雷雨';
  return '天氣狀況待更新';
 }
 function preview(d){
  const w=d.weather,r=d.refereeStats,average=key=>(r[key]/r.matches).toFixed(1);
  const country=[d.city,d.country].filter(Boolean).join('，');
  const link=/^https:\/\/88kanqiu\.sc\.cn\/$/.test(d.schedule88||'')?
   '<a class="btn secondary" href="'+d.schedule88+'" target="_blank" rel="noopener noreferrer">88 看球賽程</a><small>本場專屬連結尚未核實</small>':'';
  return '<dl class="preview-grid">'+
   '<div><dt>比賽地點</dt><dd>'+esc(country||'待確認')+'</dd></div>'+
   '<div><dt>球場</dt><dd>'+esc(d.venue||'待確認')+'</dd></div>'+
   '<div><dt>開球時段天氣</dt><dd>'+(w?esc(weatherName(w.code)+' · '+w.celsius.toFixed(1)+' °C')+
    '<small>'+esc(w.place+' · '+(w.past?'模型回溯':'預報')+' · '+w.source)+'</small>':'尚無天氣資料')+'</dd></div>'+
   '<div><dt>主裁判</dt><dd>'+esc(d.referee||'待公布')+'</dd></div>'+
   '<div><dt>主裁判數據</dt><dd>'+(r?'場均黃牌 '+average('yellow')+' · 紅牌 '+average('red')+' · 犯規 '+average('fouls')+
    '<small>兩隊近期賽事中由該裁判執法且有完整統計的 '+r.matches+' 場 · ESPN</small>':
    '可核對的執法樣本不足')+'</dd></div>'+
   '<div><dt>轉播</dt><dd>'+(d.broadcast?.length?esc(d.broadcast.join('、'))+'<br>':'')+link+'</dd></div></dl>';
 }
 function lineup(d){
  const labels={confirmed:'本場先發',predicted:'預測陣容',reported:'賽前陣容 · 公布狀態待確認',previous:'近期已核實的先發'};
  const teams=(d.lineups||[]).map(team=>{
   const l=team.lineup;
   const head='<header class="pitch-heading">'+photo(team.logo,'pitch-crest')+'<strong>'+esc(team.team)+'</strong>'+
    (l?.formation?'<b>'+esc(l.formation)+'</b>':'')+'</header>';
   if(!l)return '<section class="fxi-lineup">'+head+missing+'</section>';
   const player=p=>'<li title="'+esc(p.fullName)+'">'+(p.photo?photo(p.photo,'pitch-avatar'):
    '<span class="pitch-number">'+esc(p.number||p.position||'—')+'</span>')+
    '<span>'+esc((p.photo&&p.number?p.number+' ':'')+p.name)+'</span></li>';
   let index=0;
   const content=l.matrix.length?'<div class="fxi-pitch">'+l.matrix.map(n=>{
    const row=l.players.slice(index,index+n);index+=n;
    return '<ul class="pitch-row">'+row.map(player).join('')+'</ul>';
   }).join('')+'</div>':'<ul class="pitch-list">'+l.players.map(player).join('')+'</ul>';
   return '<section class="fxi-lineup">'+head+'<p class="pitch-meta">'+esc(labels[l.kind]||'來源陣容')+
    (l.kind==='previous'?' · '+esc(timestamp(l.date)):'')+(l.matrix.length?'':' · 站位資料待確認')+'</p>'+content+'</section>';
  }).join('');
  return teams?teams+'<p class="pitch-meta">ESPN · '+esc(timestamp(d.checkedAt))+' 查核</p>':missing;
 }
 function h2h(d){
  if(!d.matches?.length)return missing;
  const side=t=>photo(t.logo,'h2h-crest')+'<span>'+esc(t.name)+'</span>';
  return '<ul class="h2h-list">'+d.matches.map(m=>'<li><header><time datetime="'+esc(m.date)+'">'+esc(timestamp(m.date,m.timeValid))+
   '</time><span>'+esc(m.competition)+'</span></header><div class="h2h-match"><div>'+side(m.home)+
   '</div><strong>'+m.home.score+' – '+m.away.score+'</strong><div>'+side(m.away)+'</div></div>'+
   (m.status&&!['FT','Final'].includes(m.status)?'<small>'+esc(m.status)+'</small>':'')+'</li>').join('')+
   '</ul><p class="pitch-meta">台灣時間 · ESPN</p>';
 }
 root.FXIMatchSections={preview,lineup,h2h};
})(window);
