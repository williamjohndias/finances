# Vercel serverless function wrapper for Flask
import sys
import os

# Adiciona o diretório raiz ao path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Importa o app Flask
try:
    from app import app
except Exception as e:
    # Se houver erro na importação, cria um app de erro
    from flask import Flask
    app = Flask(__name__)
    
    @app.route('/')
    def error():
        return f'Error importing app: {str(e)}', 500

# Handler para Vercel
# O Vercel Python runtime espera uma função handler ou o app WSGI diretamente
handler = app
