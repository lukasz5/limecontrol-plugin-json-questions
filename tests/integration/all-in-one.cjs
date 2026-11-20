// SPDX-License-Identifier: GPL-2.0-or-later
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium,request}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function run(base) {
    if(!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Disposable loopback installation required');
    const api=await request.newContext();
    const browser=await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH}:{});
    let key;
    async function rpc(method,params) {
        const response=await api.post(base+'/index.php/admin/remotecontrol',{data:{id:1,method,params},headers:{Accept:'application/json'}});
        const body=await response.json();
        assert.ok(!body.error,method);
        return body.result;
    }
    try {
        key=await rpc('get_session_key',['lcqadmin','LCQtest-Story-4321']);
        const lss=(await fs.readFile(path.join(__dirname,'../../examples/fieldwork.lss'),'utf8'))
            .replaceAll('817301','817321').replace('<format>G</format>','<format>A</format>');
        assert.ok(lss.includes('<format>A</format>'));
        const sid=await rpc('import_survey',[key,Buffer.from(lss).toString('base64'),'lss']);
        assert.equal((await rpc('activate_survey',[key,sid])).status,'OK');
        const p=await browser.newPage();p.setDefaultTimeout(6000);
        await p.goto(base+'/index.php/'+sid+'?lang=en&newtest=Y');
        const blocks=p.locator('.lcjq-block');
        assert.equal(await blocks.count(),3);
        const [work,time,reason]=await blocks.all();
        assert.equal(await work.locator('.lcjq-row').count(),0);
        for(const city of ['Łódź','Gdynia']) {
            const input=p.getByRole('checkbox',{name:city,exact:true});
            await p.locator('label[for="'+await input.getAttribute('id')+'"]').first().click();
        }
        const row=(block,label)=>block.locator('.lcjq-row').filter({has:p.locator('legend',{hasText:label})});
        await row(work,'Łódź').getByRole('checkbox',{name:'Measurement'}).check();
        await row(work,'Gdynia').getByRole('checkbox',{name:'Service'}).check();
        await row(time,'Łódź').getByRole('spinbutton').fill('9');
        await row(time,'Gdynia').getByRole('spinbutton').fill('0');
        await row(reason,'Łódź').getByRole('checkbox',{name:'Other'}).check();
        await row(reason,'Łódź').getByRole('textbox').fill('Same page');
        assert.equal(await reason.locator('.lcjq-row').count(),1);
        await p.locator('[name=move][value=movesubmit]:visible').first().click();
        try {
            await p.getByText('Thank you.',{exact:true}).first().waitFor();
        } catch(error) {
            const diagnostics=await p.locator('[role=alert], .ls-question-message').allInnerTexts();
            throw Error('All-in-one submit failed. '+diagnostics.join(' ').slice(0,450),{cause:error});
        }
        const native=await rpc('export_responses',[key,sid,'csv','en','all','code','short']);
        assert.match(Buffer.from(native,'base64').toString('utf8'),/Same page/);
        console.log('All-in-one passed: native choices, dependent selections, two matrix rows including zero, conditional follow-up, submit and stored answer.');
    } finally {
        if(typeof key==='string') await rpc('release_session_key',[key]).catch(()=>{});
        await api.dispose();
        await browser.close();
    }
}
if(require.main===module)run(process.argv[2]).catch(error=>{console.error(error);process.exitCode=1;});
