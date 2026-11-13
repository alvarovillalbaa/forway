# Forway test scopes

The earlier77 Node fixture identities and eight hosted browser journeys are
closed at their recorded sources. Do not replay them for new transport checks.

`integration/native-network.mjs` is an explicit seven-identity T2 integration
packet, outside default collection. Data are authored constant fixtures served
from this repository's own fixed public fixture endpoint. No database, user
data, account, analytics or model provider is used. This is not T5 production
database access; requests save no application data.

The default actual importer uses native DNS/HTTP/TLS. A transparent observer
forwards original lookups, requests, stream iteration and outcomes. It records
actual inventories, pinned lookup, socket peer, TLS hostname/authorization,
headers and bytes actually iterated. A separate harness allowlist prevents
foreign requests and must record zero refusals; it cannot replace product policy.

N01–N07 cover exact UTF8 HTML, same-host307 redirect, reserved `.invalid`
redirect refusal before another lookup/request, malformed native UTF8 bytes,
over-limit Content-Length, non-HTML media and streaming-body cancellation.
No private-address connection, scan, hostile site, fuzzing, load, authorization
bypass or customer-data operation is part of this packet. See the
[bounded scope](../docs/proposals/native-network-checks.md).

Requests are serial, at most eight GETs per attempt. Unread or aborted bodies
remain explicitly incomplete. Complete Node stdout/stderr originals, source/
index guards and owned socket/process/scratch/proof teardown pass separately.
This does not establish arbitrary-site safety or durable/global abuse controls.

`fixtures/` holds authored bytes, `helpers/` observation only and `scripts/`
the exact external-CI supervisor. No local execution or existing-suite replay.
