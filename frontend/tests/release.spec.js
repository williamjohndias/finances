const { test, expect } = require('@playwright/test');

async function login(page) {
    await page.goto('/open-finance');
    await page.getByLabel('E-mail').fill('sandbox@example.test');
    await page.getByLabel('Senha').fill('synthetic-password');
    await page.getByRole('button',{ name:'Entrar',exact:true }).click();
    await expect(page.locator('#inventory')).toBeVisible();
}

test('browser flow: consent, callback, sync, financial decision, reconnect and logout',async ({ page }) => {
    // This test simulates only the provider widget callback. No bank is contacted.
    await page.route('**/static/vendor/pluggy-connect-2.14.2.js',route => route.fulfill({ contentType:'application/javascript',body:`
        window.FinancesPluggy={PluggyConnect:class {
            constructor(props){window.__testWidget=props;this.props=props;}
            async init(){await this.props.onSuccess({item:{id:'sandbox-item'}});}
            async destroy(){}
        }};` }));
    await login(page);
    await page.locator('#month').fill('2025-01'); await page.locator('#month').dispatchEvent('change');
    await page.getByRole('button',{ name:'Conectar banco com Pluggy' }).click();
    await expect(page.locator('#status')).toContainText('Confirme o consentimento');
    await page.locator('#consent').check();
    let firstBinding = true;
    await page.route('**/api/open-finance/items',async route => {
        if (firstBinding) { firstBinding=false; await route.fulfill({status:503,json:{error:'Synthetic transient failure'}}); }
        else await route.continue();
    });
    await page.getByRole('button',{ name:'Conectar banco com Pluggy' }).click();
    await expect(page.getByRole('button',{name:'Tentar vincular conexão novamente'})).toBeVisible();
    await page.getByRole('button',{name:'Tentar vincular conexão novamente'}).click();
    await expect(page.locator('#connections')).toContainText('Synthetic Nubank');
    const response = await page.request.get('/api/open-finance/jobs/sync',{
        headers:{ Authorization:'Bearer synthetic-cron-token-for-local-tests-only' }});
    expect(response.status()).toBe(200);
    await page.getByRole('button',{ name:'Atualizar consulta' }).click();
    await expect(page.locator('#transactions')).toContainText('salary');
    await expect(page.locator('#dashboard')).toContainText('25.00');
    await page.locator('#transactions tr').filter({ hasText:'salary' }).getByRole('button',{name:'Conciliar'}).click();
    await page.locator('#decision-kind').selectOption('income');
    await page.locator('#reason').fill('Confirmed salary from synthetic bank');
    await page.locator('#review-confirmation').check();
    await page.getByRole('button',{name:'Salvar decisão auditável'}).click();
    await expect(page.locator('#dashboard')).toContainText('975.00');
    await expect(page.locator('#audit')).toContainText('income');
    await page.getByRole('button',{name:'Reconectar',exact:true}).click();
    await expect.poll(() => page.evaluate(() => window.__testWidget.updateItem)).toBe('sandbox-item');
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    const cookies = await page.context().cookies();
    expect(cookies.find(c=>c.name==='of_session')).toMatchObject({httpOnly:true,secure:true,sameSite:'Strict'});
    await page.getByRole('button',{name:'Sair',exact:true}).click();
    await expect(page.locator('#inventory')).toBeHidden();
});

test('official bundled SDK loads and opens its modal with the fixed Pluggy origin',async ({ page }) => {
    await page.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation',event => window.__cspViolations.push(event.violatedDirective));
    });
    await page.route('https://connect.pluggy.ai/**',route => route.fulfill({ contentType:'text/html',body:'<!doctype html><title>Local provider frame fixture</title>' }));
    await login(page);
    expect(await page.evaluate(() => typeof window.FinancesPluggy.PluggyConnect)).toBe('function');
    await page.locator('#consent').check();
    await page.getByRole('button',{ name:'Conectar banco com Pluggy' }).click();
    await expect.poll(() => page.frames().some(frame => frame.url().startsWith('https://connect.pluggy.ai'))).toBe(true);
    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    // A local iframe response cannot authenticate the real provider: no success claim.
});
