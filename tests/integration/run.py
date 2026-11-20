"""Install the exact four archives and test them against a local, disposable CE database."""
import argparse
import base64
import contextlib
import csv
import hashlib
import io
import json
import os
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

from fixture import write_lss
from author_skeleton import write_author_skeleton
from prepare import HERE, VERSIONS, prepare

ROOT = HERE.parents[1]
EXTENSIONS = ["LimeControlJsonQuestions", "LcJsonChoice", "LcJsonMatrix", "LcJsonFollowup"]


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_archives(dist):
    sums = {name.lstrip("*"): digest for digest, name in (line.split() for line in (dist / "SHA256SUMS").read_text().splitlines() if line.strip())}
    packages = {}
    for name in EXTENSIONS:
        artifact, = dist.glob(f"{name}-*.zip")
        digest = checksum(artifact)
        if sums.get(artifact.name) != digest:
            raise ValueError(f"Invalid release checksum for {artifact.name}")
        with zipfile.ZipFile(artifact) as package:
            for member in package.namelist():
                if not member.startswith(name + "/") or ".." in Path(member).parts:
                    raise ValueError(f"Invalid release member {member}")
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


def native_deactivation(base, key, sample, tree, env, cmd, report):
    # Only this runner provisions a database with this unguessable name.
    # Keep the sample with its responses. Reclaim the other wholly synthetic surveys.
    if ";dbname=lcjq_test_" not in env["LCJQ_DSN"]:
        raise RuntimeError("Native cleanup requires the runner-owned disposable database")
    def toggle(action):
        subprocess.run(["node",str(HERE/"toggle.cjs"),base,action,str(sample)],cwd=ROOT,env=env,check=True)
    toggle("deactivate")
    if not probe(tree,env,cmd,"plugin-state")["enabled"]:
        raise RuntimeError("LimeSurvey incorrectly disabled a plugin with live validation dependencies")
    before = probe(tree,env,cmd,"inspect",str(sample))
    for survey in rpc(base,"list_surveys",[key]):
        other = int(survey["sid"])
        if other != sample:
            result = rpc(base,"delete_survey",[key,other])
            if result.get("status") != "OK":
                raise RuntimeError(f"Synthetic survey cleanup failed: {result}")
    toggle("detach")
    toggle("deactivate")
    if probe(tree,env,cmd,"plugin-state")["enabled"]:
        raise RuntimeError("LimeSurvey could not disable the detached plugin")
    if before != probe(tree,env,cmd,"inspect",str(sample)):
        raise RuntimeError("Native saved responses changed after deactivation")
    toggle("activate")
    if not probe(tree,env,cmd,"plugin-state")["enabled"]:
        raise RuntimeError("Reactivation failed")
    report["native_deactivation_blocked_then_permitted"] = True
    report["reactivation_preserved_responses"] = before["responses"]


def qualify(base,tree,env,cmd,work,report):
    key = rpc(base,"get_session_key",["lcqadmin","LCQtest-Story-4321"])
    if not isinstance(key,str):
        raise RuntimeError(f"Local administrator session failed: {key}")
    sample = import_survey(base,key,ROOT/"examples/fieldwork.lss")
    activate(base,key,sample)
    report["import_activation"] = sample
    skeleton = work / "author-skeleton.lss"
    write_author_skeleton(skeleton)
    author_sid = import_survey(base, key, skeleton)
    subprocess.run(["node", str(HERE / "author.cjs"), base, str(author_sid), str(work)], env=env, check=True)
    report["author"] = json.loads((work / "author-report.json").read_text())
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
    subprocess.run(["node",str(HERE/"browser.cjs"),base,str(sample),str(report["stress"]["sid"]),str(work)],cwd=ROOT,env=env,check=True)
    report["browser"] = json.loads((work/"browser-report.json").read_text())
    with (work/"sample-export.csv").open(encoding="utf-8-sig",newline="") as fp:
        actual=list(csv.DictReader(fp))
    with (ROOT/"examples/fieldwork-expected.csv").open(encoding="utf-8",newline="") as fp:
        expected=list(csv.DictReader(fp))
    def comparable(rows):
        return sorted(tuple((key,value) for key,value in row.items() if key != "response_id") for row in rows)
    if comparable(actual) != comparable(expected):
        raise AssertionError(f"Unexpected sample CSV: {actual}")
    with (work/"stress-export.csv").open(encoding="utf-8-sig",newline="") as fp:
        cells = list(csv.DictReader(fp))
    if len(cells) != 1600:
        raise AssertionError(f"Expected 1600 exported cells, got {len(cells)}")
    actual_values = {(tuple(json.loads(row["path"])),row["column"]):row["value"] for row in cells}
    expected_values = {((f"R{r+1:02d}",),f"C{c+1:02d}"):str(r*40+c) for r in range(40) for c in range(40)}
    if actual_values != expected_values:
        raise AssertionError("40x40 CSV differs from source values")
    report["verified_csv_cells"] = 1600
    env = dict(env,LCJQ_ROLE_RUN=secrets.token_hex(5), LCJQ_ROLE_PASSWORD=secrets.token_hex(18))
    subprocess.run([*cmd,"lcjqroles",str(sample)],cwd=tree,env=env,check=True)
    subprocess.run(["node",str(HERE/"roles.cjs"),base,str(sample),str(report["control"]["sid"])],cwd=ROOT,env=env,check=True)
    report["native_survey_acls"] = True
    subprocess.run(["node",str(HERE/"lifecycle.cjs"),base],cwd=ROOT,env=env,check=True)
    report["detach_restore_purge"] = True
    subprocess.run(["node",str(HERE/"all-in-one.cjs"),base],env=env,cwd=ROOT,check=True)
    report["same_page_dependencies"] = True
    native_deactivation(base,key,sample,tree,env,cmd,report)
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
            release = work / "release"
            release.mkdir()
            for filename in ["SHA256SUMS", *(entry.name for entry in options.dist.glob("*.zip"))]:
                shutil.copyfile(options.dist / filename, release / filename)
            report["sha256"] = verify_archives(release)
            tree,env,cmd = prepare(options.version,options.engine,options.db_port,work,options.archive,options.php)
            with http(tree,env,options.php) as base:
                for action in ("install","update"):
                    subprocess.run(["node",str(HERE/"admin.cjs"),base,str(release),action],env=env,check=True)
                    report["native_zip_"+action] = True
                report["installation"] = probe(tree,env,cmd,"installed")
                qualify(base,tree,env,cmd,work,report)
    finally:
        print(json.dumps(report,ensure_ascii=False,indent=2))
        if options.report:
            options.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")


if __name__ == "__main__":
    main()
