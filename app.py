from flask import Flask, render_template, request, jsonify
from datetime import datetime
from dateutil.relativedelta import relativedelta
from supabase import create_client, Client
import os

# Configuração do Flask com caminho absoluto para templates (necessário para Vercel)
template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'templates'))
app = Flask(__name__, template_folder=template_dir)

# Importa configurações
try:
    from config import SUPABASE_URL, SUPABASE_KEY
except ImportError:
    # Se config.py não existir, usa variáveis de ambiente
    SUPABASE_URL = os.getenv('SUPABASE_URL', '')
    SUPABASE_KEY = os.getenv('SUPABASE_KEY', '')

# Inicializa cliente Supabase com tratamento de erro
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Erro ao inicializar Supabase: {e}")
    supabase = None

def load_transactions():
    """Carrega transações do Supabase"""
    try:
        if supabase is None:
            return {
                'receitas': [],
                'gastos_debito': [],
                'gastos_mercado_pago': [],
                'gastos_nubank': []
            }
        # Busca todas as transações
        response = supabase.table('transactions').select('*').order('data', desc=False).execute()
        
        transactions = {
            'receitas': [],
            'gastos_debito': [],
            'gastos_mercado_pago': [],
            'gastos_nubank': []
        }
        
        # Organiza por tipo
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
        print(f"Erro ao carregar transações: {e}")
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
    try:
        if supabase is None:
            return jsonify({'success': False, 'error': 'Supabase não inicializado. Verifique as variáveis de ambiente.'}), 500
        
        data = request.json
        
        tipo = data.get('tipo')
        num_parcelas = int(data.get('num_parcelas', 1))
        valor_total = float(data.get('valor', 0))
        valor_parcela = valor_total / num_parcelas
        data_inicial = datetime.strptime(data.get('data', datetime.now().strftime('%Y-%m-%d')), '%Y-%m-%d')
        
        # Se for parcelado, cria múltiplas transações
        transacoes_criadas = []
        base_id = datetime.now().strftime('%Y%m%d%H%M%S%f')
        parcel_group_id = base_id if num_parcelas > 1 else None
        
        # Prepara dados para inserção em lote
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
        
        # Insere todas as transações de uma vez
        supabase.table('transactions').insert(transactions_to_insert).execute()
        
        return jsonify({'success': True, 'transactions': transacoes_criadas})
    except Exception as e:
        print(f"Erro ao adicionar transação: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/transactions/<tipo>/<transaction_id>', methods=['DELETE'])
def delete_transaction(tipo, transaction_id):
    """Remove uma transação"""
    try:
        if supabase is None:
            return jsonify({'success': False, 'error': 'Supabase não inicializado. Verifique as variáveis de ambiente.'}), 500
        
        # Busca a transação para verificar se é parcelada
        response = supabase.table('transactions').select('*').eq('id', transaction_id).execute()
        
        if not response.data:
            return jsonify({'success': False, 'error': 'Transação não encontrada'}), 404
        
        transaction_to_delete = response.data[0]
        
        # Se for parcelado, remove todas as parcelas relacionadas
        if transaction_to_delete.get('parcelado') and transaction_to_delete.get('parcel_group_id'):
            parcel_group_id = transaction_to_delete.get('parcel_group_id')
            # Remove todas as parcelas do mesmo grupo
            supabase.table('transactions').delete().eq('parcel_group_id', parcel_group_id).execute()
        else:
            # Remove apenas a transação específica
            supabase.table('transactions').delete().eq('id', transaction_id).execute()
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Erro ao deletar transação: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/transactions/monthly', methods=['GET'])
def get_monthly_summary():
    """Retorna resumo mensal para o gráfico"""
    try:
        transactions = load_transactions()
        monthly_data = {}
        
        # Processa todas as transações
        for tipo, lista in transactions.items():
            for transaction in lista:
                data_trans = datetime.strptime(transaction['data'], '%Y-%m-%d')
                mes_ano = data_trans.strftime('%Y-%m')
                
                if mes_ano not in monthly_data:
                    monthly_data[mes_ano] = {
                        'receitas': 0,
                        'gastos': 0
                    }
                
                if tipo == 'receitas':
                    monthly_data[mes_ano]['receitas'] += transaction['valor']
                else:
                    monthly_data[mes_ano]['gastos'] += transaction['valor']
        
        # Ordena por mês
        sorted_months = sorted(monthly_data.keys())
        
        # Formata meses para português
        meses_pt = {
            'Jan': 'Jan', 'Feb': 'Fev', 'Mar': 'Mar', 'Apr': 'Abr',
            'May': 'Mai', 'Jun': 'Jun', 'Jul': 'Jul', 'Aug': 'Ago',
            'Sep': 'Set', 'Oct': 'Out', 'Nov': 'Nov', 'Dec': 'Dez'
        }
        
        result = {
            'meses': [],
            'receitas': [],
            'gastos': [],
            'saldos': []
        }
        
        for m in sorted_months:
            dt = datetime.strptime(m, '%Y-%m')
            # Formata como "Mês/Ano" em português
            meses_nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                          'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
            mes_formatado = f"{meses_nomes[dt.month - 1]}/{dt.year}"
            result['meses'].append(mes_formatado)
            result['receitas'].append(monthly_data[m]['receitas'])
            result['gastos'].append(monthly_data[m]['gastos'])
            result['saldos'].append(monthly_data[m]['receitas'] - monthly_data[m]['gastos'])
        
        return jsonify(result)
    except Exception as e:
        print(f"Erro ao gerar resumo mensal: {e}")
        return jsonify({
            'meses': [],
            'receitas': [],
            'gastos': [],
            'saldos': []
        })

# Para desenvolvimento local
if __name__ == '__main__':
    app.run(debug=True, port=5000)
