/* Public survey round trip against the running, isolated CE installation. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const [base, sid, stress, work] = process.argv.slice(2);
const url = new URL(base);
if (!['localhost','127.0.0.1'].includes(url.hostname)) throw Error('The integration runner requires loopback');
const baseUrl = (id,lang) => base + '/index.php/' + id + '?lang=' + lang + '&newtest=Y';
const checks = {};
let page;

async function move(page, direction = 'movenext') {
    const btn = page.locator('[name=move][value='+direction+']').filter({visible:true}).first();
    await btn.click();
    await page.waitForTimeout(180);
}
async function clickCheck(locator) {
    // LimeSurvey's styled checkbox hides the native control in some themes.
    const id = await locator.getAttribute('id');
    if (id) await locator.page().locator('label[for="'+id+'"]').first().click();
    else await locator.check({force:true});
}
async function login(browser) {
    const p = await browser.newPage({acceptDownloads:true});
    await p.goto(base+'/index.php/admin');
    await p.locator('#user').fill('lcqadmin');
    await p.locator('#password').fill('LCQtest-Story-4321');
    await p.locator('[name=login_submit]').click();
    await p.locator('#user').waitFor({state:'detached'});
    return p;
}
async function resumeFromFreshBrowser(browser, current, id, lang) {
    const name='lcjq'+Date.now();
    const pass='LCQ-test-reload';
    // The visible toolbar submits the native hidden control on mobile and desktop.
    await current.locator('[name=saveall]').first().evaluate(node=>node.click());
    await current.locator('#savename').fill(name);
    await current.locator('#savepass').fill(pass);
    await current.locator('#savepass2').fill(pass);
    await current.locator('button[type=submit]').filter({visible:true}).last().click();
    await current.locator('#savename').waitFor({state:'detached'});
    const fresh=await browser.newPage();
    await fresh.goto(baseUrl(id,lang));
    await fresh.locator('[name=loadall]').first().evaluate(node=>node.click());
    await fresh.locator('#loadname').fill(name);
    await fresh.locator('#loadpass').fill(pass);
    await fresh.locator('#loadbutton').click();
    await fresh.locator('#loadname').waitFor({state:'detached'});
    await current.close();
    return fresh;
}
async function getCsv(admin, survey, type) {
    const response = await admin.request.get(base + '/index.php/plugins/direct?plugin=LimeControlJsonQuestions&function='+type+'&sid='+survey);
    const text = await response.text();
    assert.equal(response.status(),200,text.slice(0,400));
    assert.match(response.headers()['content-type'] || '',/csv/);
    return text;
}

(async () => {
    const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
    try {
        page = await browser.newPage({viewport:{width:1150,height:770},locale:'pl-PL'});
        page.setDefaultTimeout(8000);
        page.on('pageerror',e=>console.error('Public page script:', e.message));
        await page.goto(baseUrl(sid,'pl'));
        await clickCheck(page.getByRole('checkbox',{name:'Łódź',exact:true}));
        await clickCheck(page.getByRole('checkbox',{name:'Gdynia',exact:true}));
        await move(page);
        const visibleRows = () => page.locator('.lcjq-row:visible');
        await visibleRows().first().waitFor();
        assert.equal(await visibleRows().count(),2);
        const cityRow = name => visibleRows().filter({has:page.locator('legend, th[scope=row]',{hasText:name})});
        await cityRow('Łódź').getByRole('checkbox',{name:/Pomiar/}).check();
        await cityRow('Gdynia').getByRole('checkbox',{name:/Serwis/}).check();
        checks.dependent_choices = true;
        await move(page);
        await cityRow('Łódź').getByRole('spinbutton').fill('9');
        await cityRow('Gdynia').getByRole('spinbutton').fill('0');
        assert.equal(await visibleRows().count(),2);
        const screenshot = process.env.LCQ_SCREENSHOT;
        if (screenshot) await page.screenshot({path:screenshot});
        await move(page,'moveprev');
        assert.equal(await cityRow('Łódź').getByRole('checkbox',{name:/Pomiar/}).isChecked(),true);
        await move(page);
        assert.equal(await cityRow('Gdynia').getByRole('spinbutton').inputValue(),'0');
        page = await resumeFromFreshBrowser(browser,page,sid,'pl');
        await cityRow('Łódź').getByRole('spinbutton').waitFor();
        assert.equal(await cityRow('Łódź').getByRole('spinbutton').inputValue(),'9');
        assert.equal(await cityRow('Gdynia').getByRole('spinbutton').inputValue(),'0');
        checks.sample_resumed_in_fresh_browser = true;
        // The theme's language menu submits the current group to LimeSurvey.
        await page.locator('[data-limesurvey-lang="en"]').first().evaluate(link=>link.click());
        await page.getByRole('spinbutton',{name:/Hours/}).first().waitFor();
        assert.equal(await cityRow('Gdynia').getByRole('spinbutton').inputValue(),'0');
        await page.locator('[data-limesurvey-lang="pl"]').first().evaluate(link=>link.click());
        await page.getByRole('spinbutton',{name:/Liczba godzin/}).first().waitFor();
        checks.language_switch_retained_values = true;
        await page.setViewportSize({width:390,height:844});
        const firstNumber=cityRow('Łódź').getByRole('spinbutton');
        await firstNumber.focus(); await page.keyboard.press('Tab');
        assert.equal(await cityRow('Gdynia').getByRole('spinbutton').evaluate(input=>input===document.activeElement),true);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),true);
        await page.setViewportSize({width:1150,height:770});
        checks.mobile_keyboard_navigation=true;
        // Remove a parent choice after the dependent answers have already been saved.
        await move(page,'moveprev');
        await move(page,'moveprev');
        const gdynia=page.getByRole('checkbox',{name:'Gdynia',exact:true});
        await clickCheck(gdynia);
        assert.equal(await gdynia.isChecked(),false);
        await move(page);
        assert.equal(await visibleRows().count(),1);
        await move(page);
        assert.equal(await visibleRows().count(),1);
        assert.equal(await cityRow('Łódź').getByRole('spinbutton').inputValue(),'9');
        await move(page);
        assert.equal(await visibleRows().count(),1);
        checks.removed_source_pruned=true;
        // Restore the selected city and enter a new value for that branch.
        await move(page,'moveprev'); await move(page,'moveprev'); await move(page,'moveprev');
        await clickCheck(page.getByRole('checkbox',{name:'Gdynia',exact:true}));
        await move(page);
        await cityRow('Gdynia').getByRole('checkbox',{name:/Serwis/}).check();
        await move(page);
        await cityRow('Gdynia').getByRole('spinbutton').fill('0');
        await move(page);
        await cityRow('Łódź').waitFor();
        assert.equal(await visibleRows().count(),1);
        await cityRow('Łódź').getByRole('checkbox',{name:/Inne/}).check();
        const comment=cityRow('Łódź').getByRole('textbox');
        const maxBytes=await page.locator('.lcjq-block').evaluate(el=>JSON.parse(el.dataset.lcjq).maxBytes);
        await comment.fill('X'.repeat(maxBytes+1));
        await page.locator('.lcjq-error[tabindex]:visible').waitFor();
        await move(page,'movesubmit');
        await comment.waitFor();
        checks.over_limit_blocked_at_bytes=maxBytes;
        await comment.fill('Powtórzenie pomiaru');
        await move(page,'movesubmit');
        await page.getByText('Dziękujemy.',{exact:true}).first().waitFor();
        checks.followup_zero_and_back = true;
        const admin = await login(browser);
        const sampleCsv = await getCsv(admin,sid,'export');
        await fs.writeFile(path.join(work,'sample-export.csv'),sampleCsv);
        const dictionary = await getCsv(admin,sid,'dictionary');
        assert.match(dictionary,/HOURS/);
        checks.codebook = true;
        page = await browser.newPage();page.setDefaultTimeout(16000);
        await page.goto(baseUrl(stress,'en'));
        const boxes = page.locator('input[type=checkbox]');
        assert.equal(await boxes.count(),40);
        for (let i=0;i<40;i++) await clickCheck(boxes.nth(i));
        await move(page);
        await page.locator('.lcjq-row input[type=number]').first().waitFor();
        const count=await page.locator('.lcjq-row input[type=number]').count();
        assert.equal(count,1600);
        // Bulk-load synthetic fixture data into the native form field. LimeSurvey's own
        // save action persists it; never write directly to the survey response table.
        checks.grid_payload_bytes=await page.locator('.lcjq-block').evaluate(block=>{
            const ctx=JSON.parse(block.dataset.lcjq);
            const rows=Array.from({length:40},(_,r)=>({
                path:['R'+String(r+1).padStart(2,'0')],
                cells:Object.fromEntries(ctx.definition.options.map((opt,c)=>[opt.code,{value:r*40+c}]))
            }));
            const data=JSON.stringify({version:1,revision:ctx.definition.revision,rows});
            block.querySelector('textarea').value=data;
            return new TextEncoder().encode(data).length;
        });
        checks.grid_input_strategy='Bulk synthetic answer supplied in the native form; fresh-session UI readback and edits at both ends';
        page=await resumeFromFreshBrowser(browser,page,stress,'en');
        await page.locator('.lcjq-row input[type=number]').first().waitFor();
        const reloaded=await page.locator('.lcjq-row input[type=number]').evaluateAll(inputs=>inputs.map(input=>input.value));
        assert.deepEqual(reloaded,Array.from({length:1600},(_,i)=>String(i)));
        checks.grid_resume_values=reloaded.length;
        const values=page.locator('.lcjq-row input[type=number]');
        const started=Date.now();
        await values.first().fill('17');
        await values.first().fill('0');
        await values.last().fill('1601');
        await values.last().fill('1599');
        checks.grid_ui_edit_average_ms=Math.round((Date.now()-started)/4);
        const answerAfterEdits=await page.locator('.lcjq-block textarea').evaluate(el=>JSON.parse(el.value));
        assert.equal(answerAfterEdits.rows[0].cells.C01.value,0);
        assert.equal(answerAfterEdits.rows[39].cells.C40.value,1599);
        await move(page,'movesubmit');
        await page.getByText('Thank you.',{exact:true}).first().waitFor();
        await fs.writeFile(path.join(work,'stress-export.csv'),await getCsv(admin,stress,'export'));
        checks.grid_rendered_controls=count;
        await fs.writeFile(path.join(work,'browser-report.json'),JSON.stringify(checks,null,2));
        console.log(JSON.stringify(checks));
    } catch(e) {
        if(page) console.error('PAGE',page.url(),(await page.locator('body').innerText()).slice(-1200));
        throw e;
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
