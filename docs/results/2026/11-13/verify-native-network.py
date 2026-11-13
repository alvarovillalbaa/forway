"""Portable data-only audit. No product import, native lookup or HTTP execution."""
import base64
import gzip
import hashlib
import ipaddress
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
sha = lambda body: hashlib.sha256(body).hexdigest()
archive = (root / "native-network-attempt-1.zip").read_bytes()
assert len(archive) == 10956 and sha(archive) == "cbea85ab0097a42e3050f803a035bb80cc0b6d3b33f39b6616b59d7caed9f524"
with zipfile.ZipFile(root / "native-network-attempt-1.zip") as z:
    assert z.namelist() == ["forway-native-network-43428560903.json"]
    assert z.infolist()[0].file_size == 33343
    raw = z.read(z.namelist()[0])
assert sha(raw) == "814d02131e7f49e1583d041a6a25da0c2545934ce5400aa171b6f3055fff4bea"
r = json.loads(raw)
assert r["accepted"] is True and r["exitCode"] == 0 and r["oldCasesReexecuted"] is False
assert r["sourceCommit"] == "ce59d9b1bed94151fcd5213c11cac405432ac4b6" and r["runId"] == "43428560903"
assert r["deploymentId"] == "dpl_2qc7H2KRWGA8E3Cf6ubhRazMnPAg"
q = r["nativeResult"]
assert q["sourceCommit"] == r["sourceCommit"] and q["deploymentId"] == r["deploymentId"]
assert q["passed"] is True and q["errors"] == [] and q["node"] == "v26.13.0" and q["dataTier"] == "T2"
assert [c["identity"] for c in q["cases"]] == [f"N{i:02}" for i in range(1, 8)]
assert all(c["passed"] is True for c in q["cases"])
captures = []


def unpack(value, label, complete=None):
    body = gzip.decompress(base64.b64decode(value["gzipBase64"], validate=True))
    assert len(body) == value["bytes"] and sha(body) == value["sha256"]
    if complete is not None:
        assert value["complete"] is complete
    captures.append({"label": label, "bytes": len(body), "sha256": sha(body), "complete": value["complete"]})
    return body


assert len(r["commands"]) == 1
c = r["commands"][0]
assert c["exitCode"] == 0 and c["reaped"] is True and not c.get("boundedStop")
stdout = unpack(c["stdout"], "node.stdout", True)
stderr = unpack(c["stderr"], "node.stderr", True)
assert stderr == b"" and stdout.startswith(b"FORWAY_NATIVE_NETWORK_RESULT=") and len(stdout.splitlines()) == 1
assert json.loads(stdout.split(b"=", 1)[1]) == q
source = json.loads((root / "native-network-source.json").read_bytes())
assert source["commit"] == r["sourceCommit"] and source["tree"] == "8a524c4ef47d97182962ee70c609a0d31ea0cb18"
assert len(source["files"]) == len(r["sourceFiles"]) == 52
assert {p["path"]: (p["mode"], p["sha"], p["size"]) for p in source["files"]} == {
    path: (p["mode"], p["blob"], p["bytes"]) for path, p in r["sourceFiles"].items()}
assert [g["label"] for g in r["sourceGuards"]] == ["before-owned-work", "before-real-network", "after-real-network", "after-owned-shutdown", "after-root-removal"]
assert all(g["matches"] and g["files"] == 52 for g in r["sourceGuards"])
native = q["native"]
assert len(native["requests"]) == len(native["dns"]) == 8 and native["harnessRefusals"] == []
assert native["observerErrors"] == []
by_id = {}
for index, request in enumerate(native["requests"]):
    by_id.setdefault(request["identity"], []).append(request)
    assert request["url"].startswith("https://forway.vercel.app/api/check-fixtures/native-page?case=")
    assert request["method"] == "GET" and request["hostHeader"] == "forway.vercel.app" and request["credentialsSent"] is False
    assert request["outgoingHeaders"] == {"accept": "text/html, application/xhtml+xml;q=0.9", "accept-encoding": "identity", "user-agent": "Forway/0.1 public-page-import"}
    peer = request["peer"]
    assert ipaddress.ip_address(peer["address"]).is_global
    assert peer["authorized"] is True and peer["servername"] == "forway.vercel.app" and peer["port"] == 443
    assert peer["family"] == "IPv4" and peer["protocol"] == "TLSv1.3"
    assert len(request["lookupCalls"]) == 1
    lookup = request["lookupCalls"][0]
    assert lookup["error"] is None and lookup["hostname"] == "forway.vercel.app"
    selected = lookup["result"][0]
    pinned = selected[0]["address"] if isinstance(selected, list) else selected
    assert pinned == peer["address"]
    inventories = [d for d in native["dns"] if d["identity"] == request["identity"] and d["finishedAt"] <= request["startedAt"]]
    inventory = inventories[-1]
    assert inventory["hostname"] == "forway.vercel.app" and inventory["options"] == {"all": True, "verbatim": True}
    assert inventory["records"][0]["address"] == pinned and all(ipaddress.ip_address(row["address"]).is_global for row in inventory["records"])
    assert request["requestClosed"] and request["responseClosed"] and request["socketClosed"]
    pairs = request["rawHeaders"]
    request_headers = {pairs[i].lower(): pairs[i + 1] for i in range(0, len(pairs), 2)}
    assert request_headers["x-forway-fixture"] == "forway-native-network-20261113-1"
    request["auditHeaders"] = request_headers
    body = unpack(request["body"], f"request.{index}.{request['identity']}")
    assert len(body) == request["capturedBytes"]
assert {key: len(value) for key, value in by_id.items()} == {"N01": 1, "N02": 2, "N03": 1, "N04": 1, "N05": 1, "N06": 1, "N07": 1}
for request in (by_id["N01"][0], by_id["N02"][1]):
    assert request["body"]["complete"] is True and request["body"]["bytes"] == 158
    assert request["body"]["sha256"] == "86240bc73f6121eb5895699011534f60e696331a0bff6c16de19c17b883543ff"
assert q["cases"][0]["result"]["html"] == q["cases"][1]["result"]["html"]
assert sha(q["cases"][0]["result"]["html"].encode()) == by_id["N01"][0]["body"]["sha256"]
assert q["cases"][1]["result"]["redirects"] == 1 and by_id["N02"][0]["status"] == 307
assert by_id["N03"][0]["status"] == 307 and by_id["N03"][0]["auditHeaders"]["location"] == "https://forway-native-fixture.invalid/must-not-resolve"
assert len([d for d in native["dns"] if d["identity"] == "N03"]) == 1
assert gzip.decompress(base64.b64decode(by_id["N04"][0]["body"]["gzipBase64"])) == b"\xc3\x28"
assert by_id["N04"][0]["body"]["complete"] is True
assert by_id["N05"][0]["auditHeaders"]["content-length"] == "1048577" and by_id["N05"][0]["iteratorOpened"] == 0
assert by_id["N06"][0]["auditHeaders"]["content-type"] == "application/json" and by_id["N06"][0]["iteratorOpened"] == 0
assert by_id["N07"][0]["capturedBytes"] == 54 and by_id["N07"][0]["iteratorReturned"] is True
assert 2000 <= q["cases"][6]["elapsedMs"] < 6000
assert [request["body"]["complete"] for request in native["requests"]] == [True, False, True, False, True, False, False, False]
assert q["cleanup"] == {"liveSockets": 0, "forcedSocketCloses": 0}
cleanup = r["cleanup"]
assert cleanup["rootAbsent"] is True and cleanup["child"]["reaped"] and cleanup["child"]["groupAbsent"] and not cleanup.get("signals")
assert set(cleanup["files"]) == {".owner", "node.stdout", "node.stderr"}
assert cleanup["files"]["node.stdout"]["sha256"] == sha(stdout) and cleanup["files"]["node.stderr"]["sha256"] == sha(stderr)
assert cleanup["files"][".owner"]["sha256"] == sha(r["ownedRoot"]["nonce"].encode())
log = gzip.decompress((root / "native-network-attempt-1-job.log.gz").read_bytes())
assert len(log) == 22359 and sha(log) == "21b0edd692f5af022d38deb5fb026001f961365d4d851827a6d2583d559572c6"
assert b'"kind": "uploaded-proof-retired"' in log and b'"absent": true' in log and sha(raw).encode() in log
controls = json.loads((root / "native-network-controls.json").read_bytes())
assert controls["workflow"]["id"] == 417266739 and controls["workflow"]["state"] == "disabled_manually" and controls["qaRefs"] == []
assert controls["deployment"]["meta"]["githubCommitSha"] == r["sourceCommit"] and controls["deployment"]["readyState"] == "READY"
print(json.dumps({"accepted": True, "kind": "forway.native-network.receipt-audit", "sourceCommit": r["sourceCommit"],
    "identities": [c["identity"] for c in q["cases"]], "nativeLookups": 8, "nativeRequests": 8,
    "sourceFiles": 52, "sourceGuards": 5, "captures": captures,
    "decodedBytes": sum(c["bytes"] for c in captures), "incompleteBodies": 5,
    "ownedRootAbsent": True, "controlsRetired": True, "oldCasesReexecuted": False}, separators=(",", ":")))
