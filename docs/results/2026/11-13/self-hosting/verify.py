"""Read archived evidence only. Starts no app, test, browser or service."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
sources = json.loads((root / "qualified-sources.json").read_bytes())
artifacts = json.loads((root / "artifacts.json").read_bytes())
schema = {"version": 1, "forcedRls": True, "anonymousUsage": False,
          "authenticatedUsage": False, "runtimeNoLogin": True}
for artifact in artifacts:
    data = (root / artifact["file"]).read_bytes()
    assert hashlib.sha256(data).hexdigest() == artifact["sha256"]
    source = sources[artifact["sourceKey"]]
    with zipfile.ZipFile(root / artifact["file"]) as archive:
        entries = archive.infolist()
        assert len(entries) <= 5 and sum(x.file_size for x in entries) < 262144
        assert len({x.filename for x in entries}) == len(entries)
        assert all("/" not in x.filename and not x.filename.startswith(".") for x in entries)
        receipt = json.loads(archive.read("receipt.json"))
        assert receipt["source"] == source["commit"]
        expected = {p: {"mode": v["mode"], "blob": v["sha"], "bytes": v["bytes"],
                        "sha256": v["sha256"]} for p, v in source["files"].items()}
        assert receipt["sourceFiles"] == expected
        assert receipt["accepted"] is artifact["accepted"]
        assert receipt["runId"] == str(artifact["runId"])
        assert receipt["schema"] == schema and receipt["databaseVersion"] == "17.11"
        assert receipt["newPublishableKeyPresent"] and not receipt["config"]["remoteConfigured"]
        assert not receipt["rawSecretStreamsPublished"]
        assert not receipt.get("oldCasesExecuted", receipt.get("appBrowserOrOldCasesExecuted"))
        migration = receipt["migration"]
        sql = archive.read(migration["name"])
        assert len(sql) == migration["bytes"] == 4363
        assert hashlib.sha256(sql).hexdigest() == migration["sha256"] == "ad47ce9c53dbf0c9de177d83a4bd9da60c966351feb08bc132b855acd117a59c"
        if artifact["accepted"]:
            assert receipt["sourceAfterQualification"] and receipt["sourceAfterCleanup"]
            assert receipt["cleanup"]["ownedDockerResourcesAbsent"] and receipt["cleanup"]["scratchAbsent"]
            assert all(c["exitCode"] == 0 and c["reaped"] and not c["forced"] and c["groupAbsent"]
                       for c in receipt["commands"])
            if artifact.get("services"):
                result = json.loads(archive.read("services.json"))
                assert result["accepted"] and result["mockedResponses"] == 0
                assert [r["id"] for r in result["rows"]] == artifact["expectedRows"]
                assert all(r["status"] == "passed" for r in result["rows"])
                assert result["databaseTlsSessions"] > 0
                assert all(result["cleanup"].values())
                assert receipt["cleanup"]["capturedAppAndBrowserGroupsAbsent"]
                assert receipt["deletionReadback"] == artifact["deletionReadback"]
        elif artifact["runId"] == 43492107411:
            assert "services.json" not in archive.namelist()
            assert receipt["failure"]["message"] == "owned-database-tls-setting failed"
            assert receipt["cleanup"]["ownedDockerResourcesAbsent"]
            assert receipt["cleanup"]["failure"]["type"] == "PermissionError"
            assert "scratchAbsent" not in receipt["cleanup"]
        elif artifact["runId"] == 43493427358:
            result = json.loads(archive.read("services.json"))
            assert not result["accepted"] and result["mockedResponses"] == 0
            assert [r["id"] for r in result["rows"]] == ["R0" + str(i) for i in range(1, 6)]
            assert all(r["status"] == "passed" for r in result["rows"])
            assert result["failure"]["phase"] == "R06-real-desktop-journey"
            assert result["failure"]["type"] == "TimeoutError"
            assert all(result["cleanup"].values())
            assert receipt["cleanup"]["scratchAbsent"] and receipt["cleanup"]["ownedDockerResourcesAbsent"]
            assert receipt["cleanup"]["capturedAppAndBrowserGroupsAbsent"]
            assert "sourceAfterCleanup" not in receipt
        elif artifact["runId"] == 43494538325:
            assert "services.json" not in archive.namelist()
            assert receipt["failure"]["message"] == "Source status changed at after-service-dependencies"
            assert receipt["sourceGuardObservations"] == [
                {"stage": "snapshot", "status": "", "bounded": True},
                {"stage": "after-service-dependencies", "status": "?? supabase/.temp/\n", "bounded": True},
                {"stage": "after-owned-cleanup", "status": "?? supabase/.temp/\n", "bounded": True}]
            assert receipt["cleanup"]["scratchAbsent"] and receipt["cleanup"]["ownedDockerResourcesAbsent"]
            assert receipt["cleanup"]["capturedGroups"] == 0
            assert "sourceAfterCleanup" not in receipt
        elif artifact["runId"] == 43495299173:
            result = json.loads(archive.read("services.json"))
            assert not result["accepted"] and result["mockedResponses"] == 0
            assert [r["id"] for r in result["rows"]] == ["R0" + str(i) for i in range(1, 7)]
            assert all(r["status"] == "passed" for r in result["rows"])
            assert result["failure"]["phase"] == "R07-real-narrow-journey"
            assert result["failure"]["step"] == "save-workspace"
            assert all(result["cleanup"].values())
            assert receipt["sourceAfterCleanup"]
            assert all(x["status"] == "" and x["bounded"] for x in receipt["sourceGuardObservations"])
            assert receipt["cleanup"]["scratchAbsent"] and receipt["cleanup"]["ownedDockerResourcesAbsent"]
            assert receipt["cleanup"]["capturedAppAndBrowserGroupsAbsent"]
        else:
            raise AssertionError("Unreviewed failure outcome")
    print(str(artifact["runId"]) + ": original archive, source vector and qualified outcome verified")

runtime = json.loads((root / "runtime-vector.json").read_bytes())
assert runtime["sameProductFilesAtBothQualifiedSources"]
for path, entry in runtime["files"].items():
    assert entry == sources["servicesAttempt4"]["files"][path] == sources["servicesAttempt5"]["files"][path]
retirement = json.loads((root / "retirement.json").read_bytes())
assert {w["id"] for w in retirement["workflows"]} == {417647482, 417655693, 417663576, 417670149, 417674651, 417680580}
assert all(w["state"] == "disabled_manually" for w in retirement["workflows"])
assert len(retirement["ownedRefs"]) == 6 and all(r["absent"] for r in retirement["ownedRefs"])
assert all(r["preserved"] for r in retirement["otherObservedRefs"])
print("28 product files agree at both qualified sources; six owned CI controls retired")
