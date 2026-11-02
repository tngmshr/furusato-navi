// node --test で実行する（依存パッケージなし）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../core.js');

const ROUTE_RULE = '2026-10-25';
const SCREENS = ['home', 's1', 's1b', 's2', 's3q1', 's3q2', 's3q3', 's3r', 's4q1', 's4q2', 's4r', 's5', 's6', 's7', 'done'];

/* ---------- 控除上限の目安 ---------- */
test('年収1,000万円・独身・社会保険料15%：上限の目安は約17万円', () => {
  const r = C.estimateLimit(10000000, { socialRate: 0.15 });
  assert.equal(r.limit, 177194);
  assert.equal(r.approxMan, 170000);
  assert.equal(r.incomeTaxRate, 0.2);
});

test('年収1,000万円の例の内訳（画面の表の数字）は変わらない', () => {
  const ex = C.donationExample(C.estimateLimit(10000000).approxMan);
  assert.deepEqual(ex, { donation: 170000, reduction: 168000, selfPay: 2000, gift: 51000, net: 49000 });
});

test('60,000円を寄付した例：軽減58,000円・自己負担2,000円', () => {
  const ex = C.donationExample(60000);
  assert.equal(ex.reduction, 58000);
  assert.equal(ex.selfPay, 2000);
});

test('年収別の目安が一般的な早見表と同じ水準になる', () => {
  // 独身・社会保険料15%。万円未満切り捨て
  assert.equal(C.estimateLimit(3000000).approxMan, 20000);
  assert.equal(C.estimateLimit(5000000).approxMan, 60000);
  assert.equal(C.estimateLimit(7000000).approxMan, 100000);
});

test('年収が増えると上限も増える（単調）', () => {
  let prev = -1;
  for (let y = 1000000; y <= 30000000; y += 250000) {
    const l = C.estimateLimit(y).limit;
    assert.ok(l >= prev, `${y}円で減った: ${prev} → ${l}`);
    prev = l;
  }
});

test('住民税がかからない年収・不正な値', () => {
  assert.equal(C.estimateLimit(1000000).limit, 0);
  assert.equal(C.estimateLimit(-1), null);
  assert.equal(C.estimateLimit(NaN), null);
});

test('給与所得控除・税率の境目', () => {
  assert.equal(C.salaryDeduction(1900000), 650000);
  assert.equal(C.salaryDeduction(10000000), 1950000);
  assert.equal(C.incomeTaxRate(1950000), 0.05);
  assert.equal(C.incomeTaxRate(1951000), 0.10);
  assert.equal(C.incomeTaxRate(6950000), 0.20);
  assert.equal(C.incomeTaxRate(6951000), 0.23);
});

test('index.html の例の文言は計算結果と一致する（約17万円・170,000円）', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /C\.estimateLimit\(10000000, \{ socialRate:0\.15 \}\)/);
  assert.match(html, /C\.donationExample\(60000\)/);
  assert.match(html, /<script src="core\.js"><\/script>/);
});

/* ---------- 上限の目安の受け渡し ---------- */
test('validLimit / parseShared', () => {
  assert.equal(C.validLimit({ year: 2026, amount: 50000 }, 2026), true);
  assert.equal(C.validLimit({ year: 2025, amount: 50000 }, 2026), false);
  assert.equal(C.validLimit({ year: 2026, amount: -1 }, 2026), false);
  assert.equal(C.validLimit({ year: 2026, amount: '50000' }, 2026), false);
  assert.equal(C.validLimit(null, 2026), false);
  assert.deepEqual(C.parseShared('{"year":2026,"donationLimit":120000}', 2026), { year: 2026, donationLimit: 120000 });
  assert.equal(C.parseShared('{"year":2026,"donationLimit":1.5}', 2026), null);
  assert.equal(C.parseShared('{broken', 2026), null);
  assert.equal(C.parseShared(null, 2026), null);
  assert.equal(C.parseShared('"text"', 2026), null);
});

/* ---------- 進み具合（furusatoNavi.v3） ---------- */
const opt = { routeRule: ROUTE_RULE, screens: SCREENS };

test('進み具合：空・壊れた JSON・形の違う値は初期状態', () => {
  for (const raw of [null, undefined, '', '{', 'null', '[]', '123', '"s"', '{}', '{"stack":[]}', '{"stack":"s2"}', '{"stack":[1,2]}', '{"stack":["unknown"]}']) {
    assert.deepEqual(C.parseState(raw, opt), C.blankState(), `raw=${raw}`);
  }
});

test('進み具合：保存して読み直すと同じ', () => {
  const S = C.blankState();
  S.stack = ['home', 's1', 's2'];
  S.a = { s3q1: 'no' };
  S.route = 'tax'; S.site = 'choice'; S.rec = 'choice'; S.maxStage = 3; S.checks = { tax1: true };
  S.routeRule = ROUTE_RULE; S.donationLimit = { year: 2026, amount: 77000 };
  assert.deepEqual(C.parseState(C.serializeState(S), opt), S);
});

test('進み具合：古い判定ルールのワンストップ判定は取り消す', () => {
  const raw = JSON.stringify({ stack: ['home', 's6'], route: 'one', checks: { tax2: true, one1: true } });
  const S = C.parseState(raw, opt);
  assert.equal(S.route, null);
  assert.equal('tax2' in S.checks, false);
  assert.equal(S.checks.one1, true);
  assert.deepEqual(S.stack, ['home', 's6']);
});

test('進み具合：null や型違いのフィールドがあっても落ちない', () => {
  const raw = JSON.stringify({ stack: ['home', 's2', 'gone'], a: null, checks: null, route: 'xxx', site: 3, maxStage: 'a', resume: 'x', donationLimit: { year: 2026, amount: 'a' } });
  const S = C.parseState(raw, opt);
  assert.deepEqual(S.stack, ['home', 's2']);
  assert.deepEqual(S.a, {});
  assert.deepEqual(S.checks, {});
  assert.equal(S.route, null);
  assert.equal(S.site, null);
  assert.equal(S.maxStage, 0);
  assert.equal(S.resume, undefined);
  assert.equal(S.donationLimit, undefined);
});

test('進み具合：__proto__ などのキーで汚染されない', () => {
  const S = C.parseState('{"stack":["home"],"a":{"__proto__":{"x":"1"}},"checks":{"__proto__":true}}', opt);
  assert.equal(({}).x, undefined);
  assert.equal(Object.getPrototypeOf(S.a), Object.prototype);
});

/* ---------- 寄付の記録（furusatoNavi.log） ---------- */
test('寄付の記録：空・壊れた JSON は空の記録', () => {
  for (const raw of [null, '', '{', 'null', '[]', '{"items":null}', '{"items":"x"}']) {
    assert.deepEqual(C.parseLog(raw, { year: 2026 }), { limits: {}, items: [] }, `raw=${raw}`);
  }
});

test('寄付の記録：保存して読み直すと同じ', () => {
  const L = { limits: { 2025: 50000, 2026: 60000 }, items: [
    { id: 'a1', city: '〇〇県△△町', amount: 10000, date: '2026-05-01', one: true },
    { id: 'a2', city: '□□市', amount: 25000, date: '2026-11-02', one: false }
  ] };
  assert.deepEqual(C.parseLog(C.serializeLog(L)), L);
});

test('寄付の記録：壊れた項目だけ捨て、古い形式の値は整える', () => {
  const raw = JSON.stringify({ limit: '60000', items: [
    { id: 'ok', city: 'A町', amount: 10000, date: '2026-01-02' },        // one なし（古い形式）
    { id: 'ok', city: 'B市', amount: '5000', date: '2026-02-03', one: 1 }, // 重複 id・文字列の金額
    { city: 'C村', amount: 3000, date: '2025-12-31' },                     // id なし
    { id: 'x1', city: '', amount: 1000, date: '2026-01-01' },
    { id: 'x2', city: 'D町', amount: -5, date: '2026-01-01' },
    { id: 'x3', city: 'E町', amount: 1000, date: 20260101 },
    { id: 'x4', city: 'F町', amount: 1000 },
    { id: 'x5', city: 'G町', amount: 1000, date: '2026-02-30' },          // 実在しない日付
    { id: 'x6', city: 'H町', amount: 1000, date: '2026-13-01' },
    null, 'text', 42
  ] });
  const L = C.parseLog(raw);
  assert.deepEqual(L.limits, { 2026: 60000 });   // 以前の limit はいちばん新しい記録の年（2026）の分として引き継ぐ
  assert.deepEqual(L.items.map(i => i.city), ['A町', 'B市', 'C村']);
  assert.equal(L.items[0].one, false);
  assert.equal(L.items[1].amount, 5000);
  assert.equal(L.items[1].one, false);
  assert.equal(new Set(L.items.map(i => i.id)).size, 3);
});

test('寄付の記録：上限の目安が不正なら入れない', () => {
  assert.deepEqual(C.parseLog('{"limit":"abc","items":[]}', { year: 2026 }).limits, {});
  assert.deepEqual(C.parseLog('{"limit":-1,"items":[]}', { year: 2026 }).limits, {});
  assert.deepEqual(C.parseLog('{"limits":{"2026":"x","26":1000,"__proto__":5,"abcd":1,"2025":-1,"2027":1.5},"items":[]}').limits, {});
  assert.deepEqual(C.parseLog('{"limits":[1,2],"items":[]}').limits, {});
});

test('寄付の記録：上限の目安は年ごとに持つ', () => {
  // 以前の形式（年の区別なし）：記録がなければ opt.year の分、year もなければ引き継がない
  assert.deepEqual(C.parseLog('{"limit":60000,"items":[]}', { year: 2027 }).limits, { 2027: 60000 });
  assert.deepEqual(C.parseLog('{"limit":60000,"items":[]}').limits, {});
  // 新しい形式があれば、同じ年の以前の limit では上書きしない
  assert.deepEqual(C.parseLog('{"limit":1,"limits":{"2026":54653},"items":[{"city":"A町","amount":1000,"date":"2026-01-01"}]}').limits, { 2026: 54653 });
  let L = C.parseLog('{"limits":{"2026":54653},"items":[]}');
  assert.equal(C.yearLimit(L, 2026), 54653);
  assert.equal(C.yearLimit(L, 2027), 0);
  L = C.setYearLimit(L, 2027, 70000);
  assert.deepEqual(L.limits, { 2026: 54653, 2027: 70000 });
  L = C.setYearLimit(L, 2026, NaN);                      // 欄を空にした
  assert.deepEqual(L.limits, { 2027: 70000 });
  assert.deepEqual(C.parseLog(C.serializeLog(L)).limits, { 2027: 70000 });
  assert.equal(C.yearLimit(null, 2026), 0);
  assert.equal(C.yearLimit({ limits: { 2026: '1' } }, 2026), 0);
});

test('logYear：いちばん新しい記録の年、なければ今年', () => {
  assert.equal(C.logYear([{ date: '2025-12-01' }, { date: '2026-01-05' }], 2030), 2026);
  assert.equal(C.logYear([], 2030), 2030);
});

test('parseAmount：全角数字・カンマ・円を許す', () => {
  assert.equal(C.parseAmount('１０，０００円'), 10000);
  assert.equal(C.parseAmount(' 12,345 '), 12345);
  assert.ok(Number.isNaN(C.parseAmount('1.5')));
  assert.ok(Number.isNaN(C.parseAmount('')));
  assert.ok(Number.isNaN(C.parseAmount('1234567890')));
});

test('logLimit：記録の欄に入れた額を優先し、空なら選んだ節税・資産形成ナビの目安を使う', () => {
  const chosen = { year: 2026, amount: 54653 };
  assert.deepEqual(C.logLimit(60000, chosen, 2026), { amount: 60000, from: 'manual' });
  // 「この金額を使う」で欄にも同じ額が入った状態は、選んだ目安として扱う
  assert.deepEqual(C.logLimit(54653, chosen, 2026), { amount: 54653, from: 'chosen' });
  assert.deepEqual(C.logLimit(54653, chosen, 2025), { amount: 54653, from: 'manual' });
  assert.deepEqual(C.logLimit(0, chosen, 2026), { amount: 54653, from: 'chosen' });
  // 選んだ年と記録の年が違えば使わない
  assert.equal(C.logLimit(0, chosen, 2025), null);
  // 未入力・不正な値
  assert.equal(C.logLimit(0, undefined, 2026), null);
  assert.equal(C.logLimit(0, { year: 2026, amount: 0 }, 2026), null);
  assert.equal(C.logLimit(0, { year: 2026, amount: '54653' }, 2026), null);
  assert.equal(C.logLimit(-1, null, 2026), null);
  assert.equal(C.logLimit(NaN, chosen, 2026).from, 'chosen');
});

test('logLimit：保存データから読んだ値の組み合わせ（壊れた進み具合でも落ちない）', () => {
  const log = C.parseLog('{"limits":{},"items":[{"id":"a","city":"A町","amount":20000,"date":"2026-03-01","one":false}]}');
  const S = C.parseState('{"stack":["home"],"donationLimit":{"year":2026,"amount":54653}}');
  const y = C.logYear(log.items, 2026);
  assert.deepEqual(C.logLimit(C.yearLimit(log, y), S.donationLimit, y), { amount: 54653, from: 'chosen' });
  const broken = C.parseState('{broken');
  assert.equal(C.logLimit(C.yearLimit(log, y), broken.donationLimit, y), null);
});

test('limitYears：今年と、記録で表示している年の目安を受け付ける', () => {
  const items = [{ date: '2026-12-20' }];
  assert.deepEqual(C.limitYears(2026, items), [2026]);
  assert.deepEqual(C.limitYears(2027, items), [2027, 2026]);   // 年明けに前年分の記録を確かめる
  assert.deepEqual(C.limitYears(2027, []), [2027]);
  const shared = '{"year":2026,"donationLimit":54653}';
  assert.deepEqual(C.parseShared(shared, C.limitYears(2027, items)), { year: 2026, donationLimit: 54653 });
  assert.equal(C.parseShared(shared, C.limitYears(2027, [])), null);
  assert.equal(C.validLimit({ year: 2026, amount: 54653 }, [2027, 2026]), true);
  assert.equal(C.validLimit({ year: 2025, amount: 54653 }, [2027, 2026]), false);
});

test('realDate：実在する YYYY-MM-DD だけ', () => {
  for (const d of ['2026-01-01', '2024-02-29', '2026-12-31']) assert.equal(C.realDate(d), true, d);
  for (const d of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01', '', null, 20260101]) assert.equal(C.realDate(d), false, String(d));
});

test('寄付の記録：外した項目は dropped に残し、保存し直しても消えない', () => {
  const bad = { id: 'x5', city: 'G町', amount: 1000, date: '2026-02-30' };
  const L = C.parseLog(JSON.stringify({ limit: 0, items: [{ id: 'a', city: 'A町', amount: 10000, date: '2026-01-02' }, bad, 'text', null] }));
  assert.deepEqual(L.items.map(i => i.id), ['a']);
  assert.deepEqual(L.dropped, [bad]);
  const again = C.parseLog(C.serializeLog(L));
  assert.deepEqual(again.items.map(i => i.id), ['a']);
  assert.deepEqual(again.dropped, [bad]);                 // 二重にならない
  assert.equal(C.parseLog('{"limit":0,"items":[],"dropped":"x"}').dropped, undefined);
  const many = Array.from({ length: 80 }, (_, n) => ({ id: 'b' + n, city: '', amount: 1, date: '2026-01-01' }));
  assert.equal(C.parseLog(JSON.stringify({ items: many })).dropped.length, 50);
});
