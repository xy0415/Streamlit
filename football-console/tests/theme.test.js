'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const code=fs.readFileSync(require.resolve('../public/theme.js'),'utf8');
function start(value){
 const callbacks={},windowCallbacks={},events=[],values=new Map();if(value!==undefined)values.set('fxi-theme',value);
 const button={attributes:{},setAttribute(k,v){this.attributes[k]=v},addEventListener(k,fn){this[k]=fn}};
 const root={dataset:{}},meta={content:''};
 const document={documentElement:root,readyState:'complete',querySelectorAll:()=>[button],querySelector:()=>meta,
  dispatchEvent:e=>events.push(e.type)};
 const window={addEventListener:(k,fn)=>windowCallbacks[k]=fn};
 const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 vm.runInNewContext(code,{window,document,localStorage,Event:class{constructor(type){this.type=type}}});
 return {root,button,meta,windowCallbacks,events,values};
}
test('theme switch starts light and remembers dark with correct accessibility state',()=>{
 const t=start();assert.equal(t.root.dataset.theme,'light');assert.equal(t.button.attributes['aria-checked'],'false');
 t.button.click();assert.equal(t.root.dataset.theme,'dark');assert.equal(t.values.get('fxi-theme'),'dark');
 assert.equal(t.button.attributes['aria-label'],'切換為亮色模式');assert.equal(t.meta.content,'#0d0e12');assert.deepEqual(t.events,['fxi-theme-change']);
 t.button.click();assert.equal(t.root.dataset.theme,'light');assert.equal(t.values.get('fxi-theme'),'light');
});
test('saved theme loads on another page and changes propagate across tabs',()=>{
 const t=start('dark');assert.equal(t.root.dataset.theme,'dark');assert.equal(t.button.attributes['aria-checked'],'true');
 t.windowCallbacks.storage({key:'fxi-theme',newValue:'light'});assert.equal(t.root.dataset.theme,'light');assert.equal(t.button.attributes['aria-checked'],'false');
});
