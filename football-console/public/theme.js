'use strict';
(() => {
 const root=document.documentElement, key='fxi-theme';
 const stored=()=>{try {return localStorage.getItem(key)}catch{return null}};
 const initial=stored();
 root.dataset.theme=initial==='dark'||initial==='light'?initial:'light';
 function sync(){
  const dark=root.dataset.theme==='dark';
  document.querySelectorAll('[data-theme-switch]').forEach(button=>{
   button.setAttribute('aria-checked',String(dark));
   button.setAttribute('aria-label',dark?'切換為亮色模式':'切換為暗色模式');
   button.title=dark?'切換為亮色模式':'切換為暗色模式';
  });
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=dark?'#0d0e12':'#f5f4ef';
 }
 function bind(){
  sync();
  document.querySelectorAll('[data-theme-switch]').forEach(button=>button.addEventListener('click',()=>{
   root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';
   try{localStorage.setItem(key,root.dataset.theme)}catch{}
   sync();document.dispatchEvent(new Event('fxi-theme-change'));
  }));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
 window.addEventListener('storage',event=>{if(event.key===key&&(event.newValue==='dark'||event.newValue==='light')){root.dataset.theme=event.newValue;sync();document.dispatchEvent(new Event('fxi-theme-change'))}});
})();
