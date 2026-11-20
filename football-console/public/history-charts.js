'use strict';

(function (root) {
  function cumulativePoints(daily) {
    let graded = 0;
    let weightedWins = 0;
    return daily.flatMap(({ day, stats }) => {
      const count = stats.win + stats.halfwin + stats.loss + stats.halfloss;
      if (!count) return [];
      graded += count;
      weightedWins += stats.win + stats.halfwin * .5;
      return [{ day, graded, rate: 100 * weightedWins / graded }];
    });
  }

  function renderMix(target, stats) {
    if (!stats.finished) {
      target.innerHTML = '<p class="history-chart-empty">目前沒有已結算的預測。</p>';
      return;
    }
    const outcomes = [
      { label: '贏（含半贏）', count: stats.win + stats.halfwin, style: 'wins' },
      { label: '輸（含半輸）', count: stats.loss + stats.halfloss, style: 'losses' },
      { label: '走盤', count: stats.push, style: 'pushes' },
    ];
    target.innerHTML =
      '<div class="history-mix-bar" aria-hidden="true">' +
      outcomes.filter(item => item.count).map(item =>
        `<span class="${item.style}" style="width:${item.count / stats.finished * 100}%"></span>`
      ).join('') +
      '</div><ul class="history-mix-legend">' +
      outcomes.map(item => `<li><span class="mix-swatch ${item.style}" aria-hidden="true"></span>` +
        `<span>${item.label}</span><strong>${item.count}</strong></li>`).join('') + '</ul>';
  }

  function rollingPoints(rows) {
    const weights = {win:1,halfwin:.5,loss:0,halfloss:0};
    const ordered = rows.filter(row=>Object.hasOwn(weights,row.result?.grade)).sort((a,b)=>
      a.reportDate.localeCompare(b.reportDate)||a.p.time.localeCompare(b.p.time)||a.p.order-b.p.order);
    const window = [];
    const days = new Map();
    let sum = 0;
    for (const row of ordered) {
      const weight = weights[row.result.grade];
      window.push(weight);
      sum += weight;
      if (window.length > 30) sum -= window.shift();
      days.set(row.reportDate,{day:row.reportDate,graded:window.length,rate:sum/window.length*100});
    }
    return [...days.values()];
  }

  function renderTrend(target, points, title) {
    if (!points.length) {
      target.innerHTML = '<p class="history-chart-empty">目前沒有可計入命中率的預測。</p>';
      return;
    }

    const width = 320;
    const height = 150;
    const left = 44;
    const right = width - 14;
    const top = 12;
    const bottom = 119;
    const xDate = day => Date.parse(day + 'T00:00:00Z');
    const first = points[0];
    const last = points.at(-1);
    const start = xDate(first.day);
    const elapsed = xDate(last.day) - start;
    const x = day => elapsed ? left + (right - left) * (xDate(day) - start) / elapsed : (left + right) / 2;
    const y = rate => bottom - (bottom - top) * rate / 100;
    const dateLabel = day => day.slice(5).replace('-', '/');
    const step = points.map((point, index) => index
      ? `H ${x(point.day).toFixed(2)} V ${y(point.rate).toFixed(2)}`
      : `M ${x(point.day).toFixed(2)} ${y(point.rate).toFixed(2)}`).join(' ');

    const ticks = [100, 75, 50, 25, 0].map(value =>
      `<line class="chart-gridline" x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}"/>` +
      `<text text-anchor="end" x="${left - 7}" y="${y(value) + 4}">${value}%</text>`
    ).join('');
    const dates = elapsed
      ? `<text x="${left}" y="141">${dateLabel(first.day)}</text><text text-anchor="end" x="${right}" y="141">${dateLabel(last.day)}</text>`
      : `<text text-anchor="middle" x="${x(first.day)}" y="141">${dateLabel(first.day)}</text>`;
    const dots = points.map(point =>
      `<circle class="chart-point" cx="${x(point.day).toFixed(2)}" cy="${y(point.rate).toFixed(2)}" r="${point === last ? 4 : 2.5}">` +
      `<title>${point.day} · ${point.rate.toFixed(1)}% · ${point.graded} 項計入</title></circle>`
    ).join('');

    target.innerHTML = `<div class="history-trend-value"><strong>${last.rate.toFixed(1)}%</strong><span>${last.graded} 項計入</span></div>` +
      `<svg class="history-trend-plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="${first.day} 至 ${last.day}，${title} ${last.rate.toFixed(1)}%，共 ${last.graded} 項計入">` +
      ticks + dates + (elapsed ? `<path class="chart-line" d="${step}"/>` : '') + dots + '</svg>';
  }

  function render(mix, trend, summary, daily, rolling, rows = []) {
    renderMix(mix, summary);
    renderTrend(trend, cumulativePoints(daily),'累計命中率');
    if(rolling)renderTrend(rolling,rollingPoints(rows),'滾動命中率');
  }

  function parlayRoi(rows){
    const days=new Map();
    for(const row of rows){
      if(!Number.isFinite(row.net))continue;
      const series=days.get(row.odds.kind)||new Map();
      const d=series.get(row.date)||{net:0,count:0};
      series.set(row.date,{net:d.net+row.net,count:d.count+1});
      days.set(row.odds.kind,series);
    }
    return new Map([...days].map(([kind,series])=>{
      let net=0,count=0;
      return [kind,[...series].sort(([a],[b])=>a.localeCompare(b)).map(([date,d])=>{
        net+=d.net;count+=d.count;
        return {date,rate:100*net/count,count};
      })];
    }));
  }

  function parlayPlot(rows,labels){
    const series=parlayRoi(rows);
    if(!series.size)return '<p class="history-chart-empty">目前沒有賠率與結算齊全的串關。</p>';
    const points=[...series.values()].flat();
    const dates=[...new Set(points.map(p=>p.date))].sort();
    const low=Math.min(0,...points.map(p=>p.rate)),high=Math.max(0,...points.map(p=>p.rate));
    const yMin=low===high?-10:low,yMax=low===high?10:high;
    const t=d=>Date.parse(d+'T00:00Z');
    const first=t(dates[0]),span=t(dates.at(-1))-first;
    const x=d=>span?68+540*(t(d)-first)/span:338;
    const y=r=>138-(r-yMin)*116/(yMax-yMin);
    const percent=r=>(r>0?'+':'')+r.toFixed(1)+'%';
    const grid=[...new Set([yMin,0,yMax])].map(v=>
      `<line class="chart-gridline" x1="68" x2="608" y1="${y(v)}" y2="${y(v)}"/><text x="62" y="${y(v)+4}" text-anchor="end">${percent(v)}</text>`).join('');
    const dateTicks=dates.filter((_,i)=>!i||i===dates.length-1||dates.length<=5).map(d=>
      `<text x="${x(d)}" y="166" text-anchor="middle">${d.slice(5).replace('-','/')}</text>`).join('');
    const graphs=[...series].map(([kind,data])=>
      `<g class="roi-series roi-${kind}">`+(data.length>1?`<polyline points="${data.map(p=>x(p.date)+','+y(p.rate)).join(' ')}"/>`:'')+
      data.map(p=>`<circle cx="${x(p.date)}" cy="${y(p.rate)}" r="4" tabindex="0" aria-label="${labels[kind]} ${p.date} ${percent(p.rate)}">
        <title>${labels[kind]} · ${p.date} · ${percent(p.rate)} · ${p.count} 組</title></circle>`).join('')+'</g>').join('');
    return '<div class="parlay-roi-chart"><h4>累計串關報酬率</h4><p>依預測日期累計。</p>'+
      '<svg class="history-trend-plot" viewBox="0 0 630 176" role="img" aria-label="累計串關報酬率折線圖">'+grid+dateTicks+graphs+'</svg>'+
      '<ul class="roi-legend">'+[...series.keys()].map(kind=>`<li class="roi-${kind}">${labels[kind]}</li>`).join('')+'</ul></div>';
  }

  root.FootballHistoryCharts = Object.freeze({ render,parlayPlot });
})(window);
