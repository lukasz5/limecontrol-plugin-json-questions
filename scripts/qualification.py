#!/usr/bin/env python3
"""Collect only complete acceptance reports from the release configurations."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('reports', type=Path)
parser.add_argument('assets', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
wanted = {(ls, engine, '8.3') for ls in ('6.15.12', '6.17.19', '7.11.0') for engine in ('mysql', 'postgres')}
wanted.update({("6.15.12", "mysql", "8.1.29"), ("7.11.0", "postgres", "8.2.27")})
rows = []
digests = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in args.assets.glob('*.zip')}
if len(digests) != 4:
    raise ValueError('Four downloaded archives are required')
for path in sorted(args.reports.glob('qualification-*/qualification.json')):
    _, ls, engine, php = path.parent.name.split('-', 3)
    report = json.loads(path.read_text())
    if (ls, engine, php) not in wanted:
        raise ValueError(f'Unexpected configuration {ls}/{engine}')
    wanted.remove((ls, engine, php))
    if report.get('added_columns_40x40') != 1 or report.get('verified_csv_cells') != 1600:
        raise ValueError(f'Incomplete database and export checks for {ls}/{engine}')
    if report['installation']['edition'] != ls:
        raise ValueError('Unexpected LimeSurvey version')
    observed = report.get('sha256', {})
    if observed != digests:
        raise ValueError(f'Qualification archives differ from release for {ls}/{engine}')
    if not (report['installation']['php'] == php or report['installation']['php'].startswith(php + '.')):
        raise ValueError('Unexpected PHP version')
    rows.append({'ls':ls, 'engine':engine, 'results':report})
if wanted:
    raise ValueError(f'Missing reports: {sorted(wanted)}')
args.output.write_text(json.dumps({'archives':digests, 'configurations':rows}, indent=2, ensure_ascii=False) + '\n')

