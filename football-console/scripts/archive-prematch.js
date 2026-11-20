'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {snapshotKey,kickoffTime,collectSnapshot}=require('../prematch-snapshots');

const live='https://football-fixture-console.onrender.com';
const folder=process.argv[2];
if(!folder)throw Error('Provide the snapshot archive directory.');

async function getJson(route,query){
 const url=new URL(route,live);
 url.search=new URLSearchParams(query);
 const response=await fetch(url,{signal:AbortSignal.timeout(65000)});
 if(!response.ok)throw Error(route+' HTTP '+response.status);
 return response.json();
}

async function readDay(file){
 try{return JSON.parse(await fs.readFile(file,'utf8'))}
 catch(error){if(error.code==='ENOENT')return {snapshots:{}};throw error}
}

async function archive(){
 const feed=await getJson('/api/reports');
 if(!feed.connected)throw Error('Official prediction feed unavailable.');
 const now=Date.now();
 const lastDay=new Date(now+8*3600000+2*86400000).toISOString().slice(0,10);
 const firstDay=new Date(now+8*3600000-3*86400000).toISOString().slice(0,10);
 const failures=[];
 for(const report of feed.reports){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(report.date)||report.date<firstDay||report.date>lastDay)continue;
  const picks=report.matches.filter(p=>kickoffTime(p)>now);
  if(!picks.length)continue;
  const file=path.join(folder,report.date+'.json');
  const previous=await readDay(file);
  const snapshots={...previous.snapshots};
  const requests=await Promise.allSettled([getJson('/api/parlay-odds',{date:report.date}),
   getJson('/api/parlay-odds',{date:report.date,mode:'current'})]);
  for(const response of requests)if(response.status==='rejected')failures.push(response.reason);
  for(const pick of picks){
   const key=snapshotKey(pick);
   const quotes=requests.flatMap(response=>response.value?.legs?.[pick.id]||[]);
   const snapshot=collectSnapshot(report,pick,snapshots[key],quotes);
   if(snapshot)snapshots[key]=snapshot;
  }
  if(JSON.stringify(previous.snapshots)!==JSON.stringify(snapshots)){
   await fs.mkdir(folder,{recursive:true});
   await fs.writeFile(file,JSON.stringify({snapshots},null,2)+'\n');
  }
 }
 for(const failure of failures)console.warn(failure.message);
}

archive().catch(error=>{console.error(error.message);process.exitCode=1});
