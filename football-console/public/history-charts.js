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

  function renderTrend(target, daily) {
    const points = cumulativePoints(daily);
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
      `<svg class="history-trend-plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="${first.day} 至 ${last.day}，累計命中率 ${last.rate.toFixed(1)}%，共 ${last.graded} 項計入">` +
      ticks + dates + (elapsed ? `<path class="chart-line" d="${step}"/>` : '') + dots + '</svg>';
  }

  function render(mix, trend, summary, daily) {
    renderMix(mix, summary);
    renderTrend(trend, daily);
  }

  root.FootballHistoryCharts = Object.freeze({ render });
})(window);
