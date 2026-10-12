"""Validate tracked upstream gitlinks against the installation version lock."""
import argparse
import configparser
import json
import subprocess
from pathlib import Path


def check(source, index=False):
    source = Path(source).resolve()
    lock = json.loads((source / 'deployment/versions.lock.json').read_text())
    modules = configparser.ConfigParser()
    modules.read(source / '.gitmodules')
    verified = {}
    for name, item in lock['apps'].items():
        path = f'upstream/{name}'
        section = f'submodule "{path}"'
        if not modules.has_section(section) or modules[section].get('path') != path or modules[section].get('url') != item['url']:
            raise ValueError(f'Upstream URL/path differs from version lock: {name}')
        args = ['ls-files', '--stage', '--', path] if index else ['ls-tree', 'HEAD', '--', path]
        raw = subprocess.check_output(['git', '-C', str(source), *args], text=True).strip()
        fields = raw.split()
        sha = fields[1] if index and len(fields) == 4 else fields[2] if len(fields) == 4 else None
        if not fields or fields[0] != '160000' or sha != item['commit'] or fields[-1] != path:
            raise ValueError(f'Tracked upstream commit differs from version lock: {name}')
        verified[name] = dict(path=path, url=item['url'], commit=sha)
    return dict(status='PASS', source='index' if index else 'HEAD', dependencies=verified,
                limit='Verifies source links and installation pins; not a runtime or clean-install test.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--index', action='store_true', help='Check staged gitlinks before committing')
    args = parser.parse_args()
    print(json.dumps(check(Path(__file__).resolve().parent.parent, args.index), indent=2))
