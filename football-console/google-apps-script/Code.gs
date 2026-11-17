/**
 * Football Analytics Console / Google Apps Script bridge
 * Public output contains ONLY official published football reports and sanitized
 * match settlements. Never reads private review drafts or exposes Gmail IDs.
 * Deploy: Web app | Execute as me | Anyone (read-only GET output).
 */
const CFG = {
  OWNER:'xyu0415@gmail.com',
  TZ:'Asia/Taipei',
  SUBJECT:/^\[GPT足球分析\] 足球賽前分析[｜|](\d{4}-\d{2}-\d{2})$/,
  PRED_COLS:['id','date','order','group','time','league','round','home','homeZh','away','awayZh','market','probability','probabilityType','sentAt','status','homeScore','awayScore','settlement','verified','source','checkedAt','eventId','sourceUrl'],
  REPORT_COLS:['date','publishedAt','cutoff','article','updatedAt']
};
function ownerCheck_(){
  const email=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
  if(email!==CFG.OWNER)throw Error('帳號不符：請使用預測郵件所屬 Google 帳戶設定。');
}
function now_(){return Utilities.formatDate(new Date(),CFG.TZ,'yyyy-MM-dd HH:mm:ss');}
function getSheet_(name,headers){
 const id=PropertiesService.getScriptProperties().getProperty('FOOTBALL_SHEET_ID');
 if(!id)throw Error('尚未初始化。請在 Apps Script 編輯器執行 setup()。');
 const ss=SpreadsheetApp.openById(id),sheet=ss.getSheetByName(name)||ss.insertSheet(name);
 if(sheet.getLastRow()===0)sheet.getRange(1,1,1,headers.length).setValues([headers]);
 return sheet;
}
function loadRows_(sh){
 const values=sh.getDataRange().getDisplayValues();
 if(values.length<2)return[];
 return values.slice(1).filter(r=>r.some(c=>c)).map(r=>Object.fromEntries(values[0].map((k,i)=>[k,r[i]||''])));
}
function saveRows_(sh,headers,rows){
 const values=[headers,...rows.map(row=>headers.map(h=>row[h]===undefined||row[h]===null?'':String(row[h])))];
 sh.clearContents();
 const CHUNK=180;
 for(let i=0;i<values.length;i+=CHUNK)sh.getRange(i+1,1,Math.min(CHUNK,values.length-i),headers.length).setValues(values.slice(i,i+CHUNK));
 sh.setFrozenRows(1);
}
function id_(text){
 const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8);
 return Utilities.base64EncodeWebSafe(bytes).replace(/=/g,'').slice(0,18);
}
function lineText_(s){return String(s||'').replace(/^\s*#{1,4}\s*/,'').replace(/^\*\*/,'').replace(/\*\*$/,'').trim();}
function extract_(body,date,sentAt){
 const section=String(body||'').split('[足球全文開始]')[1]?.split('[足球全文結束]')[0];
 if(!section||!section.includes('分析日期：'+date))return null;
 const lines=section.trim().replace(/\r\n?/g,'\n').split('\n'),matches=[];
 const cutoff=(section.match(/資料截止：([^\n]+)/)||[])[1]||'';
 let group='串關單';
 for(let i=0;i<lines.length;i++){
   const line=lineText_(lines[i]);
   if(/^🎯｜/.test(line)){group=line.replace(/^🎯｜/,'').trim();continue}
   if(/^💬｜/.test(line))break; // old version long analysis text not exported as per-match cards
   const m=line.match(/^([①②③④⑤⑥⑦⑧⑨⑩])\s*(?:(?:\d{1,2}\/\d{1,2})\s+)?(\d{2}:\d{2})｜([^｜\n]+?)(?:｜(.+))?$/);
   if(!m)continue;
   let home='',homeZh='',away='',awayZh='',market='',probability=null,probabilityType='命中';
   let detailCount=0;
   for(let j=i+1;j<Math.min(i+12,lines.length)&&detailCount<2;j++){
    const t=lineText_(lines[j]);if(!t||/^=+$/.test(t))continue;
    if(/^([①②③④⑤⑥⑦⑧⑨⑩]|🎯｜|💬｜)/.test(t))break;
    if(!home){
      const tm=t.match(/^(.+?)（(.+?)）\s*vs\s*(.+?)（(.+?)）$/i);
      if(tm){home=tm[1].trim();homeZh=tm[2].trim();away=tm[3].trim();awayZh=tm[4].trim();detailCount++;continue}
    }else{
      const pm=t.match(/^(.*?)\s*｜\s*估計(命中|全贏)機率\s*(\d{1,3})%/);
      if(pm){market=pm[1].trim();probability=Number(pm[3]);probabilityType=pm[2];detailCount++;break}
    }
   }
   if(!home||!away||!market)continue;
   const id=id_([date,m[2],home,away,market].join('|'));
   matches.push({id,date,order:String(matches.length+1),group,time:m[2],league:m[3].trim(),round:(m[4]||'').trim(),
     home,homeZh,away,awayZh,market,probability:String(probability),probabilityType,sentAt,
     status:'待核對',homeScore:'',awayScore:'',settlement:'待核實',verified:'false',source:'',checkedAt:'',eventId:'',sourceUrl:''});
 }
 return {report:{date,publishedAt:sentAt,cutoff,article:section.trim(),updatedAt:now_()},matches};
}
function setup(){
 ownerCheck_();
 const props=PropertiesService.getScriptProperties();
 let id=props.getProperty('FOOTBALL_SHEET_ID');
 if(!id){
   const ss=SpreadsheetApp.create('足球分析控制台｜公開預測與賽後核對');
   id=ss.getId();props.setProperty('FOOTBALL_SHEET_ID',id);
 }
 getSheet_('Reports',CFG.REPORT_COLS);getSheet_('Predictions',CFG.PRED_COLS);
 const installed=ScriptApp.getProjectTriggers();
 const ours=['syncPredictions','syncResults'];
 for(const trigger of installed)if(ours.includes(trigger.getHandlerFunction()))ScriptApp.deleteTrigger(trigger);
 ScriptApp.newTrigger('syncPredictions').timeBased().everyHours(3).create();
 ScriptApp.newTrigger('syncResults').timeBased().everyHours(6).create();
 syncPredictions();
 Logger.log('資料表：https://docs.google.com/spreadsheets/d/'+id+'/edit');
 Logger.log('已建立每 3 小時同步預測、每 6 小時核對比分的觸發器。免費配額以帳戶實際限制為準。');
 return 'https://docs.google.com/spreadsheets/d/'+id+'/edit';
}
function syncPredictions(){
 ownerCheck_();
 const lock=LockService.getScriptLock();lock.waitLock(25000);
 try{
  const ps=getSheet_('Predictions',CFG.PRED_COLS),rs=getSheet_('Reports',CFG.REPORT_COLS);
  const existing=loadRows_(ps),oldById=Object.fromEntries(existing.map(x=>[x.id,x])),reportMap=Object.fromEntries(loadRows_(rs).map(x=>[x.date,x]));
  const newById=Object.fromEntries(existing.map(x=>[x.id,x]));
  const threads=GmailApp.search('in:sent from:me subject:"足球賽前分析" newer_than:45d',0,80);
  const seenDates=new Set();
  for(const thread of threads){
   for(const message of thread.getMessages()){
    const m=String(message.getSubject()||'').match(CFG.SUBJECT);if(!m)continue;
    const date=m[1],txt=message.getPlainBody();
    const body=txt.includes('[足球全文開始]')?txt:message.getBody().replace(/<[^>]+>/g,' ');
    const parsed=extract_(body,date,Utilities.formatDate(message.getDate(),CFG.TZ,'yyyy-MM-dd HH:mm:ss'));
    if(!parsed)continue;
    // Canonical official report for each date: keep the first full published message.
    if(seenDates.has(date))continue;seenDates.add(date);
    if(!reportMap[date])reportMap[date]=parsed.report;
    for(const row of parsed.matches) if(!newById[row.id])newById[row.id]=row;
   }
  }
  const reports=Object.values(reportMap).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,100);
  const predictions=Object.values(newById).sort((a,b)=>b.date.localeCompare(a.date)||Number(a.order)-Number(b.order)).slice(0,1000);
  saveRows_(rs,CFG.REPORT_COLS,reports);
  saveRows_(ps,CFG.PRED_COLS,predictions);
  PropertiesService.getScriptProperties().setProperty('PREDICTION_LAST_SYNC',now_());
  return {reports:reports.length,predictions:predictions.length};
 }finally{lock.releaseLock()}
}
const LEAGUE_CODES={'歐國聯':'uefa.nations','歐洲國家聯賽':'uefa.nations','國際友誼賽':'fifa.friendly',
'英超':'eng.1','英冠':'eng.2','西甲':'esp.1','德甲':'ger.1','義甲':'ita.1','法甲':'fra.1',
'歐冠':'uefa.champions','歐霸':'uefa.europa','荷甲':'ned.1','葡超':'por.1',
'巴甲':'bra.1','美職聯':'usa.1','沙職':'ksa.1','阿甲':'arg.1','日職':'jpn.1','韓職':'kor.1',
'澳甲':'aus.1','中超':'chn.1'};
function norm_(s){
 let x=String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9\u4e00-\u9fa5]/g,'');
 const a={'czechrepublic':'czechia','republicofireland':'ireland','turkiye':'turkey',
 'northmacedonia':'macedonia','unitedstates':'usa','southkorea':'korearepublic',
 'bosniaandherzegovina':'bosniaherzegovina','atleticomineiro':'atleticomg',
 'manchesterutd':'manchesterunited'};
 return a[x]||x;
}
function asTaiwanDate_(dt){return Utilities.formatDate(new Date(dt),CFG.TZ,'yyyy-MM-dd HH:mm');}
function plusUTC_(date,n){
 const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return Utilities.formatDate(d,'UTC','yyyyMMdd');
}
function chooseEvent_(row,events){
 let matches=[];
 for(const event of events){
  const c=(event.competitions||[])[0]||{},teams=c.competitors||[];
  const home=teams.find(x=>x.homeAway==='home'),away=teams.find(x=>x.homeAway==='away');
  if(!home||!away)continue;
  const eh=home.team&&(home.team.displayName||home.team.name)||'',ea=away.team&&(away.team.displayName||away.team.name)||'';
  if(norm_(eh)!==norm_(row.home)||norm_(ea)!==norm_(row.away))continue;
  const tai=asTaiwanDate_(event.date||c.date);
  const kickoff=row.date+' '+row.time;
  const diff=Math.abs(new Date((tai.replace(' ','T'))+'+08:00').getTime()-new Date(kickoff.replace(' ','T')+'+08:00').getTime());
  if(diff>120*60000)continue;
  matches.push({event,c,home,away,timeDiff:diff});
 }
 matches.sort((a,b)=>a.timeDiff-b.timeDiff);
 return matches.length===1?matches[0]:null;
}
function settle_(row,h,a){
 const m=String(row.market).replace(/\s/g,'');
 const total=h+a;
 let z=m.match(/(?:總進球|全場總進球|全場)(大|小)(\d+(?:\.\d+)?)/);
 if(z){
  const line=Number(z[2]);if(!Number.isFinite(line))return null;
  if(Math.abs(line*2-Math.round(line*2))>1e-8)return null;
  const dir=z[1]==='大'?(total>line?1:total===line?0:-1):(total<line?1:total===line?0:-1);
  return dir===1?'全贏':dir===0?'走盤':'全輸'
 }
 if(/雙方進球/.test(m)){const yes=/是|有/.test(m),scored=h>0&&a>0;return scored===yes?'全贏':'全輸'}
 if(/不敗/.test(m)){
  if(m.includes(row.homeZh)||m.toLowerCase().includes(norm_(row.home)))return h>=a?'全贏':'全輸';
  if(m.includes(row.awayZh)||m.toLowerCase().includes(norm_(row.away)))return a>=h?'全贏':'全輸';
  if(m.includes('主勝或和局'))return h>=a?'全贏':'全輸';
  if(m.includes('客勝或和局'))return a>=h?'全贏':'全輸';
  return null
 }
 if(/獲勝|勝出|主勝|客勝/.test(m)){
  if(m.includes(row.homeZh)||m.includes('主勝'))return h>a?'全贏':'全輸';
  if(m.includes(row.awayZh)||m.includes('客勝'))return a>h?'全贏':'全輸';
 }
 return null;
}
function secondSource_(row,event,expectedHome,expectedAway){
 // TheSportsDB free plan returns only one event per search and may not cover a league.
 // Never equate an empty response to a loss; only corroborate exact match + 90-minute scores.
 try{
  const utcDay=String(event.date||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(utcDay))return null;
  const query=row.home+'_vs_'+row.away;
  const url='https://www.thesportsdb.com/api/v1/json/123/searchevents.php?e='+encodeURIComponent(query)+'&d='+utcDay;
  const response=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true});
  if(response.getResponseCode()!==200)return null;
  const json=JSON.parse(response.getContentText()),events=json.event||json.events||[];
  if(!Array.isArray(events))return null;
  for(const e of events){
   if(norm_(e.strHomeTeam)!==norm_(row.home)||norm_(e.strAwayTeam)!==norm_(row.away))continue;
   if(e.strTimestamp){
    const diff=Math.abs(new Date(e.strTimestamp).getTime()-new Date(event.date).getTime());
    if(!Number.isFinite(diff)||diff>120*60000)continue;
   }
   const stat=String(e.strStatus||'');
   if(!/finish|final|full.?time|FT/i.test(stat)||/penalt|extra.?time|AET/i.test(stat))continue;
   const h=Number(e.intHomeScore),a=Number(e.intAwayScore);
   if(!Number.isInteger(h)||!Number.isInteger(a))continue;
   return {h,a,id:e.idEvent||'',url:'https://www.thesportsdb.com/event/'+String(e.idEvent||'')};
  }
 }catch(e){}
 return null;
}
function syncResults(){
 ownerCheck_();
 const lock=LockService.getScriptLock();lock.waitLock(25000);
 try{
  const sh=getSheet_('Predictions',CFG.PRED_COLS),rows=loadRows_(sh);
  const today=Utilities.formatDate(new Date(),CFG.TZ,'yyyy-MM-dd');
  const cache={};let calls=0,secondaryCalls=0;
  for(const row of rows){
   if(row.verified==='true'||row.date>today||!row.time||!row.home||!row.away)continue;
   const code=LEAGUE_CODES[row.league];
   if(!code){row.status='缺少此聯賽免費比分來源';row.checkedAt=now_();continue}
   const dates=[plusUTC_(row.date,-1),plusUTC_(row.date,0)];
   let events=[];
   for(const day of dates){
    const k=code+'|'+day;
    if(!(k in cache)){
     if(calls>=65)break;
     try{
      const url='https://site.api.espn.com/apis/site/v2/sports/soccer/'+code+'/scoreboard?dates='+day;
      const resp=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true});
      const js=resp.getResponseCode()===200?JSON.parse(resp.getContentText()):{};
      cache[k]=Array.isArray(js.events)?js.events:[];calls++;
      Utilities.sleep(140);
     }catch(e){cache[k]=[]}
    }
    events=events.concat(cache[k]||[]);
   }
   const found=chooseEvent_(row,events);
   if(!found){row.status='賽事待查證';row.checkedAt=now_();continue}
   const status=found.event.status?.type||{};
   row.eventId=String(found.event.id||'');
   row.source='ESPN（單一來源）';
   row.sourceUrl='https://www.espn.com/soccer/match/_/gameId/'+encodeURIComponent(row.eventId);
   row.checkedAt=now_();
   if(!status.completed){row.status='未完賽';continue}
   // ESPN competitions can include penalty shootouts. Use only regular-time scores
   // when explicitly not in a shootout/overtime; ambiguous finals remain unverified.
   const stateText=String(status.name||'')+' '+String(status.description||'');
   if(/PEN|AET|extra time|penalt|加時|點球/i.test(stateText)){
     row.status='可能含延長或十二碼，待人工核實';continue;
   }
   const h=Number(found.home.score),a=Number(found.away.score);
   if(!Number.isInteger(h)||!Number.isInteger(a)||h<0||a<0){row.status='比分格式異常';continue}
   row.homeScore=String(h);row.awayScore=String(a);
   row.status='終場比分待第二來源覆核';
   const result=settle_(row,h,a);
   row.settlement=result?'參考'+result:'盤型需人工結算';
   row.verified='false';
   // Free independent cross-check. If unavailable, the score stays reference-only.
   if(secondaryCalls<18 && result){
     secondaryCalls++;
     const second=secondSource_(row,found.event,h,a);
     if(second && second.h===h && second.a===a){
       row.verified='true';
       row.status='兩個獨立來源比分一致';
       row.settlement=result;
       row.source='ESPN + TheSportsDB';
       row.sourceUrl=second.url||row.sourceUrl;
     }else if(second){
       row.status='兩來源比分不一致，待核實';
       row.homeScore='';row.awayScore='';
       row.settlement='待核實';
     }
     Utilities.sleep(2200); // TheSportsDB free tier has a minute-level request ceiling.
   }
  }
  saveRows_(sh,CFG.PRED_COLS,rows);
  PropertiesService.getScriptProperties().setProperty('RESULT_LAST_SYNC',now_());
  return {rows:rows.length,apiCalls:calls,secondaryCalls};
 }finally{lock.releaseLock()}
}
function doGet(){
 const props=PropertiesService.getScriptProperties();
 try{
  const pred=loadRows_(getSheet_('Predictions',CFG.PRED_COLS)).map(row=>({
   id:row.id,date:row.date,order:Number(row.order)||0,group:row.group,time:row.time,
   league:row.league,round:row.round,home:row.home,homeZh:row.homeZh,away:row.away,awayZh:row.awayZh,
   market:row.market,probability:Number(row.probability)||null,probabilityType:row.probabilityType||'命中',
   status:row.status,homeScore:row.homeScore===''?null:Number(row.homeScore),
   awayScore:row.awayScore===''?null:Number(row.awayScore),settlement:row.settlement,verified:row.verified==='true',
   source:row.source,checkedAt:row.checkedAt,eventId:row.eventId,sourceUrl:row.sourceUrl
  }));
  const all=loadRows_(getSheet_('Reports',CFG.REPORT_COLS));
  const reports=all.map(r=>({date:r.date,cutoff:r.cutoff,publishedAt:r.publishedAt,article:r.article,
    matches:pred.filter(x=>x.date===r.date).sort((a,b)=>a.order-b.order)}))
    .sort((a,b)=>b.date.localeCompare(a.date));
  const output={version:1,connected:true,syncedAt:props.getProperty('PREDICTION_LAST_SYNC')||'',
    scoresCheckedAt:props.getProperty('RESULT_LAST_SYNC')||'',reports};
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON)
 }catch(e){
  return ContentService.createTextOutput(JSON.stringify({connected:false,error:String(e.message||e)}))
     .setMimeType(ContentService.MimeType.JSON)
 }
}
