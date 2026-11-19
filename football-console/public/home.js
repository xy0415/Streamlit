'use strict';

const taiwanDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', dateStyle: 'short' }).format(new Date());
const dateLabel = document.querySelector('#taiwan-date');
dateLabel.dateTime = taiwanDate;
dateLabel.textContent = taiwanDate.replaceAll('-', '/');

async function loadLatestReport() {
  const title = document.querySelector('#report-date');
  const summary = document.querySelector('#report-summary');

  try {
    const response = await fetch('/api/reports', { signal: AbortSignal.timeout(17000) });
    if (!response.ok) throw Error('Report request failed');
    const data = await response.json();
    if (!Array.isArray(data.reports)) throw Error('Missing reports');
    const latest = data.reports
      .filter(report => /^\d{4}-\d{2}-\d{2}$/.test(report.date) && (report.article || report.matches?.length))
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    if (!latest) {
      title.textContent = '暫無紀錄';
      summary.textContent = data.connected ? '目前沒有已發布的正式預測。' : '正式預測來源暫時無法讀取。';
      return;
    }

    title.textContent = latest.date.replaceAll('-', '/');
    summary.textContent = latest.matches?.length ? `${latest.matches.length} 項已發布的預測選項` : '正式分析全文已發布。';
    document.querySelector('#report-link').href = `/analysis.html?day=${latest.date}#predictions`;
  } catch {
    title.textContent = '暫無資料';
    summary.textContent = '正式預測來源暫時無法讀取。';
  }
}

loadLatestReport();

const hero = document.querySelector('.hero');
const canvas = document.querySelector('.hero-art');
const context = canvas.getContext('2d');
const motion = document.querySelector('.motion');
const headline = document.querySelector('.headline');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function createLayer(width, height) {
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  return layer;
}

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function drawPitch(ctx, width, height) {
  const compact = width < 580;
  const left = width * (compact ? .42 : .49);
  const top = height * (compact ? .38 : .29);
  const span = width * (compact ? .60 : .49);
  const depth = height * (compact ? .32 : .57);
  const project = (x, y) => [left + span * (.19 + x * .63 - .19 * y + .35 * x * y), top + depth * (.93 * y - .12 * x)];
  const stroke = points => {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      const point = project(x, y);
      if (index === 0) ctx.moveTo(...point);
      else ctx.lineTo(...point);
    });
    ctx.stroke();
  };
  const circle = (x, y, rx, ry) => Array.from({ length: 49 }, (_, i) => {
    const angle = i * Math.PI / 24;
    return [x + Math.cos(angle) * rx, y + Math.sin(angle) * ry];
  });

  ctx.save();
  ctx.strokeStyle = compact ? '#59635b25' : '#59635b54';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 5]);
  for (let step = 0; step <= 10; step++) {
    const fraction = step / 10;
    stroke([[fraction, 0], [fraction, 1]]);
    stroke([[0, fraction], [1, fraction]]);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = compact ? '#59635b54' : '#59635b91';
  stroke([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
  stroke([[.5, 0], [.5, 1]]);
  stroke(circle(.5, .5, .106, .155));
  for (const [edge, sign] of [[0, 1], [1, -1]]) {
    stroke([[edge, .22], [edge + sign * .16, .22], [edge + sign * .16, .78], [edge, .78]]);
    stroke([[edge, .36], [edge + sign * .066, .36], [edge + sign * .066, .64], [edge, .64]]);
  }
  ctx.strokeStyle = compact ? '#424d4670' : '#424d46a8';
  ctx.setLineDash([4, 6]);
  stroke([[.13, .74], [.37, .56], [.57, .68], [.78, .38], [.9, .22]]);
  ctx.setLineDash([]);
  ctx.fillStyle = ctx.strokeStyle;
  for (const [x, y] of [[.13, .74], [.37, .56], [.57, .68], [.78, .38], [.9, .22]]) {
    ctx.beginPath();
    ctx.arc(...project(x, y), compact ? 2 : 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

function makeLetterLayer(span, bounds, fontSize, spacing, index, random) {
  const box = span.getBoundingClientRect();
  const x = Math.round(box.left - bounds.left);
  const height = Math.ceil(fontSize * .9);
  const width = Math.ceil(box.width + 14);
  const y = Math.round(box.top - bounds.top + (box.height - height) / 2);
  const layer = createLayer(width, height);
  const ctx = layer.getContext('2d', { willReadFrequently: true });
  ctx.font = `700 ${fontSize}px "FXI Display"`;
  ctx.letterSpacing = spacing;
  const metrics = ctx.measureText(span.textContent);
  const baseline = Math.round((height + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
  ctx.fillStyle = index === 2 ? '#656d66' : '#171816';
  ctx.fillText(span.textContent, 0, baseline);

  if (index === 2) return { layer, x, y, baseline, origins: [] };

  const pixels = ctx.getImageData(0, 0, width, height);
  const edgeRows = [];
  const fade = fontSize * .29;
  for (let row = 0; row < height; row++) {
    let edge = width - 1;
    while (edge > 0 && pixels.data[(row * width + edge) * 4 + 3] < 110) edge--;
    if (edge < box.width - fade) continue;
    edgeRows.push({ x: edge, y: row });
    for (let col = Math.max(0, Math.floor(box.width - fade)); col <= edge; col++) {
      const progress = (col - box.width + fade) / fade;
      const offset = (row * width + col) * 4 + 3;
      if (random() < progress ** 2 * .78) pixels.data[offset] = 0;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return { layer, x, y, baseline, origins: edgeRows };
}

function makeParticles(lines, width, fontSize, random) {
  const symbols = 'FXI0123456789+';
  const compact = width < 580;
  return lines.slice(0, 2).flatMap((line, index) => {
    if (!line.origins.length) return [];
    return Array.from({ length: compact ? 105 : 235 }, () => {
      const origin = line.origins[Math.floor(random() * line.origins.length)];
      const distance = random() ** 2.55;
      return {
        x: line.x + origin.x - random() * fontSize * .13,
        y: line.y + origin.y,
        dx: distance * (width - line.x - origin.x) * .94 + random() * 18,
        dy: (random() - .63) * fontSize * (.28 + distance * 2.8) - index * distance * 4,
        phase: random() * Math.PI * 2,
        opacity: (.27 + random() * .65) * (1 - distance * .62),
        size: 4 + random() * (compact ? 4 : 7),
        angle: (random() - .5) * .9,
        glyph: symbols[Math.floor(random() * symbols.length)],
      };
    });
  });
}

function drawReflection(ctx, line, fontSize, time) {
  const depth = Math.round(fontSize * .31);
  const horizon = line.y + line.baseline - fontSize * .055;
  for (let i = 0; i < depth; i += 3) {
    const shift = Math.sin(i * .37 - time * 1.7) * (1.5 + i * .4);
    const band = .45 + .55 * Math.cos(i * .77 + time * .7) ** 2;
    ctx.globalAlpha = .50 * band * (1 - i / depth) ** 1.65;
    ctx.drawImage(line.layer, 0, Math.floor(line.baseline - i * 1.2 - 1), line.layer.width, 2,
      line.x + shift - i * .18, horizon + i, line.layer.width + i * .36, i < 8 ? 2 : 1.4);
  }
  ctx.globalAlpha = 1;
}

if (context && document.fonts) {
  let scene;
  let frame;
  let lastPaint = 0;
  let animate = !reducedMotion.matches;
  let isVisible = true;
  let clockStart = performance.now();

  function paint(time) {
    const { width, height, base, lines, particles, fontSize } = scene;
    context.clearRect(0, 0, width, height);
    context.drawImage(base, 0, 0);
    for (const line of lines) context.drawImage(line.layer, line.x, line.y);
    drawReflection(context, lines[2], fontSize, time);

    context.fillStyle = '#2d342f';
    for (const particle of particles) {
      const sway = Math.sin(time * .76 + particle.phase);
      const phase = Math.cos(time * .58 + particle.phase);
      context.save();
      context.globalAlpha = particle.opacity * (.82 + .18 * phase);
      context.translate(particle.x + particle.dx + sway * (2 + particle.dx * .035),
        particle.y + particle.dy + phase * (2 + particle.dx * .023));
      context.rotate(particle.angle + sway * .17);
      context.font = `600 ${particle.size}px monospace`;
      context.fillText(particle.glyph, 0, 0);
      context.restore();
    }
  }

  function tick(now) {
    frame = undefined;
    if (!animate || !isVisible || document.hidden) return;
    if (now - lastPaint > 32) {
      paint((now - clockStart) / 1000);
      lastPaint = now;
    }
    frame = requestAnimationFrame(tick);
  }

  function updateMotion() {
    motion.hidden = false;
    motion.textContent = animate ? '停用動態' : '啟用動態';
    motion.setAttribute('aria-pressed', String(animate));
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    if (!scene || !isVisible || document.hidden) return;
    if (animate) frame = requestAnimationFrame(tick);
    else paint(0);
  }

  function resize() {
    const bounds = hero.getBoundingClientRect();
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);
    if (!width || !height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    const { fontSize, letterSpacing } = getComputedStyle(headline);
    const pixels = parseFloat(fontSize);
    const random = seededRandom(721);
    const lines = Array.from(headline.children, (span, index) => makeLetterLayer(span, bounds, pixels, letterSpacing, index, random));
    const base = createLayer(width, height);
    drawPitch(base.getContext('2d'), width, height);
    scene = { width, height, base, lines, particles: makeParticles(lines, width, pixels, random), fontSize: pixels };
    paint(0);
    hero.classList.add('has-art');
  }

  document.fonts.load('700 120px "FXI Display"').then(() => {
    resize();
    new ResizeObserver(resize).observe(hero);
    new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      updateMotion();
    }).observe(hero);
    document.addEventListener('visibilitychange', updateMotion);
    motion.addEventListener('click', () => {
      animate = !animate;
      clockStart = performance.now();
      updateMotion();
    });
    reducedMotion.addEventListener('change', event => {
      animate = !event.matches;
      updateMotion();
    });
    updateMotion();
  }).catch(() => {
    canvas.hidden = true;
  });
}
