"""Consent transport checks before Frappe parses request bodies.

Deployment must use this WSGI entry (or the supplied local serve module). An
unwrapped Frappe process cannot activate consent: the API also checks our marker.
"""
from werkzeug.wrappers import Response

PUBLIC = '/api/method/kandil_hr.privacy.portal.respond'
PREFIX = '/api/method/kandil_hr.privacy.portal.'
PAGE = '/candidate-consent'
MARKER = 'kandil.consent.transport_checked'


class ConsentBoundary:
    def __init__(self, application):
        self.application = application

    def __call__(self, environ, start_response):
        path=environ.get('PATH_INFO','')
        if path == PUBLIC:
            try:
                size=int(environ.get('CONTENT_LENGTH','0'))
            except (ValueError,TypeError):
                size=0
            origin=environ.get('wsgi.url_scheme','http')+'://'+environ.get('HTTP_HOST','')
            if (environ.get('REQUEST_METHOD') != 'POST' or environ.get('QUERY_STRING')
                    or environ.get('CONTENT_TYPE','').split(';')[0].strip() != 'application/octet-stream'
                    or not 0 < size <= 4096 or environ.get('HTTP_ORIGIN') != origin
                    or environ.get('HTTP_SEC_FETCH_SITE','same-origin') != 'same-origin'):
                response=Response('{"message":{"error":"unavailable"}}',status=403,content_type='application/json',
                    headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'})
                return response(environ,start_response)
        if path == PAGE or path.startswith(PREFIX):
            environ[MARKER]=True
        return self.application(environ,start_response)


def application(environ,start_response):
    # Lazy import also permits isolated transport tests without a running site.
    from frappe.app import application as frappe_application
    return ConsentBoundary(frappe_application)(environ,start_response)
