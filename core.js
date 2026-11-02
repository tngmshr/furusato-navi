/* ふるさと納税かんたんナビ：画面に依存しない計算と保存データの読み書き
   - ブラウザでは <script src="core.js"> で window.FurusatoCore になる
   - Node では require('./core.js') で読み込み、node --test でテストする（test/ 配下）
   DOM・localStorage には触れない。文字列（保存データ）を受け取り、整えた値を返すだけ。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FurusatoCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 控除上限の目安 ---------- */
  const SELF_PAY = 2000;      // 自己負担（年間合計）
  const GIFT_RATE = 0.3;      // 返礼品は寄付額の3割以下

  // 給与所得控除（令和7年分以降）
  function salaryDeduction(salary) {
    if (salary <= 1900000) return Math.min(salary, 650000);
    if (salary <= 3600000) return Math.floor(salary * 0.3) + 80000;
    if (salary <= 6600000) return Math.floor(salary * 0.2) + 440000;
    if (salary <= 8500000) return Math.floor(salary * 0.1) + 1100000;
    return 1950000;
  }
  // 所得税の基礎控除（令和7・8年分。合計所得金額で変わる）
  function incomeTaxBasic(income) {
    if (income <= 1320000) return 950000;
    if (income <= 3360000) return 880000;
    if (income <= 4890000) return 680000;
    if (income <= 6550000) return 630000;
    if (income <= 23500000) return 580000;
    if (income <= 24000000) return 480000;
    if (income <= 24500000) return 320000;
    if (income <= 25000000) return 160000;
    return 0;
  }
  // 住民税の基礎控除
  function residentBasic(income) {
    if (income <= 24000000) return 430000;
    if (income <= 24500000) return 290000;
    if (income <= 25000000) return 150000;
    return 0;
  }
  // 所得税の税率（課税所得に対する限界税率）
  function incomeTaxRate(taxable) {
    if (taxable <= 0) return 0;
    if (taxable <= 1950000) return 0.05;
    if (taxable <= 3300000) return 0.10;
    if (taxable <= 6950000) return 0.20;
    if (taxable <= 9000000) return 0.23;
    if (taxable <= 18000000) return 0.33;
    if (taxable <= 40000000) return 0.40;
    return 0.45;
  }

  /**
   * 独身・給与収入のみの会社員の控除上限の目安（ワンストップ特例・確定申告とも同じ式）。
   * 上限 =（住民税所得割 − 調整控除）× 20% ÷（90% − 所得税率 × 1.021）+ 2,000円
   * @param {number} salary 年収（額面・円）
   * @param {object} [opt] socialRate: 社会保険料の割合（既定 0.15）/ socialInsurance: 社会保険料（円・指定時は優先）
   * @returns {{limit:number, approxMan:number, incomeTaxRate:number, residentIncomeLevy:number}|null}
   */
  function estimateLimit(salary, opt) {
    opt = opt || {};
    if (!Number.isFinite(salary) || salary < 0) return null;
    const social = Number.isFinite(opt.socialInsurance) ? opt.socialInsurance
      : Math.floor(salary * (Number.isFinite(opt.socialRate) ? opt.socialRate : 0.15));
    const income = Math.max(0, salary - salaryDeduction(salary));
    const itBasic = incomeTaxBasic(income), rtBasic = residentBasic(income);
    const itTaxable = Math.floor(Math.max(0, income - social - itBasic) / 1000) * 1000;
    const rtTaxable = Math.floor(Math.max(0, income - social - rtBasic) / 1000) * 1000;
    // 調整控除：人的控除の差（独身なら基礎控除の差 5万円）
    const diff = 50000;
    const adjust = rtTaxable <= 2000000 ? Math.min(diff, rtTaxable) * 0.05
      : Math.max((diff - (rtTaxable - 2000000)) * 0.05, 2500);
    const levy = Math.max(0, Math.floor(rtTaxable * 0.10 - adjust));
    const rate = incomeTaxRate(itTaxable);
    const limit = levy > 0 ? Math.floor(levy * 0.2 / (0.9 - rate * 1.021)) + SELF_PAY : 0;
    return { limit, approxMan: roundDownMan(limit), incomeTaxRate: rate, residentIncomeLevy: levy };
  }
  // 上限は超えると負担が増えるので、万円未満は切り捨てて「約◯万円」とする
  const roundDownMan = n => Math.floor(n / 10000) * 10000;

  /**
   * 上限内で寄付したときの内訳の例（画面の表に出す数字）
   * @returns {{donation:number, reduction:number, selfPay:number, gift:number, net:number}}
   */
  function donationExample(donation, giftRate) {
    const rate = Number.isFinite(giftRate) ? giftRate : GIFT_RATE;
    const reduction = Math.max(0, donation - SELF_PAY);
    const gift = Math.floor(donation * rate);
    return { donation, reduction, selfPay: donation - reduction, gift, net: gift - (donation - reduction) };
  }

  // 保存された上限の目安（{year, amount}）が今年の有効な値か
  const validLimit = (v, year) => !!(v && typeof v === 'object' && v.year === year && Number.isSafeInteger(v.amount) && v.amount >= 0);
  // 節税・資産形成ナビの共有データ（setsuzeiNavi.share.v1）を読む
  function parseShared(raw, year) {
    const v = safeJson(raw);
    return v && typeof v === 'object' && v.year === year && Number.isSafeInteger(v.donationLimit) && v.donationLimit >= 0 ? v : null;
  }

  /* ---------- 保存データ ---------- */
  function safeJson(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const isStrArr = v => Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string');

  const blankState = () => ({ stack: ['home'], a: {}, route: null, site: null, maxStage: 0, checks: {} });
  const ROUTES = ['one', 'tax', 'check'];

  /**
   * 進み具合（furusatoNavi.v3）を読む。空・壊れた JSON・形の違う値は初期状態にする。
   * @param {string|null} raw localStorage の値
   * @param {object} [opt] routeRule: 現在の判定ルール / screens: 有効な画面IDの配列
   */
  function parseState(raw, opt) {
    opt = opt || {};
    const o = safeJson(raw);
    const S = blankState();
    if (!isObj(o) || !isStrArr(o.stack)) return S;
    const known = Array.isArray(opt.screens) ? id => opt.screens.includes(id) : () => true;
    const stack = o.stack.filter(known);
    if (!stack.length) return S;
    S.stack = stack;
    if (isObj(o.a)) for (const k of Object.keys(o.a)) if (typeof o.a[k] === 'string') S.a[k] = o.a[k];
    if (isObj(o.checks)) for (const k of Object.keys(o.checks)) S.checks[k] = o.checks[k] === true;
    if (ROUTES.includes(o.route)) S.route = o.route;
    if (typeof o.site === 'string') S.site = o.site;
    if (typeof o.rec === 'string') S.rec = o.rec;
    if (Number.isInteger(o.maxStage) && o.maxStage >= 0 && o.maxStage <= 8) S.maxStage = o.maxStage;
    if (typeof o.routeRule === 'string') S.routeRule = o.routeRule;
    if (isStrArr(o.resume)) { const r = o.resume.filter(known); if (r.length) S.resume = r; }
    if (isObj(o.donationLimit) && Number.isSafeInteger(o.donationLimit.year) && Number.isSafeInteger(o.donationLimit.amount) && o.donationLimit.amount >= 0)
      S.donationLimit = { year: o.donationLimit.year, amount: o.donationLimit.amount };
    // 住民税申告の条件追加前の判定は、進み具合を保ったまま再確認する
    if (opt.routeRule && S.routeRule !== opt.routeRule) { if (S.route === 'one') S.route = null; delete S.checks.tax2; }
    return S;
  }
  const serializeState = S => JSON.stringify(S);

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  /**
   * 寄付の記録（furusatoNavi.log）を読む。壊れた項目だけを捨て、残りは保つ。
   * @returns {{limit:number, items:Array<{id:string, city:string, amount:number, date:string, one:boolean}>}}
   */
  function parseLog(raw) {
    const o = safeJson(raw);
    const log = { limit: 0, items: [] };
    if (!isObj(o)) return log;
    const lim = Number(o.limit);
    if (Number.isSafeInteger(lim) && lim > 0) log.limit = lim;
    if (!Array.isArray(o.items)) return log;
    const ids = new Set();
    o.items.forEach((i, n) => {
      if (!isObj(i)) return;
      const city = typeof i.city === 'string' ? i.city.trim().slice(0, 40) : '';
      const amount = Number(i.amount);
      if (!city || !Number.isSafeInteger(amount) || amount <= 0) return;
      if (typeof i.date !== 'string' || !DATE_RE.test(i.date)) return;
      let id = typeof i.id === 'string' && i.id ? i.id : 'r' + n;
      while (ids.has(id)) id += '_';
      ids.add(id);
      log.items.push({ id, city, amount, date: i.date, one: i.one === true });
    });
    return log;
  }
  const serializeLog = L => JSON.stringify(L);

  // 表示する寄付の年：いちばん新しい記録の年（なければ fallback）
  function logYear(items, fallback) {
    return items && items.length ? Math.max(...items.map(i => +i.date.slice(0, 4))) : fallback;
  }
  // 全角数字・カンマ・「円」を許して数値にする
  function parseAmount(s) {
    const t = String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[,，、円\s]/g, '');
    return /^\d{1,9}$/.test(t) ? +t : NaN;
  }

  return {
    SELF_PAY, GIFT_RATE,
    salaryDeduction, incomeTaxBasic, residentBasic, incomeTaxRate,
    estimateLimit, roundDownMan, donationExample, validLimit, parseShared,
    safeJson, blankState, parseState, serializeState, parseLog, serializeLog, logYear, parseAmount
  };
});
