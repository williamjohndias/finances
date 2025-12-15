# Vercel serverless function - exporta app Flask diretamente
import sys
import os

# Adiciona o diretório raiz ao path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Log inicial
print("="*60)
print("Iniciando Vercel serverless function...")
print("="*60)

# Verifica variáveis de ambiente ANTES de importar
print(f"\nVerificando variaveis de ambiente:")
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')
print(f"  SUPABASE_URL: {'Sim' if supabase_url else 'Nao'}")
print(f"  SUPABASE_KEY: {'Sim' if supabase_key else 'Nao'}")

# Importa o app Flask
try:
    print("\nImportando app Flask...")
    from app import app, supabase
    print("OK - App Flask importado")
    print(f"  Supabase inicializado: {'Sim' if supabase else 'Nao'}")
    print("="*60 + "\n")
except Exception as e:
    import traceback
    error_msg = traceback.format_exc()
    print(f"\nERRO ao importar app:")
    print(error_msg)
    print("="*60)
    
    # Cria app de erro
    from flask import Flask
    app = Flask(__name__)
    
    @app.route('/')
    def error():
        return f'<h1>Erro ao importar aplicacao</h1><pre>{error_msg}</pre>', 500

# Exporta o app Flask diretamente para o Vercel
# O Vercel detecta automaticamente apps Flask e os trata corretamente
__all__ = ['app']
