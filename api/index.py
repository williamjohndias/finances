# Vercel serverless function wrapper for Flask
import sys
import os

# Adiciona o diretório raiz ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

# Para Vercel, exportamos o app Flask diretamente
# O Vercel Python runtime trata Flask apps automaticamente
handler = app
