// Dashboard page: calculations and drawings. Data comes from assets/data.js.

// ================= data =================
dash.calc('months', {
  title: 'Danh sách tháng',
  description: 'Mỗi tháng có dữ liệu, số ngày có dữ liệu, ngày cuối và tỷ lệ để chia plan theo ngày (chỉ tháng cuối).',
  inputs: ['actual'],
  fn: (actual) => {
    const by = d3.rollup(actual, (v) => d3.max(v, (r) => r.date), (r) => r.date.slice(0, 7));
    const months = [...by.keys()].sort();
    const last = months[months.length - 1];
    return months.map((m) => {
      const lastDate = by.get(m);
      const [y, mo] = m.split('-').map(Number);
      const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const lastDay = Number(lastDate.slice(8, 10));
      return { month: m, last_date: lastDate, last_day: lastDay, days_in_month: dim, plan_factor: m === last ? lastDay / dim : 1 };
    });
  }
});

dash.calc('kpis', {
  title: 'KPI tháng: actual, plan, MoM',
  description: 'Tổng actual từng tháng so với plan (chia theo ngày nếu tháng chưa hết) và với cùng số ngày đầu tháng trước.',
  inputs: ['actual', 'plan', 'months'],
  fn: (actual, plan, months) => {
    const n = (x) => Number(x) || 0;
    const agg = (rows) => {
      const s = (k) => d3.sum(rows, (r) => n(r[k]));
      const spend = s('spend'), gmv = s('gmv'), purchases = s('purchases'), clicks = s('clicks');
      return { gmv, roas: spend ? gmv / spend : null, purchases, spend, cpp: purchases ? spend / purchases : null, cvr: clicks ? purchases / clicks : null };
    };
    const out = [];
    months.forEach((mi, i) => {
      const a = agg(actual.filter((r) => r.date.slice(0, 7) === mi.month));
      const p0 = agg(plan.filter((r) => r.month === mi.month));
      const f = mi.plan_factor;
      const p = { ...p0, gmv: p0.gmv * f, purchases: p0.purchases * f, spend: p0.spend * f };
      const prevM = months[i - 1];
      const pr = prevM ? agg(actual.filter((r) => r.date.slice(0, 7) === prevM.month && Number(r.date.slice(8, 10)) <= mi.last_day)) : null;
      Object.keys(a).forEach((metric) => out.push({
        month: mi.month, metric, actual: a[metric], plan: p[metric],
        ach: p[metric] ? a[metric] / p[metric] : null,
        prev: pr ? pr[metric] : null,
        mom: pr && pr[metric] ? a[metric] / pr[metric] - 1 : null
      }));
    });
    return out;
  }
});

dash.calc('monthly', {
  title: 'GMV và chi phí theo tháng vs plan',
  description: 'Tổng theo tháng; plan của tháng cuối chia theo số ngày đã có dữ liệu.',
  inputs: ['actual', 'plan', 'months'],
  fn: (actual, plan, months) => months.map((mi) => {
    const a = actual.filter((r) => r.date.slice(0, 7) === mi.month);
    const p = plan.filter((r) => r.month === mi.month);
    const s = (rows, k) => d3.sum(rows, (r) => Number(r[k]) || 0);
    return { month: mi.month, gmv: s(a, 'gmv'), gmv_plan: s(p, 'gmv') * mi.plan_factor, spend: s(a, 'spend'), spend_plan: s(p, 'spend') * mi.plan_factor };
  })
});

dash.calc('trend', {
  title: 'Xu hướng theo ngày',
  description: 'Cộng theo ngày, kèm ROAS = GMV/spend, CTR = click/impression, CVR = purchase/click.',
  inputs: ['actual'],
  fn: (actual) => {
    const g = d3.rollups(actual, (v) => {
      const s = (k) => d3.sum(v, (r) => Number(r[k]) || 0);
      return { spend: s('spend'), gmv: s('gmv'), impressions: s('impressions'), clicks: s('clicks'), add_to_cart: s('add_to_cart'), purchases: s('purchases') };
    }, (r) => r.date);
    return g.sort((a, b) => d3.ascending(a[0], b[0])).map(([date, t]) => ({
      date, month: date.slice(0, 7), spend: t.spend, roas: t.spend ? t.gmv / t.spend : null,
      add_to_cart: t.add_to_cart, purchases: t.purchases,
      ctr: t.impressions ? t.clicks / t.impressions : null, cvr: t.clicks ? t.purchases / t.clicks : null
    }));
  }
});

dash.calc('funnel', {
  title: 'Phễu actual vs plan',
  description: 'Impressions → link clicks → add to cart → purchases theo tháng, plan chia theo ngày nếu tháng chưa hết.',
  inputs: ['actual', 'plan', 'months'],
  fn: (actual, plan, months) => {
    const steps = [['impressions', 'Impressions'], ['clicks', 'Link clicks'], ['add_to_cart', 'Add to cart (shared items)'], ['purchases', 'Purchases (shared items)']];
    const out = [];
    months.forEach((mi) => {
      const a = actual.filter((r) => r.date.slice(0, 7) === mi.month), p = plan.filter((r) => r.month === mi.month);
      const s = (rows, k) => d3.sum(rows, (r) => Number(r[k]) || 0);
      steps.forEach(([k, label], i) => {
        const nx = steps[i + 1];
        out.push({
          month: mi.month, step: label, actual: s(a, k), plan: s(p, k) * mi.plan_factor,
          to_next: nx && s(a, k) ? s(a, nx[0]) / s(a, k) : null,
          to_next_plan: nx && s(p, k) ? s(p, nx[0]) / s(p, k) : null
        });
      });
    });
    return out;
  }
});

dash.calc('splits', {
  title: 'Phân bổ theo tháng',
  description: 'Spend, GMV, purchases theo loại khán giả, loại chiến dịch và định dạng quảng cáo.',
  inputs: ['actual'],
  fn: (actual) => {
    const out = [];
    ['audience_type', 'campaign_type', 'ad_format'].forEach((dim) => {
      d3.rollups(actual, (v) => ({
        spend: d3.sum(v, (r) => Number(r.spend) || 0), gmv: d3.sum(v, (r) => Number(r.gmv) || 0), purchases: d3.sum(v, (r) => Number(r.purchases) || 0)
      }), (r) => r.date.slice(0, 7), (r) => r[dim]).forEach(([month, segs]) => segs.forEach(([segment, t]) => out.push({ month, dimension: dim, segment, ...t })));
    });
    return out;
  }
});

dash.calc('type_table', {
  title: 'Theo loại chiến dịch vs plan',
  description: 'Actual và plan theo tháng × loại chiến dịch, kèm % plan, ROAS, CPP; dòng Tổng cộng mỗi tháng.',
  inputs: ['actual', 'plan', 'months'],
  fn: (actual, plan, months) => {
    const s = (rows, k) => d3.sum(rows, (r) => Number(r[k]) || 0);
    const out = [];
    months.forEach((mi) => {
      const a = actual.filter((r) => r.date.slice(0, 7) === mi.month), p = plan.filter((r) => r.month === mi.month);
      const types = [...new Set([...a.map((r) => r.campaign_type), ...p.map((r) => r.campaign_type)])].sort();
      const row = (name, ar, pr) => {
        const f = mi.plan_factor;
        const spend = s(ar, 'spend'), gmv = s(ar, 'gmv'), purchases = s(ar, 'purchases');
        const sp = s(pr, 'spend') * f, gp = s(pr, 'gmv') * f, pp = s(pr, 'purchases') * f;
        return { month: mi.month, campaign_type: name, spend, spend_plan: sp, spend_ach: sp ? spend / sp : null, gmv, gmv_plan: gp, gmv_ach: gp ? gmv / gp : null,
          roas: spend ? gmv / spend : null, roas_plan: sp ? gp / sp : null, purchases, purchases_plan: pp, cpp: purchases ? spend / purchases : null };
      };
      types.forEach((t) => out.push(row(t, a.filter((r) => r.campaign_type === t), p.filter((r) => r.campaign_type === t))));
      out.push(row('Tổng cộng', a, p));
    });
    return out;
  }
});

dash.calc('product_table', {
  title: 'Theo ngành hàng',
  description: 'Actual theo tháng × ngành hàng (List Product), kèm % GMV, ROAS, CPP.',
  inputs: ['actual'],
  fn: (actual) => {
    const out = [];
    d3.rollups(actual, (v) => {
      const s = (k) => d3.sum(v, (r) => Number(r[k]) || 0);
      return { spend: s('spend'), clicks: s('clicks'), add_to_cart: s('add_to_cart'), purchases: s('purchases'), gmv: s('gmv') };
    }, (r) => r.date.slice(0, 7), (r) => r.product).forEach(([month, prods]) => {
      const tot = d3.sum(prods, ([, t]) => t.gmv);
      prods.forEach(([product, t]) => out.push({ month, product, ...t, gmv_share: tot ? t.gmv / tot : null,
        roas: t.spend ? t.gmv / t.spend : null, cpp: t.purchases ? t.spend / t.purchases : null }));
    });
    return out;
  }
});

// ================= formats =================
const VI = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['', ' ₫'] });
const fInt = VI.format(',.0f');
const fVnd = (v) => v == null ? '—' : v >= 1e9 ? VI.format(',.2f')(v / 1e9) + ' tỷ ₫' : v >= 1e6 ? VI.format(',.1f')(v / 1e6) + ' tr ₫' : fInt(v) + ' ₫';
const fVndShort = (v) => v >= 1e9 ? VI.format(',.1f')(v / 1e9) + ' tỷ' : v >= 1e6 ? VI.format(',.0f')(v / 1e6) + ' tr' : fInt(v);
const fX = (v) => v == null ? '—' : VI.format(',.1f')(v) + 'x';
const fPct = (v) => (v > 0 ? '+' : '') + VI.format(',.1%')(v);
const fPct0 = (v) => v == null ? '—' : VI.format(',.0%')(v);
const fPct2 = (v) => v == null ? '—' : VI.format(',.2%')(v);
const FMT = { vnd: fVnd, x: fX, int: (v) => v == null ? '—' : fInt(v), pct0: fPct0, pct2: fPct2,
  planvnd: (v) => 'Plan ' + fVnd(v), planx: (v) => 'Target ' + fX(v), planint: (v) => 'Plan ' + fInt(v), planpct: (v) => 'Target ' + fPct2(v) };
const fmtDay = (s) => d3.utcFormat('%d/%m')(new Date(s));
const monthLabel = (m) => m ? 'T' + Number(m.slice(5, 7)) + '/' + m.slice(0, 4) : '—';
const ROAS_COLOR = '#ee4d2d';

// current month: param, else latest month in the data
const curMonth = () => {
  const p = dash.params().month;
  const g = dash.data('months');
  if (g.status !== 'ok' || !g.data.length) return p || null;
  return g.data.some((r) => r.month === p) ? p : g.data[g.data.length - 1].month;
};
const failed = (el, ids) => {
  const sts = ids.map((id) => dash.data(id).status);
  if (sts.includes('error')) { el.innerHTML = '<div class="cp-fail">Failed to load</div>'; el.classList.remove('dash-skeleton'); return true; }
  if (sts.some((s) => s !== 'ok')) { el.replaceChildren(); return true; }
  el.classList.remove('dash-skeleton');
  return false;
};

// ================= header controls =================
dash.draw('month', (sel) => {
  const g = dash.data('months');
  const rows = g.status === 'ok' ? g.data : [];
  sel.replaceChildren(...rows.slice().reverse().map((r) => new Option(monthLabel(r.month) + (r.plan_factor < 1 ? ' (đến ' + fmtDay(r.last_date) + ')' : ''), r.month)));
  sel.value = curMonth() || '';
  sel.onchange = () => dash.setParams({ month: sel.value });
});
dash.draw('range', (el) => {
  const g = dash.data('months'); const m = curMonth();
  const r = g.status === 'ok' ? g.data.find((x) => x.month === m) : null;
  el.textContent = r ? '📅 01/' + m.slice(5, 7) + ' – ' + fmtDay(r.last_date) + '/' + m.slice(0, 4) : '—';
});
dash.draw('mlabel', (el) => { el.textContent = monthLabel(curMonth()); });

// ================= tiles =================
const kpiRow = (el) => {
  const g = dash.data('kpis'); const m = curMonth();
  if (!m) return null;
  el.dataset.where = 'month=' + m + '&metric=' + el.dataset.metric;
  return g.status === 'ok' ? g.data.find((r) => r.month === m && r.metric === el.dataset.metric) : null;
};
dash.draw('kpi', (el) => {
  const r = kpiRow(el);
  el.dataset.field = el.dataset.field || 'actual';
  el.textContent = r && r[el.dataset.field] != null ? FMT[el.dataset.fmt](r[el.dataset.field]) : '—';
});
dash.draw('ach', (el) => {
  const r = kpiRow(el); el.dataset.field = 'ach';
  el.classList.remove('cp-good', 'cp-bad', 'cp-warn', 'cp-neutral');
  if (!r || r.ach == null) { el.textContent = '—'; return; }
  const v = r.ach, b = el.dataset.better;
  el.textContent = 'Đạt ' + fPct0(v) + ' plan';
  const ok = b === 'up' ? v >= 1 : b === 'down' ? v <= 1 : Math.abs(v - 1) <= 0.1;
  el.classList.add(ok ? 'cp-good' : (b === 'pace' ? 'cp-warn' : 'cp-bad'));
});
dash.draw('mom', (el) => {
  const r = kpiRow(el); el.dataset.field = 'mom';
  el.classList.remove('cp-good', 'cp-bad', 'cp-neutral');
  if (!r || r.mom == null) { el.textContent = '—'; return; }
  const v = r.mom, b = el.dataset.better;
  el.textContent = (v >= 0 ? '▲ ' : '▼ ') + fPct(v) + ' MoM';
  el.classList.add(b === 'none' ? 'cp-neutral' : ((v >= 0) === (b === 'up') ? 'cp-good' : 'cp-bad'));
});
dash.draw('sw', (el) => { el.style.background = dash.colors[Number(el.dataset.i)]; });

// ================= chart helpers =================
function makeTip(el) { const t = document.createElement('div'); t.className = 'cp-tip'; t.hidden = true; el.appendChild(t); return t; }
function placeTip(tip, el, x, y) {
  tip.hidden = false;
  const w = tip.offsetWidth, W = el.clientWidth;
  tip.style.left = Math.max(0, Math.min(W - w, x + 12)) + 'px';
  tip.style.top = Math.max(0, y - 10) + 'px';
}
function tipHTML(tip, title, lines) {
  tip.replaceChildren();
  const d = document.createElement('div'); d.className = 'd'; d.textContent = title; tip.appendChild(d);
  lines.forEach(([color, name, val]) => {
    const row = document.createElement('div');
    if (color) { const i = document.createElement('i'); i.style.background = color; row.appendChild(i); }
    row.appendChild(document.createTextNode(name + ': ' + val)); tip.appendChild(row);
  });
}
function axisStyle(g) {
  g.attr('font-size', null).attr('font-family', null);
  g.selectAll('text').attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)');
  g.selectAll('.domain').attr('stroke', 'var(--cds-chart-axis)');
  g.selectAll('.tick line').attr('stroke', 'var(--cds-chart-grid)');
}
function measure(svg, texts) {
  const t = svg.append('text').style('font-size', 'var(--cds-font-size-caption)');
  const w = d3.max(texts, (s) => { t.text(s); return t.node().getComputedTextLength(); }) || 0;
  t.remove(); return w;
}

// monthly actual bars vs plan dashes
function planChart(el, key, color, fmt) {
  if (failed(el, ['monthly', 'months'])) return;
  const rows = dash.data('monthly').data; const m = curMonth();
  el.replaceChildren();
  const W = el.clientWidth || 320, H = 230;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => Math.max(r[key], r[key + '_plan']))]).nice().range([H - 24, 10]);
  const ml = measure(svg, y.ticks(4).map(fVndShort)) + 8;
  const x = d3.scaleBand().domain(rows.map((r) => r.month)).range([ml, W - 4]).padding(0.28);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(fVndShort).tickSize(-(W - ml - 4))).call(axisStyle).call((g) => g.select('.domain').remove());
  const every = Math.ceil(rows.length / Math.max(1, Math.floor((W - ml) / 46)));
  svg.append('g').attr('transform', `translate(0,${H - 24})`).call(d3.axisBottom(x).tickValues(rows.map((r) => r.month).filter((_, i) => i % every === 0)).tickFormat((d) => 'T' + Number(d.slice(5)) + (d.slice(5) === '01' || d === rows[0].month ? '/' + d.slice(2, 4) : ''))).call(axisStyle);
  const bw = Math.min(32, x.bandwidth());
  const gx = (r) => x(r.month) + (x.bandwidth() - bw) / 2;
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', gx).attr('width', bw).attr('y', (r) => y(r[key])).attr('height', (r) => y(0) - y(r[key])).attr('rx', 3)
    .attr('fill', color).attr('opacity', (r) => r.month === m ? 1 : 0.45);
  svg.append('g').selectAll('line').data(rows).join('line')
    .attr('x1', (r) => gx(r) - 3).attr('x2', (r) => gx(r) + bw + 3).attr('y1', (r) => y(r[key + '_plan'])).attr('y2', (r) => y(r[key + '_plan']))
    .attr('stroke', 'var(--color-fg)').attr('stroke-width', 2).attr('stroke-dasharray', '4 3');
  const tip = makeTip(el);
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(r.month)).attr('width', x.bandwidth()).attr('y', 0).attr('height', H - 24).attr('fill', 'transparent').style('cursor', 'pointer')
    .on('pointermove', (ev, r) => {
      tipHTML(tip, monthLabel(r.month), [[color, 'Actual', fmt(r[key])], [null, 'Plan', fmt(r[key + '_plan'])], [null, '% plan', fPct0(r[key + '_plan'] ? r[key] / r[key + '_plan'] : null)]]);
      const [px, py] = d3.pointer(ev, el); placeTip(tip, el, px, py);
    })
    .on('pointerleave', () => { tip.hidden = true; })
    .on('click', (ev, r) => dash.setParams({ month: r.month }));
}
dash.draw('planGmv', (el) => planChart(el, 'gmv', '#ee4d2d', fVnd));
dash.draw('planSpend', (el) => planChart(el, 'spend', '#1877f2', fVnd));

function lineChart(el, opts) {
  if (failed(el, ['trend', 'months'])) return;
  const m = curMonth();
  const rows = dash.data('trend').data.filter((r) => r.month === m).map((r) => ({ ...r, d: new Date(r.date) }));
  el.replaceChildren();
  if (!rows.length) return;
  const W = el.clientWidth || 300, H = 200;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  const yL = d3.scaleLinear().domain([0, d3.max(rows, (r) => d3.max(opts.left.map((s) => r[s.key] || 0))) || 1]).nice().range([H - 24, 8]);
  const yR = opts.right ? d3.scaleLinear().domain([0, d3.max(rows, (r) => r[opts.right.key] || 0) || 1]).nice().range([H - 24, 8]) : null;
  const ml = measure(svg, yL.ticks(4).map(opts.leftFmt)) + 8, mr = yR ? measure(svg, yR.ticks(4).map(opts.right.fmt)) + 8 : 8;
  const x = d3.scaleUtc().domain(d3.extent(rows, (r) => r.d)).range([ml + 4, W - mr - 4]);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(yL).ticks(4).tickFormat(opts.leftFmt).tickSize(-(W - ml - mr))).call(axisStyle).call((g) => g.select('.domain').remove());
  if (yR) svg.append('g').attr('transform', `translate(${W - mr},0)`).call(d3.axisRight(yR).ticks(4).tickFormat(opts.right.fmt).tickSize(0)).call(axisStyle).call((g) => g.select('.domain').remove());
  const maxTicks = Math.max(2, Math.floor((W - ml - mr) / 55));
  const tickStep = Math.ceil(rows.length / maxTicks);
  svg.append('g').attr('transform', `translate(0,${H - 24})`).call(d3.axisBottom(x).tickValues(rows.filter((_, i) => i % tickStep === 0).map((r) => r.d)).tickFormat(d3.utcFormat('%d/%m'))).call(axisStyle);
  if (opts.bars) {
    const bw = Math.max(2, Math.min(32, (W - ml - mr) / rows.length * 0.65));
    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', (r) => x(r.d) - bw / 2).attr('width', bw).attr('y', (r) => yL(r[opts.bars])).attr('height', (r) => yL(0) - yL(r[opts.bars]))
      .attr('rx', 2).attr('fill', 'var(--cds-chart-muted)');
  }
  const lines = [...opts.left.filter((s) => !s.bar).map((s) => ({ ...s, y: yL })), ...(opts.right ? [{ ...opts.right, y: yR }] : [])];
  lines.forEach((s) => svg.append('path').datum(rows.filter((r) => r[s.key] != null)).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 2)
    .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('d', d3.line().x((r) => x(r.d)).y((r) => s.y(r[s.key]))));
  const dots = lines.map((s) => svg.append('circle').attr('r', 4).attr('fill', s.color).attr('opacity', 0));
  const rule = svg.append('line').attr('y1', 8).attr('y2', H - 24).attr('stroke', 'var(--cds-chart-reference)').attr('opacity', 0);
  const tip = makeTip(el);
  const all = [...opts.left, ...(opts.right ? [opts.right] : [])];
  svg.append('rect').attr('x', ml).attr('y', 0).attr('width', W - ml - mr).attr('height', H).attr('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [px] = d3.pointer(ev);
      const r = rows[d3.bisectCenter(rows.map((q) => +q.d), +x.invert(px))];
      rule.attr('x1', x(r.d)).attr('x2', x(r.d)).attr('opacity', 1);
      lines.forEach((s, j) => dots[j].attr('cx', x(r.d)).attr('cy', s.y(r[s.key] || 0)).attr('opacity', r[s.key] == null ? 0 : 1));
      tipHTML(tip, fmtDay(r.date), all.map((s) => [s.color, s.name, r[s.key] == null ? '—' : s.fmt(r[s.key])]));
      placeTip(tip, el, x(r.d) * el.clientWidth / W, 20);
    })
    .on('pointerleave', () => { tip.hidden = true; rule.attr('opacity', 0); dots.forEach((d) => d.attr('opacity', 0)); });
}
dash.draw('trendSpend', (el) => lineChart(el, {
  bars: 'spend', leftFmt: fVndShort,
  left: [{ key: 'spend', name: 'Spend', color: 'var(--cds-chart-muted)', fmt: fVnd, bar: true }],
  right: { key: 'roas', name: 'ROAS', color: ROAS_COLOR, fmt: fX }
}));
dash.draw('trendConv', (el) => lineChart(el, {
  leftFmt: VI.format(',.0f'),
  left: [{ key: 'add_to_cart', name: 'Add to cart', color: dash.colors[0], fmt: fInt }, { key: 'purchases', name: 'Purchases', color: dash.colors[1], fmt: fInt }]
}));
dash.draw('trendRate', (el) => lineChart(el, {
  leftFmt: VI.format('.1%'),
  left: [{ key: 'ctr', name: 'CTR', color: dash.colors[2], fmt: fPct2 }, { key: 'cvr', name: 'CVR', color: dash.colors[3], fmt: fPct2 }]
}));

// ================= funnel =================
dash.draw('funnel', (el) => {
  if (failed(el, ['funnel', 'months'])) return;
  const m = curMonth();
  const rows = dash.data('funnel').data.filter((r) => r.month === m);
  el.replaceChildren();
  if (!rows.length) return;
  const lo = d3.min(rows, (r) => Math.min(r.actual || Infinity, r.plan || Infinity));
  const hi = d3.max(rows, (r) => Math.max(r.actual, r.plan));
  const w = d3.scaleLog().domain([Math.max(1, lo * 0.5), hi]).range([14, 100]).clamp(true);
  const gaps = rows.slice(0, -1).map((r) => r.to_next != null && r.to_next_plan ? r.to_next / r.to_next_plan : Infinity);
  const worst = d3.minIndex(gaps);
  rows.forEach((r, i) => {
    const row = document.createElement('div'); row.className = 'cp-frow';
    const nm = document.createElement('div'); nm.textContent = r.step; row.appendChild(nm);
    const bars = document.createElement('div');
    const bar = document.createElement('div'); bar.className = 'cp-fbar';
    bar.style.width = w(Math.max(1, r.actual)) + '%'; bar.style.background = i < 2 ? '#1877f2' : '#ee4d2d';
    bar.textContent = fInt(r.actual); bars.appendChild(bar);
    const pv = document.createElement('div'); pv.className = 'cp-fprev'; pv.style.width = w(Math.max(1, r.plan)) + '%'; bars.appendChild(pv);
    const meta = document.createElement('div'); meta.className = 'cp-fmeta';
    meta.textContent = 'Plan ' + fInt(r.plan) + ' · đạt ' + fPct0(r.plan ? r.actual / r.plan : null); bars.appendChild(meta);
    row.appendChild(bars); el.appendChild(row);
    if (i < rows.length - 1) {
      const dr = document.createElement('div'); dr.className = 'cp-fdrop' + (i === worst && gaps[i] < 1 ? ' worst' : '');
      dr.textContent = '↓ ' + fPct2(r.to_next) + ' sang bước sau (plan ' + fPct2(r.to_next_plan) + ')';
      el.appendChild(dr);
    }
  });
});

// ================= donuts =================
const METRIC_NAME = { spend: 'Spend', gmv: 'GMV', purchases: 'Purchases' };
dash.draw('donut', (el) => {
  if (failed(el, ['splits', 'months'])) return;
  const dim = el.dataset.dim, mk = el.dataset.metric, m = curMonth();
  const rows = dash.data('splits').data.filter((r) => r.month === m && r.dimension === dim && r[mk] > 0)
    .map((r) => ({ name: r.segment, v: r[mk] })).sort((a, b) => b.v - a.v);
  el.replaceChildren();
  if (!rows.length) return;
  const total = d3.sum(rows, (r) => r.v);
  const fmt = mk === 'purchases' ? fInt : fVnd;
  const W = el.clientWidth || 280, size = Math.min(150, Math.max(110, W * 0.42)), R = size / 2;
  const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;gap:.75rem;align-items:center;flex-wrap:wrap';
  el.appendChild(wrap);
  const svg = d3.select(wrap).append('svg').attr('width', size).attr('height', size).attr('viewBox', `${-R} ${-R} ${size} ${size}`);
  const pie = d3.pie().sort(null).value((r) => r.v)(rows);
  const arc = d3.arc().innerRadius(R * 0.58).outerRadius(R - 2).padAngle(0.015);
  const tip = makeTip(el);
  svg.selectAll('path').data(pie).join('path').attr('d', arc).attr('fill', (d, i) => dash.colors[i % 8])
    .on('pointermove', (ev, d) => {
      tipHTML(tip, d.data.name, [[dash.colors[d.index % 8], METRIC_NAME[mk], fmt(d.data.v) + ' · ' + VI.format('.1%')(d.data.v / total)]]);
      const [px, py] = d3.pointer(ev, el); placeTip(tip, el, px, py);
    })
    .on('pointerleave', () => { tip.hidden = true; });
  svg.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('fill', 'var(--color-fg)')
    .style('font-size', 'var(--cds-font-size-caption)').style('font-weight', 600).text(mk === 'purchases' ? fInt(total) : fVndShort(total));
  const lg = document.createElement('div'); lg.style.cssText = 'display:grid;gap:.3rem;font-size:var(--cds-font-size-caption);flex:1;min-width:9rem';
  rows.forEach((r, i) => {
    const it = document.createElement('div'); it.style.cssText = 'display:flex;justify-content:space-between;gap:.5rem';
    const l = document.createElement('span'); const sw = document.createElement('i');
    sw.style.cssText = `display:inline-block;width:.6rem;height:.6rem;border-radius:2px;margin-right:.35rem;background:${dash.colors[i % 8]}`;
    l.appendChild(sw); l.appendChild(document.createTextNode(r.name));
    const p = document.createElement('span'); p.style.color = 'var(--color-fg-muted)'; p.textContent = VI.format('.0%')(r.v / total);
    it.appendChild(l); it.appendChild(p); lg.appendChild(it);
  });
  wrap.appendChild(lg);
});

// ================= tables =================
const keyOf = (a, b) => encodeURIComponent(a) + ',' + encodeURIComponent(b);
dash.draw('typetable', (tb) => {
  const g = dash.data('type_table'); const m = curMonth();
  tb.replaceChildren();
  if (g.status !== 'ok') return;
  const achCls = (v, up) => v == null ? '' : (up ? v >= 1 : Math.abs(v - 1) <= 0.1) ? 'pos' : 'neg';
  const cols = [['campaign_type', (v) => v], ['spend', fVnd], ['spend_plan', fVnd], ['spend_ach', fPct0, (r) => achCls(r.spend_ach, false)], ['gmv', fVnd], ['gmv_plan', fVnd],
    ['gmv_ach', fPct0, (r) => achCls(r.gmv_ach, true)], ['roas', fX], ['roas_plan', fX], ['purchases', fInt], ['purchases_plan', fInt], ['cpp', fVnd]];
  g.data.filter((r) => r.month === m).forEach((r) => {
    const tr = document.createElement('tr'); tr.dataset.key = keyOf(r.month, r.campaign_type);
    if (r.campaign_type === 'Tổng cộng') tr.className = 'total';
    cols.forEach(([k, f, c]) => { const td = document.createElement('td'); td.textContent = r[k] == null ? '—' : f(r[k]); if (c) td.className = c(r); tr.appendChild(td); });
    tb.appendChild(tr);
  });
});
dash.draw('prodtable', (tb) => {
  const g = dash.data('product_table'); const m = curMonth();
  tb.replaceChildren();
  if (g.status !== 'ok') return;
  const cols = [['product', (v) => v], ['spend', fVnd], ['clicks', fInt], ['add_to_cart', fInt], ['purchases', fInt], ['gmv', fVnd], ['gmv_share', VI.format('.1%')], ['roas', fX], ['cpp', fVnd]];
  g.data.filter((r) => r.month === m).sort((a, b) => b.gmv - a.gmv).forEach((r) => {
    const tr = document.createElement('tr'); tr.dataset.key = keyOf(r.month, r.product);
    cols.forEach(([k, f]) => { const td = document.createElement('td'); td.textContent = r[k] == null ? '—' : f(r[k]); tr.appendChild(td); });
    tb.appendChild(tr);
  });
});

// ================= audience × campaign type =================
dash.calc('aud_type', {
  title: 'Prospecting/Retargeting × loại chiến dịch',
  description: 'Tổng theo tháng × loại khán giả × loại chiến dịch, kèm % spend trong nhóm, CTR, CVR, ROAS, CPP; dòng Tổng cộng mỗi nhóm.',
  inputs: ['actual'],
  fn: (actual) => {
    const out = [];
    const mk = (month, aud, ct, v, audSpend) => {
      const s = (k) => d3.sum(v, (r) => Number(r[k]) || 0);
      const spend = s('spend'), impressions = s('impressions'), clicks = s('clicks'), purchases = s('purchases'), gmv = s('gmv');
      return { month, audience_type: aud, campaign_type: ct, spend, spend_share: audSpend ? spend / audSpend : null, impressions, clicks,
        ctr: impressions ? clicks / impressions : null, add_to_cart: s('add_to_cart'), purchases, cvr: clicks ? purchases / clicks : null,
        gmv, roas: spend ? gmv / spend : null, cpp: purchases ? spend / purchases : null };
    };
    d3.groups(actual, (r) => r.date.slice(0, 7), (r) => r.audience_type).forEach(([month, auds]) => auds.forEach(([aud, rows]) => {
      const tot = d3.sum(rows, (r) => Number(r.spend) || 0);
      d3.groups(rows, (r) => r.campaign_type).sort((a, b) => d3.ascending(a[0], b[0])).forEach(([ct, v]) => out.push(mk(month, aud, ct, v, tot)));
      out.push(mk(month, aud, 'Tổng cộng', rows, tot));
    }));
    return out;
  }
});

dash.draw('audChart', (el) => {
  if (failed(el, ['aud_type', 'months'])) return;
  const m = curMonth(), aud = el.dataset.aud;
  const rows = dash.data('aud_type').data.filter((r) => r.month === m && r.audience_type === aud && r.campaign_type !== 'Tổng cộng');
  el.replaceChildren();
  if (!rows.length) { const p = document.createElement('div'); p.className = 'cp-fail'; p.style.minHeight = '200px'; p.textContent = 'Không có chi phí ' + aud + ' trong tháng này'; el.appendChild(p); return; }
  const W = el.clientWidth || 300, H = 200;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.spend) || 1]).nice().range([H - 24, 14]);
  const y2 = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.roas || 0) || 1]).nice().range([H - 24, 14]);
  const ml = measure(svg, y.ticks(4).map(fVndShort)) + 8, mr = measure(svg, y2.ticks(4).map(fX)) + 8;
  const x = d3.scaleBand().domain(rows.map((r) => r.campaign_type)).range([ml, W - mr]).padding(0.35);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(fVndShort).tickSize(-(W - ml - mr))).call(axisStyle).call((g) => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(${W - mr},0)`).call(d3.axisRight(y2).ticks(4).tickFormat(fX).tickSize(0)).call(axisStyle).call((g) => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(0,${H - 24})`).call(d3.axisBottom(x)).call(axisStyle);
  const bw = Math.min(32, x.bandwidth()), bx = (r) => x(r.campaign_type) + (x.bandwidth() - bw) / 2;
  svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', bx).attr('width', bw)
    .attr('y', (r) => y(r.spend)).attr('height', (r) => y(0) - y(r.spend)).attr('rx', 3).attr('fill', '#1877f2');
  const cx = (r) => x(r.campaign_type) + x.bandwidth() / 2;
  svg.append('g').selectAll('circle').data(rows.filter((r) => r.roas != null)).join('circle').attr('cx', cx).attr('cy', (r) => y2(r.roas)).attr('r', 5)
    .attr('fill', '#ee4d2d').attr('stroke', 'var(--color-panel)').attr('stroke-width', 2);
  const tip = makeTip(el);
  svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', (r) => x(r.campaign_type)).attr('width', x.bandwidth()).attr('y', 0).attr('height', H - 24).attr('fill', 'transparent')
    .on('pointermove', (ev, r) => {
      tipHTML(tip, aud + ' · ' + r.campaign_type, [['#1877f2', 'Spend', fVnd(r.spend) + ' · ' + fPct0(r.spend_share)], ['#ee4d2d', 'ROAS', fX(r.roas)], [null, 'GMV', fVnd(r.gmv)], [null, 'Purchases', fInt(r.purchases)]]);
      const [px, py] = d3.pointer(ev, el); placeTip(tip, el, px, py);
    })
    .on('pointerleave', () => { tip.hidden = true; });
});

dash.draw('audTable', (tb) => {
  const g = dash.data('aud_type'); const m = curMonth(), aud = tb.dataset.aud;
  tb.replaceChildren();
  if (g.status !== 'ok') return;
  const cols = [['campaign_type', (v) => v], ['spend', fVnd], ['spend_share', fPct0], ['ctr', fPct2], ['add_to_cart', fInt], ['purchases', fInt], ['cvr', fPct2], ['gmv', fVnd], ['roas', fX], ['cpp', fVnd]];
  g.data.filter((r) => r.month === m && r.audience_type === aud).forEach((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = [r.month, r.audience_type, r.campaign_type].map(encodeURIComponent).join(',');
    if (r.campaign_type === 'Tổng cộng') tr.className = 'total';
    cols.forEach(([k, f]) => { const td = document.createElement('td'); td.textContent = r[k] == null ? '—' : f(r[k]); tr.appendChild(td); });
    tb.appendChild(tr);
  });
});

// ================= creative by post code =================
dash.calc('creative_table', {
  title: 'Post code (Angle Content) và đánh giá',
  description: 'Theo tháng × nhóm khán giả (Tất cả/Prospecting/Retargeting) × post code: chỉ số, ROAS so với TB tháng và đánh giá Tốt/Ổn/Kém/Ít data (ngưỡng: chi phí ≥ 3% tổng; Tốt: ROAS ≥ 1,2× TB và CVR ≥ TB; Kém: ROAS < 0,8× TB).',
  inputs: ['creative'],
  fn: (creative) => {
    const out = [];
    const s = (v, k) => d3.sum(v, (r) => Number(r[k]) || 0);
    d3.groups(creative, (r) => r.month).forEach(([month, rows]) => {
      [['all', rows], ['Prospecting', rows.filter((r) => r.audience_type === 'Prospecting')], ['Retargeting', rows.filter((r) => r.audience_type === 'Retargeting')]].forEach(([scope, v]) => {
        const tSpend = s(v, 'spend'), tGmv = s(v, 'gmv'), tClicks = s(v, 'clicks'), tPur = s(v, 'purchases');
        const avgRoas = tSpend ? tGmv / tSpend : null, avgCvr = tClicks ? tPur / tClicks : null;
        d3.groups(v, (r) => r.angle).forEach(([angle, a]) => {
          const spend = s(a, 'spend'), impressions = s(a, 'impressions'), clicks = s(a, 'clicks'), purchases = s(a, 'purchases'), gmv = s(a, 'gmv');
          if (!spend && !gmv) return;
          const roas = spend ? gmv / spend : null, cvr = clicks ? purchases / clicks : null;
          const idx = roas != null && avgRoas ? roas / avgRoas : null;
          let verdict = 'Ổn';
          if (spend < 0.03 * tSpend) verdict = 'Ít data';
          else if (idx != null && idx >= 1.2 && (cvr ?? 0) >= (avgCvr ?? 0)) verdict = 'Tốt';
          else if (idx == null || idx < 0.8) verdict = 'Kém';
          out.push({ month, scope, angle, verdict, campaign_types: [...new Set(a.map((r) => r.campaign_type))].sort().join(', '),
            spend, spend_share: tSpend ? spend / tSpend : null, impressions, clicks, ctr: impressions ? clicks / impressions : null,
            cpc: clicks ? spend / clicks : null, add_to_cart: s(a, 'add_to_cart'), purchases, cvr, gmv, roas, roas_index: idx,
            cpp: purchases ? spend / purchases : null, avg_roas: avgRoas, avg_cvr: avgCvr });
        });
      });
    });
    return out;
  }
});

const audScope = () => dash.params().aud || 'all';
const creativeRows = () => {
  const g = dash.data('creative_table'); const m = curMonth(), sc = audScope();
  return g.status === 'ok' ? g.data.filter((r) => r.month === m && r.scope === sc) : [];
};
document.querySelectorAll('.cp-segbtn').forEach((b) => b.addEventListener('click', () => dash.setParams({ aud: b.dataset.aud })));
dash.onData(() => {
  document.querySelectorAll('.cp-segbtn').forEach((b) => { const on = b.dataset.aud === audScope(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
});

dash.draw('creativeSummary', (el) => {
  const rows = creativeRows();
  if (dash.data('creative_table').status !== 'ok' || !rows.length) { el.textContent = '—'; return; }
  const judged = rows.filter((r) => r.verdict !== 'Ít data');
  const good = rows.filter((r) => r.verdict === 'Tốt'), bad = rows.filter((r) => r.verdict === 'Kém');
  el.textContent = `${rows.length} post code có chi phí trong ${monthLabel(curMonth())}, ${judged.length} post code đủ chi phí để đánh giá. ROAS trung bình ${fX(rows[0].avg_roas)}, CVR trung bình ${fPct2(rows[0].avg_cvr)}. ${good.length} post code tốt, ${bad.length} post code kém.`;
});

dash.draw('creativeList', (ul) => {
  ul.replaceChildren();
  if (dash.data('creative_table').status !== 'ok') return;
  const good = ul.dataset.kind === 'good';
  const rows = creativeRows().filter((r) => r.verdict === (good ? 'Tốt' : 'Kém'))
    .sort((a, b) => good ? b.gmv - a.gmv : b.spend - a.spend).slice(0, 4);
  if (!rows.length) {
    const li = document.createElement('li'); li.style.color = 'var(--color-fg-muted)';
    li.textContent = good ? 'Chưa có post code nào vượt rõ mức trung bình tháng.' : 'Không có post code nào chi nhiều mà ROAS thấp.';
    ul.appendChild(li); return;
  }
  rows.forEach((r) => {
    const li = document.createElement('li');
    const b = document.createElement('b'); b.textContent = r.angle; li.appendChild(b);
    const why = good
      ? ` — ROAS ${fX(r.roas)}, gấp ${VI.format(',.1f')(r.roas_index)} lần TB; CVR ${fPct2(r.cvr)}; mang về ${fVnd(r.gmv)} với ${fPct0(r.spend_share)} ngân sách.`
      : ` — tiêu ${fVnd(r.spend)} (${fPct0(r.spend_share)} ngân sách) nhưng ROAS chỉ ${fX(r.roas)} (${r.roas_index == null ? 'không có đơn' : VI.format(',.1f')(r.roas_index) + ' lần TB'}); CTR ${fPct2(r.ctr)}, CVR ${fPct2(r.cvr)}.`;
    li.appendChild(document.createTextNode(why));
    ul.appendChild(li);
  });
});

const VERDICT_COLOR = { 'Tốt': 'var(--color-ok)', 'Ổn': 'var(--cds-chart-muted)', 'Kém': 'var(--color-bad)', 'Ít data': 'var(--color-border-line)' };
dash.draw('creativeScatter', (el) => {
  if (failed(el, ['creative_table', 'months'])) return;
  const rows = creativeRows().filter((r) => r.spend > 0);
  el.replaceChildren();
  if (!rows.length) return;
  const W = el.clientWidth || 320, H = 230;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  const yMax = Math.min(d3.max(rows, (r) => r.roas || 0), (rows[0].avg_roas || 1) * 3) * 1.12 || 1;
  const y = d3.scaleLinear().domain([0, Math.max(yMax, (rows[0].avg_roas || 0) * 1.5)]).nice().range([H - 28, 18]).clamp(true);
  const ml = measure(svg, y.ticks(4).map(fX)) + 8;
  const x = d3.scaleLog().domain([d3.min(rows, (r) => r.spend) * 0.8, d3.max(rows, (r) => r.spend) * 1.25]).range([ml + 6, W - 10]);
  const rr = d3.scaleSqrt().domain([0, d3.max(rows, (r) => r.purchases) || 1]).range([3, 14]);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(fX).tickSize(-(W - ml - 10))).call(axisStyle).call((g) => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(0,${H - 28})`).call(d3.axisBottom(x).ticks(Math.max(2, Math.floor((W - ml) / 80)), fVndShort)).call(axisStyle);
  svg.append('line').attr('x1', ml).attr('x2', W - 10).attr('y1', y(rows[0].avg_roas)).attr('y2', y(rows[0].avg_roas))
    .attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 3');
  const tip = makeTip(el);
  svg.append('g').selectAll('circle').data(rows.slice().sort((a, b) => b.purchases - a.purchases)).join('circle')
    .attr('cx', (r) => x(r.spend)).attr('cy', (r) => y(r.roas || 0)).attr('r', (r) => rr(r.purchases))
    .attr('fill', (r) => VERDICT_COLOR[r.verdict]).attr('fill-opacity', 0.8).attr('stroke', 'var(--color-panel)')
    .on('pointermove', (ev, r) => {
      tipHTML(tip, r.angle, [[VERDICT_COLOR[r.verdict], 'Đánh giá', r.verdict], [null, 'Spend', fVnd(r.spend)], [null, 'ROAS', fX(r.roas)], [null, 'Purchases', fInt(r.purchases)], [null, 'CVR', fPct2(r.cvr)]]);
      const [px, py] = d3.pointer(ev, el); placeTip(tip, el, px, py);
    })
    .on('pointerleave', () => { tip.hidden = true; });
});

dash.draw('creativeTable', (tb) => {
  tb.replaceChildren();
  if (dash.data('creative_table').status !== 'ok') return;
  const cls = { 'Tốt': 'good', 'Kém': 'bad', 'Ổn': 'ok', 'Ít data': 'low' };
  const cols = [['angle', (v) => v], ['verdict', null], ['campaign_types', (v) => v], ['spend', fVnd], ['ctr', fPct2], ['cpc', fVnd], ['add_to_cart', fInt], ['purchases', fInt],
    ['cvr', fPct2], ['gmv', fVnd], ['roas', fX], ['roas_index', (v) => VI.format(',.2f')(v) + '×'], ['cpp', fVnd]];
  creativeRows().sort((a, b) => b.spend - a.spend).forEach((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = [r.month, r.scope, r.angle].map(encodeURIComponent).join(',');
    cols.forEach(([k, f]) => {
      const td = document.createElement('td');
      if (k === 'verdict') { const s = document.createElement('span'); s.className = 'cp-badge ' + cls[r.verdict]; s.textContent = r.verdict; td.appendChild(s); }
      else td.textContent = r[k] == null ? '—' : f(r[k]);
      if (k === 'angle') td.className = 'wrap';
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
});

// ================= data source label =================
dash.draw('planSource', (el) => { el.textContent = (window.CPAS_STATUS || {}).label || '—'; });
