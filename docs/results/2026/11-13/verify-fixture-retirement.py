"""Audit retained lifecycle data only; no live request or application execution."""
import base64
import gzip
import hashlib
import ipaddress
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
sha = lambda value: hashlib.sha256(value).hexdigest()
archive = (root / "fixture-retirement-attempt-1.zip").read_bytes()
assert len(archive) == 5873 and sha(archive) == "415f08fb0ee2152aaa45540bcd0f6f6339dae696b6eab17e88d07fd5ce293692"
with zipfile.ZipFile(root / "fixture-retirement-attempt-1.zip") as z:
    assert z.namelist() == ["forway-fixture-retirement-43430877493.json"] and z.infolist()[0].file_size == 13229
    raw = z.read(z.namelist()[0])
assert sha(raw) == "c8385e35091296274cbb12b8252f5b77784ca045f3885fc562ee872943bb6123"
r = json.loads(raw)
assert r["accepted"] is True and r["applicationCasesReexecuted"] is False and r["runId"] == "43430877493"
assert r["sourceCommit"] == "c3551d2fe135d90c3ba208c0e45e8990c2611f4f" and r["deploymentId"] == "dpl_474DophYi5tWBxciUx76bh4hLYSu"
assert r["request"]["method"] == "GET" and r["request"]["redirectsFollowed"] is False
assert r["request"]["url"] == "https://forway.vercel.app/api/check-fixtures/native-page?case=ok"
assert r["response"]["status"] == 404 and r["response"]["sslVerify"] == 0 and r["response"]["redirects"] == 0
assert ipaddress.ip_address(r["response"]["remoteIP"]).is_global
captures = []


def unpack(value, label):
    b = gzip.decompress(base64.b64decode(value["gzipBase64"], validate=True))
    assert len(b) == value["bytes"] and sha(b) == value["sha256"]
    captures.append(dict(label=label, bytes=len(b), sha256=sha(b)))
    return b


c = r["command"]
assert c["exitCode"] == 0 and c["reaped"] is True
assert json.loads(unpack(c["stdout"], "curl.stdout")) == r["response"]
assert unpack(c["stderr"], "curl.stderr") == b""
body = unpack(r["body"], "anonymous.response.body")
assert len(body) == r["response"]["bytes"] == 79
assert sha(body) == "aaabe30e4a60fa777da4778f5df705c420d9526557ad2df5236ce5c9426a7acf"
assert r["guards"] == ["before-owned-read", "after-owned-read", "after-cleanup"]
assert r["cleanup"]["childGroupAbsent"] is True and r["cleanup"]["rootAbsent"] is True and not r["cleanup"].get("signal")
assert set(r["cleanup"]["files"]) == {".owner", "headers", "body"}
assert r["cleanup"]["files"]["body"]["sha256"] == sha(body)
log = gzip.decompress((root / "fixture-retirement-attempt-1-job.log.gz").read_bytes())
assert len(log) == 29490 and sha(log) == "c40db1f85470bf80e182bb3c24a0e7d0eb566f334e09e5caa035a305fd654358"
expected = json.dumps(dict(kind="uploaded-proof-retired", sha256=sha(raw), bytes=len(raw), absent=True)).encode()
assert expected in log
p = json.loads((root / "native-network-publication.json").read_bytes())
assert p["retirement"]["anonymousGets"] == 1 and p["retirement"]["httpStatus"] == 404
assert p["canonicalDeployment"]["meta"]["githubCommitSha"] == r["sourceCommit"] and p["canonicalDeployment"]["readyState"] == "READY"
assert p["retirementSource"]["commit"] == r["sourceCommit"] and len(p["retirementSource"]["files"]) == 59
assert {row["path"]: (row["mode"], row["sha"], row["size"]) for row in p["retirementSource"]["files"]} == {
    path: (row["mode"], row["blob"], row["bytes"]) for path, row in r["sourceFiles"].items()}
assert "api/check-fixtures/native-page.mjs" not in r["sourceFiles"] and "tests/fixtures/native-page-handler.mjs" in r["sourceFiles"]
assert {w["id"] for w in p["workflows"]} == {417266739, 417281955} and all(w["state"] == "disabled_manually" for w in p["workflows"])
assert all(row["refs"] == [] for row in p["qaRefs"])
assert p["previewDeletion"]["performed"] is False and len(p["retainedHistoricalPreviews"]) == 2
assert p["localRetirementRead"]["exitCode"] == 6 and p["fullProductComplete"] is False
print(json.dumps(dict(accepted=True, kind="forway.fixture-retirement.receipt-audit", sourceCommit=r["sourceCommit"],
    anonymousGets=1, status=404, sourceFiles=59, sourceGuards=3, applicationCasesReexecuted=False,
    captures=captures, decodedBytes=sum(c["bytes"] for c in captures), historicalPreviewsRetained=2), separators=(",", ":")))
