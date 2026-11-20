"""Prepare only a fresh, verified CE tree. Python 3.12+, php CLI and a disposable SQL server."""
import hashlib
import os
import secrets
import shutil
import subprocess
import tarfile
import urllib.request
import zipfile
from pathlib import Path

VERSIONS = {
    "6.15.12": ("https://codeload.github.com/LimeSurvey/LimeSurvey/tar.gz/refs/tags/6.15.12+250916", "809818bb64269691e209870c6e89feef35ef4ee9871fa9f70f4610d20a18a174"),
    "6.17.19": ("https://codeload.github.com/LimeSurvey/LimeSurvey/tar.gz/a4a39361bd5ca1afefb85b4726d9d179ae4bad7c", "2f33d1d3f7a2ca2a0910ae7abd017838850949d7f0606c89ee885adfa6797c31"),
    "7.11.0": ("https://download.limesurvey.org/latest-master/limesurvey7.11.0+261116.zip", "cf2df8f0269bfdf9aab10ee4da83b7e259ca3dc854da89ba570669f3c0d9985f"),
}
HERE = Path(__file__).resolve().parent


def prepare(edition, engine, db_port, work, archive, php):
    url, expected = VERSIONS[edition]
    if not archive:
        archive = work / "source"
        urllib.request.urlretrieve(url, archive)
    with open(archive, "rb") as source:
        digest = hashlib.sha256()
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        raise ValueError("LimeSurvey distribution checksum mismatch")
    target = work / "source-tree"
    target.mkdir()
    if edition.startswith("7."):
        with zipfile.ZipFile(archive) as package:
            package.extractall(target)
    else:
        with tarfile.open(archive) as package:
            package.extractall(target, filter="data")
    tree, = target.iterdir()
    for folder in ("tmp/runtime", "tmp/assets", "tmp/upload", "upload/themes/question", "upload/plugins"):
        (tree / folder).mkdir(exist_ok=True, parents=True)
    config = tree / "application/config"
    shutil.copyfile(HERE / "config.php", config / "config.php")
    (config / "security.php").write_text("<?php return " + "['encryptionnonce'=>'" + secrets.token_hex(24) + "','encryptionsecretboxkey'=>'" + secrets.token_hex(32) + "'];")
    driver, user = ("pgsql", "postgres") if engine == "postgres" else ("mysql", "root")
    env = {**os.environ, "LCJQ_DSN": f"{driver}:host=127.0.0.1;port={db_port};dbname=lcjq;", "LCJQ_DB_USER": user,
           "LCJQ_TABLE_PREFIX": "lcq" + secrets.token_hex(4) + "_", "YII_CONSOLE_COMMANDS": str(HERE)}
    # PostgreSQL indexes created by LimeSurvey have schema-wide names; table prefixes
    # alone cannot isolate concurrent installations. Provision one disposable database.
    name = "lcjq_test_" + secrets.token_hex(9)
    create = '$pdo=new PDO(getenv("LCJQ_DSN"),getenv("LCJQ_DB_USER"),"lcjq-synthetic-test"); $pdo->exec("CREATE DATABASE " . $argv[1]);'
    subprocess.run([php,"-r",create,name],env=env,check=True)
    env["LCJQ_DSN"] = env["LCJQ_DSN"].replace("dbname=lcjq;","dbname="+name+";")
    cmd = [php, "-d", "memory_limit=768M", "application/commands/console.php"]
    subprocess.run([*cmd, "install", "lcqadmin", "LCQtest-Story-4321", "Demo Author", "demo@example.invalid", "verbose"], env=env, cwd=tree, check=True)
    return tree, env, cmd
