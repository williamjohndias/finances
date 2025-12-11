# Vercel serverless function wrapper for Flask
import sys
import os

# Adiciona o diretório raiz ao path para importar app
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Importa o app Flask
from app import app

# Para Vercel, o handler precisa ser uma função que recebe request e response
# Mas o Flask app já é WSGI-compatible, então podemos usar diretamente
# O Vercel Python runtime vai chamar o app como WSGI

# Exporta o app Flask diretamente - Vercel detecta automaticamente
# Se isso não funcionar, usamos o handler abaixo
try:
    # Tenta usar o app diretamente
    handler = app
except:
    # Fallback: cria um handler wrapper
    def handler(request):
        from werkzeug.wrappers import Request, Response
        from werkzeug.serving import WSGIRequestHandler
        
        # Converte request do Vercel para Werkzeug Request
        werkzeug_request = Request.from_values(
            method=request.method,
            path=request.path,
            query_string=request.query_string or '',
            headers=request.headers,
            input_stream=request.body if hasattr(request, 'body') else None
        )
        
        # Processa com Flask
        with app.request_context(werkzeug_request.environ):
            response = app.full_dispatch_request()
        
        # Retorna resposta no formato do Vercel
        return {
            'statusCode': response.status_code,
            'headers': dict(response.headers),
            'body': response.get_data(as_text=True)
        }
