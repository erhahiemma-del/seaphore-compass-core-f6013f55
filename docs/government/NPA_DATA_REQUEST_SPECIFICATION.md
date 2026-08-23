# NPA Data Integration — Request Specification

**For submission to the Nigerian Ports Authority**

Seaphore has built and tested a connector for NPA SHIPPOS data. It is
complete apart from access: normalisation, validation, deduplication,
entity resolution and the port-call lifecycle are implemented and covered
by tests. What remains is a sanctioned machine-readable route.

This document states exactly what we are asking for, so NPA can assess it
against one page rather than a conversation.

---

## What we are not asking for

- **No scraping.** SHIPPOS returns HTTP 403 to automated clients and
  `nigerianports.gov.ng/robots.txt` disallows automated agents. We have
  respected both and will continue to. Seaphore's connector has no HTML
  parsing path.
- **No credential sharing.** We are not asking for a staff login.
- **No access to internal or restricted NPA systems.**

---

## Preferred delivery, in order

| #   | Route                             | What it means                                                              | Effort for NPA                                   |
| --- | --------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | **Public export endpoint**        | A stable URL returning the same data the SHIPPOS "Export" control produces | Lowest — likely already exists behind the button |
| 2   | **REST API**                      | Authenticated read-only endpoints per dataset                              | Moderate                                         |
| 3   | **Scheduled feed**                | A daily JSON/CSV/XLSX drop to SFTP or object storage                       | Low                                              |
| 4   | **Authorized institutional feed** | Any of the above under a data-sharing agreement                            | Per NPA policy                                   |

Option 1 is the lightest ask: if the existing Export control already
produces a file, publishing its endpoint (or confirming it may be called
directly) would be sufficient.

---

## Datasets requested

1. **Daily Shipping Schedule — Vessels Expected**
2. **Vessels Awaiting Berth**
3. **Vessels at Berth**
4. **Departed Vessels**

---

## Fields requested

Bold fields are the ones the connector depends on; the rest enrich it.

| Field                | Notes                                                              |
| -------------------- | ------------------------------------------------------------------ |
| **vessel_name**      |                                                                    |
| **imo**              | Primary identifier. Everything downstream keys on it               |
| mmsi                 | If held. Enables direct AIS correlation                            |
| call_sign            |                                                                    |
| **port**             |                                                                    |
| **terminal**         | The vessel→port→terminal relationship is essential                 |
| berth                |                                                                    |
| **eta**              | With timezone, or a stated convention                              |
| etd                  |                                                                    |
| arrival_date         |                                                                    |
| departure_date       |                                                                    |
| berth_date           |                                                                    |
| agent                |                                                                    |
| cargo                |                                                                    |
| commodity            |                                                                    |
| tonnage              | With units stated                                                  |
| length               | With units stated                                                  |
| rotation             |                                                                    |
| ship_to_follow       |                                                                    |
| status               |                                                                    |
| **source_timestamp** | When NPA considers the record true, distinct from when we fetch it |

**On `imo` and `source_timestamp`:** these two carry disproportionate
weight. Without IMO, a vessel can only be matched by name, which we
refuse to do when two vessels share one — so those records cannot be
correlated with AIS at all. Without `source_timestamp` we cannot tell an
officer how old the data is, and we will not present undated operational
data as current.

---

## Technical preferences

| Aspect         | Preference                     | Acceptable alternative            |
| -------------- | ------------------------------ | --------------------------------- |
| Format         | JSON                           | CSV, XLSX, XML                    |
| Encoding       | UTF-8                          |                                   |
| Dates          | ISO 8601 with offset           | Any documented, consistent format |
| Nulls          | Explicit `null`                | Empty string, if consistent       |
| Auth           | API key in header              | Basic auth, mTLS, IP allowlist    |
| Update cadence | Whatever NPA already publishes | —                                 |
| Rate limit     | Whatever NPA sets              | —                                 |

We will honour any documented rate limit and cache accordingly. Our
default polling assumption is **no more than once per hour per dataset**
unless NPA specifies otherwise.

---

## Questions for NPA

1. Does the SHIPPOS **Export** control produce a file from a stable URL,
   and may that URL be called directly?
2. What format does the export produce?
3. How often is the underlying data updated?
4. Is there an existing API, documented or otherwise, for these datasets?
5. Are **historical** schedules available? We have observed Daily
   Shipping Position documents published as PDFs going back to at least
   2017, which suggests an archive exists.
6. What are the **licensing terms** for reuse — specifically commercial
   use, storage, redistribution and derived data?
7. Is there a preferred contact for technical integration?

---

## Licensing position

Seaphore treats NPA data as `LICENSE_REVIEW_REQUIRED` until terms are
confirmed in writing. Publicly accessible is not the same as commercially
reusable, and we will not place NPA data into a commercial product
without an explicit position on question 6 above.

---

## What Seaphore provides in return

- Full provenance on every record: source, URL, dataset, record id,
  source timestamp, retrieval time, content hash.
- No modification of NPA values. Conflicting observations from other
  sources are stored alongside, never overwriting NPA's.
- NPA marked as the **authoritative source** for Nigerian port
  operational state, above every commercial AIS provider, in Seaphore's
  source-authority framework.
- Attribution wherever NPA data is displayed.

---

## Current connector status

```
NPA SHIPPOS
STATUS: AUTHORIZATION REQUIRED
CONNECTOR: READY — AWAITING ACCESS
```

Until a route is supplied, every dataset returns zero records with the
reason stated in full. No placeholder or sample data is generated at
runtime, and the absence of records is never presented as an absence of
vessels.
