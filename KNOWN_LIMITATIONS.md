# MedVerify V1.0 — Known System Limitations & Roadmap

**Document Version:** 1.0.0  
**Effective Date:** November 6, 2026  
**Audience:** Platform Engineers, Regulatory Auditors, Clinical Stakeholders  

---

## 1. Scope Boundaries: Packaging Verification vs. Chemical Assay

MedVerify is a digital, forensic packaging verification and decision-support platform designed to validate external identifiers, serialized barcodes, physical tamper-evidence, and manufacturer registry records.

> [!IMPORTANT]
> **Digital Verification Cannot Replace Laboratory Chemical Analysis:**
> A product whose packaging, batch number, and serial number are 100% authentic could theoretically have been tampered with post-manufacturing, subjected to improper thermal storage, or refilled with counterfeit substances if seals are compromised. MedVerify explicitly disclaims the ability to guarantee active chemical purity or clinical efficacy without laboratory assay testing.

---

## 2. Optical Image & Barcode OCR Limitations

1. **Resolution & Minimum Dimensions:**
   - Packaging photographs must be at least `200x200` pixels. Low-resolution mobile cameras in dim lighting or extreme motion blur may fail OCR extraction, triggering manual review fallback.
2. **Glare and Reflective Foils:**
   - Blister packs with reflective aluminum foil can create specular highlights that obscure printed lot numbers or DataMatrix dots. Users are instructed to angle packaging away from direct flash.
3. **Severe Physical Damage:**
   - If a 2D DataMatrix barcode has suffered more than ~30% physical abrasion exceeding Reed-Solomon ECC200 error correction capacity, the payload cannot be reconstructed optically and requires manual alphanumeric field entry.

---

## 3. Serialization & Registry Assumptions

1. **Internal Registry vs. Exhaustive Global Registry:**
   - MedVerify validates incoming barcodes against its configured database of registered pharmaceutical products and batches. Unregistered legitimate medicines from countries outside participating platforms will return `NOT_FOUND` rather than `SUSPICIOUS`, indicating they are absent from the configured catalog.
2. **Serial Number Reuse Anomaly Nature:**
   - Duplicate serial number detection indicates that an identical serial code was previously recorded. While this is a high-risk counterfeit indicator (cloning), it may also occur if an authentic package is scanned multiple times across pharmacies or in demonstration workflows. MedVerify correctly treats this as an **anomaly requiring investigation**, rather than definitive mathematical proof of counterfeiting in isolation.

---

## 4. Rate Limiting Architecture & Distributed Scaling

1. **In-Memory Sliding Window Rate Limiting:**
   - In V1.0, rate limiters (`ImageRateLimiter` and `RateLimiter`) maintain sliding request timestamps in memory per backend worker process.
   - When scaled horizontally across multiple Kubernetes pods or container instances without sticky sessions, rate limit quotas are per-worker rather than global.
   - *Roadmap Recommendation for V2.0:* Replace in-memory dictionaries with a centralized Redis sliding-window key-value store.

---

## 5. Non-Automated Regulatory & Legal Actions

1. **Informational & Decision Support Only:**
   - MedVerify does **not** automatically freeze hospital dispensing, lock pharmacy point-of-sale cash registers, or dispatch law enforcement. 
   - Counterfeit reports filed through the platform are recorded in the administrative audit log; escalation to national authorities (such as the US FDA MedWatch, UK MHRA Yellow Card, or WHO Rapid Alert System) requires authorized human compliance officers to initiate formal regulatory filings.

---

## 6. Technical Roadmap for Version 2.0

| Milestone / Capability | Target Horizon | Architectural Plan |
| :--- | :---: | :--- |
| **Distributed Rate Limiting** | V2.0 Q1 | Transition from in-memory sliding window to Redis cluster. |
| **On-Device Edge OCR** | V2.0 Q2 | Client-side WebAssembly / TensorFlow.js DataMatrix decoding prior to network upload. |
| **National Drug Registry Connectors** | V2.0 Q3 | Real-time bi-directional API connectors for FDA NDC Directory, GS1 Global Registry, and EMA database. |
| **Supply Chain GS1 EPCIS Tracking** | V2.0 Q4 | Event-based Electronic Product Code Information Services (EPCIS) custody handoffs from manufacturer to distributor to pharmacy. |
