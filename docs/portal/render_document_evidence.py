"""Render every PDF in a synthetic browser evidence bundle; never grants visual acceptance."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from xml.etree import ElementTree as ET


def main():
    parser=argparse.ArgumentParser();parser.add_argument('evidence');args=parser.parse_args()
    root=Path(args.evidence).resolve();report=json.loads((root/'results.json').read_text())
    if not report.get('pdfs'):raise SystemExit('No browser-verified PDFs recorded')
    output=root/'rendered';output.mkdir(exist_ok=True);results=[]
    for record in report['pdfs']:
        source=(root/record['file']).resolve()
        if not source.is_relative_to(root) or source.suffix!='.pdf':raise SystemExit('Unexpected PDF evidence path')
        digest=hashlib.sha256(source.read_bytes()).hexdigest()
        if digest!=record['sha256']:raise SystemExit('PDF bytes changed since browser verification')
        subprocess.run(['pdftoppm','-scale-to','1300','-png',str(source),str(output/source.stem)],check=True,capture_output=True)
        bbox=subprocess.check_output(['pdftotext','-bbox',str(source),'-'])
        doc=ET.fromstring(bbox);edge=[];pages=doc.findall('.//{http://www.w3.org/1999/xhtml}page')
        for index,p in enumerate(pages,1):
            width=float(p.attrib['width']);height=float(p.attrib['height'])
            for word in p.findall('.//{http://www.w3.org/1999/xhtml}word'):
                if float(word.attrib['xMin'])<10 or float(word.attrib['yMin'])<10 or float(word.attrib['xMax'])>width-10 or float(word.attrib['yMax'])>height-10:
                    edge.append(dict(page=index,x_min=word.attrib['xMin'],x_max=word.attrib['xMax'],y_min=word.attrib['yMin'],y_max=word.attrib['yMax']))
        results.append(dict(file=record['file'],sha256=digest,pages=len(pages),edge_warnings=edge,
            renders=[str(p.relative_to(root)) for p in sorted(output.glob(source.stem+'-*.png'))]))
    value=dict(status='PASS' if all(not r['edge_warnings'] and r['pages']>0 for r in results) else 'REVIEW_REQUIRED',pdfs=results,
        limits=['Text bounds and rendering only. Human visual review must inspect every page for clipping, shaping, splits and legibility.'])
    (root/'render-checks.json').write_text(json.dumps(value,indent=2)+'\n');print(json.dumps(dict(status=value['status'],pdfs=len(results),pages=sum(r['pages'] for r in results))))

if __name__=='__main__':main()
