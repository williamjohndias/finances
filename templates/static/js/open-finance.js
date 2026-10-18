'use strict';
(() => {
    const el = (id) => document.getElementById(id);
    let messageGeneration = 0;
    const status = (message, passive = false) => { if (!passive) messageGeneration++; el('status').textContent = message; };
    let model, selected, widget, pendingDecision, pendingBinding, loading = false, generation = 0;
    function closeWidget() {
        const instance = widget; widget = null;
        if (instance) Promise.resolve(instance.destroy()).catch(() => {});
    }
    function clear() {
        generation++;
        closeWidget(); model = null; selected = null; pendingDecision = null;
        pendingBinding = null; el('retry-binding').hidden = true;
        for (const id of ['connections','accounts','transactions','dashboard','projections','rules','audit','history']) el(id).replaceChildren();
        el('inventory').hidden = true; el('login').hidden = false; el('reconcile').hidden = true;
    }
    async function api(path, method = 'GET', data) {
        const response = await fetch('/api/open-finance/' + path, {
            method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
            body: data === undefined ? undefined : JSON.stringify(data)
        });
        if (response.status === 401) clear();
        if (!response.ok) throw new Error(response.status === 429 ? 'Limite de solicitações atingido. Aguarde um minuto.' :
            'Operação indisponível. Confira a sessão, a conexão e possíveis dados alterados pelo banco.');
        return response.json();
    }
    function table(target, headings, rows) {
        const node = document.createElement('table'), head = document.createElement('tr');
        for (const text of headings) {
            const cell = document.createElement('th'); cell.textContent = text; head.append(cell);
        }
        const thead = document.createElement('thead'); thead.append(head); node.append(thead);
        const body = document.createElement('tbody');
        for (const row of rows) {
            const line = document.createElement('tr');
            for (const value of row) {
                const cell = document.createElement('td');
                if (value && typeof value === 'object' && value.nodeType) cell.append(value);
                else cell.textContent = String(value ?? '—');
                line.append(cell);
            }
            body.append(line);
        }
        node.append(body); el(target).replaceChildren(node);
    }
    function button(text, action) {
        const node = document.createElement('button'); node.type = 'button'; node.textContent = text;
        node.addEventListener('click', () => run(action)); return node;
    }
    function option(select, value, text) {
        const node = document.createElement('option'); node.value = value; node.textContent = text; select.append(node);
    }
    function choose(row) {
        selected = row; pendingDecision = null; el('reconcile').hidden = false;
        el('selected').textContent = `${row.account_id} · ${row.external_id} · ${row.currency} ${row.amount} · revisão ${row.revision}`;
        el('decision-kind').value = 'pending'; el('reason').value = '';
        el('review-confirmation').checked = false; el('save-rule').checked = false;
        el('counterpart').replaceChildren(); option(el('counterpart'), '', 'Sem outra movimentação');
        model.review_options.forEach((other, index) => {
            if ((other.account_id !== row.account_id || other.external_id !== row.external_id) &&
                other.currency === row.currency && Math.abs(Number(other.amount)) === Math.abs(Number(row.amount)))
                option(el('counterpart'), String(index), `${other.account_id} · ${other.external_id} · ${other.direction} · ${other.occurred_at}`);
        });
        el('historical').replaceChildren(); option(el('historical'), '', 'Sem vínculo histórico');
        model.legacy.forEach((legacy, index) => option(el('historical'), String(index),
            `${legacy.source} · ${legacy.id} · ${legacy.tipo || 'pagamento de fatura'} · BRL ${legacy.valor}`));
    }
    async function connect(itemId) {
        const epoch = generation;
        if (pendingBinding) throw new Error('Conclua o vínculo pendente antes de criar outra conexão.');
        if (!el('consent').checked) throw new Error('Confirme o consentimento antes de conectar ou reconectar.');
        if (!window.FinancesPluggy?.PluggyConnect) throw new Error('SDK Pluggy Connect indisponível.');
        closeWidget();
        const token = await api(itemId ? 'items/' + encodeURIComponent(itemId) + '/connect-token' : 'connect-token', 'POST', { consent: true });
        if (epoch !== generation) return;
        if (token.includeSandbox && (!Array.isArray(token.connectorIds) || !token.connectorIds.length))
            throw new Error('Conectores sandbox não foram verificados. Nenhuma conexão real será aberta.');
        let bound = false;
        widget = new window.FinancesPluggy.PluggyConnect({
            connectToken: token.accessToken, includeSandbox: token.includeSandbox,
            ...(token.connectorIds ? { connectorIds:token.connectorIds } : {}),
            ...(token.updateItem ? { updateItem: token.updateItem } : {}),
            countries: ['BR'], products: ['ACCOUNTS','CREDIT_CARDS','TRANSACTIONS'], language: 'pt',
            onSuccess: async ({ item }) => {
                if (epoch !== generation) return;
                if (bound) return; bound = true;
                try {
                    if (!item?.id || (token.updateItem && item.id !== token.updateItem)) throw new Error('Resposta rejeitada.');
                    pendingBinding = { itemId: item.id,consentId: token.consentId };
                    await finishBinding();
                } catch (_) {
                    closeWidget(); el('retry-binding').hidden = !pendingBinding;
                    status('O vínculo não foi concluído. Use tentar vincular novamente, sem criar outra conexão.');
                }
            },
            onError: () => { status('A conexão Pluggy não foi concluída. Nenhum dado foi contabilizado. Tente reconectar.'); closeWidget(); },
            onClose: () => { status('Janela Pluggy fechada. Confira o status da conexão.'); closeWidget(); }
        });
        try { await widget.init(); } catch (_) { closeWidget(); throw new Error('Não foi possível abrir o Pluggy Connect.'); }
    }
    async function finishBinding() {
        if (!pendingBinding) return;
        await api('items','POST',pendingBinding);
        pendingBinding = null; el('retry-binding').hidden = true;
        await api('sync','POST',{}); closeWidget(); await refresh();
    }
    async function refresh(force = false) {
        if (loading && !force) return; loading = true;
        const epoch = generation;
        const messageVersion = messageGeneration;
        try {
            const [data, banking] = await Promise.all([api('inventory'),api('dashboard?month=' + encodeURIComponent(el('month').value))]);
            if (epoch !== generation) return;
            model = banking; el('login').hidden = true; el('inventory').hidden = false;
            el('environment').textContent = banking.sandbox ? 'SANDBOX · dados sintéticos, sem dinheiro real' : 'PRODUÇÃO · dados bancários';
            const states = { queued: 'Na fila',syncing: 'Sincronizando',synced: 'Coletado',error: 'Falha; nova tentativa pendente' };
            el('connections').replaceChildren();
            for (const item of data.items) {
                const consent = data.consents.find((c) => c.id === item.consent_id);
                const active = consent && !consent.revoked_at && new Date(consent.expires_at) > new Date();
                const text = document.createElement('p');
                text.textContent = `${item.connector} · ${item.data_scope} · ${active ? (states[item.status] || 'Desconhecido') : 'Consentimento inativo'} · Banco: ${item.provider_status} · Última coleta: ${item.last_synced_at || 'Ainda não coletado'}`;
                el('connections').append(text,button('Reconectar', () => connect(item.id)));
                if (active) el('connections').append(button('Revogar coleta', async () => {
                    await api('consents/' + encodeURIComponent(consent.id),'DELETE'); await refresh();
                }));
            }
            table('dashboard',['Moeda','Receitas realizadas','Despesas líquidas','Resultado realizado','Faturas pagas (neutras)',
                'Receitas projetadas','Despesas projetadas'],Object.entries(banking.currencies).map(([currency,v]) =>
                [currency,v.income,v.expense,v.net_realized,v.invoice_paid,v.projected_income,v.projected_expense]));
            table('accounts',['Conta','Tipo','Moeda','Saldo bancário observado','Observação'],banking.accounts.map((a) =>
                [a.id,a.kind,a.currency,a.balance,a.observed_at]));
            table('transactions',['Conta','Lançamento','Data','Valor','Moeda','Direção','Estado bancário','Conciliação','Parcela / competência da fatura','Revisar'],
                banking.movements.map((t) => [t.account_id,t.external_id,t.occurred_at,t.amount,t.currency,t.direction,
                    t.bank_status === 'POSTED' ? 'Confirmado pelo banco' : t.bank_status === 'PENDING' ? 'Pendente' : 'Desconhecido',
                    t.decision_changed ? 'Banco alterou o lançamento: revisar novamente' : t.kind,
                    `${t.metadata?.installmentNumber || '—'}/${t.metadata?.totalInstallments || '—'} · ${t.metadata?.billForecastDate || 'Não informado'}`,
                    button('Conciliar', () => choose(t))]));
            table('projections',['Origem','Vencimento','Valor','Moeda','Tipo'],banking.projections.map((p) => [p.source,p.due,p.amount,p.currency,p.kind]));
            table('history',['Origem','Registro','Data','Tipo','Valor'],banking.legacy.map((h) => [h.source,h.id,h.data || h.data_inicio,h.tipo || 'Pagamento efetivo de fatura',h.valor]));
            table('audit',['Data','Ação','ID da decisão'],banking.decisions.map((a) => [a.created_at,a.action.kind,a.id]));
            el('rules').replaceChildren();
            for (const rule of banking.rules) {
                const text = document.createElement('p'); text.textContent = `${rule.account_id} · categoria ${rule.category_id} · ${rule.kind}`;
                el('rules').append(text,button('Desativar regra',async () => { await api('rules/' + rule.id,'DELETE'); await refresh(); }));
            }
            if (messageVersion === messageGeneration) status(`Origem: Pluggy / Open Finance. ${banking.pending_count} pendência(s). Realizados conciliados; projeções excluídas do realizado. ${banking.historical_count} registro(s) histórico(s) preservados, sem soma duplicada.`,true);
        } finally { loading = false; }
    }
    async function run(action) { try { await action(); } catch (error) { status(error.message); } }
    el('month').value = new Intl.DateTimeFormat('sv-SE',{ timeZone: 'America/Sao_Paulo',year: 'numeric',month: '2-digit' }).format(new Date());
    el('login').addEventListener('submit',(event) => {
        event.preventDefault(); const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form)); form.reset();
        run(async () => { await api('session','POST',data); generation++; await refresh(true); });
    });
    el('reconcile').addEventListener('submit',(event) => {
        event.preventDefault(); if (!selected || !el('review-confirmation').checked) return;
        const action = { account_id: selected.account_id,external_id: selected.external_id,revision: selected.revision,
            kind: el('decision-kind').value,reason: el('reason').value,save_rule: el('save-rule').checked };
        const peer = el('counterpart').value === '' ? null : model.review_options[Number(el('counterpart').value)];
        if (peer) Object.assign(action,{ other_account_id: peer.account_id,other_external_id: peer.external_id,other_revision: peer.revision });
        const historical = el('historical').value === '' ? null : model.legacy[Number(el('historical').value)];
        if (historical) Object.assign(action,{ legacy_table: historical.source,legacy_id: historical.id,
            ...(historical.source === 'recorrencias' ? { legacy_occurrence: el('occurrence').value } : {}) });
        const serialized = JSON.stringify(action);
        if (!pendingDecision || pendingDecision.serialized !== serialized) pendingDecision = { serialized,request_id: crypto.randomUUID() };
        run(async () => {
            await api('reconcile','POST',{ ...action,request_id: pendingDecision.request_id });
            pendingDecision = null; el('reconcile').hidden = true; await refresh();
        });
    });
    el('refresh').addEventListener('click',() => run(refresh));
    el('month').addEventListener('change',() => run(refresh));
    el('connect').addEventListener('click',() => run(() => connect()));
    el('retry-binding').addEventListener('click',() => run(finishBinding));
    el('sync').addEventListener('click',() => run(async () => {
        await api('sync','POST',{}); status('Coleta solicitada. O agendamento diário e os webhooks atualizarão os dados.');
    }));
    el('logout').addEventListener('click',() => run(async () => {
        await api('session','DELETE'); clear(); status('Sessão encerrada.');
    }));
    window.addEventListener('pagehide',clear);
    setInterval(() => { if (model && !document.hidden && el('reconcile').hidden) run(refresh); },60000);
    run(refresh);
})();
