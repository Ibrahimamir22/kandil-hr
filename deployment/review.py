"""Operate the persistent LOCAL synthetic review stack; never delete its volumes.

Usage: python3 deployment/review.py provision|start|stop|status
Requires the already installed pinned development bench and personal review login.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess

APP = Path(__file__).resolve().parent.parent
WORKSPACE = APP.parents[2]
SITE = WORKSPACE / 'frappe-bench/sites/kandil-review.localhost'


def compose(*args):
    env = dict(os.environ, KANDIL_DEV_WORKSPACE=str(WORKSPACE))
    subprocess.run(['docker', 'compose', '-f', str(APP / 'deployment/review.compose.yaml'), *args],
                   cwd=APP, env=env, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('provision', 'start', 'stop', 'status'))
    action = parser.parse_args().action
    if not (WORKSPACE / 'frappe-bench/apps/kandil_hr').samefile(APP):
        raise RuntimeError('Run from the existing installed development app')
    if action == 'provision':
        if SITE.exists():
            raise RuntimeError('Preserving existing review site. Use start/status; inspect partial setup without resetting')
        old = WORKSPACE / 'frappe-bench/sites/kandil-parity.localhost/private/ibrahim-review-login.json'
        login = json.loads(old.read_text())
        if login.get('email') != 'ibrahimamiir22@gmail.com' or not login.get('password'):
            raise RuntimeError('Existing personal review login is required; no weak fallback')
        from check_upstream import check
        check(APP)
        for name in ('review-db-password', 'review-admin-password'):
            path = APP / 'deployment/.local' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, 'w') as stream:
                    stream.write(secrets.token_urlsafe(36))
        compose('up', '-d', 'mariadb', 'redis-cache', 'redis-queue')
        compose('run', '--rm', '--name', 'kandil-review-provision', 'web',
                '/workspace/frappe-bench/env/bin/python',
                '/workspace/frappe-bench/apps/kandil_hr/deployment/prepare_review_site.py')
        compose('up', '-d', 'web')
    elif action == 'start':
        if not (SITE / 'private/kandil-review-ready.json').exists():
            raise RuntimeError('Review site is not ready. Inspect setup rather than starting an incomplete site')
        compose('up', '-d', 'web')
    elif action == 'stop':
        compose('stop')
    else:
        compose('ps', '--all')


if __name__ == '__main__':
    main()
