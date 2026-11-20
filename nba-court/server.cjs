const http = require('node:http');
const allowed = /^\/(scoreboard|summary|teams\/\d+\/schedule)$/;
const cache = new Map();
http.createServer(async (req,res)=>{
  const origin=req.headers.origin;
  if(origin==='https://nba-court-insight.onrender.com'){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
  res.setHeader('X-Content-Type-Options','nosniff');
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}')}
  if(req.method!=='GET'||!u.pathname.startsWith('/api/')){res.writeHead(404);return res.end()}
  const path=u.pathname.slice(4);
  if(!allowed.test(path)){res.writeHead(404);return res.end()}
  const params=new URLSearchParams();
  if(path==='/scoreboard') {const d=u.searchParams.get('dates'); if(!/^\d{8}(-\d{8})?$/.test(d||'')){res.writeHead(400);return res.end()} params.set('dates',d);params.set('limit','100')}
  if(path==='/summary'){const event=u.searchParams.get('event');if(!/^\d{6,14}$/.test(event||'')){res.writeHead(400);return res.end()}params.set('event',event)}
  if(path.endsWith('/schedule')){const season=u.searchParams.get('season');if(!/^20\d{2}$/.test(season||'')){res.writeHead(400);return res.end()}params.set('season',season)}
  const key=path+'?'+params.toString(), hit=cache.get(key);
  if(hit && Date.now()-hit.time<60000){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=30'});return res.end(hit.body)}
  try {
    const target='https://site.api.espn.com/apis/site/v2/sports/basketball/nba'+key;
    const upstream=await fetch(target,{headers:{'Accept':'application/json','User-Agent':'Mozilla/5.0 NBA scoreboard'},signal:AbortSignal.timeout(12000)});
    if(!upstream.ok) throw Error('upstream HTTP '+upstream.status);
    const body=await upstream.text(); JSON.parse(body);
    if(body.length>4000000) throw Error('response too large');
    cache.set(key,{body,time:Date.now()});
    if(cache.size>200)cache.delete(cache.keys().next().value);
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=30'});res.end(body);
  } catch(e){console.error('NBA source error:',e.message);res.writeHead(502,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'source_unavailable'}))}
}).listen(process.env.PORT||10000,'0.0.0.0');
