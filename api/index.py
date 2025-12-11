# Vercel serverless function wrapper for Flask
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

# Verifica variáveis de ambiente
print(f"\nVerificando variaveis de ambiente:")
print(f"  SUPABASE_URL: {'Sim' if os.getenv('SUPABASE_URL') else 'Nao'}")
print(f"  SUPABASE_KEY: {'Sim' if os.getenv('SUPABASE_KEY') else 'Nao'}")

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

# Handler para Vercel
# O Vercel Python runtime espera uma função handler
def handler(request):
    """
    Handler function for Vercel serverless functions
    """
    try:
        # Extrai informações da requisição do Vercel
        method = request.method if hasattr(request, 'method') else 'GET'
        path = request.path if hasattr(request, 'path') else '/'
        query_string = getattr(request, 'query_string', '') or ''
        
        # Headers
        headers_dict = {}
        if hasattr(request, 'headers'):
            if isinstance(request.headers, dict):
                headers_dict = {k.lower(): v for k, v in request.headers.items()}
            else:
                # Se for um objeto com items()
                try:
                    headers_dict = {k.lower(): v for k, v in request.headers.items()}
                except:
                    headers_dict = {}
        
        # Body
        body = b''
        if hasattr(request, 'body'):
            body = request.body
            if isinstance(body, str):
                body = body.encode('utf-8')
        elif hasattr(request, 'get_json'):
            # Tenta obter JSON
            try:
                json_data = request.get_json()
                if json_data:
                    import json
                    body = json.dumps(json_data).encode('utf-8')
            except:
                pass
        
        # Constrói ambiente WSGI
        from io import BytesIO
        
        environ = {
            'REQUEST_METHOD': method,
            'SCRIPT_NAME': '',
            'PATH_INFO': path,
            'QUERY_STRING': query_string,
            'CONTENT_TYPE': headers_dict.get('content-type', ''),
            'CONTENT_LENGTH': str(len(body)),
            'SERVER_NAME': headers_dict.get('host', 'localhost').split(':')[0] if headers_dict.get('host') else 'localhost',
            'SERVER_PORT': headers_dict.get('host', 'localhost').split(':')[1] if ':' in headers_dict.get('host', '') else '80',
            'wsgi.version': (1, 0),
            'wsgi.url_scheme': headers_dict.get('x-forwarded-proto', 'https'),
            'wsgi.input': BytesIO(body),
            'wsgi.errors': sys.stderr,
            'wsgi.multithread': False,
            'wsgi.multiprocess': True,
            'wsgi.run_once': False,
        }
        
        # Adiciona headers HTTP
        for key, value in headers_dict.items():
            if key not in ('content-type', 'content-length'):
                env_key = 'HTTP_' + key.upper().replace('-', '_')
                environ[env_key] = str(value)
        
        # Variáveis adicionais
        if headers_dict.get('host'):
            environ['HTTP_HOST'] = headers_dict['host']
        if headers_dict.get('x-forwarded-for'):
            environ['HTTP_X_FORWARDED_FOR'] = headers_dict['x-forwarded-for']
        if headers_dict.get('x-forwarded-proto'):
            environ['HTTP_X_FORWARDED_PROTO'] = headers_dict['x-forwarded-proto']
        
        # Callback para capturar status e headers
        status_code = [200]
        response_headers = []
        
        def start_response(wsgi_status, wsgi_headers):
            status_code[0] = int(wsgi_status.split()[0])
            response_headers[:] = list(wsgi_headers)
        
        # Executa app Flask
        response_body = []
        try:
            for chunk in app(environ, start_response):
                if isinstance(chunk, bytes):
                    response_body.append(chunk)
                elif isinstance(chunk, str):
                    response_body.append(chunk.encode('utf-8'))
                else:
                    response_body.append(str(chunk).encode('utf-8'))
        except Exception as app_error:
            import traceback
            error_trace = traceback.format_exc()
            print(f"ERRO ao executar app Flask: {error_trace}")
            return {
                'statusCode': 500,
                'headers': {'Content-Type': 'text/html; charset=utf-8'},
                'body': f'<h1>Erro ao executar aplicacao</h1><pre>{error_trace}</pre>'
            }
        
        # Converte resposta
        body_str = b''.join(response_body).decode('utf-8')
        
        # Converte headers para dict
        headers_result = {}
        for key, value in response_headers:
            headers_result[key] = str(value)
        
        return {
            'statusCode': status_code[0],
            'headers': headers_result,
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
