/* SPDX-License-Identifier: GPL-2.0-or-later
 * Only the survey scaffold and activation use RemoteControl. All content is authored through the visual editor.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { login } = require('./admin.cjs');

const [base, sid, work] = process.argv.slice(2);
const loopback = new URL(base);
if (!['127.0.0.1','localhost'].includes(loopback.hostname) || !/^\d+$/.test(sid)) throw new Error('An isolated loopback survey is required');
const surveyOverview = base + '/index.php/surveyAdministration/view?surveyid=' + sid;
const fixture = {
    WORK: { kind:'choice', source:'CITIES', options:[['MEASURE','multi','Pomiar','Measurement','Messung'],['SERVICE','multi','Serwis','Service','Wartung']] },
    TIME: { kind:'matrix', source:'WORK', options:[['HOURS','number','Liczba godzin','Hours','Stunden']] },
    REASON: { kind:'followup', source:'TIME', options:[['OTHER','multi','Inne','Other','Sonstiges']] }
};
async function api(page, method, params) {
    const response = await page.request.post(base + '/index.php/admin/remotecontrol', { data:{ id:1, method, params } });
    assert.equal(response.status(),200);
    const payload = await response.json();
    assert.ok(!payload.error, JSON.stringify(payload.error));
    return payload.result;
}
async function configure(page, code) {
    const spec = fixture[code];
    const question = page.locator('#lcjq-question');
    if ((await question.locator('option:checked').textContent()).trim() !== code) {
        await Promise.all([page.waitForNavigation(),question.selectOption({label:code})]);
    }
    const form = page.locator('#lcjq-editor');
    assert.equal(await form.locator('[name=expectedRevision]').inputValue(),'', 'scaffold must have no previous configuration');
    await page.locator('#lcjq-kind').selectOption(spec.kind);
    await page.locator('#lcjq-source').selectOption({label:spec.source});
    await form.locator('details').filter({has:page.locator('#lcjq-preview')}).locator('summary').click();
    for (const [i,[key,type,pl,en,de]] of spec.options.entries()) {
        if (i) await page.locator('#lcjq-new-option').click();
        const opt = page.locator('#lcjq-options > fieldset').nth(i);
        await opt.locator('input[pattern]').fill(key);
        await opt.locator('select').selectOption(type);
        for (const [lang,label] of Object.entries({pl,en,de})) {
            await opt.getByLabel(new RegExp('\\('+lang+'\\)')).fill(label);
        }
        if (code === 'REASON') await opt.locator('input[type=checkbox]').nth(1).check();
        if (code === 'TIME') await opt.locator('input[type=checkbox]').nth(2).check();
        assert.equal(await page.locator('#lcjq-preview').getByRole(type === 'number' ? 'spinbutton' : 'checkbox',
            {name: new RegExp(pl+'|'+en+'|'+de)}).count(),1);
    }
    if (code === 'REASON') {
        await page.locator('#lcjq-new-rule').click();
        const outer = page.locator('#lcjq-rules > fieldset');
        const selects = outer.locator('select');
        await selects.nth(0).selectOption('show');
        await selects.nth(1).selectOption('*');
        await selects.nth(2).selectOption('leaf');
        await selects.nth(3).selectOption('source.HOURS');
        await selects.nth(4).selectOption('gt');
        await outer.locator('input').fill('8');
    }
    await Promise.all([page.waitForNavigation(),form.locator('button[type=submit]').click()]);
    assert.equal(new URL(page.url()).searchParams.get('saved'),'1', (await page.locator('body').innerText()).slice(0,500));
    const revision = await form.locator('[name=expectedRevision]').inputValue();
    assert.match(revision,/^[0-9a-f]{16}$/);
    // Read the plugin's own backup endpoint after a full reload. Only the UI above writes the definition.
    await page.reload();
    const link = await page.locator('a[href*="function=backup"]').getAttribute('href');
    const backup = await (await page.request.get(new URL(link,page.url()).href)).json();
    assert.equal(backup.current.revision, revision);
    assert.equal(backup.current.source,spec.source);
    assert.equal(backup.current.kind,spec.kind);
    assert.deepEqual(backup.current.options.map(opt=>opt.code),spec.options.map(opt=>opt[0]));
    if (code === 'REASON') {
        assert.deepEqual(backup.current.rules,[{ effect:'show',target:'*',when:{field:'source.HOURS',op:'gt',value:8} }]);
        assert.equal(backup.current.options[0].comment,true);
    }
    return revision;
}
async function next(page, value) {
    await page.locator('[name=move][value='+value+']').filter({visible:true}).first().click();
}
async function run() {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {});
    let page;
    try {
        page=await browser.newPage();page.setDefaultTimeout(14000);
        await login(page,base);
        await page.goto(surveyOverview);
        await page.locator('#ls-tools-button').click();
        await page.locator('a[href*="LimeControlJsonQuestions"][href*="function=editor"]:visible').first().click();
        await page.locator('#lcjq-editor').waitFor();
        const checks = { sid:Number(sid), revisions:{} };
        for (const code of ['WORK','TIME','REASON']) checks.revisions[code]=await configure(page,code);
        checks.preview = true;
        const remote = await browser.newContext();
        const key = await api(remote,'get_session_key',['lcqadmin','LCQtest-Story-4321']);
        assert.equal((await api(remote,'activate_survey',[key,Number(sid)])).status,'OK');
        await api(remote,'release_session_key',[key]);
        await remote.close();
        const author = page;
        page = await browser.newPage({locale:'pl-PL'});page.setDefaultTimeout(14000);
        await page.goto(base+'/index.php/'+sid+'?lang=pl&newtest=Y');
        for (const name of ['Łódź','Gdynia']) {
            const box = page.getByRole('checkbox',{name,exact:true});
            const id = await box.getAttribute('id');
            await page.locator('label[for="'+id+'"]').click();
        }
        await next(page,'movenext');
        const choice=page.locator('.lcjq-block[data-lcjq-kind=choice]');
        const matrix=page.locator('.lcjq-block[data-lcjq-kind=matrix]');
        await choice.locator('.lcjq-row').first().waitFor();
        assert.equal(await page.locator('.lcjq-block').count(),2);
        const city=(block,name)=>block.locator('.lcjq-row').filter({has:page.locator('legend,th[scope=row]',{hasText:name})});
        await city(choice,'Łódź').getByRole('checkbox',{name:/Pomiar/}).check();
        await city(choice,'Gdynia').getByRole('checkbox',{name:/Serwis/}).check();
        const lodz=city(matrix,'Łódź');
        await lodz.getByRole('spinbutton').fill('9');
        await city(matrix,'Gdynia').getByRole('spinbutton').fill('0');
        await city(choice,'Łódź').getByRole('checkbox',{name:/Pomiar/}).uncheck();
        assert.equal(await matrix.locator('.lcjq-row').count(),1);
        await city(choice,'Łódź').getByRole('checkbox',{name:/Pomiar/}).check();
        assert.equal(await lodz.getByRole('spinbutton').inputValue(),'');
        assert.equal(await city(matrix,'Gdynia').getByRole('spinbutton').inputValue(),'0');
        await lodz.getByRole('spinbutton').fill('9');
        checks.two_live_blocks = true;
        await next(page,'movenext');
        const last=page.locator('.lcjq-block[data-lcjq-kind=followup]');
        await city(last,'Łódź').getByRole('checkbox',{name:/Inne/}).check();
        assert.equal(await last.locator('.lcjq-row').count(),1);
        await next(page,'movesubmit');
        const warning = page.getByRole('dialog').filter({hasText:/wymaganej formie|wymaganej formy|odpowiedzi/}).first();
        await warning.waitFor();
        await warning.getByRole('button',{name:/Zamknij|Close/}).last().click();
        await warning.waitFor({state:'hidden'});
        await last.getByRole('textbox').fill('Pomiar po zmianie pogody');
        await next(page,'movesubmit');
        await page.getByText('Dziękujemy.',{exact:true}).first().waitFor();
        const exportResponse=await author.request.get(base+'/index.php/plugins/direct?plugin=LimeControlJsonQuestions&function=export&sid='+sid);
        assert.equal(exportResponse.status(),200);
        assert.match(exportResponse.headers()['content-type'] || '',/csv/);
        const csv=await exportResponse.text();
        assert.match(csv,/Pomiar po zmianie pogody/);assert.match(csv,/HOURS,number,0/);
        checks.threshold_comment_and_export=true;
        await fs.mkdir(work,{recursive:true});
        await fs.writeFile(path.join(work,'author-report.json'),JSON.stringify(checks,null,2)+'\n');
        console.log('PASS author editor, persisted options, preview, threshold, same-page dependencies and respondent CSV',sid);
    } catch (e) {
        if (page) console.error('Author scenario',page.url(),(await page.locator('body').innerText()).slice(-900));
        throw e;
    } finally { await browser.close(); }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
