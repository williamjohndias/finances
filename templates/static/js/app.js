// ===================================
// FINANCES - Sistema de Controle Financeiro
// Main Application JavaScript
// ===================================

// ===================================
// DASHBOARD NAVIGATION
// ===================================
let currentPage = 'dashboard';

function navigateTo(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Show target page
    const pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');

    // Update sidebar active link
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === page);
    });

    // Update bottom nav active item
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Update topbar title
    const titles = {
        dashboard: 'Dashboard',
        transacoes: 'Transações',
        abatimentos: 'Abatimentos',
        graficos: 'Gráficos',
        analises: 'Análises',
        calendario: 'Calendário'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[page] || page;

    currentPage = page;

    // Resize charts after page transition
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 60);

    // Close sidebar on mobile
    if (window.innerWidth < 1024) closeSidebar();
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('show');
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
}

// ===================================
// GLOBAL STATE
// ===================================
let monthlyChart = null;
let gastosChart = null;
let categoryChart = null;
let allTransactions = [];
let allAbatimentos = [];
let allOrcamentos = [];
let allRecorrencias = [];
let projectionChart = null;

// ===================================
// THEME MANAGEMENT
// ===================================
function initTheme() {
    localStorage.removeItem('theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    applyDayTradeChartDefaults();
}

function toggleTheme() {
    // Modo claro removido: mantem sempre o tema escuro
    document.documentElement.setAttribute('data-theme', 'dark');
}

function updateThemeIcon() {
    // Modo escuro removido
}

function getChartPalette() {
    return {
        text:         '#7890B0',
        grid:         'rgba(27, 44, 68, 0.55)',
        tooltipBg:    '#0B1426',
        tooltipText:  '#C9D9F0',
        tooltipBorder:'#224A7A',
        bull:         '#34D399',
        bullFill:     'rgba(52, 211, 153, 0.10)',
        bear:         '#F87171',
        bearFill:     'rgba(248, 113, 113, 0.09)',
        neutral:      '#60A5FA',
        neutralFill:  'rgba(96, 165, 250, 0.09)',
        doughnutColors: ['#60A5FA', '#FBBF24', '#A78BFA', '#FB923C'],
        pointBorder:  '#050816'
    };
}

function applyDayTradeChartDefaults() {
    if (typeof Chart === 'undefined') return;
    const palette = getChartPalette();
    Chart.defaults.color = palette.text;
    Chart.defaults.font.family = "'Inter', 'IBM Plex Mono', system-ui, sans-serif";
    Chart.defaults.borderColor = palette.grid;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
}

// ===================================
// UTILITY FUNCTIONS
// ===================================
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
}

function formatDateInput(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toISOString().split('T')[0];
}

function showMessage(text, type = 'info') {
    const toast = document.getElementById('globalToast');
    const legacyMsg = document.getElementById('successMessage');
    if (toast) {
        toast.textContent = text;
        toast.className = 'global-toast ' + type;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 5000);
    }
    if (legacyMsg) {
        legacyMsg.textContent = text;
        legacyMsg.className = 'alert ' + type;
        legacyMsg.style.display = 'block';
        setTimeout(() => { legacyMsg.style.display = 'none'; }, 5000);
    }
}

function showAbatimentoMessage(text, type = 'info') {
    const msg = document.getElementById('abatimentoMessage');
    msg.textContent = text;
    msg.className = 'alert ' + type;
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 4000);
}

// ===================================
// MONTH MANAGEMENT
// ===================================
function getAvailableMonths(transactions) {
    const months = new Set();
    transactions.forEach(t => {
        const transDate = new Date(t.data + 'T00:00:00');
        const monthKey = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
        months.add(monthKey);
    });
    
    const mesesNomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    return Array.from(months)
        .sort()
        .reverse()
        .map(monthKey => {
            const [year, month] = monthKey.split('-');
            const monthName = mesesNomes[parseInt(month) - 1];
            return {
                value: monthKey,
                label: `${monthName}/${year}`
            };
        });
}

function getUniqueMonths() {
    const months = new Set();
    allTransactions.forEach(t => {
        const transDate = new Date((t.data_parcela || t.data) + 'T00:00:00');
        const monthKey = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
        months.add(monthKey);
    });
    return Array.from(months).sort().reverse();
}

function getSelectedMonthOrCurrent() {
    const dashboardMonthEl = document.getElementById('dashboardMonth');
    const selected = dashboardMonthEl ? dashboardMonthEl.value : '';
    if (selected) return selected;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function populateMonthDropdowns() {
    const months = getAvailableMonths(allTransactions);
    const currentMonth = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
    
    const dashboardSelect = document.getElementById('dashboardMonth');
    dashboardSelect.innerHTML = '<option value="">Todos os meses</option>';
    months.forEach(month => {
        const option = document.createElement('option');
        option.value = month.value;
        option.textContent = month.label;
        if (month.value === currentMonth) {
            option.selected = true;
        }
        dashboardSelect.appendChild(option);
    });
    
    const tableSelect = document.getElementById('filterMes');
    tableSelect.innerHTML = '<option value="">Todos os meses</option>';
    months.forEach(month => {
        const option = document.createElement('option');
        option.value = month.value;
        option.textContent = month.label;
        if (month.value === currentMonth) {
            option.selected = true;
        }
        tableSelect.appendChild(option);
    });
}

// ===================================
// TRANSACTIONS MANAGEMENT
// ===================================
async function loadTransactions() {
    try {
        const response = await fetch('/api/transactions');
        const data = await response.json();
        
        console.log('Dados recebidos do backend:', data);
        
        allTransactions = [
            ...(data.receitas || []).map(t => ({...t, tipo: 'receita', data_parcela: t.data})),
            ...(data.gastos_debito || []).map(t => ({...t, tipo: 'debito', data_parcela: t.data})),
            ...(data.gastos_mercado_pago || []).map(t => ({...t, tipo: 'mercado_pago', data_parcela: t.data})),
            ...(data.gastos_nubank || []).map(t => ({...t, tipo: 'nubank', data_parcela: t.data})),
            ...(data.gastos_itau || []).map(t => ({...t, tipo: 'itau', data_parcela: t.data}))
        ].sort((a, b) => new Date(b.data) - new Date(a.data));
        
        console.log('Total de transações carregadas:', allTransactions.length);
        console.log('Amostra de transações:', allTransactions.slice(0, 2));
        
        populateMonthDropdowns();
        
        const dashboardMonth = document.getElementById('dashboardMonth').value;
        
        renderTransactions();
        updateDashboard(data, dashboardMonth);
        await loadCharts();
        await loadStatistics();
        await loadFaturas();
        await atualizarSaldos();
        await loadAnaliseAvancada();
    } catch (error) {
        console.error('Erro ao carregar transações:', error);
        showMessage('Erro ao carregar transações', 'error');
    }
}

function renderTransactions() {
    const tbody = document.getElementById('transactionsTableBody');
    const filterTipo = document.getElementById('filterTipo').value;
    const filterBusca = document.getElementById('filterBusca').value.toLowerCase();
    const filterMes = document.getElementById('filterMes').value;
    
    let filtered = allTransactions;
    
    if (filterMes) {
        filtered = filtered.filter(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const transMonth = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            return transMonth === filterMes;
        });
    }
    
    if (filterTipo) {
        filtered = filtered.filter(t => t.tipo === filterTipo);
    }
    
    if (filterBusca) {
        filtered = filtered.filter(t => 
            t.descricao.toLowerCase().includes(filterBusca)
        );
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhuma transação encontrada</td></tr>';
        return;
    }
    
    const tipoLabels = {
        'receita': 'Receita',
        'debito': 'Débito',
        'mercado_pago': 'Mercado Pago',
        'nubank': 'Nubank',
        'itau': 'Itaú Platinum'
    };

    const tipoBadges = {
        'receita': 'receita',
        'debito': 'debito',
        'mercado_pago': 'mercado-pago',
        'nubank': 'nubank',
        'itau': 'itau'
    };
    
    tbody.innerHTML = filtered.map(transaction => {
        const parcelaInfo = transaction.parcelado 
            ? `<span class="badge parcela">${transaction.parcela_atual}/${transaction.total_parcelas}</span>`
            : '-';
        
        return `
            <tr>
                <td data-label="Selecionar">
                    <input type="checkbox" class="transaction-checkbox" value="${transaction.tipo}|${transaction.id}" onchange="updateDeleteButton()">
                </td>
                <td data-label="Data">${formatDate(transaction.data)}</td>
                <td data-label="Descrição">${transaction.descricao}</td>
                <td data-label="Tipo"><span class="badge ${tipoBadges[transaction.tipo]}">${tipoLabels[transaction.tipo]}</span></td>
                <td data-label="Valor" style="font-weight: 600;">${formatCurrency(transaction.valor)}</td>
                <td data-label="Parcela">${parcelaInfo}</td>
                <td data-label="Ações">
                    <div class="btn-group">
                        <button class="edit-btn btn-sm" onclick='openEditModal(${JSON.stringify(transaction).replace(/'/g, "\\'")})'>Editar</button>
                        <button class="delete-btn btn-sm" onclick="deleteTransaction('${transaction.tipo}', '${transaction.id}')">Excluir</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    updateDeleteButton();
}

async function addTransaction(formData) {
    if (!formData.tipo || !['receita', 'debito', 'mercado_pago', 'nubank', 'itau'].includes(formData.tipo)) {
        showMessage('✗ Selecione o tipo de transação', 'error');
        return;
    }
    const valor = formData.valor;
    if (valor === undefined || valor === null || isNaN(valor) || valor <= 0) {
        showMessage('✗ Informe um valor válido', 'error');
        return;
    }
    if (!formData.descricao || !formData.descricao.trim()) {
        showMessage('✗ Informe a descrição', 'error');
        return;
    }
    if (!formData.data) {
        showMessage('✗ Informe a data', 'error');
        return;
    }
    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        let result;
        try {
            result = await response.json();
        } catch (parseErr) {
            showMessage('✗ Erro no servidor. Verifique se o Supabase está configurado.', 'error');
            return;
        }
        
        if (response.ok && result.success) {
            const currentFilterMes = document.getElementById('filterMes').value;
            const currentFilterTipo = document.getElementById('filterTipo').value;
            const currentFilterBusca = document.getElementById('filterBusca').value;
            
            document.getElementById('transactionForm').reset();
            document.getElementById('num_parcelas').value = 1;
            document.getElementById('data').valueAsDate = new Date();
            document.getElementById('parcelasInfo').style.display = 'none';
            showMessage('✓ Transação adicionada com sucesso!', 'success');
            await loadTransactions();
            
            document.getElementById('filterMes').value = currentFilterMes;
            document.getElementById('filterTipo').value = currentFilterTipo;
            document.getElementById('filterBusca').value = currentFilterBusca;
            renderTransactions();
        } else {
            const errMsg = result.error || 'Erro ao adicionar';
            const details = result.details ? ' ' + result.details : '';
            showMessage('✗ Erro: ' + errMsg + details, 'error');
        }
    } catch (error) {
        showMessage('✗ Erro de conexão: ' + (error.message || 'Verifique sua internet'), 'error');
    }
}

async function deleteTransaction(tipo, id) {
    if (!confirm('Deseja realmente excluir esta transação?')) return;
    
    const currentFilterMes = document.getElementById('filterMes').value;
    const currentFilterTipo = document.getElementById('filterTipo').value;
    const currentFilterBusca = document.getElementById('filterBusca').value;
    
    try {
        const response = await fetch(`/api/transactions/${tipo}/${id}`, { method: 'DELETE' });
        if (response.ok) {
            await loadTransactions();
            document.getElementById('filterMes').value = currentFilterMes;
            document.getElementById('filterTipo').value = currentFilterTipo;
            document.getElementById('filterBusca').value = currentFilterBusca;
            renderTransactions();
            showMessage('✓ Transação excluída com sucesso!', 'success');
        }
    } catch (error) {
        console.error('Erro ao deletar:', error);
        showMessage('✗ Erro ao excluir transação', 'error');
    }
}

async function deleteSelectedTransactions() {
    const checkboxes = document.querySelectorAll('.transaction-checkbox:checked');
    if (checkboxes.length === 0) return;
    
    if (!confirm(`Deseja realmente excluir ${checkboxes.length} transação(ões)?`)) return;
    
    const currentFilterMes = document.getElementById('filterMes').value;
    const currentFilterTipo = document.getElementById('filterTipo').value;
    const currentFilterBusca = document.getElementById('filterBusca').value;
    
    const transactionsToDelete = Array.from(checkboxes).map(cb => {
        const [tipo, id] = cb.value.split('|');
        return { tipo, id };
    });
    
    try {
        let successCount = 0;
        let errorCount = 0;
        
        for (const { tipo, id } of transactionsToDelete) {
            try {
                const response = await fetch(`/api/transactions/${tipo}/${id}`, { method: 'DELETE' });
                if (response.ok) {
                    successCount++;
                } else {
                    errorCount++;
                }
            } catch (error) {
                errorCount++;
            }
        }
        
        await loadTransactions();
        document.getElementById('filterMes').value = currentFilterMes;
        document.getElementById('filterTipo').value = currentFilterTipo;
        document.getElementById('filterBusca').value = currentFilterBusca;
        renderTransactions();
        
        if (errorCount === 0) {
            showMessage(`✓ ${successCount} transação(ões) excluída(s) com sucesso!`, 'success');
        } else {
            showMessage(`${successCount} excluída(s), ${errorCount} erro(s)`, 'error');
        }
    } catch (error) {
        console.error('Erro ao deletar:', error);
        showMessage('✗ Erro ao excluir transações', 'error');
    }
}

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.transaction-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
    updateDeleteButton();
}

function updateDeleteButton() {
    const checkboxes = document.querySelectorAll('.transaction-checkbox:checked');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    if (checkboxes.length > 0) {
        deleteBtn.style.display = 'block';
        deleteBtn.textContent = `Excluir Selecionados (${checkboxes.length})`;
    } else {
        deleteBtn.style.display = 'none';
    }
    
    const allCheckboxes = document.querySelectorAll('.transaction-checkbox');
    const selectAll = document.getElementById('selectAll');
    if (allCheckboxes.length > 0) {
        selectAll.checked = checkboxes.length === allCheckboxes.length;
    }
}

// ===================================
// DASHBOARD UPDATES
// ===================================
function updateDashboard(data, filterMonth = null) {
    let receitasList = data.receitas || [];
    let debitoList = data.gastos_debito || [];
    let mercadoPagoList = data.gastos_mercado_pago || [];
    let nubankList = data.gastos_nubank || [];
    let itauList = data.gastos_itau || [];

    if (filterMonth) {
        receitasList = receitasList.filter(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const transMonth = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            return transMonth === filterMonth;
        });
        debitoList = debitoList.filter(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const transMonth = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            return transMonth === filterMonth;
        });
        mercadoPagoList = mercadoPagoList.filter(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const transMonth = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            return transMonth === filterMonth;
        });
        nubankList = nubankList.filter(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const transMonth = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            return transMonth === filterMonth;
        });
        itauList = itauList.filter(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const transMonth = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            return transMonth === filterMonth;
        });
    }

    const receitas = receitasList.reduce((sum, t) => sum + t.valor, 0);
    const debito = debitoList.reduce((sum, t) => sum + t.valor, 0);
    const mercadoPago = mercadoPagoList.reduce((sum, t) => sum + t.valor, 0);
    const nubank = nubankList.reduce((sum, t) => sum + t.valor, 0);
    const itau = itauList.reduce((sum, t) => sum + t.valor, 0);
    const gastos = debito + mercadoPago + nubank + itau;
    
    renderResumoChart(receitas, gastos);

    const filteredTransactions = filterMonth
        ? allTransactions.filter(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const transMonth = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            return transMonth === filterMonth;
        })
        : allTransactions;

    const totalTransacoesEl = document.getElementById('totalTransacoes');
    if (totalTransacoesEl) totalTransacoesEl.textContent = filteredTransactions.length;
}

// ===================================
// RESUMO DO MÊS (bar chart)
// ===================================
// Plugin: desenha o valor dentro (ou ao lado) de cada barra horizontal
const barValueLabels = {
    id: 'barValueLabels',
    afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '600 10px "IBM Plex Mono", monospace';
        ctx.textBaseline = 'middle';
        chart.data.datasets.forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            if (meta.hidden) return;
            meta.data.forEach((bar, index) => {
                const value = dataset.data[index];
                if (!value || value === 0) return;
                const label = formatCurrency(value);
                const textWidth = ctx.measureText(label).width;
                const segWidth = Math.abs(bar.x - bar.base);
                if (segWidth > textWidth + 14) {
                    // Cabe dentro da barra: texto escuro alinhado ao fim do segmento
                    ctx.fillStyle = '#0B1426';
                    ctx.textAlign = 'right';
                    ctx.fillText(label, bar.x - 7, bar.y);
                } else {
                    // Barra estreita: texto claro logo após a barra
                    ctx.fillStyle = '#C9D9F0';
                    ctx.textAlign = 'left';
                    ctx.fillText(label, bar.x + 7, bar.y);
                }
            });
        });
        ctx.restore();
    }
};

let resumoChart = null;

function renderResumoChart(receitas, gastos) {
    const canvas = document.getElementById('resumoChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const saldo = receitas - gastos;
    const palette = getChartPalette();

    if (resumoChart) resumoChart.destroy();
    resumoChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        plugins: [barValueLabels],
        data: {
            labels: ['Receitas', 'Gastos', 'Saldo do Mês'],
            datasets: [{
                data: [receitas, gastos, saldo],
                backgroundColor: [
                    'rgba(52, 211, 153, 0.85)',
                    'rgba(248, 113, 113, 0.85)',
                    saldo >= 0 ? 'rgba(96, 165, 250, 0.85)' : 'rgba(248, 113, 113, 0.85)'
                ],
                borderColor: palette.pointBorder,
                borderWidth: 2,
                borderRadius: 6,
                barThickness: 30
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: palette.tooltipBg,
                    titleColor: palette.tooltipText,
                    bodyColor: palette.tooltipText,
                    borderColor: palette.tooltipBorder,
                    borderWidth: 2,
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: { label: (ctx) => formatCurrency(ctx.parsed.x) }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        color: palette.text,
                        font: { size: 10, family: 'IBM Plex Mono' },
                        callback: (value) => {
                            if (Math.abs(value) >= 1000) return 'R$ ' + (value / 1000).toFixed(1) + 'k';
                            return formatCurrency(value);
                        }
                    },
                    grid: { color: palette.grid, drawBorder: false }
                },
                y: {
                    ticks: { color: palette.text, font: { size: 11, weight: '600', family: 'IBM Plex Mono' } },
                    grid: { display: false }
                }
            }
        }
    });
}

// ===================================
// FATURAS DOS CARTÕES (bar chart)
// ===================================
let faturasChart = null;

function renderFaturasChart(data) {
    const canvas = document.getElementById('faturasChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const palette = getChartPalette();
    const nubank = data.nubank || { abatido: 0, atual: 0 };
    const mp = data.mercado_pago || { abatido: 0, atual: 0 };
    const itau = data.itau || { abatido: 0, atual: 0 };
    const debitoTotal = (data.debito && data.debito.total) || 0;

    if (faturasChart) faturasChart.destroy();
    faturasChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        plugins: [barValueLabels],
        data: {
            labels: ['Nubank', 'Mercado Pago', 'Itaú Platinum', 'Débito'],
            datasets: [
                {
                    label: 'Pago',
                    data: [nubank.abatido, mp.abatido, itau.abatido, debitoTotal],
                    backgroundColor: 'rgba(52, 211, 153, 0.85)',
                    borderColor: palette.pointBorder,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 24
                },
                {
                    label: 'Pendente',
                    data: [nubank.atual, mp.atual, itau.atual, 0],
                    backgroundColor: 'rgba(251, 146, 60, 0.85)',
                    borderColor: palette.pointBorder,
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 24
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: palette.text,
                        font: { size: 11, weight: '600', family: 'IBM Plex Mono' },
                        padding: 14,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: palette.tooltipBg,
                    titleColor: palette.tooltipText,
                    bodyColor: palette.tooltipText,
                    borderColor: palette.tooltipBorder,
                    borderWidth: 2,
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: { label: (ctx) => ctx.dataset.label + ': ' + formatCurrency(ctx.parsed.x) }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        color: palette.text,
                        font: { size: 10, family: 'IBM Plex Mono' },
                        callback: (value) => {
                            if (Math.abs(value) >= 1000) return 'R$ ' + (value / 1000).toFixed(1) + 'k';
                            return formatCurrency(value);
                        }
                    },
                    grid: { color: palette.grid, drawBorder: false }
                },
                y: {
                    stacked: true,
                    ticks: { color: palette.text, font: { size: 11, weight: '600', family: 'IBM Plex Mono' } },
                    grid: { display: false }
                }
            }
        }
    });
}

async function updateDashboardOnMonthChange() {
    try {
        const response = await fetch('/api/transactions');
        const data = await response.json();
        const dashboardMonth = document.getElementById('dashboardMonth').value;
        updateDashboard(data, dashboardMonth);
        await loadFaturas();
        await atualizarSaldos();
        await loadStatistics();
        await displayTopExpenses();
        await loadAnaliseAvancada();
    } catch (error) {
        console.error('Erro ao atualizar dashboard:', error);
    }
}

// ===================================
// CHARTS
// ===================================
async function loadCharts() {
    try {
        const monthlyResponse = await fetch('/api/transactions/monthly');
        const monthlyData = await monthlyResponse.json();
        
        const transactionsResponse = await fetch('/api/transactions');
        const transactionsData = await transactionsResponse.json();
        
        const totalDebito = (transactionsData.gastos_debito || []).reduce((sum, t) => sum + t.valor, 0);
        const totalMercadoPago = (transactionsData.gastos_mercado_pago || []).reduce((sum, t) => sum + t.valor, 0);
        const totalNubank = (transactionsData.gastos_nubank || []).reduce((sum, t) => sum + t.valor, 0);
        const totalItau = (transactionsData.gastos_itau || []).reduce((sum, t) => sum + t.valor, 0);
        const totalGastos = totalDebito + totalMercadoPago + totalNubank + totalItau;
        
        const palette = getChartPalette();
        const textColor = palette.text;
        const gridColor = palette.grid;
        
        if (monthlyChart) monthlyChart.destroy();
        const ctx1 = document.getElementById('monthlyChart').getContext('2d');
        monthlyChart = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: monthlyData.meses || [],
                datasets: [
                    {
                        label: 'Receitas',
                        data: monthlyData.receitas || [],
                        borderColor: palette.bull,
                        backgroundColor: palette.bullFill,
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: palette.bull,
                        pointBorderColor: palette.pointBorder,
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Gastos',
                        data: monthlyData.gastos || [],
                        borderColor: palette.bear,
                        backgroundColor: palette.bearFill,
                        borderWidth: 3,
                        tension: 0.4,
                        fill: false,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: palette.bear,
                        pointBorderColor: palette.pointBorder,
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Saldo',
                        data: monthlyData.saldos || [],
                        borderColor: palette.neutral,
                        backgroundColor: palette.neutralFill,
                        borderWidth: 3,
                        borderDash: [8, 4],
                        tension: 0.4,
                        fill: false,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: palette.neutral,
                        pointBorderColor: palette.pointBorder,
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: { 
                        labels: { 
                            color: textColor,
                            font: { size: 12, weight: '600', family: 'IBM Plex Mono' },
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        },
                        position: 'top'
                    },
                    tooltip: {
                        backgroundColor: palette.tooltipBg,
                        titleColor: palette.tooltipText,
                        bodyColor: palette.tooltipText,
                        borderColor: palette.tooltipBorder,
                        borderWidth: 2,
                        padding: 14,
                        cornerRadius: 8,
                        titleFont: { size: 14, weight: '600' },
                        bodyFont: { size: 13 },
                        callbacks: {
                            label: (ctx) => {
                                return ctx.dataset.label + ': ' + formatCurrency(ctx.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        ticks: { 
                            color: textColor,
                            font: { size: 10, family: 'IBM Plex Mono' }
                        }, 
                        grid: { 
                            color: gridColor,
                            drawBorder: false
                        } 
                    },
                    y: {
                        ticks: {
                            color: textColor,
                            font: { size: 10, family: 'IBM Plex Mono' },
                            callback: (value) => {
                                if (value >= 1000) return 'R$ ' + (value / 1000).toFixed(1) + 'k';
                                return formatCurrency(value);
                            }
                        },
                        grid: { 
                            color: gridColor,
                            drawBorder: false
                        },
                        beginAtZero: true
                    }
                }
            }
        });
        
        if (gastosChart) gastosChart.destroy();
        const ctx2 = document.getElementById('gastosChart').getContext('2d');
        
        if (totalGastos > 0) {
            gastosChart = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: ['Débito', 'Mercado Pago', 'Nubank', 'Itaú Platinum'],
                    datasets: [{
                        data: [totalDebito, totalMercadoPago, totalNubank, totalItau],
                        backgroundColor: palette.doughnutColors,
                        borderColor: palette.pointBorder,
                        borderWidth: 3,
                        hoverOffset: 12
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                        legend: { 
                            labels: { 
                                color: textColor,
                                font: { size: 12, weight: '600', family: 'IBM Plex Mono' },
                                padding: 14,
                                usePointStyle: true
                            }, 
                            position: 'bottom'
                        },
                        tooltip: {
                            backgroundColor: palette.tooltipBg,
                            titleColor: palette.tooltipText,
                            bodyColor: palette.tooltipText,
                            borderColor: palette.tooltipBorder,
                            borderWidth: 2,
                            padding: 14,
                            cornerRadius: 8,
                            callbacks: {
                                label: (ctx) => {
                                    const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                    const percent = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                    return ctx.label + ': ' + formatCurrency(ctx.parsed) + ' (' + percent + '%)';
                                }
                            }
                        }
                    }
                }
            });
        } else {
            ctx2.clearRect(0, 0, ctx2.canvas.width, ctx2.canvas.height);
            ctx2.fillStyle = textColor;
            ctx2.font = '600 11px IBM Plex Mono, monospace';
            ctx2.textAlign = 'center';
            ctx2.fillText('SEM OPERACOES NO PERIODO', ctx2.canvas.width / 2, ctx2.canvas.height / 2);
        }
    } catch (error) {
        console.error('Erro ao carregar gráficos:', error);
    }
}

// ===================================
// STATISTICS
// ===================================
async function loadStatistics() {
    try {
        const dashboardMonth = document.getElementById('dashboardMonth').value;
        const monthParam = dashboardMonth ? `?month=${dashboardMonth}` : '';
        const response = await fetch('/api/statistics' + monthParam);
        const stats = await response.json();
        
        document.getElementById('statDebito').textContent = formatCurrency(stats.total_debito);
        document.getElementById('statMercadoPago').textContent = formatCurrency(stats.total_mercado_pago);
        document.getElementById('statNubank').textContent = formatCurrency(stats.total_nubank);
        const statItauEl = document.getElementById('statItau');
        if (statItauEl) statItauEl.textContent = formatCurrency(stats.total_itau || 0);

        document.getElementById('pctDebito').textContent = stats.pct_debito.toFixed(1) + '% do total';
        document.getElementById('pctMercadoPago').textContent = stats.pct_mercado_pago.toFixed(1) + '% do total';
        document.getElementById('pctNubank').textContent = stats.pct_nubank.toFixed(1) + '% do total';
        const pctItauEl = document.getElementById('pctItau');
        if (pctItauEl) pctItauEl.textContent = (stats.pct_itau || 0).toFixed(1) + '% do total';
        
        document.getElementById('parceladasInfo').textContent =
            stats.compras_parceladas + ' parceladas';
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
    }
}

// ===================================
// ORCAMENTO POR CATEGORIA
// ===================================
async function loadBudgetSummary(monthFilter = null) {
    try {
        const month = monthFilter || getSelectedMonthOrCurrent();
        const response = await fetch(`/api/orcamentos/summary?month=${month}`);
        const data = await response.json();
        renderBudgetSummary(data);

        const mesInput = document.getElementById('orcamentoMes');
        if (mesInput && !mesInput.value) {
            mesInput.value = month;
        }
    } catch (error) {
        console.error('Erro ao carregar resumo de orcamento:', error);
    }
}

function renderBudgetSummary(data) {
    const grid = document.getElementById('orcamentoResumoGrid');
    const alerts = document.getElementById('orcamentoAlertas');
    if (!grid || !alerts) return;

    const categories = data.categories || [];
    allOrcamentos = categories;

    if (!categories.length) {
        grid.innerHTML = '<div class="stat-item"><div class="stat-label">Orcamento</div><div class="stat-value">Sem dados</div></div>';
        alerts.innerHTML = '<div class="budget-alert-item ok">Nenhum orcamento cadastrado para este mes.</div>';
        return;
    }

    const statusLabel = {
        ok: 'Dentro do limite',
        alerta: 'Alerta de limite',
        estourado: 'Limite estourado',
        sem_orcamento: 'Sem limite cadastrado'
    };

    grid.innerHTML = categories.map(item => {
        const restanteClass = item.restante < 0 ? 'negative' : 'positive';
        const statusClass = item.status === 'estourado' ? 'negative' : item.status === 'alerta' ? 'warning' : '';
        return `
            <div class="stat-item">
                <div class="stat-label">${item.label}</div>
                <div class="stat-value ${restanteClass}">${formatCurrency(item.restante)}</div>
                <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:6px;">
                    Usado ${formatCurrency(item.usado)} de ${formatCurrency(item.limite || 0)}
                </div>
                <div style="font-size:0.74rem;margin-top:6px;" class="${statusClass}">
                    ${statusLabel[item.status] || item.status} (${(item.uso_percentual || 0).toFixed(1)}%)
                </div>
                ${item.id ? `<button class="btn-icon-small" style="margin-top:8px;" onclick="deleteOrcamento('${item.id}')">Excluir</button>` : ''}
            </div>
        `;
    }).join('');

    const alertItems = data.alerts || [];
    if (!alertItems.length) {
        alerts.innerHTML = '<div class="budget-alert-item ok">Sem alertas de orcamento neste mes.</div>';
    } else {
        alerts.innerHTML = alertItems.map(item => `
            <div class="budget-alert-item ${item.status}">
                ${item.label}: uso de ${(item.uso_percentual || 0).toFixed(1)}% (${formatCurrency(item.usado)} / ${formatCurrency(item.limite)})
            </div>
        `).join('');
    }
}

async function saveOrcamento(event) {
    event.preventDefault();

    const payload = {
        mes_referencia: (document.getElementById('orcamentoMes').value || '').trim(),
        categoria: document.getElementById('orcamentoCategoria').value,
        limite: parseFloat(document.getElementById('orcamentoLimite').value || '0'),
        alerta_percentual: parseFloat(document.getElementById('orcamentoAlerta').value || '80')
    };

    if (!payload.mes_referencia || payload.limite <= 0) {
        showMessage('✗ Preencha mes e limite do orcamento.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/orcamentos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showMessage('✓ Orcamento salvo com sucesso!', 'success');
            await loadBudgetSummary(payload.mes_referencia);
            document.getElementById('orcamentoLimite').value = '';
        } else {
            showMessage('✗ Erro ao salvar orcamento: ' + (result.error || 'erro desconhecido'), 'error');
        }
    } catch (error) {
        console.error('Erro ao salvar orcamento:', error);
        showMessage('✗ Erro ao salvar orcamento', 'error');
    }
}

async function deleteOrcamento(id) {
    if (!confirm('Deseja remover este orcamento?')) return;

    try {
        const response = await fetch(`/api/orcamentos/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (response.ok && result.success) {
            showMessage('✓ Orcamento removido.', 'success');
            await loadBudgetSummary();
        } else {
            showMessage('✗ Nao foi possivel remover orcamento.', 'error');
        }
    } catch (error) {
        console.error('Erro ao deletar orcamento:', error);
        showMessage('✗ Erro ao deletar orcamento.', 'error');
    }
}

// ===================================
// RECORRENCIAS
// ===================================
async function loadRecorrencias() {
    try {
        const response = await fetch('/api/recorrencias');
        const data = await response.json();
        allRecorrencias = data || [];
        renderRecorrencias();
    } catch (error) {
        console.error('Erro ao carregar recorrencias:', error);
    }
}

function renderRecorrencias() {
    const tbody = document.getElementById('recorrenciasTableBody');
    if (!tbody) return;

    if (!allRecorrencias.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhuma recorrencia cadastrada</td></tr>';
        return;
    }

    const tipoLabel = {
        receita: 'Receita',
        debito: 'Debito',
        mercado_pago: 'Mercado Pago',
        nubank: 'Nubank',
        itau: 'Itaú Platinum'
    };

    tbody.innerHTML = allRecorrencias.map(item => `
        <tr>
            <td data-label="Tipo"><span class="badge">${tipoLabel[item.tipo] || item.tipo}</span></td>
            <td data-label="Descricao">${item.descricao}</td>
            <td data-label="Valor">${formatCurrency(parseFloat(item.valor || 0))}</td>
            <td data-label="Dia">${item.dia_mes}</td>
            <td data-label="Inicio">${formatDate(item.data_inicio)}</td>
            <td data-label="Status"><span class="rec-status ${item.ativo ? 'ativo' : 'inativo'}">${item.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td data-label="Acoes">
                <div class="btn-group">
                    <button class="edit-btn btn-sm" onclick='toggleRecorrencia(${JSON.stringify(item).replace(/'/g, "\\'")})'>${item.ativo ? 'Pausar' : 'Ativar'}</button>
                    <button class="delete-btn btn-sm" onclick="deleteRecorrencia('${item.id}')">Excluir</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function saveRecorrencia(event) {
    event.preventDefault();

    const payload = {
        tipo: document.getElementById('recTipo').value,
        descricao: document.getElementById('recDescricao').value.trim(),
        valor: parseFloat(document.getElementById('recValor').value || '0'),
        dia_mes: parseInt(document.getElementById('recDiaMes').value || '1', 10),
        data_inicio: document.getElementById('recDataInicio').value,
        ativo: true
    };

    if (!payload.descricao || payload.valor <= 0 || !payload.data_inicio) {
        showMessage('✗ Preencha os dados da recorrencia corretamente.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/recorrencias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showMessage('✓ Recorrencia adicionada!', 'success');
            document.getElementById('recorrenciaForm').reset();
            document.getElementById('recDiaMes').value = '5';
            document.getElementById('recDataInicio').valueAsDate = new Date();
            await loadRecorrencias();
        } else {
            showMessage('✗ Erro ao cadastrar recorrencia: ' + (result.error || 'erro desconhecido'), 'error');
        }
    } catch (error) {
        console.error('Erro ao cadastrar recorrencia:', error);
        showMessage('✗ Erro ao cadastrar recorrencia.', 'error');
    }
}

async function toggleRecorrencia(item) {
    const payload = {
        ...item,
        ativo: !item.ativo
    };

    try {
        const response = await fetch(`/api/recorrencias/${item.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (response.ok && result.success) {
            await loadRecorrencias();
            showMessage(`✓ Recorrencia ${payload.ativo ? 'ativada' : 'pausada'}.`, 'success');
        } else {
            showMessage('✗ Erro ao alterar status da recorrencia.', 'error');
        }
    } catch (error) {
        console.error('Erro ao atualizar recorrencia:', error);
        showMessage('✗ Erro ao atualizar recorrencia.', 'error');
    }
}

async function deleteRecorrencia(id) {
    if (!confirm('Deseja excluir esta recorrencia?')) return;

    try {
        const response = await fetch(`/api/recorrencias/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (response.ok && result.success) {
            await loadRecorrencias();
            showMessage('✓ Recorrencia removida.', 'success');
        } else {
            showMessage('✗ Nao foi possivel remover a recorrencia.', 'error');
        }
    } catch (error) {
        console.error('Erro ao deletar recorrencia:', error);
        showMessage('✗ Erro ao deletar recorrencia.', 'error');
    }
}

async function processarRecorrenciasManual() {
    try {
        const response = await fetch('/api/recorrencias/process', { method: 'POST' });
        const result = await response.json();
        if (response.ok && result.success) {
            const criadas = result.created || 0;
            showMessage(`✓ Processamento concluido: ${criadas} transacao(oes) gerada(s).`, 'success');
            await loadTransactions();
            await loadRecorrencias();
            await loadProjectionD90();
            await loadBudgetSummary();
        } else {
            showMessage('✗ Erro ao processar recorrencias: ' + (result.error || 'erro desconhecido'), 'error');
        }
    } catch (error) {
        console.error('Erro no processamento de recorrencias:', error);
        showMessage('✗ Erro ao processar recorrencias.', 'error');
    }
}

async function processarRecorrenciasSilencioso() {
    try {
        await fetch('/api/recorrencias/process', { method: 'POST' });
    } catch (error) {
        console.error('Falha no processamento silencioso de recorrencias:', error);
    }
}

// ===================================
// PROJECAO D+90
// ===================================
async function loadProjectionD90() {
    try {
        const response = await fetch('/api/projecao-d90');
        const data = await response.json();

        const projSaldoAtual = document.getElementById('projSaldoAtual');
        if (projSaldoAtual) projSaldoAtual.textContent = formatCurrency(data.saldo_atual || 0);

        const base = (data.cenarios || {}).base || {};
        const otimista = (data.cenarios || {}).otimista || {};
        const pessimista = (data.cenarios || {}).pessimista || {};

        const baseD30 = ((base.d30 || {}).saldo) || 0;
        const baseD60 = ((base.d60 || {}).saldo) || 0;
        const baseD90 = ((base.d90 || {}).saldo) || 0;
        const otD90 = ((otimista.d90 || {}).saldo) || 0;
        const peD90 = ((pessimista.d90 || {}).saldo) || 0;

        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = formatCurrency(value);
        };
        setText('projBaseD30', baseD30);
        setText('projBaseD60', baseD60);
        setText('projBaseD90', baseD90);
        setText('projOtimistaD90', otD90);
        setText('projPessimistaD90', peD90);

        const info = document.getElementById('projBaseInfo');
        if (info && data.base_historica) {
            const baseHistorica = data.base_historica;
            info.textContent = `Base historica: ${baseHistorica.meses_avaliados || 0} mes(es), media de receitas ${formatCurrency(baseHistorica.media_receitas_mensais || 0)} e media de gastos ${formatCurrency(baseHistorica.media_gastos_mensais || 0)} por mes.`;
        }

        renderProjectionChart(data.cenarios || {});
    } catch (error) {
        console.error('Erro ao carregar projecao D+90:', error);
    }
}

function renderProjectionChart(cenarios) {
    const canvas = document.getElementById('projectionChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const palette = getChartPalette();
    const labels = ['D+30', 'D+60', 'D+90'];

    const optimisticData = [
        ((cenarios.otimista || {}).d30 || {}).saldo || 0,
        ((cenarios.otimista || {}).d60 || {}).saldo || 0,
        ((cenarios.otimista || {}).d90 || {}).saldo || 0
    ];

    const baseData = [
        ((cenarios.base || {}).d30 || {}).saldo || 0,
        ((cenarios.base || {}).d60 || {}).saldo || 0,
        ((cenarios.base || {}).d90 || {}).saldo || 0
    ];

    const pessimisticData = [
        ((cenarios.pessimista || {}).d30 || {}).saldo || 0,
        ((cenarios.pessimista || {}).d60 || {}).saldo || 0,
        ((cenarios.pessimista || {}).d90 || {}).saldo || 0
    ];

    if (projectionChart) projectionChart.destroy();

    projectionChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Otimista',
                    data: optimisticData,
                    borderColor: palette.bull,
                    backgroundColor: palette.bullFill,
                    borderWidth: 3,
                    tension: 0.35,
                    fill: false
                },
                {
                    label: 'Base',
                    data: baseData,
                    borderColor: palette.neutral,
                    backgroundColor: palette.neutralFill,
                    borderWidth: 3,
                    tension: 0.35,
                    fill: false
                },
                {
                    label: 'Pessimista',
                    data: pessimisticData,
                    borderColor: palette.bear,
                    backgroundColor: palette.bearFill,
                    borderWidth: 3,
                    tension: 0.35,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: palette.text }
                },
                tooltip: {
                    backgroundColor: palette.tooltipBg,
                    titleColor: palette.tooltipText,
                    bodyColor: palette.tooltipText,
                    borderColor: palette.tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: palette.text },
                    grid: { color: palette.grid }
                },
                y: {
                    ticks: {
                        color: palette.text,
                        callback: value => formatCurrency(value)
                    },
                    grid: { color: palette.grid }
                }
            }
        }
    });
}

// ===================================
// FATURAS (INVOICES)
// ===================================
async function loadFaturas() {
    try {
        const dashboardMonth = document.getElementById('dashboardMonth').value;
        const monthParam = dashboardMonth ? `?month=${dashboardMonth}` : '';
        const response = await fetch('/api/faturas' + monthParam);
        const data = await response.json();

        renderFaturasChart(data);

        await atualizarSaldos();
    } catch (error) {
        console.error('Erro ao carregar faturas:', error);
    }
}

// ===================================
// RESERVA / DINHEIRO GUARDADO
// ===================================
let dinheiroGuardadoData = { valor: 0, descricao: 'Reserva' };
let reservaMovimentos = [];

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function loadDinheiroGuardado() {
    try {
        const response = await fetch('/api/dinheiro-guardado');
        const data = await response.json();
        dinheiroGuardadoData = {
            valor: parseFloat(data.valor || 0),
            descricao: data.descricao || 'Reserva'
        };
        const valorEl = document.getElementById('dinheiroGuardado');
        if (valorEl) valorEl.textContent = formatCurrency(dinheiroGuardadoData.valor);
    } catch (error) {
        console.error('Erro ao carregar dinheiro guardado:', error);
    }
}

async function loadReserva() {
    try {
        const response = await fetch('/api/reserva/movimentos');
        const data = await response.json();
        reservaMovimentos = data.movimentos || [];
        const total = parseFloat(data.total || 0);
        dinheiroGuardadoData.valor = total;
        const totalEl = document.getElementById('reservaTotal');
        if (totalEl) totalEl.textContent = formatCurrency(total);
        const kpiEl = document.getElementById('dinheiroGuardado');
        if (kpiEl) kpiEl.textContent = formatCurrency(total);
        renderReserva();
    } catch (error) {
        console.error('Erro ao carregar reserva:', error);
    }
}

function renderReserva() {
    const tbody = document.getElementById('reservaTableBody');
    if (!tbody) return;
    if (!reservaMovimentos.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Nenhum movimento ainda. Guarde dinheiro no formulário acima.</td></tr>';
        return;
    }
    tbody.innerHTML = reservaMovimentos.map(m => {
        const isGuardar = m.tipo === 'guardar';
        const cor = isGuardar ? '#22c55e' : '#f59e0b';
        const sinal = isGuardar ? '+' : '−';
        const label = isGuardar ? 'GUARDAR' : 'RETIRAR';
        return `<tr>
            <td>${formatDate(m.data)}</td>
            <td>${escapeHtml(m.descricao)}</td>
            <td><span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:0.7rem;font-weight:700;background:${cor}22;color:${cor};">${label}</span></td>
            <td style="color:${cor};font-weight:600;">${sinal} ${formatCurrency(m.valor)}</td>
            <td><button type="button" class="btn-danger btn-sm" onclick="deleteReservaMovimento('${m.id}')">Excluir</button></td>
        </tr>`;
    }).join('');
}

async function addReservaMovimento(event) {
    event.preventDefault();
    const payload = {
        tipo: document.getElementById('reservaTipo').value,
        valor: parseFloat(document.getElementById('reservaValor').value || '0'),
        descricao: document.getElementById('reservaDescricao').value.trim(),
        data: document.getElementById('reservaData').value
    };
    if (isNaN(payload.valor) || payload.valor <= 0) {
        showReservaMessage('✗ Informe um valor maior que zero', 'error');
        return;
    }
    try {
        const response = await fetch('/api/reserva/movimentos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showReservaMessage('✓ Movimento registrado!', 'success');
            document.getElementById('reservaValor').value = '';
            document.getElementById('reservaDescricao').value = '';
            await loadReserva();
            await atualizarSaldos();
        } else {
            showReservaMessage('✗ ' + (result.error || 'Erro desconhecido'), 'error');
        }
    } catch (error) {
        console.error('Erro ao registrar movimento da reserva:', error);
        showReservaMessage('✗ Erro de conexão ao registrar movimento.', 'error');
    }
}

async function deleteReservaMovimento(id) {
    if (!confirm('Excluir este movimento da reserva?')) return;
    try {
        const response = await fetch('/api/reserva/movimentos/' + id, { method: 'DELETE' });
        const result = await response.json();
        if (response.ok && result.success) {
            showReservaMessage('✓ Movimento excluído.', 'success');
            await loadReserva();
            await atualizarSaldos();
        } else {
            showReservaMessage('✗ ' + (result.error || 'Erro ao excluir'), 'error');
        }
    } catch (error) {
        console.error('Erro ao excluir movimento da reserva:', error);
        showReservaMessage('✗ Erro de conexão ao excluir.', 'error');
    }
}

function showReservaMessage(text, type) {
    const el = document.getElementById('reservaMessage');
    if (!el) return;
    el.textContent = text;
    el.className = 'alert ' + (type === 'error' ? 'error' : 'success');
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ===================================
// SALDOS (BALANCES)
// ===================================
async function atualizarSaldos() {
    try {
        const dashboardMonth = document.getElementById('dashboardMonth').value;
        const response = await fetch('/api/transactions');
        const data = await response.json();
        
        const abatimentosResponse = await fetch('/api/abatimentos');
        const abatimentos = await abatimentosResponse.json();

        const monthParam = dashboardMonth ? `?month=${dashboardMonth}` : '';
        const faturasResponse = await fetch('/api/faturas' + monthParam);
        const faturasData = await faturasResponse.json();

        const monthlyData = {};
        
        (data.receitas || []).forEach(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const monthKey = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { receitas: 0, debito: 0, abatimentos: 0, faturas: 0, reserva: 0 };
            }
            monthlyData[monthKey].receitas += t.valor;
        });
        
        (data.gastos_debito || []).forEach(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const monthKey = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { receitas: 0, debito: 0, abatimentos: 0, faturas: 0, reserva: 0 };
            }
            monthlyData[monthKey].debito += t.valor;
        });
        
        [...(data.gastos_mercado_pago || []), ...(data.gastos_nubank || []), ...(data.gastos_itau || [])].forEach(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const monthKey = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { receitas: 0, debito: 0, abatimentos: 0, faturas: 0, reserva: 0 };
            }
            monthlyData[monthKey].faturas += t.valor;
        });
        
        (abatimentos || []).forEach(a => {
            const abatDate = new Date(a.data + 'T00:00:00');
            const monthKey = abatDate.getFullYear() + '-' + String(abatDate.getMonth() + 1).padStart(2, '0');
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { receitas: 0, debito: 0, abatimentos: 0, faturas: 0, reserva: 0 };
            }
            monthlyData[monthKey].abatimentos += parseFloat(a.valor);
        });

        // Reserva: guardar tira do caixa (negativo), retirar devolve (positivo)
        try {
            const reservaResp = await fetch('/api/reserva/movimentos');
            const reservaJson = await reservaResp.json();
            (reservaJson.movimentos || []).forEach(m => {
                if (!m.data) return;
                const mDate = new Date(m.data + 'T00:00:00');
                const monthKey = mDate.getFullYear() + '-' + String(mDate.getMonth() + 1).padStart(2, '0');
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { receitas: 0, debito: 0, abatimentos: 0, faturas: 0, reserva: 0 };
                }
                const v = parseFloat(m.valor) || 0;
                monthlyData[monthKey].reserva += (m.tipo === 'retirar' ? v : -v);
            });
        } catch (e) {
            console.error('Erro ao carregar reserva nos saldos:', e);
        }

        const sortedMonths = Object.keys(monthlyData).sort();
        const hoje = new Date();
        const mesAtual = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
        const isMesFuturo = dashboardMonth && dashboardMonth > mesAtual;
        
        // saldoAcumuladoAtual → caixa real (receitas − débito − abatimentos) acumulado até o mês
        // sobrouAnterior      → Saldo Atual dos meses anteriores (o que realmente rolou)
        let saldoAcumuladoAtual = 0;
        let sobrouAnterior = 0;
        let totalReceitas = 0, totalDebito = 0, totalFaturas = 0, totalAbatimentos = 0;

        for (const month of sortedMonths) {
            const monthData = monthlyData[month];
            totalReceitas += monthData.receitas;
            totalDebito += monthData.debito;
            totalFaturas += monthData.faturas;
            totalAbatimentos += monthData.abatimentos;

            const saldoCaixa = monthData.receitas - monthData.debito - monthData.abatimentos + (monthData.reserva || 0);

            if (dashboardMonth && month === dashboardMonth) {
                saldoAcumuladoAtual += saldoCaixa;
                break;
            }

            saldoAcumuladoAtual += saldoCaixa;
            sobrouAnterior += saldoCaixa;
        }

        const monthData = dashboardMonth && monthlyData[dashboardMonth] ? monthlyData[dashboardMonth] : { receitas: 0, debito: 0, faturas: 0, abatimentos: 0, reserva: 0 };
        const totalGastosMes = monthData.debito + monthData.faturas;
        let saldoProjetado;
        let sobrouExibido = sobrouAnterior;

        if (isMesFuturo) {
            // Mês futuro: rola Saldo Projetado a partir do mês atual
            // Precisamos do Sobrou ANTES do mês atual (para calcular Saldo Projetado do mês atual)
            let sobrouAntesMesAtual = 0;
            for (const month of sortedMonths) {
                if (month >= mesAtual) break;
                const md = monthlyData[month];
                sobrouAntesMesAtual += md.receitas - md.debito - md.abatimentos + (md.reserva || 0);
            }
            const mesAtualData = monthlyData[mesAtual] || { receitas: 0, debito: 0, faturas: 0, abatimentos: 0, reserva: 0 };
            let saldoProjRolado = sobrouAntesMesAtual + mesAtualData.receitas - (mesAtualData.debito + mesAtualData.faturas) + (mesAtualData.reserva || 0);
            
            let monthKey = mesAtual;
            while (true) {
                const [ano, mes] = monthKey.split('-').map(Number);
                const nextMes = mes === 12 ? 1 : mes + 1;
                const nextAno = mes === 12 ? ano + 1 : ano;
                monthKey = nextAno + '-' + String(nextMes).padStart(2, '0');
                if (monthKey > dashboardMonth) break;
                sobrouExibido = saldoProjRolado;
                const md = monthlyData[monthKey] || { receitas: 0, debito: 0, faturas: 0, abatimentos: 0, reserva: 0 };
                const gastos = (md.debito || 0) + (md.faturas || 0);
                saldoProjRolado = saldoProjRolado + (md.receitas || 0) - gastos + (md.reserva || 0);
            }
            saldoProjetado = saldoProjRolado;
        } else {
            // Mês atual ou anterior: usa Sobrou real (Saldo Atual)
            saldoProjetado = sobrouAnterior + monthData.receitas - totalGastosMes + (monthData.reserva || 0);
        }
        
        const saldoAtualEl = document.getElementById('saldoAtual');
        saldoAtualEl.textContent = formatCurrency(saldoAcumuladoAtual);
        saldoAtualEl.className = 'kpi-mini-value ' + (saldoAcumuladoAtual >= 0 ? 'positive' : 'negative');

        const saldoAnteriorEl = document.getElementById('saldoMesAnterior');
        if (saldoAnteriorEl) {
            saldoAnteriorEl.textContent = formatCurrency(sobrouExibido);
            saldoAnteriorEl.className = 'kpi-mini-value ' + (sobrouExibido >= 0 ? 'positive' : 'negative');
        }
        const saldoAnteriorFooter = document.getElementById('saldoMesAnteriorFooter');
        if (saldoAnteriorFooter) {
            saldoAnteriorFooter.textContent = isMesFuturo 
                ? 'Saldo Projetado do mês passado (projeção que rolou)' 
                : 'Saldo Atual do mês passado (caixa real que rolou)';
        }

        const saldoProjetadoEl = document.getElementById('saldoProjetado');
        saldoProjetadoEl.textContent = formatCurrency(saldoProjetado);
        saldoProjetadoEl.className = 'kpi-mini-value ' + (saldoProjetado >= 0 ? 'positive' : 'negative');
        
        // Preencher painel de diagnóstico
        const diagReceitas = document.getElementById('diagReceitas');
        const diagDebito = document.getElementById('diagDebito');
        const diagFaturas = document.getElementById('diagFaturas');
        const diagAbatimentos = document.getElementById('diagAbatimentos');
        const diagAviso = document.getElementById('diagAviso');
        if (diagReceitas) diagReceitas.textContent = formatCurrency(totalReceitas);
        if (diagDebito) diagDebito.textContent = formatCurrency(totalDebito);
        if (diagFaturas) diagFaturas.textContent = formatCurrency(totalFaturas);
        if (diagAbatimentos) diagAbatimentos.textContent = formatCurrency(totalAbatimentos);
        
        // Aviso explicativo (página Análises)
        if (diagAviso) {
            let txt = `Saldo Atual = Receitas + Sobrou − Débitos − Abatimentos. Saldo Projetado = Receitas + Sobrou − Total Gastos.`;
            if (isMesFuturo) txt += ` Para meses futuros, o Saldo Projetado rola mês a mês (projeção).`;
            diagAviso.textContent = txt;
        }
    } catch (error) {
        console.error('Erro ao calcular saldos:', error);
    }
}

// ===================================
// ABATIMENTOS (DEDUCTIONS)
// ===================================
async function loadAbatimentos() {
    try {
        const response = await fetch('/api/abatimentos');
        allAbatimentos = await response.json();
        renderAbatimentos(allAbatimentos);
    } catch (error) {
        console.error('Erro ao carregar abatimentos:', error);
    }
}

function renderAbatimentos(abatimentos) {
    const tbody = document.getElementById('abatimentosTableBody');
    
    if (!abatimentos || abatimentos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum abatimento encontrado</td></tr>';
        return;
    }
    
    const sorted = [...abatimentos].sort((a, b) => new Date(b.data) - new Date(a.data));
    
    tbody.innerHTML = sorted.map(abatimento => {
        const cartaoLabels = {
            'mercado_pago': 'Mercado Pago',
            'nubank': 'Nubank',
            'itau': 'Itaú Platinum'
        };
        const cartaoLabel = cartaoLabels[abatimento.tipo_cartao] || abatimento.tipo_cartao;
        
        return `
            <tr>
                <td data-label="Data">${formatDate(abatimento.data)}</td>
                <td data-label="Cartão"><span class="badge ${abatimento.tipo_cartao}">${cartaoLabel}</span></td>
                <td data-label="Descrição">${abatimento.descricao || '-'}</td>
                <td data-label="Valor" style="font-weight: 600;">${formatCurrency(abatimento.valor)}</td>
                <td data-label="Ações">
                    <div class="btn-group">
                        <button class="edit-btn btn-sm" onclick='openEditAbatimentoModal(${JSON.stringify(abatimento).replace(/'/g, "\\'")})'>Editar</button>
                        <button class="delete-btn btn-sm" onclick="deleteAbatimento('${abatimento.id}')">Excluir</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function deleteAbatimento(id) {
    if (!confirm('Deseja realmente excluir este abatimento?')) return;
    
    try {
        const response = await fetch(`/api/abatimentos/${id}`, { method: 'DELETE' });
        if (response.ok) {
            await loadAbatimentos();
            await loadFaturas();
            showAbatimentoMessage('✓ Abatimento excluído com sucesso!', 'success');
        }
    } catch (error) {
        console.error('Erro ao deletar:', error);
        showAbatimentoMessage('✗ Erro ao excluir abatimento', 'error');
    }
}

// ===================================
// MODALS
// ===================================
function openEditModal(transaction) {
    const modal = document.getElementById('editModal');
    document.getElementById('editId').value = transaction.id;
    document.getElementById('editTipo').value = transaction.tipo;
    document.getElementById('editTipoSelect').value = transaction.tipo;
    document.getElementById('editDescricao').value = transaction.descricao;
    document.getElementById('editValor').value = transaction.valor;
    document.getElementById('editData').value = transaction.data;
    document.getElementById('editParcelGroupId').value = transaction.parcel_group_id || '';
    document.getElementById('editParcelado').value = transaction.parcelado ? 'true' : 'false';
    
    if (transaction.parcelado) {
        document.getElementById('editParcelasGroup').style.display = 'block';
        document.getElementById('editNumParcelas').value = transaction.total_parcelas || 1;
        document.getElementById('editValor').value = transaction.valor_total || transaction.valor;
        updateEditParcelasInfo();
    } else {
        document.getElementById('editParcelasGroup').style.display = 'none';
        document.getElementById('editParcelasInfo').style.display = 'none';
    }
    
    modal.style.display = 'block';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

function openEditAbatimentoModal(abatimento) {
    const modal = document.getElementById('editAbatimentoModal');
    document.getElementById('editAbatimentoId').value = abatimento.id;
    document.getElementById('editAbatimentoTipoCartao').value = abatimento.tipo_cartao;
    document.getElementById('editAbatimentoValor').value = abatimento.valor;
    document.getElementById('editAbatimentoData').value = abatimento.data;
    document.getElementById('editAbatimentoDescricao').value = abatimento.descricao || '';
    
    modal.style.display = 'block';
}

function closeEditAbatimentoModal() {
    document.getElementById('editAbatimentoModal').style.display = 'none';
}

// ===================================
// PARCELAS (INSTALLMENTS) INFO
// ===================================
function updateParcelasInfo() {
    const numParcelas = parseInt(document.getElementById('num_parcelas').value) || 1;
    const valorTotal = parseFloat(document.getElementById('valor').value) || 0;
    const infoDiv = document.getElementById('parcelasInfo');
    
    if (numParcelas > 1 && valorTotal > 0) {
        const valorParcela = valorTotal / numParcelas;
        infoDiv.innerHTML = `<strong style="font-weight: 600;">INFO:</strong> ${numParcelas}x de ${formatCurrency(valorParcela)} = Total: ${formatCurrency(valorTotal)}`;
        infoDiv.style.display = 'block';
    } else {
        infoDiv.style.display = 'none';
    }
}

function updateEditParcelasInfo() {
    const numParcelas = parseInt(document.getElementById('editNumParcelas').value) || 1;
    const valorTotal = parseFloat(document.getElementById('editValor').value) || 0;
    const infoDiv = document.getElementById('editParcelasInfo');
    
    if (numParcelas > 1 && valorTotal > 0) {
        const valorParcela = valorTotal / numParcelas;
        infoDiv.innerHTML = `<strong style="font-weight: 600;">INFO:</strong> ${numParcelas}x de ${formatCurrency(valorParcela)} = Total: ${formatCurrency(valorTotal)}`;
        infoDiv.style.display = 'block';
    } else {
        infoDiv.style.display = 'none';
    }
}

// ===================================
// EXPORT FUNCTIONS
// ===================================
function exportToCSV() {
    const csv = ['Data,Tipo,Descrição,Categoria,Valor,Parcela'];
    
    allTransactions.forEach(t => {
        const tipoLabels = {
            'receita': 'Receita',
            'debito': 'Débito',
            'mercado_pago': 'Mercado Pago',
            'nubank': 'Nubank',
            'itau': 'Itaú Platinum'
        };
        
        const parcela = t.parcelado ? `${t.parcela_atual}/${t.total_parcelas}` : '-';
        csv.push(`${t.data},${tipoLabels[t.tipo]},${t.descricao},${t.valor},${parcela}`);
    });
    
    const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `finances-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showMessage('✓ Dados exportados com sucesso!', 'success');
}

function exportToPDF() {
    window.print();
}

function toggleExportMenu() {
    const menu = document.getElementById('exportMenu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// ===================================
// FORM HANDLERS
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    // Exibe data/hora do último deploy
    fetch('/api/version').then(r => r.json()).then(v => {
        const el = document.getElementById('deployDate');
        if (el && v.date && v.date !== 'N/A') {
            const d = new Date(v.date);
            el.textContent = d.toLocaleString('pt-BR') + ' (commit ' + v.hash + ')';
        } else if (el) {
            el.textContent = 'N/A';
        }
    }).catch(() => {});

    // Transaction Form
    const transactionForm = document.getElementById('transactionForm');
    if (transactionForm) {
        transactionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tipoEl = document.getElementById('tipo');
            const descricaoEl = document.getElementById('descricao');
            const valorEl = document.getElementById('valor');
            const dataEl = document.getElementById('data');
            const numParcelasEl = document.getElementById('num_parcelas');
            if (!tipoEl || !descricaoEl || !valorEl || !dataEl || !numParcelasEl) {
                showMessage('✗ Formulário incompleto. Recarregue a página.', 'error');
                return;
            }
            const formData = {
                tipo: tipoEl.value,
                descricao: descricaoEl.value.trim(),
                valor: parseFloat(valorEl.value) || 0,
                data: dataEl.value,
                num_parcelas: parseInt(numParcelasEl.value) || 1
            };
            const submitBtn = transactionForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Salvando...';
            }
            await addTransaction(formData);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Adicionar Transação';
            }
        });
    }
    
    // Edit Transaction Form
    document.getElementById('editForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const transactionId = document.getElementById('editId').value;
        const tipo = document.getElementById('editTipo').value;
        const isParcelado = document.getElementById('editParcelado').value === 'true';
        
        const formData = {
            tipo: document.getElementById('editTipoSelect').value,
            descricao: document.getElementById('editDescricao').value,
            valor: parseFloat(document.getElementById('editValor').value),
            data: document.getElementById('editData').value,
        };
        
        if (isParcelado) {
            formData.num_parcelas = parseInt(document.getElementById('editNumParcelas').value) || 1;
            formData.valor_total = formData.valor;
        }
        
        try {
            const response = await fetch(`/api/transactions/${tipo}/${transactionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                const currentFilterMes = document.getElementById('filterMes').value;
                const currentFilterTipo = document.getElementById('filterTipo').value;
                const currentFilterBusca = document.getElementById('filterBusca').value;
                
                closeEditModal();
                showMessage('✓ Transação atualizada com sucesso!', 'success');
                await loadTransactions();
                
                document.getElementById('filterMes').value = currentFilterMes;
                document.getElementById('filterTipo').value = currentFilterTipo;
                document.getElementById('filterBusca').value = currentFilterBusca;
                renderTransactions();
            } else {
                showMessage('✗ Erro: ' + (result.error || 'Erro ao atualizar'), 'error');
            }
        } catch (error) {
            showMessage('✗ Erro de conexão: ' + error.message, 'error');
        }
    });
    
    // Abatimento Form
    document.getElementById('abatimentoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            tipo_cartao: document.getElementById('tipo_cartao_abatimento').value,
            valor: parseFloat(document.getElementById('valor_abatimento').value),
            data: document.getElementById('data_abatimento').value,
            descricao: document.getElementById('descricao_abatimento').value || ''
        };
        
        try {
            const response = await fetch('/api/abatimentos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                document.getElementById('abatimentoForm').reset();
                document.getElementById('data_abatimento').valueAsDate = new Date();
                showAbatimentoMessage('✓ Abatimento adicionado com sucesso!', 'success');
                await loadFaturas();
                await loadAbatimentos();
                loadTransactions();
            } else {
                showAbatimentoMessage('✗ Erro: ' + (result.error || 'Erro ao adicionar abatimento'), 'error');
            }
        } catch (error) {
            showAbatimentoMessage('✗ Erro de conexão: ' + error.message, 'error');
        }
    });
    
    // Edit Abatimento Form
    document.getElementById('editAbatimentoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const abatimentoId = document.getElementById('editAbatimentoId').value;
        
        const formData = {
            tipo_cartao: document.getElementById('editAbatimentoTipoCartao').value,
            valor: parseFloat(document.getElementById('editAbatimentoValor').value),
            data: document.getElementById('editAbatimentoData').value,
            descricao: document.getElementById('editAbatimentoDescricao').value || ''
        };
        
        try {
            const response = await fetch(`/api/abatimentos/${abatimentoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                closeEditAbatimentoModal();
                showAbatimentoMessage('✓ Abatimento atualizado com sucesso!', 'success');
                await loadAbatimentos();
                await loadFaturas();
            } else {
                showAbatimentoMessage('✗ Erro: ' + (result.error || 'Erro ao atualizar'), 'error');
            }
        } catch (error) {
            showAbatimentoMessage('✗ Erro de conexão: ' + error.message, 'error');
        }
    });
    
    // Event Listeners
    document.getElementById('dashboardMonth').addEventListener('change', updateDashboardOnMonthChange);
    document.getElementById('filterMes').addEventListener('change', renderTransactions);
    document.getElementById('filterTipo').addEventListener('change', renderTransactions);
    document.getElementById('filterBusca').addEventListener('input', renderTransactions);
    
    
    document.getElementById('num_parcelas').addEventListener('input', updateParcelasInfo);
    document.getElementById('valor').addEventListener('input', updateParcelasInfo);
    document.getElementById('editNumParcelas').addEventListener('input', updateEditParcelasInfo);
    document.getElementById('editValor').addEventListener('input', updateEditParcelasInfo);

    const orcamentoForm = document.getElementById('orcamentoForm');
    if (orcamentoForm) {
        orcamentoForm.addEventListener('submit', saveOrcamento);
    }

    const recorrenciaForm = document.getElementById('recorrenciaForm');
    if (recorrenciaForm) {
        recorrenciaForm.addEventListener('submit', saveRecorrencia);
    }

    const reservaForm = document.getElementById('reservaForm');
    if (reservaForm) {
        reservaForm.addEventListener('submit', addReservaMovimento);
    }

    // Set default dates
    document.getElementById('data').valueAsDate = new Date();
    document.getElementById('data_abatimento').valueAsDate = new Date();
    const reservaData = document.getElementById('reservaData');
    if (reservaData) reservaData.valueAsDate = new Date();
    const recDataInicio = document.getElementById('recDataInicio');
    if (recDataInicio) recDataInicio.valueAsDate = new Date();
    const orcamentoMes = document.getElementById('orcamentoMes');
    if (orcamentoMes && !orcamentoMes.value) {
        const now = new Date();
        orcamentoMes.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    
    // Close modals on outside click
    window.onclick = function(event) {
        const editModal = document.getElementById('editModal');
        const editAbatimentoModal = document.getElementById('editAbatimentoModal');
        if (event.target == editModal) {
            closeEditModal();
        }
        if (event.target == editAbatimentoModal) {
            closeEditAbatimentoModal();
        }
    }
    
    // Bottom Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const target = this.getAttribute('data-target');
            if (target) {
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                this.classList.add('active');
                const element = document.querySelector(target);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    });
    
    // Initial Load
    (async () => {
        await loadTransactions();
        await loadAbatimentos();
        await loadDinheiroGuardado();
        await loadReserva();
        await calculateFinancialHealth();
        await displayTopExpenses();
        await loadAnaliseAvancada();

        setTimeout(() => {
            updateEvolutionChart();
            updatePaymentAnalysis();
            renderCalendar();
        }, 500);
    })();
});

// ===================================
// ANÁLISES AVANÇADAS
// ===================================
let gastosCartaoTempoChart = null;
let patrimonioChart = null;

function mesKey(dateStr) {
    const d = new Date((dateStr || '') + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function mesLabel(monthKey) {
    const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const partes = monthKey.split('-');
    return nomes[parseInt(partes[1], 10) - 1] + '/' + partes[0].slice(2);
}

function tooltipBase(palette) {
    return {
        backgroundColor: palette.tooltipBg,
        titleColor: palette.tooltipText,
        bodyColor: palette.tooltipText,
        borderColor: palette.tooltipBorder,
        borderWidth: 2,
        padding: 12,
        cornerRadius: 8
    };
}

async function loadAnaliseAvancada() {
    let reservaMovs = [];
    try {
        const rRes = await fetch('/api/reserva/movimentos');
        const rJson = await rRes.json();
        reservaMovs = rJson.movimentos || [];
    } catch (e) {
        console.error('Erro ao carregar dados das análises:', e);
    }
    renderComparativoMensal(reservaMovs);
    renderGastosCartaoTempo();
    renderOndeMaisGasta();
    renderPatrimonioChart(reservaMovs);
}

function renderComparativoMensal(reservaMovs) {
    const container = document.getElementById('comparativoMensal');
    if (!container) return;

    const meses = [...new Set(allTransactions.map(t => mesKey(t.data)).filter(Boolean))].sort().reverse();
    if (meses.length === 0) {
        container.innerHTML = '<p class="empty-state">Sem dados para comparar.</p>';
        return;
    }
    const mesAtual = meses[0];
    const mesAnterior = meses[1] || null;

    function resumoDoMes(mk) {
        const r = { receitas: 0, gastos: 0, saldo: 0, guardado: 0 };
        if (!mk) return r;
        allTransactions.forEach(t => {
            if (mesKey(t.data) !== mk) return;
            if (t.tipo === 'receita') r.receitas += t.valor;
            else r.gastos += t.valor;
        });
        reservaMovs.forEach(m => {
            if (mesKey(m.data) !== mk) return;
            r.guardado += (m.tipo === 'guardar' ? m.valor : -m.valor);
        });
        r.saldo = r.receitas - r.gastos;
        return r;
    }

    const atual = resumoDoMes(mesAtual);
    const ant = resumoDoMes(mesAnterior);
    const metrics = [
        { label: 'Receitas', key: 'receitas', bomSobe: true },
        { label: 'Gastos', key: 'gastos', bomSobe: false },
        { label: 'Saldo do Mês', key: 'saldo', bomSobe: true },
        { label: 'Guardado', key: 'guardado', bomSobe: true }
    ];

    let html = `<div class="comparativo-head">
        <span>Métrica</span>
        <span>${mesAnterior ? mesLabel(mesAnterior) : '—'}</span>
        <span>${mesLabel(mesAtual)}</span>
        <span style="text-align:right;">Variação</span>
    </div>`;

    metrics.forEach(mt => {
        const va = ant[mt.key];
        const vb = atual[mt.key];
        let varText = '—';
        let varClass = 'flat';
        if (mesAnterior) {
            const diff = vb - va;
            if (Math.abs(diff) > 0.009) {
                if (Math.abs(va) > 0.009) {
                    const pct = (diff / Math.abs(va)) * 100;
                    varText = (diff > 0 ? '▲ ' : '▼ ') + (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%';
                } else {
                    varText = diff > 0 ? '▲ novo' : '▼';
                }
                varClass = ((diff > 0) === mt.bomSobe) ? 'good' : 'bad';
            }
        }
        html += `<div class="comparativo-row">
            <span class="comparativo-label">${mt.label}</span>
            <span class="comparativo-val">${formatCurrency(va)}</span>
            <span class="comparativo-val strong">${formatCurrency(vb)}</span>
            <span class="comparativo-var ${varClass}">${varText}</span>
        </div>`;
    });
    container.innerHTML = html;
}

function renderGastosCartaoTempo() {
    const canvas = document.getElementById('gastosCartaoTempoChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const hoje = new Date();
    const meses = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        meses.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    const tipos = ['debito', 'mercado_pago', 'nubank', 'itau'];
    const nomes = { debito: 'Débito', mercado_pago: 'Mercado Pago', nubank: 'Nubank', itau: 'Itaú Platinum' };
    const cores = { debito: '#34D399', mercado_pago: '#FBBF24', nubank: '#A78BFA', itau: '#FB923C' };
    const dados = {};
    tipos.forEach(tp => { dados[tp] = {}; meses.forEach(mk => { dados[tp][mk] = 0; }); });

    allTransactions.forEach(t => {
        const mk = mesKey(t.data);
        if (dados[t.tipo] && dados[t.tipo][mk] !== undefined) {
            dados[t.tipo][mk] += t.valor;
        }
    });

    const palette = getChartPalette();
    if (gastosCartaoTempoChart) gastosCartaoTempoChart.destroy();
    gastosCartaoTempoChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: meses.map(mesLabel),
            datasets: tipos.map(tp => ({
                label: nomes[tp],
                data: meses.map(mk => dados[tp][mk]),
                backgroundColor: cores[tp],
                borderColor: palette.pointBorder,
                borderWidth: 1,
                borderRadius: 3
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: palette.text, font: { size: 11, family: 'IBM Plex Mono' }, padding: 12, usePointStyle: true }
                },
                tooltip: Object.assign(tooltipBase(palette), {
                    callbacks: { label: (ctx) => ctx.dataset.label + ': ' + formatCurrency(ctx.parsed.y) }
                })
            },
            scales: {
                x: { stacked: true, ticks: { color: palette.text, font: { size: 10, family: 'IBM Plex Mono' } }, grid: { display: false } },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        color: palette.text,
                        font: { size: 10, family: 'IBM Plex Mono' },
                        callback: (v) => v >= 1000 ? 'R$ ' + (v / 1000).toFixed(1) + 'k' : formatCurrency(v)
                    },
                    grid: { color: palette.grid }
                }
            }
        }
    });
}

function renderOndeMaisGasta() {
    const container = document.getElementById('ondeMaisGasta');
    if (!container) return;

    const meses = [...new Set(allTransactions.map(t => mesKey(t.data)).filter(Boolean))].sort().reverse();
    if (meses.length === 0) {
        container.innerHTML = '<p class="empty-state">Sem gastos registrados.</p>';
        return;
    }
    const mesAtual = meses[0];
    const grupos = {};
    allTransactions.forEach(t => {
        if (t.tipo === 'receita') return;
        if (mesKey(t.data) !== mesAtual) return;
        const chave = (t.descricao || 'Sem descrição').trim() || 'Sem descrição';
        grupos[chave] = (grupos[chave] || 0) + t.valor;
    });
    const ranking = Object.entries(grupos).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (ranking.length === 0) {
        container.innerHTML = '<p class="empty-state">Nenhum gasto neste mês.</p>';
        return;
    }
    const max = ranking[0][1];
    container.innerHTML = `<div class="ranking-caption">Mês de ${mesLabel(mesAtual)}</div>` + ranking.map((r, i) => {
        const pct = max > 0 ? (r[1] / max * 100) : 0;
        return `<div class="ranking-item">
            <div class="ranking-rank">${i + 1}</div>
            <div class="ranking-body">
                <div class="ranking-top">
                    <span class="ranking-desc">${escapeHtml(r[0])}</span>
                    <span class="ranking-val">${formatCurrency(r[1])}</span>
                </div>
                <div class="ranking-bar-wrap"><div class="ranking-bar" style="width:${pct}%;"></div></div>
            </div>
        </div>`;
    }).join('');
}

function renderPatrimonioChart(reservaMovs) {
    const canvas = document.getElementById('patrimonioChart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Patrimônio projetado: receitas - todos os gastos (faturas contam no mês da compra)
    const porMes = {};
    function ensure(mk) {
        if (!porMes[mk]) porMes[mk] = { receitas: 0, gastos: 0, guardado: 0 };
        return porMes[mk];
    }
    allTransactions.forEach(t => {
        const mk = mesKey(t.data);
        if (!mk) return;
        if (t.tipo === 'receita') ensure(mk).receitas += t.valor;
        else ensure(mk).gastos += t.valor;
    });
    (reservaMovs || []).forEach(m => {
        const mk = mesKey(m.data);
        if (!mk) return;
        ensure(mk).guardado += (m.tipo === 'guardar' ? m.valor : -m.valor);
    });

    const meses = Object.keys(porMes).sort();
    if (meses.length === 0) {
        if (patrimonioChart) { patrimonioChart.destroy(); patrimonioChart = null; }
        return;
    }
    let acumPat = 0;
    let acumGuard = 0;
    const seriePatrimonio = [];
    const serieGuardado = [];
    meses.forEach(mk => {
        const d = porMes[mk];
        acumPat += d.receitas - d.gastos;
        acumGuard += d.guardado;
        seriePatrimonio.push(acumPat);
        serieGuardado.push(acumGuard);
    });

    const palette = getChartPalette();
    if (patrimonioChart) patrimonioChart.destroy();
    patrimonioChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: meses.map(mesLabel),
            datasets: [
                {
                    label: 'Patrimônio Projetado',
                    data: seriePatrimonio,
                    borderColor: palette.neutral,
                    backgroundColor: palette.neutralFill,
                    borderWidth: 3,
                    tension: 0.35,
                    fill: true,
                    pointBackgroundColor: palette.neutral,
                    pointRadius: 4
                },
                {
                    label: 'Dinheiro Guardado',
                    data: serieGuardado,
                    borderColor: '#34D399',
                    backgroundColor: 'rgba(52, 211, 153, 0.10)',
                    borderWidth: 2,
                    tension: 0.35,
                    fill: true,
                    pointBackgroundColor: '#34D399',
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: palette.text, font: { size: 11, family: 'IBM Plex Mono' }, usePointStyle: true } },
                tooltip: Object.assign(tooltipBase(palette), {
                    callbacks: { label: (ctx) => ctx.dataset.label + ': ' + formatCurrency(ctx.parsed.y) }
                })
            },
            scales: {
                x: { ticks: { color: palette.text, font: { size: 10, family: 'IBM Plex Mono' } }, grid: { color: palette.grid } },
                y: {
                    ticks: {
                        color: palette.text,
                        font: { size: 10, family: 'IBM Plex Mono' },
                        callback: (v) => (v >= 1000 || v <= -1000) ? 'R$ ' + (v / 1000).toFixed(1) + 'k' : formatCurrency(v)
                    },
                    grid: { color: palette.grid }
                }
            }
        }
    });
}

// ===================================
// FINANCIAL HEALTH ANALYSIS
// ===================================
async function calculateFinancialHealth() {
    try {
        console.log('=== Calculando Saúde Financeira ===');
        console.log('Total de transações:', allTransactions.length);
        
        const months = getUniqueMonths();
        console.log('Meses únicos encontrados:', months);
        
        if (months.length < 1 || allTransactions.length === 0) {
            console.log('Dados insuficientes para análise');
            return;
        }
        
        // Últimos 3 meses de dados (ou quantos tiver disponível)
        const recentMonths = months.slice(0, Math.min(3, months.length));
        let totalReceitas = 0;
        let totalGastos = 0;
        const monthlyGastos = [];
        
        recentMonths.forEach(month => {
            const transactions = allTransactions.filter(t => {
                const tDate = new Date((t.data_parcela || t.data) + 'T00:00:00');
                const tMonth = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
                return tMonth === month;
            });
            
            const receitas = transactions.filter(t => t.tipo === 'receita').reduce((sum, t) => sum + parseFloat(t.valor_parcela || t.valor), 0);
            const gastos = transactions.filter(t => t.tipo !== 'receita').reduce((sum, t) => sum + parseFloat(t.valor_parcela || t.valor), 0);
            
            totalReceitas += receitas;
            totalGastos += gastos;
            monthlyGastos.push(gastos);
        });
        
        const avgReceitas = totalReceitas / recentMonths.length;
        const avgGastos = totalGastos / recentMonths.length;
        const savingsRate = avgReceitas > 0 ? ((avgReceitas - avgGastos) / avgReceitas) * 100 : 0;
        
        // Calcular estabilidade (desvio padrão dos gastos)
        const avgMonthlyGastos = monthlyGastos.reduce((a, b) => a + b, 0) / monthlyGastos.length;
        const variance = monthlyGastos.reduce((sum, val) => sum + Math.pow(val - avgMonthlyGastos, 2), 0) / monthlyGastos.length;
        const stdDev = Math.sqrt(variance);
        const stability = stdDev / avgMonthlyGastos;
        
        // Calcular score de saúde (0-100)
        let healthScore = 50;
        
        // Taxa de poupança (até 40 pontos)
        if (savingsRate >= 30) healthScore += 40;
        else if (savingsRate >= 20) healthScore += 30;
        else if (savingsRate >= 10) healthScore += 20;
        else if (savingsRate >= 5) healthScore += 10;
        else if (savingsRate < 0) healthScore -= 20;
        
        // Estabilidade (até 20 pontos)
        if (stability < 0.1) healthScore += 20;
        else if (stability < 0.2) healthScore += 15;
        else if (stability < 0.3) healthScore += 10;
        else if (stability < 0.4) healthScore += 5;
        
        // Tendência (até 20 pontos)
        if (monthlyGastos.length >= 2) {
            const trend = monthlyGastos[0] < monthlyGastos[monthlyGastos.length - 1];
            if (trend) healthScore += 20;
            else healthScore -= 10;
        }
        
        healthScore = Math.max(0, Math.min(100, healthScore));
        
        // Atualizar UI
        updateHealthScoreUI(healthScore, savingsRate, stability, monthlyGastos);
        
    } catch (error) {
        console.error('Erro ao calcular saúde financeira:', error);
    }
}

function updateHealthScoreUI(score, savingsRate, stability, monthlyGastos) {
    const scoreValue = document.getElementById('healthScore');
    const scoreLabel = document.getElementById('healthLabel');
    const scoreCircle = document.getElementById('scoreCircle');
    const savingsRateEl = document.getElementById('savingsRate');
    const stabilityEl = document.getElementById('stability');
    const trendEl = document.getElementById('trend');
    const topCategoryEl = document.getElementById('topCategory');
    
    if (scoreValue) scoreValue.textContent = Math.round(score);
    
    if (scoreLabel) {
        if (score >= 80) scoreLabel.textContent = 'Excelente!';
        else if (score >= 60) scoreLabel.textContent = 'Muito Bom';
        else if (score >= 40) scoreLabel.textContent = 'Bom';
        else if (score >= 20) scoreLabel.textContent = 'Regular';
        else scoreLabel.textContent = 'Atenção';
    }
    
    if (scoreCircle) {
        const offset = 440 - (score / 100) * 440;
        scoreCircle.style.strokeDashoffset = offset;
    }
    
    if (savingsRateEl) {
        savingsRateEl.textContent = `${savingsRate.toFixed(1)}%`;
        savingsRateEl.className = 'metric-value ' + (savingsRate > 0 ? 'positive' : 'negative');
    }
    
    if (stabilityEl) {
        if (stability < 0.2) stabilityEl.textContent = 'Alta';
        else if (stability < 0.4) stabilityEl.textContent = 'Média';
        else stabilityEl.textContent = 'Baixa';
    }
    
    if (trendEl) {
        if (monthlyGastos.length >= 2) {
            const improving = monthlyGastos[0] < monthlyGastos[monthlyGastos.length - 1];
            trendEl.textContent = improving ? '📈 Melhorando' : '📉 Piorando';
        } else {
            trendEl.textContent = '➡️ Estável';
        }
    }
    
    // Maior tipo de gasto
    const typeTotals = {};
    allTransactions.filter(t => t.tipo !== 'receita').forEach(t => {
        typeTotals[t.tipo] = (typeTotals[t.tipo] || 0) + parseFloat(t.valor_parcela || t.valor);
    });
    
    const tipoLabels = {
        'debito': 'Débito',
        'mercado_pago': 'Mercado Pago',
        'nubank': 'Nubank',
        'itau': 'Itaú Platinum'
    };
    
    const topType = Object.keys(typeTotals).length > 0 
        ? Object.keys(typeTotals).reduce((a, b) => typeTotals[a] > typeTotals[b] ? a : b)
        : 'debito';
    if (topCategoryEl) topCategoryEl.textContent = tipoLabels[topType] || 'Débito';
}

// ===================================
// TOP EXPENSES
// ===================================
async function displayTopExpenses() {
    try {
        const months = getUniqueMonths();
        if (months.length < 1) return;

        const dashboardMonth = document.getElementById('dashboardMonth').value;
        const currentMonth = dashboardMonth || months[0];

        const expenses = allTransactions.filter(t => {
            const tDate = new Date((t.data_parcela || t.data) + 'T00:00:00');
            const tMonth = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
            return tMonth === currentMonth && t.tipo !== 'receita';
        });
        
        const topExpenses = expenses
            .sort((a, b) => parseFloat(b.valor_parcela || b.valor) - parseFloat(a.valor_parcela || a.valor))
            .slice(0, 5);
        
        renderTopExpenses(topExpenses);
        
    } catch (error) {
        console.error('Erro ao exibir top gastos:', error);
    }
}

function renderTopExpenses(expenses) {
    const container = document.getElementById('topExpenses');
    if (!container) return;
    
    if (expenses.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum gasto registrado este mês.</p>';
        return;
    }
    
    const tipoIcons = {
        'debito': '💸',
        'mercado_pago': '💳',
        'nubank': '💜',
        'itau': '🟠'
    };
    
    const tipoLabels = {
        'debito': 'Débito',
        'mercado_pago': 'Mercado Pago',
        'nubank': 'Nubank',
        'itau': 'Itaú Platinum'
    };
    
    container.innerHTML = expenses.map((expense, index) => `
        <div class="expense-item">
            <div class="expense-rank">#${index + 1}</div>
            <div class="expense-info">
                <div class="expense-description">${expense.descricao}</div>
                <div class="expense-meta">
                    <span class="expense-type">${tipoIcons[expense.tipo]} ${tipoLabels[expense.tipo]}</span>
                    <span class="expense-date">${formatDate(expense.data_parcela || expense.data)}</span>
                </div>
            </div>
            <div class="expense-amount">${formatCurrency(parseFloat(expense.valor_parcela || expense.valor))}</div>
        </div>
    `).join('');
}

// ===================================
// EVOLUTION CHART
// ===================================
let evolutionChart = null;

async function updateEvolutionChart() {
    try {
        const months = getUniqueMonths().reverse();
        if (months.length < 2) return;
        
        const labels = [];
        const balances = [];
        let runningBalance = 0;
        
        months.forEach(month => {
            const transactions = allTransactions.filter(t => {
                const tDate = new Date((t.data_parcela || t.data) + 'T00:00:00');
                const tMonth = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
                return tMonth <= month;
            });
            
            runningBalance = 0;
            transactions.forEach(t => {
                const valor = parseFloat(t.valor_parcela || t.valor);
                if (t.tipo === 'receita') {
                    runningBalance += valor;
                } else {
                    runningBalance -= valor;
                }
            });
            
            const [year, monthNum] = month.split('-');
            const monthName = new Date(year, monthNum - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            labels.push(monthName);
            balances.push(runningBalance);
        });
        
        const ctx = document.getElementById('evolutionChart');
        if (!ctx) return;
        
        const palette = getChartPalette();
        const gridColor = palette.grid;
        const textColor = palette.text;
        
        if (evolutionChart) evolutionChart.destroy();
        
        evolutionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Saldo Acumulado',
                    data: balances,
                    borderColor: palette.bull,
                    backgroundColor: palette.bullFill,
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: palette.bull,
                    pointBorderColor: palette.pointBorder,
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: palette.tooltipBg,
                        titleColor: palette.tooltipText,
                        bodyColor: palette.tooltipText,
                        borderColor: palette.tooltipBorder,
                        borderWidth: 2,
                        callbacks: {
                            label: function(context) {
                                return 'Saldo: ' + formatCurrency(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    },
                    x: {
                        grid: { color: gridColor },
                        ticks: { color: textColor }
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Erro ao atualizar gráfico de evolução:', error);
    }
}

// ===================================
// PAYMENT ANALYSIS
// ===================================
async function updatePaymentAnalysis() {
    try {
        const months = getUniqueMonths();
        if (months.length < 1) return;
        
        const currentMonth = months[0];
        const expenses = allTransactions.filter(t => {
            const tDate = new Date((t.data_parcela || t.data) + 'T00:00:00');
            const tMonth = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
            return tMonth === currentMonth && t.tipo !== 'receita';
        });
        
        const totals = {
            debito: 0,
            mercado_pago: 0,
            nubank: 0,
            itau: 0
        };

        expenses.forEach(e => {
            const valor = parseFloat(e.valor_parcela || e.valor);
            if (totals[e.tipo] !== undefined) {
                totals[e.tipo] += valor;
            }
        });

        const total = Object.values(totals).reduce((a, b) => a + b, 0);

        const paymentKeys = {
            debito: 'Debito',
            mercado_pago: 'MercadoPago',
            nubank: 'Nubank',
            itau: 'Itau'
        };

        Object.keys(totals).forEach(tipo => {
            const percentage = total > 0 ? (totals[tipo] / total) * 100 : 0;
            const tipoKey = paymentKeys[tipo];
            const valEl = document.getElementById(`payment${tipoKey}`);
            const pctEl = document.getElementById(`payment${tipoKey}Pct`);
            const barEl = document.getElementById(`payment${tipoKey}Bar`);
            if (valEl) valEl.textContent = formatCurrency(totals[tipo]);
            if (pctEl) pctEl.textContent = `${percentage.toFixed(1)}% do total`;
            if (barEl) barEl.style.width = `${percentage}%`;
        });
        
    } catch (error) {
        console.error('Erro ao atualizar análise de pagamentos:', error);
    }
}

// ===================================
// CARD LIMITS
// ===================================
// ===================================
// FINANCIAL CALENDAR
// ===================================
let currentCalendarDate = new Date();

function previousMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
}

function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    document.getElementById('calendarMonth').textContent = new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthTransactions = allTransactions.filter(t => {
        const tDate = new Date((t.data_parcela || t.data) + 'T00:00:00');
        const tMonth = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
        return tMonth === monthKey;
    });
    
    let html = '<div class="calendar-header">';
    ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });
    html += '</div><div class="calendar-days">';
    
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayTransactions = monthTransactions.filter(t => {
            const tDate = t.data_parcela || t.data;
            return tDate === dateStr;
        });
        
        const gastos = dayTransactions.filter(t => t.tipo !== 'receita').reduce((sum, t) => sum + parseFloat(t.valor_parcela || t.valor), 0);
        const receitas = dayTransactions.filter(t => t.tipo === 'receita').reduce((sum, t) => sum + parseFloat(t.valor_parcela || t.valor), 0);
        
        const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
        const hasTransactions = dayTransactions.length > 0;
        
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${hasTransactions ? 'has-transactions' : ''}">
                <div class="calendar-day-number">${day}</div>
                ${hasTransactions ? `
                    <div class="calendar-day-transactions">
                        ${receitas > 0 ? `<div class="calendar-transaction positive">+${formatCurrency(receitas)}</div>` : ''}
                        ${gastos > 0 ? `<div class="calendar-transaction negative">-${formatCurrency(gastos)}</div>` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    html += '</div>';
    document.getElementById('calendar').innerHTML = html;
}

// ===================================
// QUICK ADD (FAB)
// ===================================
let quickAddOpen = false;

function toggleQuickAdd() {
    quickAddOpen = !quickAddOpen;
    const menu = document.getElementById('quickAddMenu');
    const fab = document.querySelector('.fab');
    
    if (quickAddOpen) {
        menu.style.display = 'flex';
        fab.querySelector('.fab-icon').textContent = '×';
        fab.style.transform = 'rotate(45deg)';
    } else {
        menu.style.display = 'none';
        fab.querySelector('.fab-icon').textContent = '+';
        fab.style.transform = 'rotate(0deg)';
    }
}

function quickAddReceita() {
    toggleQuickAdd();
    document.getElementById('quickAddTitle').textContent = 'Adicionar Receita';
    document.getElementById('quickTipoGroup').style.display = 'none';
    document.getElementById('quickAddForm').dataset.type = 'receita';
    document.getElementById('quickAddModal').style.display = 'flex';
}

function quickAddGasto() {
    toggleQuickAdd();
    document.getElementById('quickAddTitle').textContent = 'Adicionar Gasto';
    document.getElementById('quickTipoGroup').style.display = 'block';
    document.getElementById('quickAddForm').dataset.type = 'gasto';
    document.getElementById('quickAddModal').style.display = 'flex';
}

function closeQuickAddModal() {
    document.getElementById('quickAddModal').style.display = 'none';
    document.getElementById('quickAddForm').reset();
}

async function submitQuickAdd(event) {
    event.preventDefault();
    
    const form = event.target;
    const type = form.dataset.type;
    const descricao = document.getElementById('quickDescricao').value;
    const valor = parseFloat(document.getElementById('quickValor').value);
    const tipo = type === 'receita' ? 'receita' : document.getElementById('quickTipo').value;
    const saveFavorite = document.getElementById('quickSaveFavorite').checked;
    
    if (saveFavorite) {
        const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        favorites.push({ descricao, valor, tipo });
        localStorage.setItem('favorites', JSON.stringify(favorites));
    }
    
    const data = {
        descricao,
        valor,
        tipo,
        data: new Date().toISOString().split('T')[0],
        num_parcelas: 1
    };
    
    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            closeQuickAddModal();
            await loadTransactions();
            await atualizarSaldos();
            updateEvolutionChart();
            updatePaymentAnalysis();
            showNotification('✅ Transação adicionada com sucesso!', 'success');
        } else {
            const error = await response.json();
            showNotification('❌ Erro: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Erro ao adicionar transação:', error);
        showNotification('❌ Erro ao adicionar transação', 'error');
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#0B1426' : type === 'error' ? '#0B1426' : '#0B1426'};
        border: 1px solid ${type === 'success' ? 'rgba(52,211,153,0.35)' : type === 'error' ? 'rgba(248,113,113,0.35)' : 'rgba(96,165,250,0.30)'};
        color: ${type === 'success' ? '#34D399' : type === 'error' ? '#F87171' : '#60A5FA'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===================================
// FAVORITES
// ===================================
function openFavorites() {
    toggleQuickAdd();
    renderFavorites();
    document.getElementById('favoritesModal').style.display = 'flex';
}

function closeFavoritesModal() {
    document.getElementById('favoritesModal').style.display = 'none';
}

function renderFavorites() {
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    const container = document.getElementById('favoritesList');
    
    if (favorites.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum favorito salvo.</p>';
        return;
    }
    
    const tipoIcons = {
        'receita': '💰',
        'debito': '💸',
        'mercado_pago': '💳',
        'nubank': '💜',
        'itau': '🟠'
    };
    
    container.innerHTML = favorites.map((fav, index) => `
        <div class="favorite-item">
            <span class="favorite-icon">${tipoIcons[fav.tipo]}</span>
            <div class="favorite-info">
                <div class="favorite-description">${fav.descricao}</div>
                <div class="favorite-value">${formatCurrency(fav.valor)}</div>
            </div>
            <button class="btn-icon-small" onclick="useFavorite(${index})" title="Usar">✓</button>
            <button class="btn-icon-small" onclick="deleteFavorite(${index})" title="Excluir">✕</button>
        </div>
    `).join('');
}

async function useFavorite(index) {
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    const fav = favorites[index];
    
    const data = {
        descricao: fav.descricao,
        valor: fav.valor,
        tipo: fav.tipo,
        data: new Date().toISOString().split('T')[0],
        num_parcelas: 1
    };
    
    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            closeFavoritesModal();
            await loadTransactions();
            await atualizarSaldos();
            updateEvolutionChart();
            updatePaymentAnalysis();
            showNotification('✅ Transação adicionada!', 'success');
        }
    } catch (error) {
        console.error('Erro:', error);
        showNotification('❌ Erro ao adicionar transação', 'error');
    }
}

function deleteFavorite(index) {
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    favorites.splice(index, 1);
    localStorage.setItem('favorites', JSON.stringify(favorites));
    renderFavorites();
}

// ===================================
// INITIALIZE NEW FEATURES
// ===================================
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        updateEvolutionChart();
        updatePaymentAnalysis();
        renderCalendar();
    }, 1000);
    
    // Close modals on outside click
    window.addEventListener('click', function(event) {
        const modals = ['favoritesModal', 'quickAddModal'];
        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // Close quick add menu on outside click
    document.addEventListener('click', function(event) {
        if (quickAddOpen && !event.target.closest('.fab') && !event.target.closest('.quick-add-menu')) {
            toggleQuickAdd();
        }
    });
});

