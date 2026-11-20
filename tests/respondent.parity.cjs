/* SPDX-License-Identifier: GPL-2.0-or-later
 * Exercise the browser and PHP rules with exactly the same inputs.
 */
'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
require('../LimeControlJsonQuestions/assets/respondent.js');

const option = (code, type, flags = {}) => ({ code, label: { en: code }, type, ...flags });
const options = [option('ON', 'single'), option('OFF', 'single'), option('A', 'multi'), option('B', 'multi'),
    option('NONE', 'multi', { exclusive: true }), option('NUM', 'number'), option('DESC', 'text')];
const base = { version: 1, kind: 'followup', source: 'MATRIX', options, rules: [] };
const cell = value => ({ value });
const row = (code, cells) => ({ path: [code], cells });
const answer = (...rows) => ({ version: 1, rows });
const when = (field, op, value) => value === undefined ? { field, op } : { field, op, value };
const rule = (effect, target, when) => ({ effect, target, when });
const hours = { version: 1, rows: [row('A',{ H: cell(9) }), row('B',{ H: cell(0) })] };
const cases = [];
function add(name, def, answer, expected, source = hours) { cases.push({ name, def, answer, expected, source }); }

add('empty optional', base, answer(), true);
add('two radio options', base, answer(row('A',{ ON:cell(true), OFF:cell(true) })), false);
add('two checkboxes', base, answer(row('A',{ A:cell(true), B:cell(true) })), true);
add('exclusive and free text', base, answer(row('A',{ NONE:cell(true), DESC:cell('one') })), false);
add('comment on absent choice', base, answer(row('A',{ ON:{ value:false, comment:'Note' } })), false);
add('string instead of number', base, answer(row('A',{ NUM:cell('0') })), false);
add('numeric zero', base, answer(row('A',{ NUM:cell(0) })), true);
add('unknown key', base, answer(row('A',{ UNKNOWN:cell(true) })), false);
add('duplicate path', base, answer(row('A',{}),row('A',{})), false);
add('unselected source', base, answer(row('Removed',{ A:cell(true) })), false);
add('wrong revision', { ...base, revision:'r2' }, { ...answer(), revision:'r1' }, false);
add('prior revision', { ...base, revision:'r1' }, { ...answer(), revision:'r1' }, true);
const filtered = { ...base, rules:[rule('show','*',{all:[when('source.H','gt',8),{not:when('source.H','lt',0)}]})] };
add('hidden whole row', filtered, answer(row('B',{A:cell(true)})), false);
add('visible whole row', filtered, answer(row('A',{A:cell(true)})), true);
const conditional = { ...base, rules:[rule('require','DESC',{any:[when('source.H','eq','0'),when('self.A','selected')]})] };
add('require by zero numeric string', conditional, answer(row('A',{})), false);
add('require by earlier choice and zero', conditional, answer(row('A',{ A:cell(true), DESC:cell('x') }),row('B',{DESC:cell('y')})),true);
const conditionalNote = { ...base, rules:[rule('requireComment','A',when('source.count','gte',2))] };
add('comment when count two', conditionalNote, answer(row('A',{A:cell(true)})), false);
add('blank comment',conditionalNote, answer(row('A',{A:{value:true,comment:' '}})),false);
add('filled comment',conditionalNote, answer(row('A',{A:{value:true,comment:'Łódź'}})),true);
const hidden = { ...base, rules:[rule('show','A',when('self.ON','selected'))] };
add('hidden option',hidden,answer(row('A',{A:cell(true)})),false);
add('visible option',hidden,answer(row('A',{ON:cell(true),A:cell(true)})),true);
const all = { ...base, rules:[rule('require','*',when('source.count','lte',2))] };
add('any on each row',all,answer(row('A',{DESC:cell('yes')})),false);
add('zero is active for required row',all,answer(row('A',{NUM:cell(0)}),row('B',{A:cell(true)})),true);
add('per option required', { ...base, options:[option('TXT','text',{required:true})] }, answer(row('B',{TXT:cell('two')})),false);
add('native source paths',base,answer(row('X',{A:cell(true)})),true,[{path:['X'],label:'Item'}]);

const php = spawnSync('php', ['-r', `
    require $argv[1];
    $codes=[];
    foreach(json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR) as $case) {
        $codes[]=LimeControlJsonModel::validateAnswer($case['def'],$case['answer'],[$case['def']['source']=>$case['source']]);
    }
    echo json_encode($codes,JSON_THROW_ON_ERROR);
`, path.join(__dirname,'../LimeControlJsonQuestions/LimeControlJsonModel.php')], { input: JSON.stringify(cases), encoding: 'utf8' });
assert.equal(php.status, 0, php.stderr || String(php.error));
const codes = JSON.parse(php.stdout);
for (const [i, test] of cases.entries()) {
    const sources = Array.isArray(test.source) ? test.source : test.source.rows;
    let js;
    try { js = globalThis.LimeControlJsonRespondent.validatePayload(test.def, sources, JSON.stringify(test.answer)); }
    catch { js = false; }
    assert.equal(js, test.expected, test.name + ' (JS)');
    assert.equal(codes[i].length === 0, test.expected, test.name + ' (PHP) ' + codes[i]);
}
console.log('PASS '+ cases.length +' shared PHP/JS rule and validation fixtures');
