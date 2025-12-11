# Vercel serverless function wrapper for Flask
import sys
import os

# Adiciona o diretório raiz ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

# Vercel expects a handler function
def handler(request):
    return app(request.environ, lambda status, headers: None)
