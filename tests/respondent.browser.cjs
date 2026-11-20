/* SPDX-License-Identifier: GPL-2.0-or-later
 * Run with node tests/respondent.browser.cjs. CHROMIUM may point to a Chromium executable.
 * Set LCJQ_ASSETS to the extracted installable plugin's assets directory to test the ZIP.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

function exercise() {
    const verify = (condition, description) => { if (!condition) throw new Error(description); };
    const label = (en, pl = en, de = en) => ({ en, pl, de });
    const option = (code, name, type, flags = {}) => ({ code, label: name, type, ...flags });
    const nativeField = (code, city) => ({ path: [code], fieldName: 'Q42_S' + code, label: city, value: 'Y' });
    const fields = [nativeField('LDZ', 'Łódź'), nativeField('GDY', 'Gdynia')];
    const citySource = { sources: { CITY: [] }, sourceFields: { CITY: fields } };
    const def = (kind, source, options, rules = []) => ({ version: 1, revision: 'r1', kind, source, options, rules });
    const activities = def('choice', 'CITY', [
        option('MEASURE', label('Measure', 'Pomiar', 'Messung'), 'multi'),
        option('SERVICE', label('Service', 'Serwis'), 'multi'),
        option('NONE', label('None'), 'multi', { exclusive: true }),
    ]);
    const hours = def('matrix', 'WORK', [option('HOURS', label('Hours', 'Godziny'), 'number', { required: true })]);
    const follow = def('followup', 'HOURS', [
        option('WEATHER', label('Weather', 'Pogoda'), 'single'),
        option('OTHER', label('Other', 'Inne'), 'single', { comment: true }),
        option('NOTES', label('Notes'), 'text')
    ], [{ effect: 'show', target: '*', when: { field: 'source.HOURS', op: 'gt', value: 8 } }]);
    const form = document.createElement('form');
    document.body.append(form);
    function addBlock(questionCode, definition, extras = {}, stored = '') {
        const block = document.createElement('div');
        block.className = 'lcjq-block';
        block.dataset.lcjq = JSON.stringify({ definition, questionCode, fieldName: 'Q' + questionCode,
            surveyId: 5, language: 'pl', ...citySource, ...extras });
        const textarea = document.createElement('textarea');
        textarea.name = 'Q' + questionCode;
        textarea.value = stored;
        block.append(textarea);
        form.append(block);
        return block;
    }
    for (const entry of fields) {
        const input = document.createElement('input');
        input.name = entry.fieldName;
        input.type = 'checkbox';
        form.append(input);
    }
    const work = addBlock('WORK', activities);
    const matrix = addBlock('HOURS', hours);
    const last = addBlock('WHY', follow);
    const groups = block => [...block.querySelectorAll('.lcjq-row')];
    const inputAt = (block, group, col) => groups(block)[group].querySelectorAll('.lcjq-label input')[col];
    const change = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
    const storage = block => block.querySelector('textarea');
    const read = block => JSON.parse(storage(block).value);
    const api = window.LimeControlJsonRespondent;
    api.mount();
    verify(!groups(work).length && !groups(matrix).length, 'no initial ghost rows');
    for (const entry of fields) form.elements.namedItem(entry.fieldName).click();
    verify(groups(work).length === 2, 'native checkbox sources');
    inputAt(work, 0, 0).click();
    inputAt(work, 1, 1).click();
    verify(groups(matrix).map(group => group.querySelector('legend').textContent).join('|') === 'Łódź / Pomiar|Gdynia / Serwis', 'translated pair labels');
    change(inputAt(matrix, 0, 0), '9');
    change(inputAt(matrix, 1, 0), '0');
    verify(read(matrix).rows[1].cells.HOURS.value === 0, 'zero as a number');
    verify(groups(last).length === 1 && groups(last)[0].querySelector('legend').textContent === 'Łódź / Pomiar', 'follow-up source predicate');
    inputAt(last, 0, 0).click();
    inputAt(last, 0, 1).click();
    verify(!inputAt(last, 0, 0).checked && !window.lcjqValid(storage(last).value, 'WHY', 5), 'single choice and required comment');
    const comment = groups(last)[0].querySelectorAll('.lcjq-comment input')[1];
    change(comment, 'Zatrzymanie & "<test>"');
    verify(window.lcjqValid(storage(last).value, 'WHY', 5) && read(last).rows[0].cells.OTHER.comment.includes('<test>'), 'typed comment');
    verify(!new FormData(form).has(inputAt(last, 0, 0).name), 'UI-only radio excluded from survey POST');
    change(inputAt(last, 0, 2), 'Uwaga');
    verify(read(last).rows[0].cells.NOTES.value === 'Uwaga', 'free text');
    comment.focus();
    change(comment, 'Komentarz');
    verify(document.activeElement === comment, 'input update preserves keyboard focus');
    const saved = { city: fields.map(f => ({ path: f.path, label: f.label })), work: read(work), matrix: read(matrix), why: storage(last).value };
    inputAt(work, 0, 2).click();
    verify(!inputAt(work, 0, 0).checked && read(work).rows[0].cells.NONE.value === true && !groups(last).length, 'exclusive choice and cascading prune');
    form.elements.namedItem(fields[0].fieldName).click();
    verify(groups(work).length === 1 && read(matrix).rows.length === 1 && read(matrix).rows[0].cells.HOURS.value === 0, 'removal maintains unrelated zero');
    work.remove(); matrix.remove(); last.remove();
    for (const entry of fields) form.elements.namedItem(entry.fieldName).remove();
    const resumed = addBlock('WHY', follow, { language: 'de', sourceFields: {}, sources: {
        CITY: saved.city, WORK: { ...saved.work, definition: activities }, HOURS: { ...saved.matrix, definition: hours }
    } }, saved.why);
    api.mount();
    verify(groups(resumed)[0].querySelector('legend').textContent === 'Łódź / Messung', 'historical source chain and language change');
    verify(read(resumed).rows[0].cells.OTHER.comment === 'Komentarz', 'resume preserves answer/comment by stable path');
    const bad = addBlock('BAD', follow, {}, '{broken');
    api.mount();
    verify(storage(bad).value === '{broken' && bad.querySelector('[role=alert]') && !window.lcjqValid('{broken', 'BAD', 5), 'malformed stored data preserved');
    const safe = addBlock('SAFE', def('matrix', 'CITY', [option('TXT', label('<b>Sample</b>'), 'text')]), {
        sources: { CITY: [{ path:['X'], label:'<em>Location</em>' }] }, sourceFields: {}
    });
    api.mount();
    verify(!safe.querySelector('b,em') && safe.querySelector('.lcjq-label span').textContent === '<b>Sample</b>' && safe.querySelector('legend').textContent === '<em>Location</em>', 'untrusted labels are text');
    const limited = addBlock('LIMIT', def('matrix', 'CITY', [option('TEXT', label('Text'), 'text')]), {
        sources: { CITY: [{ path:['X'], label:'X' }] }, sourceFields: {}, maxBytes: 180
    });
    api.mount();
    change(inputAt(limited,0,0), 'Ł'.repeat(70));
    verify(new TextEncoder().encode(storage(limited).value).length > 180 &&
        inputAt(limited,0,0).value.length === 70 && !window.lcjqValid(storage(limited).value,'LIMIT',5),
        'UTF-8 byte limit retains oversized text');
    verify(!form.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})) &&
        document.activeElement.textContent.includes('180'), 'oversized answer blocks navigation with localized error');
    change(inputAt(limited,0,0), 'Ł'.repeat(10));
    verify(window.lcjqValid(storage(limited).value,'LIMIT',5) &&
        form.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})), 'corrected answer can be submitted');
    const source = Array.from({ length: 40 }, (_, i) => ({ path: ['R' + i], label: 'Row ' + i }));
    const columns = Array.from({ length: 40 }, (_, i) => option('C' + i, label('Column ' + i), 'number'));
    const rows = source.map((row, r) => ({ path: row.path, cells: Object.fromEntries(columns.map((col, c) => [col.code, { value: r * 40 + c }])) }));
    const packed = JSON.stringify({ version: 1, revision:'r1', rows });
    const bulk = addBlock('BULK', def('matrix','ITEMS',columns), { sources:{ ITEMS:source }, sourceFields:{} }, packed);
    api.mount();
    verify(bulk.querySelectorAll('input[type=number]').length === 1600 && new FormData(form).get('QBULK') === packed, '1600 cell round-trip via one successful form control');
    verify(window.lcjqValid(packed, 'BULK', 5), '1600 validated cells');
    verify(!window.lcjqValid(packed.replace('"value":0', '"value":"0"'), 'BULK', 5), 'numeric type mismatch');
    verify(api.condition({all:[{field:'source.count',op:'gte',value:2},{not:{field:'self.NO',op:'selected'}},{any:[{field:'source.H',op:'gt',value:8},{field:'source.H',op:'eq',value:'0'}]}]}, {}, {H:{value:0}}, 2), 'numeric equality, count, boolean composition');
}

const assetDir = process.env.LCJQ_ASSETS || path.join(__dirname, '../LimeControlJsonQuestions/assets');
const script = fs.readFileSync(path.join(assetDir, 'respondent.js'), 'utf8');
const style = fs.readFileSync(path.join(assetDir, 'respondent.css'), 'utf8');
const candidates = [process.env.CHROMIUM, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].filter(Boolean);
try {
    const { chromium } = require('playwright');
    candidates.splice(process.env.CHROMIUM ? 1 : 0, 0, chromium.executablePath());
} catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
}
const browser = candidates.find(file => fs.existsSync(file));
assert.ok(browser, 'Set CHROMIUM to a Chromium executable');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcjq-browser-'));
try {
    const file = path.join(tmp,'test.html');
    const suite = 'try { (' + exercise.toString() + ')(); document.body.textContent="LCJQ_BROWSER_PASS"; } catch(err) { document.body.textContent="LCJQ_BROWSER_FAIL: "+err.stack; }';
    fs.writeFileSync(file, '<!doctype html><html lang="pl"><meta charset="utf-8"><style>'+style+'</style><body><script>'+script+'<\/script><script>'+suite+'<\/script></body></html>');
    const result = spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking',
        '--user-data-dir=' + path.join(tmp, 'profile'), '--dump-dom', 'file://' + file], { encoding:'utf8', timeout:55000, maxBuffer:8000000 });
    assert.equal(result.status, 0, String(result.error || result.stderr).slice(-1800));
    assert.match(result.stdout, /<body>LCJQ_BROWSER_PASS<\/body>/, result.stdout.match(/<body>(LCJQ_BROWSER_FAIL[^<]*)/)?.[1] || 'Browser did not complete the suite');
    console.log('PASS Chromium respondent controls, dependent selections, access by keyboard focus, resume, filter, checked field count and 1600 cells');
} finally {
    fs.rmSync(tmp, { recursive:true, force:true });
}
