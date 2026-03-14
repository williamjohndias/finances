#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Script de teste para verificar conexão com Supabase"""

print("="*60)
print("Teste de Conexao com Supabase")
print("="*60)

# 1. Testar importação do config
print("\n1. Testando importacao do config.py...")
try:
    from config import SUPABASE_URL, SUPABASE_KEY
    print(f"   OK - Config importado")
    print(f"   URL: {SUPABASE_URL}")
    print(f"   Key presente: {'Sim' if SUPABASE_KEY else 'Não'}")
    print(f"   Key tamanho: {len(SUPABASE_KEY) if SUPABASE_KEY else 0} caracteres")
    if SUPABASE_KEY:
        print(f"   Key inicia com: {SUPABASE_KEY[:30]}...")
except Exception as e:
    print(f"   ERRO: {e}")
    exit(1)

# 2. Testar importação da biblioteca supabase
print("\n2. Testando importacao da biblioteca supabase...")
try:
    from supabase import create_client, Client
    print("   OK - Biblioteca supabase importada")
except Exception as e:
    print(f"   ERRO ao importar: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

# 3. Testar criação do cliente
print("\n3. Testando criacao do cliente Supabase...")
try:
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("   OK - Cliente criado com sucesso!")
except Exception as e:
    print(f"   ERRO ao criar cliente:")
    print(f"     Tipo: {type(e).__name__}")
    print(f"     Mensagem: {str(e)}")
    import traceback
    print("\n   📋 Traceback:")
    traceback.print_exc()
    exit(1)

# 4. Testar conexão com a tabela
print("\n4. Testando conexao com a tabela 'transactions'...")
try:
    response = client.table('transactions').select('*').limit(1).execute()
    print(f"   OK - Conexao com tabela OK!")
    print(f"   Registros encontrados: {len(response.data)}")
except Exception as e:
    print(f"   ERRO ao acessar tabela:")
    print(f"     Tipo: {type(e).__name__}")
    print(f"     Mensagem: {str(e)}")
    print("\n   💡 Dica: Verifique se a tabela 'transactions' foi criada no Supabase")
    print("   Execute o script database_setup.sql no SQL Editor do Supabase")
    import traceback
    print("\n   📋 Traceback:")
    traceback.print_exc()
    exit(1)

print("\n" + "="*60)
print("SUCESSO! Todos os testes passaram! Supabase esta funcionando!")
print("="*60)

