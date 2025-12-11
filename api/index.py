# Vercel serverless function wrapper for Flask
import sys
import os
from io import BytesIO

# Adiciona o diretório raiz ao path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Importa o app Flask
try:
    from app import app
    print("App Flask importado com sucesso")
except Exception as e:
    import traceback
    error_msg = traceback.format_exc()
    print(f"ERRO ao importar app: {error_msg}")
    # Se houver erro na importação, cria um app de erro
    from flask import Flask
    app = Flask(__name__)
    
    @app.route('/')
    def error():
        return f'<h1>Erro ao importar aplicação</h1><pre>{error_msg}</pre>', 500

def handler(request):
    """
    Handler function for Vercel serverless functions
    Converte requisição do Vercel para WSGI e retorna resposta
    """
    try:
        # Constrói ambiente WSGI
        method = getattr(request, 'method', 'GET')
        path = getattr(request, 'path', '/')
        query_string = getattr(request, 'query_string', '') or ''
        
        # Headers
        headers = {}
        if hasattr(request, 'headers'):
            for key, value in request.headers.items():
                headers[key.lower()] = value
        
        # Body
        body = b''
        if hasattr(request, 'body'):
            body = request.body
            if isinstance(body, str):
                body = body.encode('utf-8')
        
        # Constrói environ WSGI
        environ = {
            'REQUEST_METHOD': method,
            'SCRIPT_NAME': '',
            'PATH_INFO': path,
            'QUERY_STRING': query_string,
            'CONTENT_TYPE': headers.get('content-type', ''),
            'CONTENT_LENGTH': str(len(body)),
            'SERVER_NAME': headers.get('host', 'localhost').split(':')[0],
            'SERVER_PORT': headers.get('host', 'localhost').split(':')[1] if ':' in headers.get('host', '') else '80',
            'wsgi.version': (1, 0),
            'wsgi.url_scheme': headers.get('x-forwarded-proto', 'https'),
            'wsgi.input': BytesIO(body),
            'wsgi.errors': sys.stderr,
            'wsgi.multithread': False,
            'wsgi.multiprocess': True,
            'wsgi.run_once': False,
        }
        
        # Adiciona headers HTTP
        for key, value in headers.items():
            if key not in ('content-type', 'content-length'):
                env_key = 'HTTP_' + key.upper().replace('-', '_')
                environ[env_key] = value
        
        # Variáveis adicionais
        environ['HTTP_HOST'] = headers.get('host', 'localhost')
        environ['HTTP_X_FORWARDED_FOR'] = headers.get('x-forwarded-for', '')
        environ['HTTP_X_FORWARDED_PROTO'] = headers.get('x-forwarded-proto', 'https')
        
        # Callback para capturar status e headers
        status_code = [200]
        response_headers = []
        
        def start_response(wsgi_status, wsgi_headers):
            status_code[0] = int(wsgi_status.split()[0])
            response_headers[:] = wsgi_headers
        
        # Executa app Flask
        response_body = []
        for chunk in app(environ, start_response):
            if isinstance(chunk, bytes):
                response_body.append(chunk)
            else:
                response_body.append(chunk.encode('utf-8'))
        
        # Converte resposta
        body_str = b''.join(response_body).decode('utf-8')
        
        # Converte headers para dict
        headers_dict = {}
        for key, value in response_headers:
            headers_dict[key] = value
        
        return {
            'statusCode': status_code[0],
            'headers': headers_dict,
            'body': body_str
        }
        
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        print(f"ERRO no handler: {error_msg}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'text/html; charset=utf-8'},
            'body': f'<h1>Erro Interno do Servidor</h1><pre>{error_msg}</pre>'
        }
