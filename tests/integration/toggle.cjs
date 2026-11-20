// SPDX-License-Identifier: GPL-2.0-or-later
// Exercise the actual native deactivate/activate endpoints, including the dependency guard.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {login}=require('./admin.cjs');
const [base,mode,sid]=process.argv.slice(2);
async function main(){
    if(new URL(base).hostname!=='127.0.0.1' || !['deactivate','activate','detach'].includes(mode)) throw Error('Local QA only');
    const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
    try{
        const p=await browser.newPage();
        await login(p,base);
        if(mode==='detach'){
            assert.match(sid,/^[1-9]\d*$/);
            for(const code of ['REASON','TIME','WORK']){
                const url=base+'/index.php/plugins/direct?'+new URLSearchParams({plugin:'LimeControlJsonQuestions',function:'editor',sid,code});
                await p.goto(url);
                const button=p.locator('button[value=detach]');
                const form=await button.evaluate(b=>({...Object.fromEntries(new FormData(b.form)),action:'detach'}));
                const response=await p.request.post(url,{form});
                assert.equal(response.status(),200,'Detach '+code);
            }
            return;
        }
        const manager=base+'/index.php/admin/pluginmanager/sa';
        await p.goto(manager+'/index?pageSize=100');
        const row=p.locator('tr').filter({hasText:'LimeControlJsonQuestions'}).first();
        const pluginId=await row.getAttribute('data-id');
        assert.match(pluginId,/^[1-9]\d*$/);
        const csrf=p.locator('input[type=hidden][name*=CSRF i]').first();
        const response=await p.request.post(manager+'/'+mode,{form:{pluginId,[await csrf.getAttribute('name')]:await csrf.inputValue()}});
        assert.equal(response.status(),200,mode);
    }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
