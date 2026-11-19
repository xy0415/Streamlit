'use strict';

(function (root) {
  const marketLabels = Object.freeze({
    totals:'大小球', handicap:'讓球', double:'不敗／雙重機會',
    both:'雙方進球', winner:'勝平負', other:'其他玩法',
  });

  function marketType(market) {
    const value = String(market || '');
    if (/雙方進球|BTTS/i.test(value)) return 'both';
    if (/讓球|讓分/.test(value)) return 'handicap';
    if (/不敗|勝或和|勝或平|雙重機會/.test(value)) return 'double';
    if (/總進球|進球數|全場\s*[大小]/.test(value)) return 'totals';
    if (/勝|和局|平局/.test(value)) return 'winner';
    return 'other';
  }

  function matchLink(match, view = 'schedule', tab = '') {
    const target = new URL('/analysis.html', root.location.origin);
    target.searchParams.set('day', match.date);
    // Use the published pair rather than a mutable display name or row index.
    target.searchParams.set('match', JSON.stringify([match.home, match.away, match.time]));
    if (tab) target.searchParams.set('tab', tab);
    target.hash = view;
    return target.href;
  }

  function readMatchLink(query) {
    try {
      const value = JSON.parse(query.get('match') || 'null');
      if (!Array.isArray(value) || value.length !== 3 ||
          !value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 100) ||
          !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value[2])) return null;
      const tab = query.get('tab');
      return {home:value[0], away:value[1], time:value[2],
        tab:['prediction','review','snapshot'].includes(tab) ? tab : 'facts'};
    } catch {
      return null;
    }
  }

  function originalOdds(row, publishedAt) {
    const price = Number(row.publishedOdds);
    const capturedAt = String(row.publishedOddsAt || '');
    const source = String(row.publishedOddsSource || '').trim();
    const timestamp = time => {
      const value = String(time || '').trim().replace(' ', 'T');
      const explicitZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
      return value ? Date.parse(explicitZone ? value : value + '+08:00') : NaN;
    };
    const captured = timestamp(capturedAt);
    const released = timestamp(publishedAt);
    if (!(price > 1) || !Number.isFinite(price) || !source ||
        !Number.isFinite(captured) || !Number.isFinite(released) || captured > released) return null;
    return {price, source, capturedAt};
  }

  function unitReturn(grade, price) {
    const values = {win:price-1, halfwin:(price-1)/2, loss:-1, halfloss:-.5, push:0};
    return Object.hasOwn(values, grade) ? values[grade] : null;
  }

  function parlayStatus(grades) {
    if (grades.includes('loss')) return '未全中';
    if (!grades.length || grades.some(grade=>!grade)) return '待結算';
    if (grades.includes('halfloss') || grades.includes('halfwin')) return '含半贏／半輸';
    if (grades.every(grade=>grade==='push')) return '全走盤';
    if (grades.includes('push')) return '其餘關卡全贏';
    return '全中';
  }

  function priceBook(value) {
    const name=String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    return ['1xbet','pinnacle','bet365','williamhill','betfair','unibet'].includes(name)?name:'';
  }

  function parlayPrices(legs,quotes,publishedAt) {
    const published=Date.parse(String(publishedAt||'').replace(' ','T').replace(/(\d\d:\d\d(?::\d\d)?)$/,'$1+08:00'));
    const options=legs.map(leg=>leg.publishedOdds?[{...leg.publishedOdds,kind:'published',book:priceBook(leg.publishedOdds.source)}]:
      [...(quotes[leg.id]||[])].sort((a,b)=>
        Number(Date.parse(b.capturedAt)<=published)-Number(Date.parse(a.capturedAt)<=published)));
    const books=[...new Set(options.flatMap(quotes=>quotes.map(q=>q.book).filter(Boolean)))];
    const common=books.map(book=>options.map(quotes=>quotes.find(q=>q.book===book)))
      .filter(list=>list.every(Boolean))
      .sort((a,b)=>b.filter(q=>Date.parse(q.capturedAt)<=published).length-a.filter(q=>Date.parse(q.capturedAt)<=published).length)[0];
    const prices=common||options.map(list=>list[0]||null);
    const priced=prices.filter(Boolean).length;
    return {prices,priced,commonBook:Boolean(common),
      kind:prices.every(q=>q?.kind==='published')?'published':
       prices.every(q=>q&&Date.parse(q.capturedAt)<=published)?'beforePublication':'reference'};
  }

  function parlayProduct(prices) {
    return prices.length>1&&prices.every(q=>Number.isFinite(q?.price)&&q.price>1)?
      prices.reduce((total,q)=>total*q.price,1):null;
  }

  function parlayNet(grades,prices) {
    if(!parlayProduct(prices)||grades.length!==prices.length)return null;
    const returns=grades.map((grade,i)=>unitReturn(grade,prices[i].price));
    if(returns.some(value=>value===null))return null;
    return returns.reduce((product,net)=>product*(1+net),1)-1;
  }

  root.FXIPredictionInsights = Object.freeze({marketLabels, marketType, matchLink, readMatchLink, originalOdds, unitReturn, parlayStatus, parlayPrices, parlayProduct, parlayNet});
})(window);
