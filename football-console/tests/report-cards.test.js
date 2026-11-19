'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parsePublishedCards,includePublishedCards}=require('../report-cards');

const date='2026-11-20';
const article=`分析日期：2026-11-20（Asia/Taipei）
資料截止：2026-11-19 16:12:39（台灣時間）
賽程範圍：11/20 00:00 至 11/21 00:00

### 🎯｜串關單

① 06:30｜巴甲｜第35輪
**Vasco da Gama（瓦斯科達伽馬）vs Internacional（國際體育會）**
全場總進球大 1.5｜估計命中機率 73%

② 08:30｜巴甲｜第35輪
**São Paulo（聖保羅）vs Fluminense（富明尼斯）**
全場總進球小 3.5｜估計命中機率 79%

③ 16:40｜澳職｜第5輪
**Western Sydney Wanderers（西悉尼流浪者）vs Adelaide United（阿德萊德聯）**
西悉尼流浪者不敗（主勝或和局）｜估計命中機率 75%`;

test('Published report produces all official match cards before Predictions spreadsheet is populated',()=>{
 const parsed=parsePublishedCards(article,date);
 assert.equal(parsed.length,3);
 assert.deepEqual(parsed.map(p=>p.time),['06:30','08:30','16:40']);
 assert.equal(parsed[0].id,'uOLLWZbr4mizW5T1h6');
 assert.equal(parsed[1].id,'u-UH3oy1Gmj6HgPKl5');
 assert.equal(parsed[2].id,'srGLJhJfLMPROuOYSI');
 assert.equal(parsed[2].league,'澳職');
 assert.equal(parsed[2].market,'西悉尼流浪者不敗（主勝或和局）');
 assert.ok(parsed.every(p=>p.verified===false&&p.homeScore===null));
});

test('Stored verified results always beat report fallback, without duplicates',()=>{
 const parsed=parsePublishedCards(article,date);
 const stored={...parsed[0],time:'6:30',homeScore:2,awayScore:1,verified:true,source:'Google 已核實'};
 const merged=includePublishedCards(article,date,[stored]);
 assert.equal(merged.length,3);
 assert.equal(merged[0].verified,true);
 assert.equal(merged[0].homeScore,2);
 assert.deepEqual(merged.map(p=>p.order),[1,2,3]);
});

test('Unknown dates and malformed or incomplete cards never become predictions',()=>{
 assert.deepEqual(parsePublishedCards(article,'2026-11-19'),[]);
 assert.deepEqual(parsePublishedCards(article.replace('估計命中機率 79%','估計命中機率 179%'),date),[]);
 assert.deepEqual(parsePublishedCards(article.replace('**São Paulo（聖保羅）vs Fluminense（富明尼斯）**','**某隊 vs 另一隊**'),date),[]);
 assert.deepEqual(parsePublishedCards('分析日期：'+date+'\n### 🎯｜串關單\n無合格選項',date),[]);
});
