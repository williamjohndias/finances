# Script de teste para verificar se todas as importações funcionam
import sys
import os

# Adiciona o diretório raiz ao path
root_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, root_dir)

print("Testando importações...")

try:
    print("1. Importando Flask...")
    from flask import Flask
    print("   ✓ Flask importado")
except Exception as e:
    print(f"   ✗ Erro: {e}")

try:
    print("2. Importando supabase...")
    from supabase import create_client
    print("   ✓ Supabase importado")
except Exception as e:
    print(f"   ✗ Erro: {e}")

try:
    print("3. Importando dateutil...")
    from dateutil.relativedelta import relativedelta
    print("   ✓ dateutil importado")
except Exception as e:
    print(f"   ✗ Erro: {e}")

try:
    print("4. Importando config...")
    from config import SUPABASE_URL, SUPABASE_KEY
    print(f"   ✓ Config importado (URL: {SUPABASE_URL[:30]}...)")
except Exception as e:
    print(f"   ✗ Erro: {e}")
    print("   Tentando variáveis de ambiente...")
    SUPABASE_URL = os.getenv('SUPABASE_URL', '')
    SUPABASE_KEY = os.getenv('SUPABASE_KEY', '')
    if SUPABASE_URL and SUPABASE_KEY:
        print(f"   ✓ Variáveis de ambiente encontradas (URL: {SUPABASE_URL[:30]}...)")
    else:
        print("   ✗ Variáveis de ambiente não encontradas")

try:
    print("5. Importando app...")
    from app import app
    print("   ✓ App importado com sucesso!")
except Exception as e:
    import traceback
    print(f"   ✗ Erro: {e}")
    print(f"   Traceback: {traceback.format_exc()}")

print("\nTeste concluído!")

