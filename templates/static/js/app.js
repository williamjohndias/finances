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

// ===================================
// THEME MANAGEMENT
// ===================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    // Recarrega gráficos para ajustar cores
    if (monthlyChart) loadCharts();
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.innerHTML = theme === 'dark' 
            ? '<span class="theme-icon">☀</span><span class="hide-mobile">Modo Claro</span>' 
            : '<span class="theme-icon">☾</span><span class="hide-mobile">Modo Escuro</span>';
    }
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
    const msg = document.getElementById('successMessage');
    msg.textContent = text;
    msg.className = 'alert ' + type;
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 4000);
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
            ...(data.gastos_nubank || []).map(t => ({...t, tipo: 'nubank', data_parcela: t.data}))
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
        'nubank': 'Nubank'
    };
    
    const tipoBadges = {
        'receita': 'receita',
        'debito': 'debito',
        'mercado_pago': 'mercado-pago',
        'nubank': 'nubank'
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
    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
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
            showMessage('✗ Erro: ' + (result.error || 'Erro ao adicionar'), 'error');
        }
    } catch (error) {
        showMessage('✗ Erro de conexão: ' + error.message, 'error');
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
    }
    
    const receitas = receitasList.reduce((sum, t) => sum + t.valor, 0);
    const debito = debitoList.reduce((sum, t) => sum + t.valor, 0);
    const mercadoPago = mercadoPagoList.reduce((sum, t) => sum + t.valor, 0);
    const nubank = nubankList.reduce((sum, t) => sum + t.valor, 0);
    const gastos = debito + mercadoPago + nubank;
    
    document.getElementById('totalReceitas').textContent = formatCurrency(receitas);
    document.getElementById('totalGastos').textContent = formatCurrency(gastos);
    
    const filteredTransactions = filterMonth 
        ? allTransactions.filter(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const transMonth = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            return transMonth === filterMonth;
        })
        : allTransactions;
    
    const totalTransacoes = filteredTransactions.length;
    document.getElementById('totalTransacoes').textContent = totalTransacoes;
    
    if (!filterMonth) {
        const monthlyData = {};
        [...receitasList, ...debitoList, ...mercadoPagoList, ...nubankList].forEach(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const monthKey = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            if (!monthlyData[monthKey]) monthlyData[monthKey] = true;
        });
        const numMonths = Object.keys(monthlyData).length || 1;
        document.getElementById('mediaReceitas').textContent = 
            'Média mensal: ' + formatCurrency(receitas / numMonths);
        document.getElementById('mediaGastos').textContent = 
            'Média mensal: ' + formatCurrency(gastos / numMonths);
    } else {
        document.getElementById('mediaReceitas').textContent = 'Mês atual';
        document.getElementById('mediaGastos').textContent = 'Mês atual';
    }
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
        const totalGastos = totalDebito + totalMercadoPago + totalNubank;
        
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#cbd5e1' : '#475569';
        const gridColor = isDark ? '#334155' : '#e2e8f0';
        
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
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#22c55e',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Gastos',
                        data: monthlyData.gastos || [],
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.08)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: false,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#ef4444',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Saldo',
                        data: monthlyData.saldos || [],
                        borderColor: '#6366f1',
                        backgroundColor: 'transparent',
                        borderWidth: 3,
                        borderDash: [8, 4],
                        tension: 0.4,
                        fill: false,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#6366f1',
                        pointBorderColor: '#fff',
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
                            font: { size: 13, weight: '600', family: 'Inter' },
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        },
                        position: 'top'
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#0f172a',
                        titleColor: '#ffffff',
                        bodyColor: '#e2e8f0',
                        borderColor: '#4f46e5',
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
                            font: { size: 11, family: 'Inter' }
                        }, 
                        grid: { 
                            color: gridColor,
                            drawBorder: false
                        } 
                    },
                    y: {
                        ticks: {
                            color: textColor,
                            font: { size: 11, family: 'Inter' },
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
                    labels: ['Débito', 'Mercado Pago', 'Nubank'],
                    datasets: [{
                        data: [totalDebito, totalMercadoPago, totalNubank],
                        backgroundColor: ['#0ea5e9', '#f59e0b', '#8b5cf6'],
                        borderColor: isDark ? '#0f172a' : '#ffffff',
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
                                font: { size: 13, weight: '600', family: 'Inter' },
                                padding: 14,
                                usePointStyle: true
                            }, 
                            position: 'bottom'
                        },
                        tooltip: {
                            backgroundColor: isDark ? '#1e293b' : '#0f172a',
                            titleColor: '#ffffff',
                            bodyColor: '#e2e8f0',
                            borderColor: '#4f46e5',
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
            ctx2.font = '600 12px Inter, sans-serif';
            ctx2.textAlign = 'center';
            ctx2.fillText('NENHUM GASTO REGISTRADO', ctx2.canvas.width / 2, ctx2.canvas.height / 2);
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
        document.getElementById('totalDebitoCard').textContent = formatCurrency(stats.total_debito);
        document.getElementById('statMercadoPago').textContent = formatCurrency(stats.total_mercado_pago);
        document.getElementById('statNubank').textContent = formatCurrency(stats.total_nubank);
        
        document.getElementById('pctDebito').textContent = stats.pct_debito.toFixed(1) + '% do total';
        document.getElementById('pctMercadoPago').textContent = stats.pct_mercado_pago.toFixed(1) + '% do total';
        document.getElementById('pctNubank').textContent = stats.pct_nubank.toFixed(1) + '% do total';
        
        document.getElementById('parceladasInfo').textContent = 
            stats.compras_parceladas + ' compras parceladas';
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
    }
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
        
        document.getElementById('faturaAtualMP').textContent = formatCurrency(data.mercado_pago.atual);
        document.getElementById('faturaAbatidaMP').textContent = formatCurrency(data.mercado_pago.abatido);
        document.getElementById('faturaAtualNubank').textContent = formatCurrency(data.nubank.atual);
        document.getElementById('faturaAbatidaNubank').textContent = formatCurrency(data.nubank.abatido);
        
        await atualizarSaldos();
    } catch (error) {
        console.error('Erro ao carregar faturas:', error);
    }
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
                monthlyData[monthKey] = { receitas: 0, debito: 0, abatimentos: 0, faturas: 0 };
            }
            monthlyData[monthKey].receitas += t.valor;
        });
        
        (data.gastos_debito || []).forEach(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const monthKey = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { receitas: 0, debito: 0, abatimentos: 0, faturas: 0 };
            }
            monthlyData[monthKey].debito += t.valor;
        });
        
        [...(data.gastos_mercado_pago || []), ...(data.gastos_nubank || [])].forEach(t => {
            const transDate = new Date(t.data + 'T00:00:00');
            const monthKey = transDate.getFullYear() + '-' + String(transDate.getMonth() + 1).padStart(2, '0');
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { receitas: 0, debito: 0, abatimentos: 0, faturas: 0 };
            }
            monthlyData[monthKey].faturas += t.valor;
        });
        
        (abatimentos || []).forEach(a => {
            const abatDate = new Date(a.data + 'T00:00:00');
            const monthKey = abatDate.getFullYear() + '-' + String(abatDate.getMonth() + 1).padStart(2, '0');
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { receitas: 0, debito: 0, abatimentos: 0, faturas: 0 };
            }
            monthlyData[monthKey].abatimentos += parseFloat(a.valor);
        });
        
        const sortedMonths = Object.keys(monthlyData).sort();
        
        // saldoAcumuladoAtual → caixa real (receitas − débito − abatimentos) acumulado até o mês
        // sobrouAnterior      → Saldo Atual dos meses anteriores (o que rola para o próximo mês)
        // saldoProjetado     → acumulado (receitas − débito − faturas) — rola mês a mês
        let saldoAcumuladoAtual = 0;
        let sobrouAnterior = 0;
        let saldoProjetado = 0;
        let totalReceitas = 0, totalDebito = 0, totalFaturas = 0, totalAbatimentos = 0;

        for (const month of sortedMonths) {
            const monthData = monthlyData[month];
            totalReceitas += monthData.receitas;
            totalDebito += monthData.debito;
            totalFaturas += monthData.faturas;
            totalAbatimentos += monthData.abatimentos;

            const saldoCaixa = monthData.receitas - monthData.debito - monthData.abatimentos;
            const saldoProjMes = monthData.receitas - monthData.debito - monthData.faturas;

            if (dashboardMonth && month === dashboardMonth) {
                saldoAcumuladoAtual += saldoCaixa;
                saldoProjetado += saldoProjMes;
                break;
            }

            saldoAcumuladoAtual += saldoCaixa;
            sobrouAnterior += saldoCaixa;
            saldoProjetado += saldoProjMes;
        }
        
        const saldoAtualEl = document.getElementById('saldoAtual');
        saldoAtualEl.textContent = formatCurrency(saldoAcumuladoAtual);
        saldoAtualEl.className = 'card-value ' + (saldoAcumuladoAtual >= 0 ? 'positive' : 'negative');

        const saldoAnteriorEl = document.getElementById('saldoMesAnterior');
        if (saldoAnteriorEl) {
            saldoAnteriorEl.textContent = formatCurrency(sobrouAnterior);
            saldoAnteriorEl.className = 'card-value ' + (sobrouAnterior >= 0 ? 'positive' : 'negative');
        }

        const saldoProjetadoEl = document.getElementById('saldoProjetado');
        saldoProjetadoEl.textContent = formatCurrency(saldoProjetado);
        saldoProjetadoEl.className = 'card-value ' + (saldoProjetado >= 0 ? 'positive' : 'negative');
        
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
            diagAviso.textContent = `Saldo Projetado = acumulado (Receitas − Débito − Faturas) até o mês selecionado. Rola para o próximo mês.`;
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
        const cartaoLabel = abatimento.tipo_cartao === 'mercado_pago' 
            ? 'Mercado Pago' 
            : 'Nubank';
        
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
            'nubank': 'Nubank'
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
    document.getElementById('transactionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            tipo: document.getElementById('tipo').value,
            descricao: document.getElementById('descricao').value,
            valor: parseFloat(document.getElementById('valor').value),
            data: document.getElementById('data').value,
            num_parcelas: parseInt(document.getElementById('num_parcelas').value) || 1
        };
        
        await addTransaction(formData);
    });
    
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
    
    // Set default dates
    document.getElementById('data').valueAsDate = new Date();
    document.getElementById('data_abatimento').valueAsDate = new Date();
    
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
        await loadFaturas();
        await loadAbatimentos();
        await atualizarSaldos();
        await calculateFinancialHealth();
        await displayTopExpenses();
        
        setTimeout(() => {
            updateEvolutionChart();
            updatePaymentAnalysis();
            renderCalendar();
        }, 500);
    })();
});

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
        'nubank': 'Nubank'
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
        
        const currentMonth = months[0];
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
        'nubank': '💜'
    };
    
    const tipoLabels = {
        'debito': 'Débito',
        'mercado_pago': 'Mercado Pago',
        'nubank': 'Nubank'
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
        
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(71, 85, 105, 0.3)' : 'rgba(203, 213, 225, 0.5)';
        const textColor = isDark ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)';
        
        if (evolutionChart) evolutionChart.destroy();
        
        evolutionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Saldo Acumulado',
                    data: balances,
                    borderColor: 'rgb(16, 185, 129)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: 'rgb(16, 185, 129)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
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
            nubank: 0
        };
        
        expenses.forEach(e => {
            const valor = parseFloat(e.valor_parcela || e.valor);
            totals[e.tipo] = (totals[e.tipo] || 0) + valor;
        });
        
        const total = Object.values(totals).reduce((a, b) => a + b, 0);
        
        Object.keys(totals).forEach(tipo => {
            const percentage = total > 0 ? (totals[tipo] / total) * 100 : 0;
            const tipoKey = tipo === 'debito' ? 'Debito' : tipo === 'mercado_pago' ? 'MercadoPago' : 'Nubank';
            
            document.getElementById(`payment${tipoKey}`).textContent = formatCurrency(totals[tipo]);
            document.getElementById(`payment${tipoKey}Pct`).textContent = `${percentage.toFixed(1)}% do total`;
            document.getElementById(`payment${tipoKey}Bar`).style.width = `${percentage}%`;
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
        const response = await fetch('/api/transacao', {
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
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
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
        'nubank': '💜'
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
        const response = await fetch('/api/transacao', {
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
        renderSavingsGoals();
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
