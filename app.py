from flask import Flask, render_template, request, jsonify
from datetime import datetime
from dateutil.relativedelta import relativedelta
import os

# Configuração do Flask
template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'templates'))
app = Flask(__name__, template_folder=template_dir)

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
        num_parcelas = int(data.get('num_parcelas', 1))
        valor_total = float(data.get('valor', 0))
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
                    if tipo == 'debito':
                        monthly_data[mes_ano]['debito'] += transaction['valor']
                    elif tipo == 'mercado_pago':
                        monthly_data[mes_ano]['mercado_pago'] += transaction['valor']
                    elif tipo == 'nubank':
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

if __name__ == '__main__':
    print("\n" + "="*50)
    print("Iniciando servidor Flask...")
    print("="*50)
    print(f"Diretorio de templates: {template_dir}")
    print(f"Supabase: {'Conectado OK' if supabase else 'Nao conectado'}")
    print("="*50)
    print("Servidor rodando em: http://localhost:5000")
    print("="*50 + "\n")
    app.run(debug=True, port=5000, host='127.0.0.1')
