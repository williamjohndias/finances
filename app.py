from flask import Flask, render_template, request, jsonify
from datetime import datetime, timedelta
from calendar import monthrange
from dateutil.relativedelta import relativedelta
import os

# Configuração do Flask
template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'templates'))
static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'templates', 'static'))
app = Flask(__name__, template_folder=template_dir, static_folder=static_dir, static_url_path='/static')

# Importa configurações do Supabase
try:
    from config import SUPABASE_URL, SUPABASE_KEY
    print(f"OK - Configuracoes carregadas do config.py")
    print(f"  URL: {SUPABASE_URL}")
    print(f"  Key presente: {'Sim' if SUPABASE_KEY else 'Não'}")
except ImportError:
    # Se config.py não existir, tenta variáveis de ambiente
    SUPABASE_URL = os.getenv('SUPABASE_URL', '')
    SUPABASE_KEY = os.getenv('SUPABASE_KEY', '')
    print("AVISO: config.py nao encontrado, usando variaveis de ambiente")

# Inicializa Supabase
supabase = None
print(f"\nTentando inicializar Supabase...")
print(f"  URL: {SUPABASE_URL}")
print(f"  Key presente: {'Sim' if SUPABASE_KEY else 'Nao'} (tamanho: {len(SUPABASE_KEY) if SUPABASE_KEY else 0})")

if SUPABASE_URL and SUPABASE_KEY:
    try:
        print("  Importando biblioteca supabase...")
        from supabase import create_client, Client
        print("  Criando cliente Supabase...")
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("OK - Supabase inicializado com sucesso!\n")
    except Exception as e:
        print(f"ERRO ao inicializar Supabase:")
        print(f"  Tipo: {type(e).__name__}")
        print(f"  Mensagem: {str(e)}")
        import traceback
        print("\nTraceback completo:")
        traceback.print_exc()
        supabase = None
        print()
else:
    print("AVISO: SUPABASE_URL ou SUPABASE_KEY nao configurados")
    print(f"  SUPABASE_URL: {'Definido' if SUPABASE_URL else 'NAO DEFINIDO'}")
    print(f"  SUPABASE_KEY: {'Definido' if SUPABASE_KEY else 'NAO DEFINIDO'}\n")

BUDGET_CATEGORIES = {
    'debito': 'Debito',
    'mercado_pago': 'Mercado Pago',
    'nubank': 'Nubank'
}


def parse_date(date_text, default=None):
    """Converte texto YYYY-MM-DD para datetime."""
    if not date_text:
        return default
    try:
        return datetime.strptime(date_text, '%Y-%m-%d')
    except Exception:
        return default


def clamp_day(year, month, day):
    """Garante que o dia esteja dentro do mês."""
    return min(max(int(day), 1), monthrange(year, month)[1])


def month_key_from_date(date_obj):
    return date_obj.strftime('%Y-%m')


def next_month_key(month_key):
    base = datetime.strptime(month_key + '-01', '%Y-%m-%d')
    return (base + relativedelta(months=1)).strftime('%Y-%m')


def iter_month_keys(start_month_key, end_month_key):
    current = datetime.strptime(start_month_key + '-01', '%Y-%m-%d')
    end = datetime.strptime(end_month_key + '-01', '%Y-%m-%d')
    while current <= end:
        yield current.strftime('%Y-%m')
        current = current + relativedelta(months=1)


def normalize_transactions(transactions):
    """Flatten das listas de transações com tipo normalizado."""
    normalized = []
    type_map = {
        'receitas': 'receita',
        'gastos_debito': 'debito',
        'gastos_mercado_pago': 'mercado_pago',
        'gastos_nubank': 'nubank'
    }
    for key, items in transactions.items():
        normalized_type = type_map.get(key)
        if not normalized_type:
            continue
        for row in items:
            normalized.append({
                'id': row.get('id'),
                'tipo': normalized_type,
                'descricao': row.get('descricao', ''),
                'valor': float(row.get('valor', 0) or 0),
                'data': row.get('data'),
                'parcelado': row.get('parcelado', False),
                'parcela_atual': row.get('parcela_atual'),
                'total_parcelas': row.get('total_parcelas'),
                'valor_total': row.get('valor_total'),
                'parcel_group_id': row.get('parcel_group_id')
            })
    return normalized


def load_transactions():
    """Carrega transações do Supabase"""
    if supabase is None:
        print("AVISO: Supabase nao inicializado, retornando dados vazios")
        return {
            'receitas': [],
            'gastos_debito': [],
            'gastos_mercado_pago': [],
            'gastos_nubank': []
        }
    
    try:
        response = supabase.table('transactions').select('*').order('data', desc=False).execute()
        
        transactions = {
            'receitas': [],
            'gastos_debito': [],
            'gastos_mercado_pago': [],
            'gastos_nubank': []
        }
        
        for row in response.data:
            transaction = {
                'id': row['id'],
                'descricao': row['descricao'],
                'valor': float(row['valor']),
                'data': row['data'],
                'parcelado': row.get('parcelado', False),
                'parcela_atual': row.get('parcela_atual'),
                'total_parcelas': row.get('total_parcelas'),
                'valor_total': float(row['valor_total']) if row.get('valor_total') else None,
                'parcel_group_id': row.get('parcel_group_id')
            }
            
            tipo = row['tipo']
            if tipo == 'receita':
                transactions['receitas'].append(transaction)
            elif tipo == 'debito':
                transactions['gastos_debito'].append(transaction)
            elif tipo == 'mercado_pago':
                transactions['gastos_mercado_pago'].append(transaction)
            elif tipo == 'nubank':
                transactions['gastos_nubank'].append(transaction)
        
        return transactions
    except Exception as e:
        print(f"ERRO ao carregar transacoes: {e}")
        import traceback
        traceback.print_exc()
        return {
            'receitas': [],
            'gastos_debito': [],
            'gastos_mercado_pago': [],
            'gastos_nubank': []
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """Retorna todas as transações"""
    return jsonify(load_transactions())

@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    """Adiciona uma nova transação"""
    if supabase is None:
        return jsonify({
            'success': False, 
            'error': 'Supabase não inicializado. Verifique o config.py ou variáveis de ambiente.'
        }), 500
    
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'Dados não fornecidos'}), 400
        
        tipo = data.get('tipo')
        if not tipo or tipo not in ('receita', 'debito', 'mercado_pago', 'nubank'):
            return jsonify({'success': False, 'error': 'Tipo de transação inválido. Selecione: Receita, Débito, Mercado Pago ou Nubank.'}), 400
        
        if not data.get('descricao') or not str(data.get('descricao', '')).strip():
            return jsonify({'success': False, 'error': 'Descrição é obrigatória.'}), 400
        
        valor = float(data.get('valor', 0))
        if valor <= 0:
            return jsonify({'success': False, 'error': 'Valor deve ser maior que zero.'}), 400
        num_parcelas = int(data.get('num_parcelas', 1))
        valor_total = valor
        valor_parcela = valor_total / num_parcelas
        data_inicial = datetime.strptime(data.get('data', datetime.now().strftime('%Y-%m-%d')), '%Y-%m-%d')
        
        transacoes_criadas = []
        base_id = datetime.now().strftime('%Y%m%d%H%M%S%f')
        parcel_group_id = base_id if num_parcelas > 1 else None
        
        transactions_to_insert = []
        
        for i in range(num_parcelas):
            data_parcela = data_inicial + relativedelta(months=i)
            
            transaction_data = {
                'id': base_id + str(i),
                'tipo': tipo,
                'descricao': data.get('descricao', ''),
                'valor': float(valor_parcela),
                'data': data_parcela.strftime('%Y-%m-%d'),
                'parcelado': num_parcelas > 1,
                'parcela_atual': i + 1 if num_parcelas > 1 else None,
                'total_parcelas': num_parcelas if num_parcelas > 1 else None,
                'valor_total': float(valor_total),
                'parcel_group_id': parcel_group_id
            }
            
            transactions_to_insert.append(transaction_data)
            transacoes_criadas.append({
                'id': transaction_data['id'],
                'descricao': transaction_data['descricao'],
                'valor': transaction_data['valor'],
                'data': transaction_data['data'],
                'parcelado': transaction_data['parcelado'],
                'parcela_atual': transaction_data['parcela_atual'],
                'total_parcelas': transaction_data['total_parcelas'],
                'valor_total': transaction_data['valor_total'],
                'parcel_group_id': transaction_data['parcel_group_id']
            })
        
        # Insere no Supabase
        try:
            response = supabase.table('transactions').insert(transactions_to_insert).execute()
            print(f"OK - {len(transacoes_criadas)} transacao(oes) inserida(s) com sucesso")
        except Exception as db_error:
            print(f"ERRO ao inserir no Supabase: {db_error}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False, 
                'error': f'Erro ao salvar no banco: {str(db_error)}',
                'details': 'Verifique se a tabela transactions existe no Supabase'
            }), 500
        
        return jsonify({'success': True, 'transactions': transacoes_criadas})
    except Exception as e:
        print(f"ERRO ao adicionar transacao: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False, 
            'error': str(e)
        }), 500

@app.route('/api/transactions/<tipo>/<transaction_id>', methods=['DELETE'])
def delete_transaction(tipo, transaction_id):
    """Remove uma transação"""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase não inicializado'}), 500
    
    try:
        response = supabase.table('transactions').select('*').eq('id', transaction_id).execute()
        
        if not response.data:
            return jsonify({'success': False, 'error': 'Transação não encontrada'}), 404
        
        transaction_to_delete = response.data[0]
        
        if transaction_to_delete.get('parcelado') and transaction_to_delete.get('parcel_group_id'):
            parcel_group_id = transaction_to_delete.get('parcel_group_id')
            supabase.table('transactions').delete().eq('parcel_group_id', parcel_group_id).execute()
            print(f"OK - Parcelas deletadas (grupo: {parcel_group_id})")
        else:
            supabase.table('transactions').delete().eq('id', transaction_id).execute()
            print(f"OK - Transacao deletada: {transaction_id}")
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"ERRO ao deletar transacao: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/transactions/<tipo>/<transaction_id>', methods=['PUT'])
def update_transaction(tipo, transaction_id):
    """Atualiza uma transação"""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase não inicializado'}), 500
    
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'Dados não fornecidos'}), 400
        
        # Busca a transação atual
        response = supabase.table('transactions').select('*').eq('id', transaction_id).execute()
        
        if not response.data:
            return jsonify({'success': False, 'error': 'Transação não encontrada'}), 404
        
        transaction = response.data[0]
        
        # Se for parcelada, atualiza todas as parcelas do grupo
        if transaction.get('parcelado') and transaction.get('parcel_group_id'):
            parcel_group_id = transaction.get('parcel_group_id')
            num_parcelas = int(data.get('num_parcelas', transaction.get('total_parcelas', 1)))
            valor_total = float(data.get('valor_total', data.get('valor', 0)))
            valor_parcela = valor_total / num_parcelas
            data_inicial = datetime.strptime(data.get('data', transaction['data']), '%Y-%m-%d')
            
            # Deleta todas as parcelas antigas
            supabase.table('transactions').delete().eq('parcel_group_id', parcel_group_id).execute()
            
            # Cria novas parcelas
            transactions_to_insert = []
            base_id = datetime.now().strftime('%Y%m%d%H%M%S%f')
            
            for i in range(num_parcelas):
                data_parcela = data_inicial + relativedelta(months=i)
                transaction_data = {
                    'id': base_id + str(i),
                    'tipo': data.get('tipo', transaction['tipo']),
                    'descricao': data.get('descricao', transaction['descricao']),
                    'valor': float(valor_parcela),
                    'data': data_parcela.strftime('%Y-%m-%d'),
                    'parcelado': True,
                    'parcela_atual': i + 1,
                    'total_parcelas': num_parcelas,
                    'valor_total': float(valor_total),
                    'parcel_group_id': parcel_group_id
                }
                transactions_to_insert.append(transaction_data)
            
            supabase.table('transactions').insert(transactions_to_insert).execute()
            print(f"OK - Parcelas atualizadas (grupo: {parcel_group_id})")
        else:
            # Atualiza transação única
            update_data = {
                'descricao': data.get('descricao', transaction['descricao']),
                'valor': float(data.get('valor', transaction['valor'])),
                'data': data.get('data', transaction['data']),
                'tipo': data.get('tipo', transaction['tipo'])
            }
            
            supabase.table('transactions').update(update_data).eq('id', transaction_id).execute()
            print(f"OK - Transacao atualizada: {transaction_id}")
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"ERRO ao atualizar transacao: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/transactions/monthly', methods=['GET'])
def get_monthly_summary():
    """Retorna resumo mensal para o gráfico"""
    try:
        transactions = load_transactions()
        monthly_data = {}
        
        for tipo, lista in transactions.items():
            for transaction in lista:
                data_trans = datetime.strptime(transaction['data'], '%Y-%m-%d')
                mes_ano = data_trans.strftime('%Y-%m')
                
                if mes_ano not in monthly_data:
                    monthly_data[mes_ano] = {
                        'receitas': 0,
                        'gastos': 0,
                        'debito': 0,
                        'mercado_pago': 0,
                        'nubank': 0
                    }
                
                if tipo == 'receitas':
                    monthly_data[mes_ano]['receitas'] += transaction['valor']
                else:
                    monthly_data[mes_ano]['gastos'] += transaction['valor']
                    if tipo == 'gastos_debito':
                        monthly_data[mes_ano]['debito'] += transaction['valor']
                    elif tipo == 'gastos_mercado_pago':
                        monthly_data[mes_ano]['mercado_pago'] += transaction['valor']
                    elif tipo == 'gastos_nubank':
                        monthly_data[mes_ano]['nubank'] += transaction['valor']
        
        sorted_months = sorted(monthly_data.keys())
        meses_nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
        
        result = {
            'meses': [],
            'receitas': [],
            'gastos': [],
            'saldos': [],
            'debito': [],
            'mercado_pago': [],
            'nubank': []
        }
        
        for m in sorted_months:
            dt = datetime.strptime(m, '%Y-%m')
            mes_formatado = f"{meses_nomes[dt.month - 1]}/{dt.year}"
            result['meses'].append(mes_formatado)
            result['receitas'].append(monthly_data[m]['receitas'])
            result['gastos'].append(monthly_data[m]['gastos'])
            result['saldos'].append(monthly_data[m]['receitas'] - monthly_data[m]['gastos'])
            result['debito'].append(monthly_data[m]['debito'])
            result['mercado_pago'].append(monthly_data[m]['mercado_pago'])
            result['nubank'].append(monthly_data[m]['nubank'])
        
        return jsonify(result)
    except Exception as e:
        print(f"ERRO ao gerar resumo mensal: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'meses': [],
            'receitas': [],
            'gastos': [],
            'saldos': [],
            'debito': [],
            'mercado_pago': [],
            'nubank': []
        })

@app.route('/api/statistics', methods=['GET'])
def get_statistics():
    """Retorna estatísticas financeiras (filtradas por mês se especificado)"""
    try:
        transactions = load_transactions()
        
        # Obtém mês do filtro se especificado
        month_filter = request.args.get('month', None)
        
        # Filtra transações por mês se especificado
        def filter_by_month(transaction_list):
            if not month_filter:
                return transaction_list
            filtered = []
            for t in transaction_list:
                trans_date = datetime.strptime(t['data'], '%Y-%m-%d')
                trans_month = trans_date.strftime('%Y-%m')
                if trans_month == month_filter:
                    filtered.append(t)
            return filtered
        
        # Filtra cada tipo de transação
        receitas_filtradas = filter_by_month(transactions['receitas'])
        debito_filtrado = filter_by_month(transactions['gastos_debito'])
        mercado_pago_filtrado = filter_by_month(transactions['gastos_mercado_pago'])
        nubank_filtrado = filter_by_month(transactions['gastos_nubank'])
        
        # Calcula totais (filtrados ou não)
        total_receitas = sum(t['valor'] for t in receitas_filtradas)
        total_debito = sum(t['valor'] for t in debito_filtrado)
        total_mercado_pago = sum(t['valor'] for t in mercado_pago_filtrado)
        total_nubank = sum(t['valor'] for t in nubank_filtrado)
        total_gastos = total_debito + total_mercado_pago + total_nubank
        saldo = total_receitas - total_gastos
        
        # Média mensal (só calcula se não estiver filtrado por mês)
        if month_filter:
            # Se está filtrado por mês, média = valores do mês
            media_receitas = total_receitas
            media_gastos = total_gastos
            num_meses = 1
        else:
            monthly_data = {}
            for tipo, lista in transactions.items():
                for transaction in lista:
                    data_trans = datetime.strptime(transaction['data'], '%Y-%m-%d')
                    mes_ano = data_trans.strftime('%Y-%m')
                    if mes_ano not in monthly_data:
                        monthly_data[mes_ano] = {'receitas': 0, 'gastos': 0}
                    if tipo == 'receitas':
                        monthly_data[mes_ano]['receitas'] += transaction['valor']
                    else:
                        monthly_data[mes_ano]['gastos'] += transaction['valor']
            
            num_meses = len(monthly_data) if monthly_data else 1
            media_receitas = total_receitas / num_meses if num_meses > 0 else 0
            media_gastos = total_gastos / num_meses if num_meses > 0 else 0
        
        # Maior e menor transação (das transações filtradas)
        all_transactions = []
        all_transactions.extend(receitas_filtradas)
        all_transactions.extend(debito_filtrado)
        all_transactions.extend(mercado_pago_filtrado)
        all_transactions.extend(nubank_filtrado)
        
        if all_transactions:
            maior_transacao = max(all_transactions, key=lambda x: x['valor'])
            menor_transacao = min(all_transactions, key=lambda x: x['valor'])
        else:
            maior_transacao = None
            menor_transacao = None
        
        # Percentual de gastos por tipo
        if total_gastos > 0:
            pct_debito = (total_debito / total_gastos) * 100
            pct_mercado_pago = (total_mercado_pago / total_gastos) * 100
            pct_nubank = (total_nubank / total_gastos) * 100
        else:
            pct_debito = pct_mercado_pago = pct_nubank = 0
        
        # Transações parceladas
        parceladas = sum(1 for t in all_transactions if t.get('parcelado', False))
        total_parceladas = len(set(t.get('parcel_group_id') for t in all_transactions if t.get('parcel_group_id')))
        
        return jsonify({
            'total_receitas': total_receitas,
            'total_gastos': total_gastos,
            'saldo': saldo,
            'media_mensal_receitas': media_receitas,
            'media_mensal_gastos': media_gastos,
            'total_debito': total_debito,
            'total_mercado_pago': total_mercado_pago,
            'total_nubank': total_nubank,
            'pct_debito': pct_debito,
            'pct_mercado_pago': pct_mercado_pago,
            'pct_nubank': pct_nubank,
            'maior_transacao': maior_transacao,
            'menor_transacao': menor_transacao,
            'total_transacoes': len(all_transactions),
            'transacoes_parceladas': parceladas,
            'compras_parceladas': total_parceladas,
            'num_meses': num_meses
        })
    except Exception as e:
        print(f"ERRO ao gerar estatisticas: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def load_abatimentos():
    """Carrega abatimentos do Supabase"""
    if supabase is None:
        return []
    
    try:
        response = supabase.table('abatimentos').select('*').order('data', desc=False).execute()
        return response.data
    except Exception as e:
        print(f"ERRO ao carregar abatimentos: {e}")
        return []


def load_orcamentos(month_filter=None):
    """Carrega orçamentos por categoria."""
    if supabase is None:
        return []

    try:
        query = supabase.table('orcamentos').select('*')
        if month_filter:
            query = query.eq('mes_referencia', month_filter)
        response = query.order('mes_referencia', desc=True).execute()
        return response.data
    except Exception as e:
        print(f"ERRO ao carregar orcamentos: {e}")
        return []


def load_recorrencias(active_only=False):
    """Carrega regras de recorrência."""
    if supabase is None:
        return []

    try:
        query = supabase.table('recorrencias').select('*')
        if active_only:
            query = query.eq('ativo', True)
        response = query.order('created_at', desc=False).execute()
        return response.data
    except Exception as e:
        print(f"ERRO ao carregar recorrencias: {e}")
        return []


def calculate_cash_balance(today=None):
    """Saldo de caixa real: receitas - débito - abatimentos."""
    today_dt = today or datetime.now()
    today_date = today_dt.date()

    transactions = load_transactions()
    abatimentos = load_abatimentos()

    saldo = 0.0
    for tx in normalize_transactions(transactions):
        tx_date = parse_date(tx.get('data'))
        if not tx_date or tx_date.date() > today_date:
            continue
        if tx['tipo'] == 'receita':
            saldo += tx['valor']
        elif tx['tipo'] == 'debito':
            saldo -= tx['valor']

    for abat in abatimentos:
        abat_date = parse_date(abat.get('data'))
        if not abat_date or abat_date.date() > today_date:
            continue
        saldo -= float(abat.get('valor', 0) or 0)

    return saldo


def get_average_monthly_flow(lookback_days=180):
    """Média mensal de entradas e saídas no período recente."""
    end_dt = datetime.now()
    start_dt = end_dt - timedelta(days=lookback_days)

    monthly = {}
    for tx in normalize_transactions(load_transactions()):
        tx_date = parse_date(tx.get('data'))
        if not tx_date or tx_date < start_dt or tx_date > end_dt:
            continue
        key = month_key_from_date(tx_date)
        if key not in monthly:
            monthly[key] = {'receitas': 0.0, 'gastos': 0.0}
        if tx['tipo'] == 'receita':
            monthly[key]['receitas'] += tx['valor']
        else:
            monthly[key]['gastos'] += tx['valor']

    for abat in load_abatimentos():
        abat_date = parse_date(abat.get('data'))
        if not abat_date or abat_date < start_dt or abat_date > end_dt:
            continue
        key = month_key_from_date(abat_date)
        if key not in monthly:
            monthly[key] = {'receitas': 0.0, 'gastos': 0.0}
        monthly[key]['gastos'] += float(abat.get('valor', 0) or 0)

    if not monthly:
        return {'media_receitas': 0.0, 'media_gastos': 0.0, 'meses': 0}

    months_count = len(monthly)
    total_receitas = sum(v['receitas'] for v in monthly.values())
    total_gastos = sum(v['gastos'] for v in monthly.values())
    return {
        'media_receitas': total_receitas / months_count,
        'media_gastos': total_gastos / months_count,
        'meses': months_count
    }


def get_recurring_totals_until(days):
    """Soma valores recorrentes que vencem até D+N."""
    today = datetime.now().date()
    horizon = today + timedelta(days=days)
    recs = load_recorrencias(active_only=True)

    total_receitas = 0.0
    total_gastos = 0.0

    if not recs:
        return {'receitas': 0.0, 'gastos': 0.0}

    start_month = month_key_from_date(datetime.combine(today, datetime.min.time()))
    end_month = month_key_from_date(datetime.combine(horizon, datetime.min.time()))

    for rec in recs:
        tipo = rec.get('tipo')
        if tipo not in ('receita', 'debito', 'mercado_pago', 'nubank'):
            continue

        valor = float(rec.get('valor', 0) or 0)
        dia_mes = int(rec.get('dia_mes', 1) or 1)
        data_inicio = parse_date(rec.get('data_inicio'), datetime.now())
        first_month = month_key_from_date(data_inicio)

        month_start = max(start_month, first_month)
        for month_key in iter_month_keys(month_start, end_month):
            year, month = map(int, month_key.split('-'))
            due_day = clamp_day(year, month, dia_mes)
            due_date = datetime(year, month, due_day).date()
            if due_date <= today or due_date > horizon:
                continue

            if tipo == 'receita':
                total_receitas += valor
            else:
                total_gastos += valor

    return {'receitas': total_receitas, 'gastos': total_gastos}

@app.route('/api/abatimentos', methods=['GET'])
def get_abatimentos():
    """Retorna todos os abatimentos"""
    return jsonify(load_abatimentos())

@app.route('/api/abatimentos', methods=['POST'])
def add_abatimento():
    """Adiciona um novo abatimento/depósito"""
    if supabase is None:
        return jsonify({
            'success': False, 
            'error': 'Supabase não inicializado. Verifique o config.py ou variáveis de ambiente.'
        }), 500
    
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'Dados não fornecidos'}), 400
        
        abatimento_id = datetime.now().strftime('%Y%m%d%H%M%S%f')
        
        abatimento_data = {
            'id': abatimento_id,
            'tipo_cartao': data.get('tipo_cartao'),
            'valor': float(data.get('valor', 0)),
            'data': data.get('data', datetime.now().strftime('%Y-%m-%d')),
            'descricao': data.get('descricao', '')
        }
        
        response = supabase.table('abatimentos').insert(abatimento_data).execute()
        print(f"OK - Abatimento inserido com sucesso: {abatimento_id}")
        
        return jsonify({'success': True, 'abatimento': abatimento_data})
    except Exception as e:
        print(f"ERRO ao adicionar abatimento: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False, 
            'error': str(e)
        }), 500

@app.route('/api/abatimentos/<abatimento_id>', methods=['PUT'])
def update_abatimento(abatimento_id):
    """Atualiza um abatimento"""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase não inicializado'}), 500
    
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'Dados não fornecidos'}), 400
        
        # Verifica se o abatimento existe
        response = supabase.table('abatimentos').select('*').eq('id', abatimento_id).execute()
        
        if not response.data:
            return jsonify({'success': False, 'error': 'Abatimento não encontrado'}), 404
        
        # Atualiza o abatimento
        update_data = {
            'tipo_cartao': data.get('tipo_cartao'),
            'valor': float(data.get('valor', 0)),
            'data': data.get('data'),
            'descricao': data.get('descricao', '')
        }
        
        supabase.table('abatimentos').update(update_data).eq('id', abatimento_id).execute()
        print(f"OK - Abatimento atualizado: {abatimento_id}")
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"ERRO ao atualizar abatimento: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/abatimentos/<abatimento_id>', methods=['DELETE'])
def delete_abatimento(abatimento_id):
    """Remove um abatimento"""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase não inicializado'}), 500
    
    try:
        supabase.table('abatimentos').delete().eq('id', abatimento_id).execute()
        print(f"OK - Abatimento deletado: {abatimento_id}")
        return jsonify({'success': True})
    except Exception as e:
        print(f"ERRO ao deletar abatimento: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/faturas', methods=['GET'])
def get_faturas():
    """Retorna resumo de faturas (atual e abatida) para cada cartão do mês atual"""
    try:
        transactions = load_transactions()
        abatimentos = load_abatimentos()
        
        # Obtém mês atual ou mês especificado na query
        month_filter = request.args.get('month', None)
        if not month_filter:
            now = datetime.now()
            month_filter = now.strftime('%Y-%m')
        
        # Filtra transações do mês especificado
        def filter_by_month(transaction_list):
            filtered = []
            for t in transaction_list:
                trans_date = datetime.strptime(t['data'], '%Y-%m-%d')
                trans_month = trans_date.strftime('%Y-%m')
                if trans_month == month_filter:
                    filtered.append(t)
            return filtered
        
        # Filtra abatimentos do mês especificado
        def filter_abatimentos_by_month(abat_list, tipo_cartao):
            filtered = []
            for a in abat_list:
                if a['tipo_cartao'] == tipo_cartao:
                    abat_date = datetime.strptime(a['data'], '%Y-%m-%d')
                    abat_month = abat_date.strftime('%Y-%m')
                    if abat_month == month_filter:
                        filtered.append(a)
            return filtered
        
        # Calcula faturas do mês por cartão
        fatura_mp_mes = filter_by_month(transactions['gastos_mercado_pago'])
        fatura_nubank_mes = filter_by_month(transactions['gastos_nubank'])
        
        fatura_mercado_pago = sum(t['valor'] for t in fatura_mp_mes)
        fatura_nubank = sum(t['valor'] for t in fatura_nubank_mes)
        
        # Calcula abatimentos do mês por cartão
        abatido_mp_mes = filter_abatimentos_by_month(abatimentos, 'mercado_pago')
        abatido_nubank_mes = filter_abatimentos_by_month(abatimentos, 'nubank')
        
        abatido_mercado_pago = sum(a['valor'] for a in abatido_mp_mes)
        abatido_nubank = sum(a['valor'] for a in abatido_nubank_mes)
        
        # Calcula faturas atuais (fatura do mês - abatido do mês)
        atual_mercado_pago = max(0, fatura_mercado_pago - abatido_mercado_pago)
        atual_nubank = max(0, fatura_nubank - abatido_nubank)
        
        return jsonify({
            'month': month_filter,
            'mercado_pago': {
                'fatura_total': fatura_mercado_pago,
                'abatido': abatido_mercado_pago,
                'atual': atual_mercado_pago
            },
            'nubank': {
                'fatura_total': fatura_nubank,
                'abatido': abatido_nubank,
                'atual': atual_nubank
            }
        })
    except Exception as e:
        print(f"ERRO ao calcular faturas: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'month': month_filter if 'month_filter' in locals() else None,
            'mercado_pago': {'fatura_total': 0, 'abatido': 0, 'atual': 0},
            'nubank': {'fatura_total': 0, 'abatido': 0, 'atual': 0}
        }), 500


@app.route('/api/orcamentos', methods=['GET'])
def get_orcamentos():
    """Retorna orcamentos por categoria."""
    month_filter = request.args.get('month', None)
    return jsonify(load_orcamentos(month_filter))


@app.route('/api/orcamentos', methods=['POST'])
def upsert_orcamento():
    """Cria/atualiza orcamento por categoria e mes."""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase nao inicializado'}), 500

    try:
        data = request.json or {}
        categoria = data.get('categoria')
        if categoria not in BUDGET_CATEGORIES:
            return jsonify({'success': False, 'error': 'Categoria invalida'}), 400

        limite = float(data.get('limite', 0) or 0)
        if limite <= 0:
            return jsonify({'success': False, 'error': 'Limite deve ser maior que zero'}), 400

        mes_referencia = data.get('mes_referencia') or datetime.now().strftime('%Y-%m')
        alerta_percentual = float(data.get('alerta_percentual', 80) or 80)
        alerta_percentual = max(1, min(100, alerta_percentual))
        now_iso = datetime.now().isoformat()

        existing = supabase.table('orcamentos').select('*') \
            .eq('categoria', categoria).eq('mes_referencia', mes_referencia).limit(1).execute()

        if existing.data:
            orcamento_id = existing.data[0]['id']
            payload = {
                'limite': limite,
                'alerta_percentual': alerta_percentual,
                'updated_at': now_iso
            }
            supabase.table('orcamentos').update(payload).eq('id', orcamento_id).execute()
            return jsonify({
                'success': True,
                'updated': True,
                'orcamento': {
                    'id': orcamento_id,
                    'categoria': categoria,
                    'mes_referencia': mes_referencia,
                    'limite': limite,
                    'alerta_percentual': alerta_percentual
                }
            })

        orcamento_id = datetime.now().strftime('%Y%m%d%H%M%S%f')
        payload = {
            'id': orcamento_id,
            'categoria': categoria,
            'mes_referencia': mes_referencia,
            'limite': limite,
            'alerta_percentual': alerta_percentual,
            'created_at': now_iso,
            'updated_at': now_iso
        }
        supabase.table('orcamentos').insert(payload).execute()
        return jsonify({'success': True, 'updated': False, 'orcamento': payload})
    except Exception as e:
        print(f"ERRO ao salvar orcamento: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'details': 'Verifique se a tabela orcamentos existe no Supabase'
        }), 500


@app.route('/api/orcamentos/<orcamento_id>', methods=['PUT'])
def update_orcamento(orcamento_id):
    """Atualiza um orçamento específico."""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase nao inicializado'}), 500

    try:
        data = request.json or {}
        payload = {
            'limite': float(data.get('limite', 0) or 0),
            'alerta_percentual': float(data.get('alerta_percentual', 80) or 80),
            'updated_at': datetime.now().isoformat()
        }
        if payload['limite'] <= 0:
            return jsonify({'success': False, 'error': 'Limite deve ser maior que zero'}), 400

        payload['alerta_percentual'] = max(1, min(100, payload['alerta_percentual']))
        supabase.table('orcamentos').update(payload).eq('id', orcamento_id).execute()
        return jsonify({'success': True})
    except Exception as e:
        print(f"ERRO ao atualizar orcamento: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/orcamentos/<orcamento_id>', methods=['DELETE'])
def delete_orcamento(orcamento_id):
    """Remove um orçamento."""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase nao inicializado'}), 500

    try:
        supabase.table('orcamentos').delete().eq('id', orcamento_id).execute()
        return jsonify({'success': True})
    except Exception as e:
        print(f"ERRO ao deletar orcamento: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/orcamentos/summary', methods=['GET'])
def get_orcamentos_summary():
    """Resumo de execução de orçamento com alertas."""
    try:
        month_filter = request.args.get('month', datetime.now().strftime('%Y-%m'))
        budgets = load_orcamentos(month_filter)

        spent = {category: 0.0 for category in BUDGET_CATEGORIES}
        for tx in normalize_transactions(load_transactions()):
            tx_date = parse_date(tx.get('data'))
            if not tx_date:
                continue
            if month_key_from_date(tx_date) != month_filter:
                continue
            if tx['tipo'] in spent:
                spent[tx['tipo']] += tx['valor']

        by_category = []
        for category, label in BUDGET_CATEGORIES.items():
            budget_row = next((b for b in budgets if b.get('categoria') == category), None)
            limit_value = float((budget_row or {}).get('limite', 0) or 0)
            alert_threshold = float((budget_row or {}).get('alerta_percentual', 80) or 80)
            used_value = spent.get(category, 0.0)
            remaining_value = limit_value - used_value
            usage_pct = (used_value / limit_value * 100) if limit_value > 0 else 0

            if limit_value <= 0:
                status = 'sem_orcamento'
            elif usage_pct >= 100:
                status = 'estourado'
            elif usage_pct >= alert_threshold:
                status = 'alerta'
            else:
                status = 'ok'

            by_category.append({
                'id': (budget_row or {}).get('id'),
                'categoria': category,
                'label': label,
                'mes_referencia': month_filter,
                'limite': limit_value,
                'usado': used_value,
                'restante': remaining_value,
                'uso_percentual': usage_pct,
                'alerta_percentual': alert_threshold,
                'status': status
            })

        alerts = [c for c in by_category if c['status'] in ('alerta', 'estourado')]
        total_limit = sum(item['limite'] for item in by_category)
        total_spent = sum(item['usado'] for item in by_category)

        return jsonify({
            'month': month_filter,
            'categories': by_category,
            'alerts': alerts,
            'totals': {
                'limite_total': total_limit,
                'usado_total': total_spent,
                'restante_total': total_limit - total_spent,
                'uso_percentual_total': (total_spent / total_limit * 100) if total_limit > 0 else 0
            }
        })
    except Exception as e:
        print(f"ERRO no resumo de orcamentos: {e}")
        return jsonify({
            'month': request.args.get('month', datetime.now().strftime('%Y-%m')),
            'categories': [],
            'alerts': [],
            'totals': {
                'limite_total': 0,
                'usado_total': 0,
                'restante_total': 0,
                'uso_percentual_total': 0
            }
        }), 500


@app.route('/api/recorrencias', methods=['GET'])
def get_recorrencias():
    """Retorna todas as recorrencias."""
    return jsonify(load_recorrencias(active_only=False))


@app.route('/api/recorrencias', methods=['POST'])
def add_recorrencia():
    """Cadastra uma recorrencia de transacao."""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase nao inicializado'}), 500

    try:
        data = request.json or {}
        tipo = data.get('tipo')
        if tipo not in ('receita', 'debito', 'mercado_pago', 'nubank'):
            return jsonify({'success': False, 'error': 'Tipo invalido'}), 400

        descricao = str(data.get('descricao', '')).strip()
        if not descricao:
            return jsonify({'success': False, 'error': 'Descricao obrigatoria'}), 400

        valor = float(data.get('valor', 0) or 0)
        if valor <= 0:
            return jsonify({'success': False, 'error': 'Valor deve ser maior que zero'}), 400

        dia_mes = int(data.get('dia_mes', 1) or 1)
        dia_mes = max(1, min(31, dia_mes))
        data_inicio = data.get('data_inicio') or datetime.now().strftime('%Y-%m-%d')
        ativo = bool(data.get('ativo', True))

        rec_id = datetime.now().strftime('%Y%m%d%H%M%S%f')
        now_iso = datetime.now().isoformat()
        payload = {
            'id': rec_id,
            'tipo': tipo,
            'descricao': descricao,
            'valor': valor,
            'dia_mes': dia_mes,
            'data_inicio': data_inicio,
            'ativo': ativo,
            'observacao': data.get('observacao', ''),
            'ultima_competencia': None,
            'created_at': now_iso,
            'updated_at': now_iso
        }
        supabase.table('recorrencias').insert(payload).execute()
        return jsonify({'success': True, 'recorrencia': payload})
    except Exception as e:
        print(f"ERRO ao adicionar recorrencia: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'details': 'Verifique se a tabela recorrencias existe no Supabase'
        }), 500


@app.route('/api/recorrencias/<recorrencia_id>', methods=['PUT'])
def update_recorrencia(recorrencia_id):
    """Atualiza uma recorrencia."""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase nao inicializado'}), 500

    try:
        data = request.json or {}
        payload = {
            'tipo': data.get('tipo'),
            'descricao': str(data.get('descricao', '')).strip(),
            'valor': float(data.get('valor', 0) or 0),
            'dia_mes': max(1, min(31, int(data.get('dia_mes', 1) or 1))),
            'data_inicio': data.get('data_inicio') or datetime.now().strftime('%Y-%m-%d'),
            'ativo': bool(data.get('ativo', True)),
            'observacao': data.get('observacao', ''),
            'updated_at': datetime.now().isoformat()
        }

        if payload['tipo'] not in ('receita', 'debito', 'mercado_pago', 'nubank'):
            return jsonify({'success': False, 'error': 'Tipo invalido'}), 400
        if not payload['descricao']:
            return jsonify({'success': False, 'error': 'Descricao obrigatoria'}), 400
        if payload['valor'] <= 0:
            return jsonify({'success': False, 'error': 'Valor deve ser maior que zero'}), 400

        supabase.table('recorrencias').update(payload).eq('id', recorrencia_id).execute()
        return jsonify({'success': True})
    except Exception as e:
        print(f"ERRO ao atualizar recorrencia: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/recorrencias/<recorrencia_id>', methods=['DELETE'])
def delete_recorrencia(recorrencia_id):
    """Remove uma recorrencia."""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase nao inicializado'}), 500

    try:
        supabase.table('recorrencias').delete().eq('id', recorrencia_id).execute()
        return jsonify({'success': True})
    except Exception as e:
        print(f"ERRO ao deletar recorrencia: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/recorrencias/process', methods=['POST'])
def process_recorrencias():
    """Materializa transacoes recorrentes vencidas ate hoje."""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase nao inicializado'}), 500

    try:
        recs = load_recorrencias(active_only=True)
        today = datetime.now()
        today_month = today.strftime('%Y-%m')
        created = 0
        generated = []

        for rec in recs:
            rec_id = rec.get('id')
            tipo = rec.get('tipo')
            if tipo not in ('receita', 'debito', 'mercado_pago', 'nubank'):
                continue

            valor = float(rec.get('valor', 0) or 0)
            if valor <= 0:
                continue

            descricao = rec.get('descricao', '').strip()
            if not descricao:
                continue

            dia_mes = max(1, min(31, int(rec.get('dia_mes', 1) or 1)))
            data_inicio = parse_date(rec.get('data_inicio'), today)
            start_month = month_key_from_date(data_inicio)
            last_month = rec.get('ultima_competencia')
            if last_month:
                start_month = max(start_month, next_month_key(last_month))

            last_processed = last_month
            for month_key in iter_month_keys(start_month, today_month):
                year, month = map(int, month_key.split('-'))
                due_day = clamp_day(year, month, dia_mes)
                due_date = datetime(year, month, due_day)
                if due_date > today:
                    continue

                marker = f"rec_{rec_id}_{month_key}"
                exists = supabase.table('transactions').select('id') \
                    .eq('parcel_group_id', marker).limit(1).execute()
                if exists.data:
                    last_processed = month_key
                    continue

                transaction_id = datetime.now().strftime('%Y%m%d%H%M%S%f')
                tx_payload = {
                    'id': transaction_id,
                    'tipo': tipo,
                    'descricao': descricao,
                    'valor': valor,
                    'data': due_date.strftime('%Y-%m-%d'),
                    'parcelado': False,
                    'parcela_atual': None,
                    'total_parcelas': None,
                    'valor_total': valor,
                    'parcel_group_id': marker
                }
                supabase.table('transactions').insert(tx_payload).execute()
                created += 1
                generated.append(tx_payload)
                last_processed = month_key

            if last_processed and last_processed != rec.get('ultima_competencia'):
                supabase.table('recorrencias').update({
                    'ultima_competencia': last_processed,
                    'updated_at': datetime.now().isoformat()
                }).eq('id', rec_id).execute()

        return jsonify({'success': True, 'created': created, 'transactions': generated})
    except Exception as e:
        print(f"ERRO ao processar recorrencias: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/projecao-d90', methods=['GET'])
def get_projection_d90():
    """Projecao de caixa D+30/D+60/D+90 com cenarios."""
    try:
        saldo_atual = calculate_cash_balance()
        avg = get_average_monthly_flow(lookback_days=180)

        horizons = [30, 60, 90]
        scenarios = {
            'otimista': {'mult_receitas': 1.10, 'mult_gastos': 0.90},
            'base': {'mult_receitas': 1.00, 'mult_gastos': 1.00},
            'pessimista': {'mult_receitas': 0.90, 'mult_gastos': 1.15}
        }

        output = {}
        for scenario_name, mult in scenarios.items():
            points = {}
            for days in horizons:
                recurring = get_recurring_totals_until(days)
                factor = days / 30.0
                projected_receitas = avg['media_receitas'] * factor * mult['mult_receitas']
                projected_gastos = avg['media_gastos'] * factor * mult['mult_gastos']
                saldo = saldo_atual + recurring['receitas'] - recurring['gastos'] + projected_receitas - projected_gastos

                points[f'd{days}'] = {
                    'saldo': saldo,
                    'receitas_estimadas': projected_receitas + recurring['receitas'],
                    'gastos_estimados': projected_gastos + recurring['gastos'],
                    'recorrente_receitas': recurring['receitas'],
                    'recorrente_gastos': recurring['gastos']
                }
            output[scenario_name] = points

        return jsonify({
            'saldo_atual': saldo_atual,
            'base_historica': {
                'media_receitas_mensais': avg['media_receitas'],
                'media_gastos_mensais': avg['media_gastos'],
                'meses_avaliados': avg['meses']
            },
            'cenarios': output
        })
    except Exception as e:
        print(f"ERRO na projecao D+90: {e}")
        return jsonify({
            'saldo_atual': 0,
            'base_historica': {
                'media_receitas_mensais': 0,
                'media_gastos_mensais': 0,
                'meses_avaliados': 0
            },
            'cenarios': {
                'otimista': {},
                'base': {},
                'pessimista': {}
            }
        }), 500

@app.route('/api/metas', methods=['GET'])
def get_metas():
    """Retorna todas as metas financeiras"""
    if supabase is None:
        return jsonify([])
    
    try:
        response = supabase.table('metas').select('*').order('created_at', desc=False).execute()
        return jsonify(response.data)
    except Exception as e:
        print(f"ERRO ao carregar metas: {e}")
        return jsonify([]), 500

@app.route('/api/metas', methods=['POST'])
def add_meta():
    """Adiciona uma nova meta financeira"""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase não inicializado'}), 500
    
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'Dados não fornecidos'}), 400
        
        meta_id = datetime.now().strftime('%Y%m%d%H%M%S%f')
        
        meta_data = {
            'id': meta_id,
            'nome': data.get('nome'),
            'valor_alvo': float(data.get('valor_alvo', 0)),
            'valor_atual': float(data.get('valor_atual', 0)),
            'data_inicio': data.get('data_inicio', datetime.now().strftime('%Y-%m-%d')),
            'data_fim': data.get('data_fim'),
            'categoria': data.get('categoria'),
            'status': 'ativa'
        }
        
        response = supabase.table('metas').insert(meta_data).execute()
        print(f"OK - Meta inserida com sucesso: {meta_id}")
        
        return jsonify({'success': True, 'meta': meta_data})
    except Exception as e:
        print(f"ERRO ao adicionar meta: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/metas/<meta_id>', methods=['PUT'])
def update_meta(meta_id):
    """Atualiza uma meta financeira"""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase não inicializado'}), 500
    
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'Dados não fornecidos'}), 400
        
        update_data = {
            'nome': data.get('nome'),
            'valor_alvo': float(data.get('valor_alvo', 0)),
            'valor_atual': float(data.get('valor_atual', 0)),
            'data_fim': data.get('data_fim'),
            'categoria': data.get('categoria'),
            'status': data.get('status', 'ativa'),
            'updated_at': datetime.now().isoformat()
        }
        
        supabase.table('metas').update(update_data).eq('id', meta_id).execute()
        print(f"OK - Meta atualizada: {meta_id}")
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"ERRO ao atualizar meta: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/version', methods=['GET'])
def get_version():
    """Retorna data e hash do último commit git"""
    try:
        import subprocess
        commit_hash = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], stderr=subprocess.DEVNULL).decode().strip()
        commit_date = subprocess.check_output(['git', 'log', '-1', '--format=%ci'], stderr=subprocess.DEVNULL).decode().strip()
        return jsonify({'hash': commit_hash, 'date': commit_date})
    except Exception:
        return jsonify({'hash': 'N/A', 'date': 'N/A'})

@app.route('/api/metas/<meta_id>', methods=['DELETE'])
def delete_meta(meta_id):
    """Remove uma meta financeira"""
    if supabase is None:
        return jsonify({'success': False, 'error': 'Supabase não inicializado'}), 500
    
    try:
        supabase.table('metas').delete().eq('id', meta_id).execute()
        print(f"OK - Meta deletada: {meta_id}")
        return jsonify({'success': True})
    except Exception as e:
        print(f"ERRO ao deletar meta: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print("\n" + "="*50)
    print("Iniciando servidor Flask...")
    print("="*50)
    print(f"Diretorio de templates: {template_dir}")
    print(f"Diretorio de static: {static_dir}")
    print(f"Supabase: {'Conectado OK' if supabase else 'Nao conectado'}")
    print("="*50)
    print("Servidor rodando em: http://localhost:5000")
    print("="*50 + "\n")
    app.run(debug=True, port=5000, host='127.0.0.1')
