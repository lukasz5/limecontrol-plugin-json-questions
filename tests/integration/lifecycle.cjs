// SPDX-License-Identifier: GPL-2.0-or-later
// Create a separate synthetic survey and verify the public editor, native responses and lifecycle.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const {chromium,request} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {login} = require('./admin.cjs');

async function run(base) {
    const origin = new URL(base);
    if (!['127.0.0.1','localhost'].includes(origin.hostname)) throw Error('A disposable loopback installation is required.');
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {});
    const page = await browser.newPage();
    const rpcSession=await request.newContext();
    let key;
    async function rpc(method, params) {
        const response = await rpcSession.post(base + '/index.php/admin/remotecontrol', {data:{method,params,id:1},headers:{Accept:'application/json'}});
        assert.equal(response.status(), 200);
        const data = await response.json();
        assert.ok(!data.error, JSON.stringify(data.error));
        return data.result;
    }
    try {
        await login(page, base);
        key = await rpc('get_session_key',['lcqadmin','LCQtest-Story-4321']);
        assert.equal(typeof key,'string');
        const lss = (await fs.readFile(path.join(__dirname,'../../examples/fieldwork.lss'),'utf8'))
            .replaceAll('817301','817320')
            .replace('lcjqValid(this.NAOK, "REASON", SID)', '(1 == 1) and lcjqValid(this.NAOK, "REASON", SID)');
        const sid = await rpc('import_survey',[key,Buffer.from(lss).toString('base64'),'lss']);
        assert.ok(Number.isInteger(sid), JSON.stringify(sid));
        assert.equal((await rpc('activate_survey',[key,sid])).status,'OK');
        const url = (action,code) => base + '/index.php/plugins/direct?' + new URLSearchParams({
            plugin:'LimeControlJsonQuestions',function:action,sid,...(code ? {code} : {})
        });
        const backup = async code => (await page.request.get(url('backup',code))).json();
        async function submit(code,action,expected=200) {
            await page.goto(url('editor',code));
            const button = page.locator('button[value="'+action+'"]');
            const form = action==='save' ? page.locator('#lcjq-editor') : button.locator('..');
            const data = await form.evaluate((f,action) => {
                const data=Object.fromEntries(new FormData(f).entries());
                if(action==='save') data.definition=JSON.stringify(JSON.parse(f.dataset.config).definition);
                return {...data,action};
            },action);
            const response = await page.request.post(url('editor',code),{form:data});
            assert.equal(response.status(),expected,action+' '+code+': '+(await response.text()).replace(/<[^>]*>/g,' ').slice(-450));
        }
        const map = Object.values(await rpc('get_fieldmap',[key,sid,'en']));
        const field = (code,aid='') => {
            const record = map.find(f=>f.title===code && String(f.aid || '')===aid);
            assert.ok(record,'Missing field '+code+' '+aid);
            return record.fieldname;
        };
        const value = async (code,row,cells) => JSON.stringify({version:1,revision:(await backup(code)).current.revision,rows:[{path:row,cells}]});
        const row = await rpc('add_response',[key,sid,{
            [field('CITIES','LODZ')]:'Y',
            [field('WORK')]: await value('WORK',['LODZ'],{MEASURE:{value:true}}),
            [field('TIME')]: await value('TIME',['LODZ','MEASURE'],{HOURS:{value:10}}),
            [field('REASON')]: await value('REASON',['LODZ','MEASURE'],{OTHER:{value:true,comment:'Lifecycle test'}})
        }]);
        assert.ok(Number(row)>0, JSON.stringify(row));
        async function csv() {
            const response = await page.request.get(url('export'));
            assert.equal(response.status(),200);
            return response.text();
        }
        async function nativeCsv() {
            const bytes=await rpc('export_responses',[key,sid,'csv','en','all','code','short']);
            assert.equal(typeof bytes,'string');
            return Buffer.from(bytes,'base64').toString('utf8');
        }
        const before = await csv();
        const nativeBefore = await nativeCsv();
        assert.match(before,/Lifecycle test/);
        assert.match(nativeBefore,/Lifecycle test/);

        await submit('WORK','detach',409);
        for(const code of ['REASON','TIME','WORK']) {
            const original = (await backup(code)).current;
            await submit(code,'detach');
            const retained=await backup(code);
            assert.deepEqual(retained.detached,original);
            assert.deepEqual(retained.current,[]);
        }
        assert.equal(await csv(),before,'Detached sources must preserve the normalized export');
        assert.equal(await nativeCsv(),nativeBefore);

        for(const code of ['WORK','TIME','REASON']) {
            await submit(code,'save');
            assert.equal((await backup(code)).detached,null);
        }
        assert.equal(await csv(),before,'Reattaching must preserve every answer and revision');

        for(const code of ['REASON','TIME','WORK']) {
            await submit(code,'detach');
            await submit(code,'purge');
            const snapshot=await backup(code);
            assert.deepEqual(snapshot.current,[]);
            assert.deepEqual(snapshot.history,[]);
            assert.equal(snapshot.detached,null);
        }
        assert.equal(await nativeCsv(),nativeBefore,'Purging metadata must preserve the native response byte-for-byte');
        assert.equal((await csv()).trim().split('\n').length,1);
        // A new respondent now sees native text fields. The previous custom equation still evaluates.
        const respondent=await browser.newPage();
        await respondent.goto(base+'/index.php/'+sid+'?lang=en&newtest=Y');
        await respondent.locator('[name=move][value=movenext]:visible').first().click();
        for(const code of ['WORK','TIME','REASON']) {
            assert.equal(await respondent.locator('.lcjq-block').count(),0);
            await respondent.locator('textarea:visible').first().fill('Native '+code);
            await respondent.locator('[name=move][value='+ (code==='REASON'?'movesubmit':'movenext') +']:visible').first().click();
        }
        await respondent.getByText('Thank you.',{exact:true}).first().waitFor();
        console.log('LimeSurvey lifecycle passed: dependency guard, backup, detach, restore, metadata deletion, response preservation and native survey completion.');
    } finally {
        if(typeof key==='string') await rpc('release_session_key',[key]).catch(()=>{});
        await rpcSession.dispose();
        await browser.close();
    }
}
if(require.main===module)run(process.argv[2]).catch(error=>{console.error(error);process.exitCode=1;});
