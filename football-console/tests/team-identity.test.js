'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compatible}=require('../public/team-identity');
const {matchFixture}=require('../parlay-odds');

test('separate senior, women, youth and reserve teams before matching names',()=>{
 for(const other of ['Arsenal Women','Arsenal (W)','Arsenal WFC','Arsenal U21','Arsenal under-23','Arsenal II','Arsenal B'])
  assert.equal(compatible('Arsenal',other),false,other);
 assert.equal(compatible('Chelsea Women','Chelsea (W)'),true);
 assert.equal(compatible('France U21','France U19'),false);
 assert.equal(compatible('Real Madrid','Real Madrid Castilla'),false);
 assert.equal(compatible('巴塞隆納','巴塞隆納女足'),false);
 assert.equal(compatible('','Arsenal'),false);
});

test('odds matching keeps exact kickoff and refuses another squad or duplicate event',()=>{
 const p={date:'2026-11-22',time:'03:45',home:'Arsenal',away:'Chelsea'};
 const f={date:p.date,utc:'2026-11-21T19:45:00Z',home:'Arsenal',away:'Chelsea'};
 assert.equal(matchFixture(p,[f]),f);
 assert.equal(matchFixture(p,[{...f,home:'Arsenal Women'}]),null);
 assert.equal(matchFixture(p,[f,{...f}]),null);
});
