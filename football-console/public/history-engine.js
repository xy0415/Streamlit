'use strict';
(function(root){
  function sideFor(m,p){
    const compact=x=>String(x||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\u3400-\u9fff]+/g,'');
    const h=[p.homeZh,p.home],a=[p.awayZh,p.away];
    const sel=compact(m);
    const check=xs=>xs.some(x=>{const y=compact(x);return y.length>1&&sel.includes(y)});
    if(check(h)&&!check(a))return 'home';
    if(check(a)&&!check(h))return 'away';
    if(/主勝|主隊|主場/.test(m)&&!/客勝/.test(m))return 'home';
    if(/客勝|客隊|客場/.test(m)&&!/主勝/.test(m))return 'away';
    return '';
  }
  function resolveDiff(diff,line){
    // Asian quarter lines are two equal stakes on adjacent 0.5 lines.
    const quarter=Math.round(line*4);
    if(Math.abs(line*4-quarter)>1e-7)return '';
    if(Math.abs(quarter)%2===1){
      const left=Math.floor(line*2)/2,right=Math.ceil(line*2)/2;
      const a=resolveDiff(diff,left),b=resolveDiff(diff,right);
      if(!a||!b)return '';
      const numeric={win:1,push:0,loss:-1};
      const avg=(numeric[a]+numeric[b])/2;
      return avg===1?'win':avg===0.5?'halfwin':avg===0?'push':avg===-0.5?'halfloss':'loss';
    }
    const net=diff+line;
    return net>0?'win':net<0?'loss':'push';
  }
  function evaluate(p,h,a){
    if(!Number.isInteger(h)||!Number.isInteger(a)||h<0||a<0)return null;
    const raw=String(p?.market||'').replace(/\s+/g,'');
    if(!raw)return null;
    const yesNo=raw.match(/雙方進球[：:]?(是|否|有|無)/);
    if(yesNo){
      const predicted=/(是|有)/.test(yesNo[1]);
      return (h>0&&a>0)===predicted?'win':'loss';
    }
    const total=raw.match(/(?:全場)?(?:總進球|進球數)?(大|小)(\d+(?:\.\d+)?)/);
    if(total){
      const line=Number(total[2]),direction=total[1];
      return resolveDiff(direction==='大'?h+a:-(h+a),direction==='大'?-line:line);
    }
    const handicap=raw.match(/(.+?)(?:亞洲)?讓球([+-]?\d+(?:\.\d+)?)/);
    if(handicap){
      const side=sideFor(handicap[1],p);
      if(!side)return null;
      return resolveDiff(side==='home'?h-a:a-h,Number(handicap[2]));
    }
    if(/不敗|勝或和局|勝或平局/.test(raw)){
      const side=sideFor(raw,p);
      if(!side)return null;
      return side==='home'?(h>=a?'win':'loss'):(a>=h?'win':'loss');
    }
    if(/獲勝|勝出|主勝|客勝|勝利/.test(raw)){
      const side=sideFor(raw,p);
      if(!side)return null;
      return side==='home'?(h>a?'win':'loss'):(a>h?'win':'loss');
    }
    return null;
  }
  function settledFromString(x){
    const text=String(x||'');
    if(/全贏|參考全贏/.test(text))return 'win';
    if(/半贏/.test(text))return 'halfwin';
    if(/全輸|參考全輸/.test(text))return 'loss';
    if(/半輸/.test(text))return 'halfloss';
    if(/走盤|退款/.test(text))return 'push';
    return null;
  }
  function summarize(rows){
    const out={total:rows.length,finished:0,win:0,loss:0,halfwin:0,halfloss:0,push:0,pending:0,unsupported:0,rate:null,sourceCount:0};
    for(const row of rows){
      if(row.grade&&Object.hasOwn(out,row.grade)){
        out[row.grade]++;out.finished++;out.sourceCount++;
      }else if(row.status==='unsupported')out.unsupported++;
      else out.pending++;
    }
    const decisive=out.win+out.loss+out.halfwin+out.halfloss;
    out.rate=decisive?Math.round((out.win+.5*out.halfwin)/decisive*1000)/10:null;
    return out;
  }
  root.FootballHistory=Object.freeze({evaluate,settledFromString,summarize,sideFor});
})(window);
