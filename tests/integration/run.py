"""Install the exact four archives and test them against a local, disposable CE database."""
import argparse
import base64
import contextlib
import csv
import hashlib
import io
import json
import os
import re
import socket
import subprocess
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

from fixture import write_lss
from prepare import HERE, VERSIONS, prepare

ROOT = HERE.parents[1]
EXTENSIONS = ["LimeControlJsonQuestions", "LcJsonChoice", "LcJsonMatrix", "LcJsonFollowup"]


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def deploy_archives(dist, tree):
    sums = {name.lstrip("*"): digest for digest, name in (line.split() for line in (dist / "SHA256SUMS").read_text().splitlines() if line.strip())}
    packages = {}
    for name in EXTENSIONS:
        artifact, = dist.glob(f"{name}-*.zip")
        digest = checksum(artifact)
        if sums.get(artifact.name) != digest:
            raise ValueError(f"Invalid release checksum for {artifact.name}")
        target = tree / ("upload/plugins" if name == EXTENSIONS[0] else "upload/themes/question")
        with zipfile.ZipFile(artifact) as package:
            for member in package.namelist():
                if not member.startswith(name + "/") or ".." in Path(member).parts:
                    raise ValueError(f"Invalid release member {member}")
            package.extractall(target)
        packages[artifact.name] = digest
    return packages


def rpc(base, method, args):
    payload = json.dumps(dict(method=method,params=args,id=1)).encode()
    req = urllib.request.Request(base+"/index.php/admin/remotecontrol",payload,{"Content-Type":"application/json","Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=120) as response:
        raw = response.read()
    try:
        answer = json.loads(raw)
    except ValueError:
        raise RuntimeError(f"{method}: invalid server reply: {raw[:250]!r}")
    if answer.get("error"):
        raise RuntimeError(f"{method}: {answer['error']}")
    return answer.get("result")


def import_survey(base,key,file):
    sid = rpc(base,"import_survey",[key,base64.b64encode(file.read_bytes()).decode(),"lss"])
    if not isinstance(sid,int):
        raise RuntimeError(f"LSS import failed: {sid}")
    return sid


def activate(base,key,sid):
    activation = rpc(base,"activate_survey",[key,sid])
    if not isinstance(activation, dict) or activation.get("status") != "OK":
        raise RuntimeError(f"Activation {sid}: {activation}")


def probe(tree,env,cmd,*args):
    raw = subprocess.check_output([*cmd,"lcjqprobe",*args],cwd=tree,env=env,text=True)
    lines = [line for line in raw.splitlines() if line.startswith("LCJQ ")]
    if not lines:
        raise RuntimeError("LimeSurvey probe failed: "+raw[:1500])
    return json.loads(lines[-1][5:])


def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1",0))
        return sock.getsockname()[1]


@contextlib.contextmanager
def http(tree,env,php):
    address = "127.0.0.1:"+str(port())
    with tempfile.TemporaryFile() as log:
        with subprocess.Popen([php,"-d","memory_limit=768M","-S",address,"-t",str(tree)],cwd=tree,env=env,stdout=log,stderr=log) as proc:
            try:
                for _ in range(80):
                    try:
                        urllib.request.urlopen("http://"+address+"/index.php/admin",timeout=10).close()
                        break
                    except OSError:
                        time.sleep(.2)
                yield "http://"+address
            finally:
                proc.terminate()


def qualify(base,tree,env,cmd,work,report):
    key = rpc(base,"get_session_key",["lcqadmin","LCQtest-Story-4321"])
    if not isinstance(key,str):
        raise RuntimeError(f"Local administrator session failed: {key}")
    sample = import_survey(base,key,ROOT/"examples/fieldwork.lss")
    activate(base,key,sample)
    report["import_activation"] = sample
    for filename,empty in [("control",True),("stress",False)]:
        path = work / (filename+".lss")
        write_lss(path,stress=True,empty=empty)
        sid = import_survey(base,key,path)
        activate(base,key,sid)
        report[filename] = dict(sid=sid,**probe(tree,env,cmd,"inspect",str(sid)))
    delta = len(report["stress"]["columns"]) - len(report["control"]["columns"])
    if delta != 1:
        raise AssertionError(f"40x40 block added {delta} SQL columns")
    report["added_columns_40x40"] = delta
    proc = subprocess.run(["node",str(HERE/"browser.cjs"),base,str(sample),str(report["stress"]["sid"]),str(work)],cwd=ROOT,env=env,check=True)
    report["browser"] = json.loads((work/"browser-report.json").read_text())
    rpc(base,"release_session_key",[key])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version",required=True,choices=VERSIONS)
    parser.add_argument("--engine",required=True,choices=["mysql","postgres"])
    parser.add_argument("--db-port",required=True,type=int)
    parser.add_argument("--dist",type=Path,default=ROOT/"dist")
    parser.add_argument("--archive",type=Path)
    parser.add_argument("--php",default=os.environ.get("PHP_BINARY","php"))
    parser.add_argument("--report",type=Path)
    options = parser.parse_args()
    report = {}
    try:
        with tempfile.TemporaryDirectory(prefix="lcjq-ce-") as folder:
            work = Path(folder)
            tree,env,cmd = prepare(options.version,options.engine,options.db_port,work,options.archive,options.php)
            report["sha256"] = deploy_archives(options.dist,tree)
            report["installation"] = probe(tree,env,cmd,"install")
            with http(tree,env,options.php) as base:
                qualify(base,tree,env,cmd,work,report)
    finally:
        print(json.dumps(report,ensure_ascii=False,indent=2))
        if options.report:
            options.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")


if __name__ == "__main__":
    main()
