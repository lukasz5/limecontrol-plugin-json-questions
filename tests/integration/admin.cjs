/* Real LimeSurvey upload endpoints, confirmation, installation and activation in an authenticated session. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

async function login(page,base) {
    await page.goto(base+'/index.php/admin');
    await page.locator('#user').fill('lcqadmin');
    await page.locator('#password').fill('LCQtest-Story-4321');
    await page.locator('[name=login_submit]').click();
    await page.locator('#user').waitFor({state:'detached'});
}
async function csrf(page) {
    const token=page.locator('input[type=hidden][name*=CSRF i]').first();
    return {[await token.getAttribute('name')]:await token.inputValue()};
}
async function run() {
    const [base,dist,mode='install']=process.argv.slice(2);
    if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Loopback required');
    const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
    const p=await browser.newPage();
    try {
        await login(p,base);
        const manager=base+'/index.php/admin/pluginmanager/sa';
        await p.goto(manager+'/index');
        const fields=await csrf(p);
        const names=await fs.readdir(dist);
        async function zip(name){
            const file=names.find(f=>f.startsWith(name+'-')&&f.endsWith('.zip'));
            return {name:file,mimeType:'application/zip',buffer:await fs.readFile(path.join(dist,file))};
        }
        const response=await p.request.post(manager+'/upload',{multipart:{...fields,the_file:await zip('LimeControlJsonQuestions')}});
        assert.equal(response.status(),200);
        if (!/uploadConfirm/i.test(response.url())) throw Error('Plugin ZIP upload did not reach native confirmation: '+response.url());
        await p.goto(response.url());
        assert.equal(await p.locator('input[name=isUpdate]').inputValue(), mode==='update'?'true':'false');
        const install=p.locator('form[action*=installUploadedPlugin]');
        await install.locator('button[type=submit],input[type=submit]').last().click();
        const row=p.locator('tr').filter({hasText:'LimeControlJsonQuestions'}).first();
        await row.waitFor();
        if(mode==='install'){
            const toggle=row.locator('[data-plugin-id],[data-pluginid],[data-id]').first();
            const id=await row.getAttribute('data-id') || await toggle.evaluate(n=>n.dataset.pluginId || n.dataset.pluginid || n.dataset.id);
            assert.match(id,/^\d+$/);
            const activation=await p.request.post(manager+'/activate',{form:{...await csrf(p),pluginId:id}});
            assert.equal(activation.status(),200);
        }
        for(const name of ['LcJsonChoice','LcJsonMatrix','LcJsonFollowup']){
            const theme=await p.request.post(base+'/index.php/admin/themes/sa/upload',{multipart:{...await csrf(p),action:'templateupload',theme:'question',the_file:await zip(name)}});
            const body=await theme.text();
            if(theme.status()!==200 || !/<p class=['"]lead text-success['"]>\s*Success\s*<\/p>/i.test(body)){
                const only=body.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
                throw Error('Native theme upload failed for '+name+': '+only.slice(only.lastIndexOf('Import theme result:'),only.lastIndexOf('Import theme result:')+440));
            }
        }
        console.log('LimeSurvey native upload '+mode+' passed for the plugin and three question themes.');
    }catch(e){console.error('Admin page:',p.url(),(await p.locator('body').innerText()).slice(-700));throw e;}
    finally{await browser.close();}
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={login};
