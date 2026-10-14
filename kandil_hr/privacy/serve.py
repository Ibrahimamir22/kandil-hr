"""Loopback-published synthetic local server, without the Werkzeug debugger."""
import argparse
import os


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--site',required=True,choices=('kandil-parity.localhost','kandil-review.localhost'))
    args=parser.parse_args()
    os.chdir('/workspace/frappe-bench/sites')
    import frappe.app
    from werkzeug.serving import run_simple
    from kandil_hr.privacy.wsgi import ConsentBoundary
    frappe.app._site=args.site
    frappe.app._sites_path='.'
    frappe.app.application=ConsentBoundary(frappe.app.application)
    application=frappe.app.application_with_statics()
    run_simple('0.0.0.0',8000,application,use_reloader=False,use_debugger=False,threaded=True)


if __name__=='__main__':main()
