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
    required_steps = ('native_zip_install', 'native_zip_update', 'native_survey_acls', 'detach_restore_purge', 'same_page_dependencies', 'native_deactivation_blocked_then_permitted')
    for step in required_steps:
        if report.get(step) is not True:
            raise ValueError(f'Missing acceptance step {step} for {ls}/{engine}')
    browser = report['browser']
    browser_steps = ('sample_resumed_in_fresh_browser', 'removed_source_pruned', 'mobile_keyboard_navigation', 'codebook')
    if any(browser.get(step) is not True for step in browser_steps) or browser['grid_resume_values'] != 1600:
        raise ValueError(f'Incomplete respondent flow for {ls}/{engine}')
    author = report['author']
    if not (author['preview'] and author['two_live_blocks'] and author['threshold_comment_and_export']):
        raise ValueError(f'Incomplete author flow for {ls}/{engine}')
    if report['installation']['edition'] != ls:
        raise ValueError('Unexpected LimeSurvey version')
    observed = report.get('sha256', {})
    if observed != digests:
        raise ValueError(f'Qualification archives differ from release for {ls}/{engine}')
    if not (report['installation']['php'] == php or report['installation']['php'].startswith(php + '.')):
        raise ValueError('Unexpected PHP version')
    rows.append({'ls': ls, 'engine': engine, 'results': report})
if wanted:
    raise ValueError(f'Missing reports: {sorted(wanted)}')
args.output.write_text(json.dumps({'archives':digests, 'configurations':rows}, indent=2, ensure_ascii=False) + '\n')
