# Vercel serverless function wrapper for Flask
import sys
import os
from io import BytesIO

# Adiciona o diretório raiz ao path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Importa o app Flask
from app import app

def handler(request):
    """
    Handler function for Vercel serverless functions
    """
    try:
        # Constrói o ambiente WSGI a partir da requisição do Vercel
        method = request.method
        path = request.path
        query_string = request.query_string or ''
        
        # Headers
        headers = {}
        for key, value in request.headers.items():
            headers[key.lower()] = value
        
        # Body
        body = request.body if hasattr(request, 'body') else b''
        if isinstance(body, str):
            body = body.encode('utf-8')
        
        # Constrói o ambiente WSGI
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
        
        # Adiciona headers HTTP ao ambiente
        for key, value in headers.items():
            if key not in ('content-type', 'content-length'):
                env_key = 'HTTP_' + key.upper().replace('-', '_')
                environ[env_key] = value
        
        # Variáveis adicionais
        environ['HTTP_HOST'] = headers.get('host', 'localhost')
        environ['HTTP_X_FORWARDED_FOR'] = headers.get('x-forwarded-for', '')
        environ['HTTP_X_FORWARDED_PROTO'] = headers.get('x-forwarded-proto', 'https')
        
        # Callback para capturar status e headers
        status = [200]
        response_headers = []
        
        def start_response(wsgi_status, wsgi_headers):
            status[0] = int(wsgi_status.split()[0])
            response_headers[:] = wsgi_headers
        
        # Executa a aplicação Flask
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
            'statusCode': status[0],
            'headers': headers_dict,
            'body': body_str
        }
        
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': f'{{"error": "Internal Server Error", "message": "{str(e)}", "traceback": "{error_msg}"}}'
        }
