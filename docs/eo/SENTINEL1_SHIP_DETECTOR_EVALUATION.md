# Sentinel-1 Ship Detector — Evaluation

**Research only. No detector has been selected or implemented.**

`ShipDetector` remains the abstraction boundary. This document exists so
the choice is made on licence and calibration evidence rather than on
whichever model appears first in a search.

---

## The finding that shapes everything

**The dominant open-source SAR ship detectors are YOLO-derived, and
Ultralytics YOLO (v5, v8, v11) is licensed AGPL-3.0.**

AGPL-3.0 is network copyleft. Serving a product _over a network_ using
AGPL code triggers the obligation to offer the complete corresponding
source of the combined work to users. For a commercial hosted platform
like Seaphore that is not a footnote — it is either a business-model
change or a paid Ultralytics Enterprise licence.

This disqualifies most of the published state of the art from
drop-in use, regardless of accuracy. Papers report benchmark numbers;
they do not report that the weights carry the framework's licence.

**Any candidate below built on Ultralytics inherits AGPL-3.0 unless its
authors explicitly relicensed, and derived weights generally do not
escape it.**

---

## Candidate matrix

| Candidate                    | Base                    | Dataset               | Sensor                              | Licence                   | Commercial use          | GPU                  | Inference | Accuracy evidence                       | Difficulty | Recommendation                               |
| ---------------------------- | ----------------------- | --------------------- | ----------------------------------- | ------------------------- | ----------------------- | -------------------- | --------- | --------------------------------------- | ---------- | -------------------------------------------- |
| **LEAD-YOLO**                | YOLOv5 (Ultralytics)    | SSDD, HRSID, SAR-Ship | S-1, RadarSat-2, TerraSAR-X         | **AGPL-3.0 (inherited)**  | ❌ without paid licence | Yes (edge-capable)   | Self-host | Published on 3 datasets; edge-optimised | Medium     | **Reject** on licence                        |
| **AC-YOLO**                  | YOLO11 (Ultralytics)    | SSDD, HRSID           | SAR                                 | **AGPL-3.0 (inherited)**  | ❌ without paid licence | Yes                  | Self-host | +1.2% AP SSDD, +1.5% HRSID vs baseline  | Medium     | **Reject** on licence                        |
| **YOLO-SD**                  | YOLO variant            | SSDD                  | SAR                                 | UNVERIFIED                | UNVERIFIED              | Yes                  | Self-host | Published, small-ship focus             | Medium     | Verify licence                               |
| **YOLOv11 + SAM2 zero-shot** | Ultralytics + Meta SAM2 | SSDD                  | SAR                                 | **AGPL-3.0 + SAM2 terms** | ❌ compound risk        | Yes, heavy           | Self-host | 0.637 mIoU, 89.2% detection rate        | High       | **Reject** — two licences to clear           |
| **Ultralytics Enterprise**   | YOLO                    | —                     | —                                   | Commercial                | ✅ **paid**             | Yes                  | Self-host | Same models, cleared licence            | Medium     | **Viable — cost unverified**                 |
| **Custom model on SSDD**     | Own architecture        | **SSDD (Apache-2.0)** | S-1, RadarSat-2, TerraSAR-X, 1–15 m | Ours                      | ✅                      | Training + inference | Self-host | Would need establishing                 | **High**   | **Viable — highest effort, cleanest rights** |
| Hosted SAR inference API     | Vendor                  | Vendor                | Vendor                              | Commercial                | ✅ typically            | None (ours)          | API       | Vendor-claimed                          | Low        | **UNVERIFIED — none evaluated**              |

---

## Dataset licences

| Dataset       | Licence                                  | Note                                                                                          |
| ------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| **SSDD**      | **Apache-2.0** (official GitHub release) | Sentinel-1, RadarSat-2, TerraSAR-X at 1–15 m. Permissive — usable for training a model we own |
| **HRSID**     | UNVERIFIED                               | Released Jan 2020, UESTC. High-resolution; detection + segmentation                           |
| iVision MRSSD | UNVERIFIED                               | Multi-resolution                                                                              |

**SSDD being Apache-2.0 is the most useful licensing fact in this
document.** It means the _training data_ for a commercially clean model
is already available; only the architecture and the training run are
missing.

---

## Sentinel-1 compatibility — the calibration question

None of the accuracy figures above transfer automatically to Seaphore's
scenes. Published SAR detectors are typically trained across mixed
sensors at 1–15 m resolution. Sentinel-1 **IW GRDH** — the standard
maritime mode — is ~10 m pixel spacing, at the coarse end of that range.

Consequences that must be settled before any model is trusted:

- **Minimum detectable target.** At 10 m, a 30 m fishing vessel is ~3
  pixels. Detection rates reported on 1 m imagery say nothing about it.
- **Polarisation.** VV is standard for maritime; models trained on
  mixed or unspecified polarisation may behave differently.
- **Incidence angle.** Sea clutter varies strongly across the swath;
  a model that ignores it will have a position-dependent false-alarm rate.
- **Azimuth ambiguities.** Bright ghost returns offset from real targets
  — a SAR-specific artefact that generic detectors do not reject.

`detector.ts` already refuses scenes whose mode a model does not declare
support for, and returns `unsupported-scene` rather than running anyway.
Whatever is selected must declare `supportedModes`, and honestly.

---

## Options, ranked

### 1. Hosted commercial SAR inference API — **investigate first**

Lowest integration cost and no GPU. No candidate has been evaluated;
this is the gap to close next. Requires: vendor, pricing, Sentinel-1
IW GRDH support, output format, data-residency terms.

### 2. Ultralytics Enterprise licence — **viable, cost unknown**

Buys the published state of the art with cleared rights. Cost unverified.
Fastest route to a working detector _if_ the price is acceptable.

### 3. Custom model trained on SSDD — **cleanest rights, highest effort**

Apache-2.0 data, our architecture, our weights, no licence encumbrance.
Needs ML capability, GPU training, and calibration work Seaphore does not
currently have.

### 4. Ultralytics-derived open models — **reject for production**

Excellent research artefacts. AGPL-3.0 makes them unusable in a
commercial hosted product without the enterprise licence, in which case
option 2 is the same thing bought properly.

---

## What is still unverified

- HRSID licence terms
- YOLO-SD licence
- Ultralytics Enterprise pricing
- Whether any hosted SAR detection API supports Sentinel-1 IW GRDH
- Real-world accuracy of any candidate **on Sentinel-1 IW specifically**
- Inference cost per scene
- Whether Copernicus product download is workable inside our runtime

---

## Copernicus product access — an unresolved blocker

`CopernicusProvider` retrieves **scene metadata only** and now carries
`productHref`. It has never downloaded a product.

A Sentinel-1 IW GRDH scene is roughly **1 GB**. That cannot be fetched,
held or processed inside a Cloudflare Worker, which means a detector
integration needs separate processing infrastructure regardless of which
model is chosen.

**Do not run detection against the browse thumbnail.** A preview JPEG has
none of the radiometric content detection depends on, and a model run
against it produces confident nonsense. `productHref` exists precisely so
a processing service fetches the real product directly.

---

## Recommendation

**Select nothing yet.** Two questions decide it, and both are commercial
rather than technical:

1. What does an Ultralytics Enterprise licence cost?
2. Does a hosted SAR inference API exist that supports Sentinel-1 IW GRDH
   at acceptable cost and terms?

Until one is answered, `unavailableDetector` remains correct: it returns
no detections and explains why, which is the honest state of a pipeline
with no model.
