#!/usr/bin/env python3
"""Build the four LimeSurvey archives reproducibly, or verify downloaded release assets."""
import argparse
import hashlib
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = {
    'LimeControlJsonQuestions': ('plugin', ROOT / 'LimeControlJsonQuestions'),
    **{name: ('question_theme', ROOT / 'themes' / name)
       for name in ('LcJsonChoice', 'LcJsonMatrix', 'LcJsonFollowup')},
}


def manifest(path, name, extension_type):
    configs = list(path.rglob('config.xml'))
    if len(configs) != 1:
        raise ValueError(f'{name}: expected one config.xml, found {len(configs)}')
    xml = ET.parse(configs[0])
    if xml.findtext('metadata/name') != name or xml.findtext('metadata/type') != extension_type:
        raise ValueError(f'{name}: incorrect manifest name or type')
    if extension_type == 'plugin' and not (path / f'{name}.php').is_file():
        raise ValueError(f'{name}: missing entry point')
    return xml.findtext('metadata/version')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def create_archive(target, folder, name):
    files = {item.relative_to(folder).as_posix(): item for item in folder.rglob('*') if item.is_file()}
    files['LICENSE'] = ROOT / 'LICENSE'
    with ZipFile(target, 'w', ZIP_STORED) as archive:
        for relative, item in sorted(files.items()):
            if any(part.startswith('.') for part in Path(relative).parts) or item.is_symlink():
                raise ValueError(f'{item}: unexpected hidden file or symlink')
            entry = ZipInfo(f'{name}/{relative}', (2026, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, item.read_bytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    parser.add_argument('--tag')
    parser.add_argument('--verify', action='store_true', help='verify assets instead of rebuilding them')
    args = parser.parse_args()
    versions = {manifest(folder, name, kind) for name, (kind, folder) in EXTENSIONS.items()}
    if len(versions) != 1:
        raise ValueError('Plugin and theme versions differ')
    version, = versions
    if not version or not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version):
        raise ValueError('Expected a stable SemVer version')
    if args.tag and args.tag != 'v' + version:
        raise ValueError('Tag differs from manifest')
    if not re.search(r'^## \[' + re.escape(version) + r'\]', (ROOT / 'CHANGELOG.md').read_text(), re.M):
        raise ValueError('Missing changelog entry')
    args.output.mkdir(parents=True, exist_ok=True)
    sums = []
    for name, (_, folder) in EXTENSIONS.items():
        path = args.output / f'{name}-{version}.zip'
        if not args.verify:
            create_archive(path, folder, name)
        with ZipFile(path) as archive:
            if archive.testzip() or any(not p.startswith(name + '/') for p in archive.namelist()):
                raise ValueError(f'{path}: invalid content')
            manifests = [p for p in archive.namelist() if p.endswith('/config.xml')]
            if len(manifests) != 1 or ET.fromstring(archive.read(manifests[0])).findtext('metadata/version') != version:
                raise ValueError(f'{path}: invalid packaged manifest')
        sums.append(f'{digest(path)}  {path.name}\n')
    expected = ''.join(sorted(sums, key=lambda line: line.split('  ')[1]))
    checksum_file = args.output / 'SHA256SUMS'
    if args.verify:
        if checksum_file.read_text() != expected:
            raise ValueError('SHA256SUMS differs from downloaded bytes')
    else:
        checksum_file.write_text(expected)
    print(expected, end='')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        sys.exit(str(error))
