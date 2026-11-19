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

  root.FXIPredictionInsights = Object.freeze({marketLabels, marketType, matchLink, readMatchLink, originalOdds, unitReturn, parlayStatus});
})(window);
