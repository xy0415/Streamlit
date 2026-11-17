const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const BASE = path.join(__dirname, 'public');
const MAX_BODY = 4096;
const ALLOWED = new Set(['eng.1','eng.2','eng.fa','esp.1','ger.1','ita.1','fra.1','ned.1','por.1','usa.1','bra.1','arg.1','ksa.1','jpn.1','kor.1','mex.1','uefa.champions','uefa.europa','uefa.europa.conf','uefa.nations','fifa.world','fifa.friendly','conmebol.libertadores','concacaf.champions','afc.champions','aus.1','sco.1','bel.1','tur.1','chn.1','fifa.worldq.uefa','fifa.worldq.conmebol']);
const FD_ALLOWED = new Set(['PL','ELC','PD','BL1','SA','FL1','DED','PPL','BSA','CL','WC']);
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
const counters = new Map();
function send(res,code,data,extra={}) {res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}); res.end(JSON.stringify(data));}
function dateOk(v){return /^\d{4}-\d{2}-\d{2}$/.test(v||'') && !Number.isNaN(Date.parse(v+'T00:00:00Z'));}
function rateOk(req) {
 const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
 const t=Date.now(), entry=counters.get(ip)||{count:0,t};
 if(t-entry.t>60000){entry.count=0;entry.t=t;}
 entry.count++;counters.set(ip,entry);
 return entry.count<=100;
}
function remoteGet(target, headers={}) {
 return new Promise((resolve,reject)=>{
   const url=new URL(target);const request=https.get(url,{headers:{'accept':'application/json','user-agent':'FixtureValidationConsole/1.0',...headers},timeout:14000},r=>{
     let bytes=0; const pieces=[];
     r.on('data',b=>{bytes+=b.length;if(bytes>3*1024*1024){request.destroy(new Error('回應內容超過 3 MB'));return;}pieces.push(b)});
     r.on('end',()=>{const body=Buffer.concat(pieces).toString('utf8');let parsed;try{parsed=JSON.parse(body)}catch{parsed={message:'回傳格式不是有效 JSON',excerpt:body.slice(0,500)}}resolve({status:r.statusCode,data:parsed,bytes,contentType:r.headers['content-type']||''})});
   });request.on('timeout',()=>request.destroy(new Error('上游連線逾時（14秒）')));request.on('error',reject);
 });
}
async function api(req,res,route){
 if(!rateOk(req))return send(res,429,{error:'請求過於頻繁，請稍後再試'});
 if(route.pathname==='/api/health')return send(res,200,{ok:true,serverTime:new Date().toISOString(),sources:['ESPN','TheSportsDB','football-data.org']});
 if(route.pathname==='/api/fixtures'&&req.method==='GET'){
   const provider=route.searchParams.get('provider'),league=route.searchParams.get('league'),date=route.searchParams.get('date');
   if(!dateOk(date))return send(res,400,{error:'日期無效'});
   let target;
   if(provider==='espn'&&ALLOWED.has(league))target='https://site.api.espn.com/apis/site/v2/sports/soccer/'+encodeURIComponent(league)+'/scoreboard?dates='+date.replaceAll('-','');
   else if(provider==='tsdb')target='https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d='+encodeURIComponent(date)+'&s=Soccer';
   else return send(res,400,{error:'不支援的來源或聯賽'});
   try{const up=await remoteGet(target);return send(res,up.status===200?200:502,{provider,requestUrl:target,upstreamStatus:up.status,bytes:up.bytes,receivedAt:new Date().toISOString(),data:up.data})}catch(e){return send(res,502,{provider,requestUrl:target,error:String(e.message||e)})}
 }
 if(route.pathname==='/api/football-data'&&req.method==='POST'){
   let raw='';try{for await(const chunk of req){raw+=chunk;if(raw.length>MAX_BODY)throw Error('輸入資料過大')}}catch(e){return send(res,413,{error:String(e.message||e)})}
   let p;try{p=JSON.parse(raw)}catch{return send(res,400,{error:'JSON 格式錯誤'})}
   if(!FD_ALLOWED.has(p.competition)||!dateOk(p.dateFrom)||!dateOk(p.dateTo)||typeof p.token!=='string'||p.token.length<6||p.token.length>300)return send(res,400,{error:'請求參數或 API 金鑰不正確'});
   const target='https://api.football-data.org/v4/competitions/'+p.competition+'/matches?dateFrom='+p.dateFrom+'&dateTo='+p.dateTo;
   try{const up=await remoteGet(target,{'X-Auth-Token':p.token});return send(res,up.status===200?200:502,{provider:'fd',requestUrl:target,upstreamStatus:up.status,bytes:up.bytes,receivedAt:new Date().toISOString(),data:up.data})}catch(e){return send(res,502,{provider:'fd',requestUrl:target,error:String(e.message||e)})}
 }
 return send(res,404,{error:'找不到 API 路徑'});
}
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/'))return await api(req,res,url);
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
  const safePath=path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]*\.\.[/\\])+/, '');
  const file=path.resolve(BASE,'.'+(safePath==='/'?'/index.html':safePath));
  if(!file.startsWith(BASE+path.sep))return send(res,403,{error:'Forbidden'});
  fs.readFile(file,(err,buf)=>{if(err)return send(res,404,{error:'Not found'});res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cache-control':'public, max-age=180','content-security-policy':"frame-ancestors 'self' https://sites.google.com https://*.google.com"});res.end(buf)});
 }catch(e){send(res,500,{error:'伺服器處理失敗',detail:String(e.message||e)})}
});
server.listen(PORT,'0.0.0.0',()=>console.log('Fixture console listening on '+PORT));
