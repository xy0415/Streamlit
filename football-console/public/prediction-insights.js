'use strict';

(function (root) {
  const marketLabels = Object.freeze({
    totals:'全場大小球', teamTotals:'球隊進球大小', halfTotals:'半場大小球',
    handicap:'讓球', double:'不敗／雙重機會', both:'雙方進球', winner:'勝平負',
    corners:'角球', cards:'牌數', exactScore:'正確比分', drawNoBet:'平局退款',
    halfFull:'半全場', unknown:'玩法未記錄',
  });

  function marketType(market) {
    const text=String(market||'').normalize('NFKC').replace(/\s+/g,' ').trim();
    const value=text.replace(/\s+/g,'');
    if(!value)return 'unknown';
    if(/角球|corners?/i.test(value))return 'corners';
    if(/牌數|黃牌|紅牌|總牌|cards?/i.test(value))return 'cards';
    if(/正確比分|波膽|correctscore/i.test(value))return 'exactScore';
    if(/半全場|半場.?全場/.test(value))return 'halfFull';
    if(/平局退款|平局不算|和局退款|drawnobet/i.test(value))return 'drawNoBet';
    if(/雙方(?:都有|均有)?進球|BTTS/i.test(value))return 'both';
    if(/讓球|讓分/.test(value))return 'handicap';
    if(/不敗|勝或和|勝或平|雙重機會/.test(value))return 'double';
    if(/(?:球隊|單隊)(?:總)?進球(?:大|小|數)/.test(value))return 'teamTotals';
    if(/半場|上半時|下半時/.test(value)){
      if(/總進球|進球數|[大小]\d/.test(value))return 'halfTotals';
      return 'published:'+text;
    }
    if(/總進球|進球數|全場[大小]/.test(value))return 'totals';
    if(/(?:獲勝|勝出|勝利)$|^(?:主勝|客勝|和局|平局|勝平負)$/.test(value))return 'winner';
    return 'published:'+text;
  }

  function marketLabel(type) {
    return type.startsWith('published:')?type.slice('published:'.length):marketLabels[type];
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
        tab:['prediction','review','snapshot','preview','lineup','h2h'].includes(tab) ? tab : 'facts'};
    } catch {
      return null;
    }
  }

  function oddsTimestamp(time) {
    const value=String(time||'').trim().replace(' ','T').replace(/T(\d):/,'T0$1:');
    if(!value)return NaN;
    return Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)?value:value+'+08:00');
  }

  function originalOdds(row, publishedAt) {
    const price = Number(row.publishedOdds);
    const capturedAt = String(row.publishedOddsAt || '');
    const source = String(row.publishedOddsSource || '').trim();
    const captured = oddsTimestamp(capturedAt);
    const released = oddsTimestamp(publishedAt);
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
    return name;
  }

  function parlayPrices(legs,quotes,publishedAt) {
    const published=oddsTimestamp(publishedAt);
    const options=legs.map(leg=>[
      ...(leg.publishedOdds?[{...leg.publishedOdds,kind:'published',book:priceBook(leg.publishedOdds.source)}]:[]),
      ...(quotes[leg.id]||[])
    ].filter(q=>Number.isFinite(Number(q?.price))&&Number(q.price)>1&&q.book)
     .sort((a,b)=>Number(b.book==='1xbet')-Number(a.book==='1xbet')||
       Number(a.book==='manual')-Number(b.book==='manual')||
       Number(Date.parse(b.capturedAt)<=published)-Number(Date.parse(a.capturedAt)<=published)));
    const prices=options.map(list=>list[0]||null);
    const selectedBooks=new Set(prices.map(q=>q?.book).filter(Boolean));
    const priced=prices.filter(Boolean).length;
    return {prices,priced,commonBook:priced===legs.length&&selectedBooks.size===1&& !selectedBooks.has('manual'),
      kind:prices.every(q=>q?.kind==='published')?'published':
       prices.every(q=>q&&Date.parse(q.capturedAt)<=published)?'beforePublication':'reference'};
  }

  // User-defined haircut is indicative only; it is not an observed bookmaker
  // margin and cannot represent push or partial-settlement probabilities.
  function estimatedOdds(leg) {
    if (leg?.probability === null || leg?.probability === undefined || leg?.probability === '') return null;
    const probability = Number(leg.probability);
    if (!Number.isFinite(probability) || probability <= 0 || probability >= 100) return null;
    const price=86/probability;
    if (price <= 1 || Number(price.toFixed(2)) <= 1) return null;
    return {price, book:'estimate', source:'機率倒數 × 0.86 估算', kind:'estimate',
      probability, probabilityType:leg.probabilityType||'命中'};
  }

  function displayOdds(legs, prices) {
    return legs.map((leg, index) => prices[index] || estimatedOdds(leg));
  }

  function parlayProduct(prices) {
    return prices.length>1&&prices.every(q=>Number.isFinite(q?.price)&&q.price>1)?
      prices.reduce((total,q)=>total*q.price,1):null;
  }

  function parlayNet(grades,prices) {
    if(!Array.isArray(grades)||!Array.isArray(prices)||grades.length<2||grades.length!==prices.length)return null;
    if(grades.includes('loss'))return -1;
    if(!parlayProduct(prices))return null;
    const returns=grades.map((grade,i)=>unitReturn(grade,prices[i].price));
    if(returns.some(value=>value===null))return null;
    return returns.reduce((product,net)=>product*(1+net),1)-1;
  }

  root.FXIPredictionInsights = Object.freeze({marketLabels, marketType, marketLabel, matchLink, readMatchLink, originalOdds, oddsTimestamp, unitReturn, parlayStatus, parlayPrices, estimatedOdds, displayOdds, parlayProduct, parlayNet});
})(window);
