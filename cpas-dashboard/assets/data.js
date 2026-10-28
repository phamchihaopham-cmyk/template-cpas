// Loads Actual + Plan (Google Sheets published CSV, or the sample files), cleans them
// and hands three datasets to the page: `actual`, `creative`, `plan`.
(() => {
  const CFG = window.CPAS_CONFIG || {};
  const status = (window.CPAS_STATUS = { label: 'Đang tải…', sample: false, autoPlan: false, warnings: [] });

  // ---------- parsing helpers ----------
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  function num(v) {
    if (v == null) return 0;
    let s = String(v).trim().replace(/[\s₫đ%]|vnd/gi, '');
    if (!s || s === '-' || /^#/.test(s)) return 0;
    if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');          // 1.234.567 or 1,234,567
    else if (s.includes(',') && s.includes('.')) {                              // 1.234,5 or 1,234.5
      s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  const pad = (n) => String(n).padStart(2, '0');
  function toISO(v) {
    const s = String(v ?? '').trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (m) {
      const [a, b] = CFG.DATE_ORDER === 'mdy' ? [m[2], m[1]] : [m[1], m[2]];
      return `${m[3]}-${pad(b)}-${pad(a)}`;
    }
    if (/^\d{5}(\.\d+)?$/.test(s)) {                                             // Excel / Sheets serial
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 864e5);
      return d.toISOString().slice(0, 10);
    }
    return null;
  }
  function toMonth(v) {
    const s = String(v ?? '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})$/);
    if (m) return `${m[1]}-${pad(m[2])}`;
    m = s.match(/^T?(\d{1,2})[/-](\d{4})$/i);
    if (m) return `${m[2]}-${pad(m[1])}`;
    const d = toISO(s);
    return d ? d.slice(0, 7) : null;
  }
  function pick(row, names) {
    for (const n of names) if (row[n] !== undefined) return row[n];
    return undefined;
  }
  function normalizeRows(rows) {
    return rows.map((r) => { const o = {}; Object.keys(r).forEach((k) => { o[norm(k)] = r[k]; }); return o; });
  }

  // ---------- cleaning, same rules as the original report ----------
  const FORMAT = { caurousel: 'Carousel', carousel: 'Carousel', single: 'Single', collection: 'Collection', video: 'Video' };
  const PRODUCT = { 'tủ lạnh': 'Tủ lạnh', 'sku máy lọc không khí': 'Máy lọc không khí', 'all product': 'All Categories' };
  function cleanAngle(a) {
    let s = String(a ?? '').trim();
    if (!s || /^(nan|n\/a|none)$/i.test(s)) return '(Không ghi)';
    s = s.replace(/^(\d{5})-/, (_, serial) => {                                   // "46266-AWO-…": a date Excel turned into a number
      const d = new Date(Date.UTC(1899, 11, 30) + Number(serial) * 864e5);
      return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'August', 'Sept', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + '-';
    });
    s = s.replace(/^mini\s?s(pike|ipke)/i, 'Mini Spike').replace(/^BAU REf /, 'BAU REF ');
    return s;
  }

  const COL = {
    day: ['day', 'date', 'ngày'],
    impressions: ['impressions'],
    clicks: ['link clicks'],
    add_to_cart: ['adds to cart with shared items'],
    purchases: ['purchases with shared items'],
    gmv: ['purchases conversion value for shared items only'],
    spend: ['amount spent (vnd)', 'amount spent'],
    campaign_type: ['campaign type'],
    audience_type: ['type audience'],
    ad_format: ['ad format'],
    product: ['list product'],
    angle: ['angle content'],
  };
  const METRICS = ['spend', 'impressions', 'clicks', 'add_to_cart', 'purchases', 'gmv'];

  function buildActual(raw) {
    const rows = normalizeRows(raw);
    if (!rows.length) throw new Error('Sheet Actual không có dòng nào.');
    const missing = Object.entries(COL).filter(([, names]) => pick(rows[0], names) === undefined).map(([k]) => COL[k][0]);
    if (missing.length) throw new Error('Sheet Actual thiếu cột: ' + missing.join(', '));
    const actual = new Map(), creative = new Map();
    let skipped = 0;
    rows.forEach((r) => {
      const date = toISO(pick(r, COL.day));
      const m = {}; METRICS.forEach((k) => { m[k] = num(pick(r, COL[k])); });
      if (METRICS.every((k) => !m[k])) return;            // empty rows, repeated header rows
      if (!date) { skipped++; return; }
      const ct = String(pick(r, COL.campaign_type) ?? '').trim() || '(Không ghi)';
      const aud = String(pick(r, COL.audience_type) ?? '').trim() || '(Không ghi)';
      const fmt = FORMAT[norm(pick(r, COL.ad_format))] || 'Khác';
      const prodRaw = String(pick(r, COL.product) ?? '').trim() || '(Không ghi)';
      const prod = PRODUCT[norm(prodRaw)] || prodRaw;
      const angle = cleanAngle(pick(r, COL.angle));
      const add = (map, key, base) => {
        const cur = map.get(key) || { ...base, spend: 0, impressions: 0, clicks: 0, add_to_cart: 0, purchases: 0, gmv: 0 };
        METRICS.forEach((k) => { cur[k] += m[k]; });
        map.set(key, cur);
      };
      add(actual, [date, ct, aud, fmt, prod].join('|'), { date, campaign_type: ct, audience_type: aud, ad_format: fmt, product: prod });
      const month = date.slice(0, 7);
      add(creative, [month, angle, ct, aud, fmt].join('|'), { month, angle, campaign_type: ct, audience_type: aud, ad_format: fmt });
    });
    if (skipped) status.warnings.push(`Bỏ qua ${skipped} dòng có số liệu nhưng không đọc được cột Day.`);
    const out = [...actual.values()].sort((a, b) => d3.ascending(a.date, b.date));
    if (!out.length) throw new Error('Không đọc được dòng dữ liệu nào trong sheet Actual. Kiểm tra cột Day.');
    return { actual: out, creative: [...creative.values()] };
  }

  function buildPlan(raw) {
    const rows = normalizeRows(raw);
    return rows.map((r) => {
      const month = toMonth(pick(r, ['month', 'tháng']));
      const ct = String(pick(r, ['campaign_type', 'campaign type', 'loại chiến dịch']) ?? '').trim();
      if (!month || !ct) return null;
      const o = { month, campaign_type: ct };
      METRICS.forEach((k) => { o[k] = num(pick(r, [k, k.replace(/_/g, ' ')])); });
      return o;
    }).filter((r) => r && METRICS.some((k) => r[k]));
  }

  // Plan built from actual when the Plan sheet is empty (same rules as the first version of the report).
  function autoPlan(actual) {
    const uplift = 1 + (CFG.PLAN_UPLIFT ?? 0.05), look = CFG.PLAN_LOOKBACK_MONTHS ?? 3;
    const byMonth = d3.group(actual, (r) => r.date.slice(0, 7));
    const months = [...byMonth.keys()].sort();
    const lastDate = d3.max(actual, (r) => r.date);
    const sum = (rows) => { const o = {}; METRICS.forEach((k) => { o[k] = d3.sum(rows, (r) => r[k]); }); return o; };
    const rates = (s) => ({ cpm: s.impressions ? s.spend / s.impressions * 1000 : 0, cpc: s.spend / Math.max(s.clicks, 1),
      atc: s.add_to_cart / Math.max(s.clicks, 1), cvr: s.purchases / Math.max(s.clicks, 1), roas: s.spend ? s.gmv / s.spend : 0 });
    const out = [];
    months.forEach((mo, i) => {
      const [y, mm] = mo.split('-').map(Number);
      const dim = new Date(Date.UTC(y, mm, 0)).getUTCDate();
      const frac = mo === months[months.length - 1] ? Number(lastDate.slice(8, 10)) / dim : 1;
      const hist = months.slice(Math.max(0, i - look), i);
      const up = hist.length ? uplift : 1;
      const histRows = hist.flatMap((h) => byMonth.get(h));
      d3.groups(byMonth.get(mo), (r) => r.campaign_type).forEach(([ct, rows]) => {
        const full = d3.sum(rows, (r) => r.spend) / frac;
        const step = full >= 20e6 ? 5e6 : 1e6;
        const budget = Math.max(step, Math.round(full / step) * step);
        const th = sum(histRows.filter((r) => r.campaign_type === ct));
        const useType = th.spend > 5e6 && th.purchases > 0;
        const r = rates(useType ? th : sum(hist.length ? histRows : byMonth.get(mo)));
        const clicks = budget / r.cpc;
        out.push({ month: mo, campaign_type: ct, spend: budget, impressions: r.cpm ? Math.round(budget / r.cpm * 1000) : 0, clicks: Math.round(clicks),
          add_to_cart: Math.round(clicks * r.atc * up), purchases: Math.round(clicks * r.cvr * up), gmv: Math.round(budget * r.roas * up / 1000) * 1000 });
      });
    });
    return out;
  }

  // ---------- fetching ----------
  async function fetchCsv(url) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(url.startsWith('http') ? `${url}${sep}t=${Date.now()}` : url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Không tải được ${url} (HTTP ${res.status}).`);
    const text = await res.text();
    if (/^\s*<!doctype html|<html/i.test(text)) throw new Error('Link trả về trang HTML, không phải CSV. Hãy dùng link "Publish to web" dạng CSV.');
    return d3.csvParse(text.replace(/^﻿/, ''));
  }

  const banner = () => {
    const el = document.querySelector('.cp-banner');
    if (!el) return;
    const msgs = [...status.warnings];
    if (status.sample) msgs.unshift('Đang hiển thị dữ liệu mẫu. Điền link Google Sheet vào config.js để dùng số thật.');
    el.hidden = !msgs.length;
    el.textContent = msgs.join(' ');
  };

  async function load() {
    status.warnings = [];
    ['actual', 'creative', 'plan'].forEach((id) => dash._setSource(id, { status: 'loading', data: [] }));
    try {
      status.sample = !CFG.ACTUAL_CSV_URL;
      const raw = await fetchCsv(CFG.ACTUAL_CSV_URL || CFG.SAMPLE_ACTUAL_CSV);
      const { actual, creative } = buildActual(raw);
      let plan = [];
      if (CFG.PLAN_CSV_URL) {
        try { plan = buildPlan(await fetchCsv(CFG.PLAN_CSV_URL)); }
        catch (e) { status.warnings.push('Không đọc được sheet Plan: ' + e.message); }
      }
      status.autoPlan = !plan.length && CFG.AUTO_PLAN_WHEN_EMPTY !== false;
      if (status.autoPlan) plan = autoPlan(actual);
      status.label = (status.sample ? 'Dữ liệu mẫu · ' : '') + (status.autoPlan ? 'Plan tự dựng từ actual' : 'Plan từ Google Sheet');
      dash._setSource('actual', { status: 'ok', data: actual });
      dash._setSource('creative', { status: 'ok', data: creative });
      dash._setSource('plan', { status: 'ok', data: plan });
    } catch (e) {
      console.error(e);
      status.label = 'Lỗi tải dữ liệu';
      status.warnings.push(e.message);
      ['actual', 'creative', 'plan'].forEach((id) => dash._setSource(id, { status: 'error', data: [], message: e.message }));
    }
    banner();
  }

  window.CPAS_RELOAD = load;
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.cp-reload').forEach((b) => b.addEventListener('click', load));
    load();
    if (CFG.AUTO_REFRESH_MINUTES > 0) setInterval(load, CFG.AUTO_REFRESH_MINUTES * 60e3);
  });
})();
