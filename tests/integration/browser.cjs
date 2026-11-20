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
        const rows = page.locator('.lcjq-row:visible');
        await rows.first().waitFor();
        assert.equal(await rows.count(),2);
        const cityRow = name => rows.filter({has:page.locator('legend',{hasText:name})});
        await cityRow('Łódź').getByRole('checkbox',{name:/Pomiar/}).check();
        await cityRow('Gdynia').getByRole('checkbox',{name:/Serwis/}).check();
        checks.dependent_choices = true;
        await move(page);
        await cityRow('Łódź').getByRole('spinbutton').fill('9');
        await cityRow('Gdynia').getByRole('spinbutton').fill('0');
        assert.equal(await rows.count(),2);
        const screenshot = process.env.LCQ_SCREENSHOT;
        if (screenshot) await page.screenshot({path:screenshot});
        await move(page,'moveprev');
        assert.equal(await cityRow('Łódź').getByRole('checkbox',{name:/Pomiar/}).isChecked(),true);
        await move(page);
        assert.equal(await cityRow('Gdynia').getByRole('spinbutton').inputValue(),'0');
        await move(page);
        await cityRow('Łódź').waitFor();
        assert.equal(await rows.count(),1);
        await cityRow('Łódź').getByRole('checkbox',{name:/Inne/}).check();
        await cityRow('Łódź').getByRole('textbox').fill('Powtórzenie pomiaru');
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
        // Dispatch one input event per actual rendered control, including cell zero.
        await page.evaluate(async()=>{
            const rows=[...document.querySelectorAll('.lcjq-row')];
            for(let r=0;r<rows.length;r++){
                const inputs=rows[r].querySelectorAll('input[type=number]');
                for(let c=0;c<inputs.length;c++){
                    inputs[c].value=String(r*40+c);
                    inputs[c].dispatchEvent(new Event('input',{bubbles:true}));
                }
                await new Promise(resolve=>setTimeout(resolve,0));
            }
        });
        checks.grid_payload_bytes=await page.locator('.lcjq-block textarea').evaluate(el=>new TextEncoder().encode(el.value).length);
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
