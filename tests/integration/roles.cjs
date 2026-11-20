// SPDX-License-Identifier: GPL-2.0-or-later
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function run(base, grantedSid, otherSid) {
    if (!['localhost','127.0.0.1'].includes(new URL(base).hostname) || grantedSid === otherSid ||
        !/^\d+$/.test(grantedSid) || !/^\d+$/.test(otherSid) || !process.env.LCJQ_ROLE_PASSWORD)
        throw Error('Requires separate disposable local survey IDs and synthetic roles');
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {});
    try {
        for (const role of ['author','analyst','reader','exporter','guest']) {
            const p=await browser.newPage();
            if(role !== 'guest') {
                await p.goto(base+'/index.php/admin');
                await p.locator('#user').fill('lcq_'+role+'_'+process.env.LCJQ_ROLE_RUN);
                await p.locator('#password').fill(process.env.LCJQ_ROLE_PASSWORD);
                await p.locator('[name=login_submit]').click();
                await p.locator('#user').waitFor({state:'detached'});
            }
            for(const sid of [grantedSid,otherSid]) {
                for(const action of ['editor','backup','export','dictionary','legacy']) {
                    const authorAccess=['editor','backup'].includes(action);
                    const ok=sid===grantedSid && (authorAccess ? role==='author' : role==='analyst');
                    const endpoint=base+'/index.php/plugins/direct?'+new URLSearchParams({
                        plugin:'LimeControlJsonQuestions',function:action,sid,...(action==='backup'?{code:'WORK'}:{})
                    });
                    const result=await p.request.get(endpoint);
                    assert.equal(result.status(),ok ? 200 : 403,role+' '+action+' '+(sid===grantedSid?'A':'B'));
                    if(ok && !authorAccess) assert.match(result.headers()['content-type'],/text\/csv/);
                    await result.dispose();
                }
            }
            await p.close();
        }
        console.log('Survey ACL passed for 5 identities, 5 endpoints and 2 surveys (50 real requests).');
    } finally { await browser.close(); }
}
if(require.main===module)run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
