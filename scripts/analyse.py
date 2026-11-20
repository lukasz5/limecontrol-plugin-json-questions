#!/usr/bin/env python3
"""Analyze the plugin against the source of an actual LimeSurvey CE installation."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
upstream = Path(sys.argv[1]).resolve()
if not (upstream / 'application/models/Response.php').is_file():
    sys.exit('Pass a LimeSurvey source tree as the argument.')
scans = [
    'application/core', 'application/models', 'application/libraries/PluginManager', 'application/libraries/MenuObjects',
    'application/helpers/expressions/emcache', 'vendor/yiisoft/yii/framework/base',
    'vendor/yiisoft/yii/framework/db', 'vendor/yiisoft/yii/framework/web',
]
files = ['application/helpers/common_helper.php', 'application/helpers/globals.php',
         'application/helpers/expressions/em_manager_helper.php']
quote = lambda path: json.dumps(str(path))
with TemporaryDirectory() as temp:
    config = Path(temp) / 'phpstan.neon'
    config.write_text('parameters:\n    level: 3\n    phpVersion: 80129\n    paths:\n' +
                      ''.join('        - ' + quote(path) + '\n' for path in sorted((root / 'LimeControlJsonQuestions').glob('LimeControl*.php'))) +
                      '    scanDirectories:\n' + ''.join('        - ' + quote(upstream / path) + '\n' for path in scans) +
                      '    scanFiles:\n' + ''.join('        - ' + quote(upstream / path) + '\n' for path in files))
    sys.exit(subprocess.call([str(root / 'vendor/bin/phpstan'), 'analyse', '--no-progress',
                              '--memory-limit=1G', '-c', str(config)]))
