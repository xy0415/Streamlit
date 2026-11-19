'use strict';

(() => {
 const button=document.getElementById('refreshSync');
 const message=document.getElementById('syncMessage');
 const details=document.getElementById('syncDetails');
 const timeFormat=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'medium'});
 function format(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const iso=raw.replace(' ','T');
  const date=new Date(/Z$|[+-]\d{2}:\d{2}$/.test(iso)?iso:iso+'+08:00');
  return Number.isFinite(+date)?timeFormat.format(date):raw;
 }
 function field(label,record,note){
  const row=document.createElement('div');
  const title=document.createElement('dt');
  const value=document.createElement('dd');
  const status=document.createElement('small');
  title.textContent=label;
  value.textContent=format(record?.lastSuccess)||'尚無成功紀錄';
  status.textContent=[record?.ok===false?'最近查詢失敗 '+format(record.checkedAt):'',note].filter(Boolean).join(' · ');
  row.append(title,value,status);
  return row;
 }
 async function refresh(){
  button.disabled=true;message.textContent='讀取同步紀錄中…';
  try{
   const response=await fetch('/api/sync-status',{cache:'no-store',signal:AbortSignal.timeout(18000)});
   if(!response.ok)throw Error('同步狀態查詢失敗');
   const data=await response.json();
   const predictions=data.predictions||{};
   const scores=data.scores||{};
   details.replaceChildren(
    field('賽程',data.fixtures,'ESPN 最後一次有效回應'),
    field('預測',{...predictions,lastSuccess:predictions.publishedAt||predictions.lastSuccess},
     !predictions.configured?'預測來源未設定':predictions.publishedAt?'上游預測同步時間':'網站最後一次成功讀取'),
    field('比分',scores,scores.upstreamCheckedAt?'上游復查時間 '+format(scores.upstreamCheckedAt):'ESPN 最後一次收到比分'));
   message.textContent='台灣時間（UTC+8）。網站端的賽程與比分查詢紀錄自本次服務啟動起算。';
  }catch{
   message.textContent=details.children.length?'暫時無法更新，保留上次查到的紀錄。':'暫時無法取得同步紀錄。';
  }finally{
   button.disabled=false;
  }
 }
 button.addEventListener('click',refresh);
 refresh();
})();
