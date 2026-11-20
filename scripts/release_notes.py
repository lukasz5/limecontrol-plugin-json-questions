#!/usr/bin/env python3
"""Print the PL/EN changelog entry matching a release tag."""
from pathlib import Path
import re
import sys

tag = sys.argv[1]
if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+', tag):
    sys.exit('Invalid tag')
changelog = (Path(__file__).resolve().parents[1] / 'CHANGELOG.md').read_text()
heading = r'^## \[' + re.escape(tag[1:]) + r'\][^\n]*\n'
match = re.search(heading + r'(?P<notes>.*?)(?=^## |\Z)', changelog, re.M | re.S)
if not match or not match['notes'].strip():
    sys.exit('Missing release notes')
print(match['notes'].strip())
