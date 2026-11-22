/* Team category is part of identity: do not join senior, youth or reserve teams. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.FXITeamIdentity=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function squad(name){
  const raw=String(name||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
  const women=/(?:\b(?:women|womens|woman|ladies|wfc|femenino|femenina|feminino|feminina|feminin|feminine|fem|frauen|damen)\b|女子|女足|女隊|女$|\(\s*w\s*\)|(?:^|\s)w$)/u.test(raw);
  const age=raw.match(/(?:^|[^a-z0-9])(?:u|under)[\s-]*(1[56789]|2[0123])(?:\b|$)/);
  const reserve=/(?:\b(?:reserves?|reserve|reserva|reserves|jong|castilla|ii)\b|(?:^|\s)b$|預備隊|二隊)/u.test(raw);
  return [women?'women':'open',age?'u'+age[1]:'senior',reserve?'reserve':'first'].join('|');
 }
 function compatible(a,b){return Boolean(String(a||'').trim()&&String(b||'').trim())&&squad(a)===squad(b)}
 return {squad,compatible};
});
