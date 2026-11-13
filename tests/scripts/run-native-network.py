"""Explicit external-CI native transport packet; no old suites or dependencies."""
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import traceback

REPO = "alvarovillalbaa/forway"
BRANCH = "refs/heads/qa/forway-native-network-20261113-1"
BASE = "a765f129e9273e5f875c9903c206690d06ce9bbf"
repo = Path.cwd()
run_id = os.environ.get("GITHUB_RUN_ID", "")
source = os.environ.get("SOURCE_COMMIT", "")
proof = Path(os.environ.get("RUNNER_TEMP", "/invalid")) / ("forway-native-network-" + run_id + ".json")
sha = lambda value: hashlib.sha256(value).hexdigest()


def need(value, message):
    if not value:
        raise RuntimeError(message)


def absent(path):
    try:
        path.lstat()
        return False
    except FileNotFoundError:
        return True


def admit():
    need(os.environ.get("CI") == "true" and os.environ.get("GITHUB_REPOSITORY") == REPO and run_id.isdigit(), "Owned public CI only")
    need(os.environ.get("GITHUB_EVENT_NAME") == "create" and os.environ.get("GITHUB_REF") == BRANCH, "Exact create event/ref")
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_bytes())
    need(event["repository"]["private"] is False and event["ref_type"] == "branch" and event["ref"] == BRANCH.removeprefix("refs/heads/"), "Exact public source")
    need(subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source, "Frozen source checkout")


admit()
if sys.argv[1:] == ["--retire"]:
    info = proof.lstat()
    body = proof.read_bytes()
    need(proof.is_file() and not proof.is_symlink() and info.st_uid == os.getuid()
         and (info.st_dev, info.st_ino) == (int(os.environ["REPORT_DEV"]), int(os.environ["REPORT_INO"]))
         and sha(body) == os.environ["REPORT_SHA"] and json.loads(body)["runId"] == run_id, "Exact uploaded proof identity")
    proof.unlink()
    need(absent(proof), "Uploaded proof absence")
    print(json.dumps({"kind": "uploaded-proof-retired", "sha256": sha(body), "bytes": len(body), "absent": True}))
    sys.exit(0)
need(sys.argv[1:] == [], "No unreviewed arguments")


def vector(ref, native=False):
    result = {}
    for entry in subprocess.check_output(["git", "ls-tree", "-rz", ref]).split(b"\0"):
        if not entry:
            continue
        metadata, name = entry.split(b"\t", 1)
        mode, kind, blob = metadata.decode().split()
        need(kind == "blob" and mode in ("100644", "100755"), "Source leaf type/mode")
        path = repo / name.decode()
        body = path.read_bytes() if native else subprocess.check_output(["git", "cat-file", "blob", blob])
        if native:
            need(not path.is_symlink() and bool(path.stat().st_mode & 0o111) == (mode == "100755"), "Native source mode")
            need(hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest() == blob, "Native source bytes")
        result[name.decode()] = {"mode": mode, "blob": blob, "bytes": len(body), "sha256": sha(body)}
    return result


def guard(label):
    need(subprocess.check_output(["git", "status", "--porcelain"]) == b"" and vector("HEAD", True) == source_files, "Complete unchanged source/index")
    report["sourceGuards"].append({"label": label, "files": len(source_files), "matches": True})


def capture(body):
    retained = body[:2 * 1024**2]
    return {"bytes": len(body), "sha256": sha(body), "complete": retained == body,
            "gzipBase64": base64.b64encode(gzip.compress(retained, mtime=0)).decode()}


def group_absent(pid):
    try:
        os.killpg(pid, 0)
        return False
    except ProcessLookupError:
        return True


def process_identity(pid):
    entry = Path("/proc") / str(pid)
    values = (entry / "stat").read_text().rpartition(") ")[2].split()
    return {"uid": entry.stat().st_uid, "parent": int(values[1]), "group": int(values[2]), "session": int(values[3]), "start": values[19]}


def stop_owned():
    need(child is not None and child_identity is not None and process_identity(child.pid) == child_identity
         and child_identity["uid"] == os.getuid() and child_identity["group"] == child.pid
         and child_identity["session"] == child.pid and child.pid != os.getpgrp(), "Owned leader identity before signal")
    for sig in (signal.SIGTERM, signal.SIGKILL):
        os.killpg(child.pid, sig)
        report["cleanup"].setdefault("signals", []).append({"pid": child.pid, "signal": int(sig)})
        try:
            child.wait(timeout=5)
            return
        except subprocess.TimeoutExpired:
            need(process_identity(child.pid) == child_identity, "Owned identity before next signal")


status, root, child, child_identity, source_files = 1, None, None, None, None
report = {"kind": "forway.native-network-ci", "runId": run_id, "sourceCommit": source,
          "baseCommit": BASE, "deploymentId": os.environ.get("FORWAY_DEPLOYMENT_ID"),
          "sourceGuards": [], "cleanup": {}, "commands": [], "oldCasesReexecuted": False}
deadline = time.monotonic() + max(0, 600 - (time.time() - float(os.environ.get("PROFILE_STARTED_EPOCH", "0"))))
try:
    need(sys.platform == "linux" and time.monotonic() + 180 < deadline, "Linux/time admission")
    need(shutil.disk_usage(os.environ["RUNNER_TEMP"]).free > 8 * 1024**3, "External storage admission")
    source_files, baseline = vector("HEAD", True), vector(BASE)
    need(len(baseline) == 44 and set(source_files) >= set(baseline), "Exact starting source")
    need(source_files["src/fetch-page.mjs"] == baseline["src/fetch-page.mjs"]
         and source_files["api/audit.mjs"] == baseline["api/audit.mjs"], "Unchanged importer and HTTP API")
    report["sourceFiles"] = source_files
    guard("before-owned-work")
    root = Path(tempfile.mkdtemp(prefix="forway-native-network-", dir=os.environ["RUNNER_TEMP"])).resolve()
    os.chmod(root, 0o700)
    identity = root.stat()
    nonce = secrets.token_hex(16)
    (root / ".owner").write_text(nonce)
    (root / "temp").mkdir(mode=0o700)
    report["ownedRoot"] = {"path": str(root), "device": identity.st_dev, "inode": identity.st_ino, "uid": identity.st_uid, "nonce": nonce}
    environment = {name: os.environ[name] for name in ("PATH", "HOME")}
    environment.update({"LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "TZ": "UTC", "CI": "true", "NO_COLOR": "1",
                        "TMPDIR": str(root / "temp"), "TMP": str(root / "temp"), "TEMP": str(root / "temp"),
                        "SOURCE_COMMIT": source, "FORWAY_DEPLOYMENT_ID": os.environ["FORWAY_DEPLOYMENT_ID"]})
    output, errors = root / "node.stdout", root / "node.stderr"
    command = {"argv": [shutil.which("node"), "tests/integration/native-network.mjs"], "startedAt": time.time()}
    report["commands"].append(command)
    guard("before-real-network")
    try:
        with output.open("xb") as stdout, errors.open("xb") as stderr:
            child = subprocess.Popen(command["argv"], cwd=repo, env=environment, stdin=subprocess.DEVNULL,
                                     stdout=stdout, stderr=stderr, start_new_session=True)
            command["pid"] = child.pid
            child_identity = process_identity(child.pid)
            need(child_identity["uid"] == os.getuid() and child_identity["parent"] == os.getpid()
                 and child_identity["group"] == child.pid and child_identity["session"] == child.pid, "Direct child ownership")
            until = min(deadline, time.monotonic() + 120)
            while child.poll() is None:
                if time.monotonic() >= until or output.stat().st_size + errors.stat().st_size > 2 * 1024**2:
                    command["boundedStop"] = True
                    stop_owned()
                    break
                time.sleep(.05)
            child.wait(timeout=5)
    finally:
        command["stdout"] = capture(output.read_bytes()) if output.exists() else capture(b"")
        command["stderr"] = capture(errors.read_bytes()) if errors.exists() else capture(b"")
        if child is not None:
            command["exitCode"] = child.poll()
            command["reaped"] = child.poll() is not None
    need(child is not None and all(command[k]["complete"] for k in ("stdout", "stderr"))
         and group_absent(child.pid), "Original streams and owned group closure")
    guard("after-real-network")
    lines = output.read_text().splitlines()
    need(len(lines) == 1 and lines[0].startswith("FORWAY_NATIVE_NETWORK_RESULT="), "One original native receipt")
    case = json.loads(lines[0].split("=", 1)[1])
    report["nativeResult"] = case
    need(child.returncode == 0 and not command.get("boundedStop") and case["passed"] is True
         and case["sourceCommit"] == source and case["deploymentId"] == report["deploymentId"]
         and [row["identity"] for row in case["cases"]] == ["N01", "N02", "N03", "N04", "N05", "N06", "N07"]
         and len(case["native"]["requests"]) == 8 and case["cleanup"] == {"liveSockets": 0, "forcedSocketCloses": 0}, "Seven actual native cases")
    need(group_absent(child.pid), "Direct owned group absence")
    status = 0
except BaseException as error:
    report["failure"] = {"type": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
finally:
    try:
        if child is not None:
            if child.poll() is None:
                stop_owned()
                status = 1
            child.wait(timeout=5)
            report["cleanup"]["child"] = {"pid": child.pid, "reaped": child.poll() is not None, "groupAbsent": group_absent(child.pid)}
            need(report["cleanup"]["child"]["groupAbsent"], "Owned group remains; preserve scratch")
        if root is not None:
            guard("after-owned-shutdown")
            now = root.lstat()
            need(not root.is_symlink() and (now.st_dev, now.st_ino, now.st_uid) == (identity.st_dev, identity.st_ino, os.getuid())
                 and (root / ".owner").read_text() == nonce, "Owned scratch identity/nonce")
            inventory = {}
            for path in sorted(root.rglob("*")):
                info = path.lstat()
                need(info.st_uid == os.getuid() and not path.is_symlink(), "Owned scratch leaf")
                if path.is_file():
                    body = path.read_bytes()
                    inventory[str(path.relative_to(root))] = {"bytes": len(body), "sha256": sha(body)}
                else:
                    need(path.is_dir(), "Owned scratch type")
            need(len(inventory) <= 1000 and sum(row["bytes"] for row in inventory.values()) <= 32 * 1024**2, "Bounded scratch inventory")
            report["cleanup"]["files"] = inventory
            shutil.rmtree(root)
            report["cleanup"]["rootAbsent"] = absent(root)
            guard("after-root-removal")
    except BaseException:
        report["cleanup"]["failure"] = traceback.format_exc()
        status = 1
    report["exitCode"] = status
    report["accepted"] = status == 0 and report["cleanup"].get("rootAbsent") is True
    body = json.dumps(report, separators=(",", ":")).encode() + b"\n"
    need(len(body) < 4 * 1024**2 and absent(proof), "Bounded new proof file")
    with proof.open("xb") as file:
        file.write(body)
    info = proof.stat()
    with Path(os.environ["GITHUB_OUTPUT"]).open("a") as output_file:
        output_file.write(f"report_sha={sha(body)}\nreport_dev={info.st_dev}\nreport_ino={info.st_ino}\n")
    print(json.dumps({"kind": "native-network-proof", "sha256": sha(body), "bytes": len(body), "accepted": report["accepted"]}))
sys.exit(status)
