'use strict';
(() => {
    const el = (id) => document.getElementById(id);
    const status = (message) => { el('status').textContent = message; };
    const clear = () => {
        for (const id of ['connections', 'accounts', 'transactions']) el(id).replaceChildren();
        el('inventory').hidden = true;
        el('login').hidden = false;
    };
    async function api(path, method = 'GET', data) {
        const response = await fetch('/api/open-finance/' + path, {
            method, credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: data === undefined ? undefined : JSON.stringify(data)
        });
        if (response.status === 401) clear();
        if (!response.ok) throw new Error('Operação indisponível. Confira a sessão e o status da homologação.');
        return response.json();
    }
    function table(target, headings, rows) {
        const node = document.createElement('table');
        const head = document.createElement('tr');
        for (const text of headings) {
            const cell = document.createElement('th'); cell.textContent = text; head.append(cell);
        }
        const thead = document.createElement('thead'); thead.append(head); node.append(thead);
        const body = document.createElement('tbody');
        for (const row of rows) {
            const line = document.createElement('tr');
            for (const value of row) {
                const cell = document.createElement('td'); cell.textContent = String(value ?? '—'); line.append(cell);
            }
            body.append(line);
        }
        node.append(body); el(target).replaceChildren(node);
    }
    async function refresh() {
        const data = await api('inventory');
        el('login').hidden = true; el('inventory').hidden = false;
        const states = { queued: 'Na fila', syncing: 'Sincronizando', synced: 'Coletado', error: 'Falha; nova tentativa pendente' };
        el('connections').replaceChildren();
        for (const item of data.items) {
            const consent = data.consents.find((c) => c.id === item.consent_id);
            const active = consent && !consent.revoked_at && new Date(consent.expires_at) > new Date();
            const text = document.createElement('p');
            text.textContent = `${item.connector} · ${active ? (states[item.status] || 'Desconhecido') : 'Consentimento inativo'} · Banco: ${item.provider_status} · Última coleta: ${item.last_synced_at || 'Ainda não coletado'}`;
            el('connections').append(text);
            if (active) {
                const button = document.createElement('button'); button.textContent = 'Revogar coleta';
                button.addEventListener('click', () => run(async () => {
                    await api('consents/' + encodeURIComponent(consent.id), 'DELETE'); await refresh();
                }));
                el('connections').append(button);
            }
        }
        table('accounts', ['Conta', 'Tipo', 'Moeda', 'Saldo bancário', 'Coleta'], data.accounts.map((a) =>
            [a.id, a.kind, a.currency, a.balance, a.observed_at]));
        table('transactions', ['Conta', 'Data', 'Valor', 'Moeda', 'Direção', 'Estado bancário', 'Conciliação'],
            data.transactions.map((t) => [t.account_id, t.occurred_at, t.amount, t.currency, t.direction,
                t.bank_status === 'POSTED' ? 'Confirmado pelo banco' : t.bank_status === 'PENDING' ? 'Pendente' : 'Desconhecido',
                t.reconciliation_status]));
        status('Origem: Pluggy / Open Finance. Dados em preparação, excluídos do dashboard.');
    }
    async function run(action) {
        try { await action(); } catch (error) { status(error.message); }
    }
    el('login').addEventListener('submit', (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        form.reset();
        run(async () => { await api('session', 'POST', data); await refresh(); });
    });
    el('refresh').addEventListener('click', () => run(refresh));
    el('sync').addEventListener('click', () => run(async () => {
        await api('sync', 'POST', {}); status('Coleta solicitada. Aguarde a execução agendada e atualize a consulta.');
    }));
    el('logout').addEventListener('click', () => run(async () => {
        await api('session', 'DELETE'); clear(); status('Sessão encerrada.');
    }));
    window.addEventListener('pagehide', clear);
    run(refresh);
})();
