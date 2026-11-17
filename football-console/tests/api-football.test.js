'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=require('../api-football');
function fixture(name,country,id,home='Arsenal',away='Chelsea'){
 return {fixture:{id:123,date:'2026-11-18T12:00:00+00:00',status:{short:'HT',long:'Halftime',elapsed:45}},
  league:{name,country,id},teams:{home:{name:home,id:12,logo:'https://media.api-sports.io/football/teams/42.png'},away:{name:away,id:18}},
  goals:{home:1,away:0}};
}
test('include only user-approved adult competition types',()=>{
 assert.equal(api.competitionCode({name:'Premier League',country:'England',id:39}),'eng.1');
 assert.equal(api.competitionCode({name:'Africa Cup of Nations',country:'World',id:6}),'caf.nations');
 assert.equal(api.competitionCode({name:'Africa Cup of Nations - Qualification',country:'World'}),'caf.nations_qual');
 assert.equal(api.competitionCode({name:'Club Friendlies',country:'World',id:667}),null);
 assert.equal(api.competitionCode({name:'Premier League Women',country:'England',id:39}),null);
 assert.equal(api.competitionCode({name:'Under 21 Championship',country:'England',id:40}),null);
 assert.equal(api.competitionCode({name:'Scottish Premiership',country:'Scotland',id:179}),null);
});
test('fixture timestamps use Taiwan and source halftime/status only',()=>{
 const item=api.normalizedFixture(fixture('Premier League','England',39));
 assert.equal(item.date,'2026-11-18');
 assert.equal(item.time,'20:00');
 assert.equal(item.status,'halftime');
 assert.equal(item.minute,45);
 assert.equal(item.scoreHome,1);
 assert.equal(item.scoreAway,0);
 assert.match(item.homeLogo,/media\.api-sports\.io/);
});
test('do not fabricate scores from missing fields',()=>{
 const missing=fixture('Premier League','England',39);
 missing.goals={home:null,away:0};
 const result=api.normalizedFixture(missing);
 assert.equal(result.scoreHome,null);
 assert.equal(result.scoreAway,null);
});
test('do not identify women's clubs from league ID alone',()=>{
 const wrong=fixture('Premier League Women','England',39);
 assert.equal(api.normalizedFixture(wrong),null);
});
test('empty or unsupported leagues are not shown',()=>{
 assert.equal(api.normalizedFixture(fixture('Club Friendlies','World',667)),null);
});
