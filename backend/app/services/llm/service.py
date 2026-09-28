"""MedVerify LLM Service.

Orchestrates:
1. Explain My Result (grounded, multilingual, simple/technical)
2. Ask MedVerify assistant (contextual, conversational memory, strict medical safety)
3. Packaging OCR AI Normalization
4. Admin AI Verification Analyst (aggregated analytics only)
5. Rate limiting & Failsafe deterministic fallback
"""

import json
import logging
import time
import uuid
from collections import defaultdict
from typing import Optional, Dict, Any, List, Tuple

from app.config import settings
from app.db.repositories import verifications_repo
from app.services.llm.client import (
    call_openai_json,
    is_ai_available,
)
from app.services.llm.prompts import (
    EXPLAIN_VERIFICATION_SYSTEM_PROMPT,
    ASK_MEDVERIFY_SYSTEM_PROMPT,
    OCR_NORMALIZATION_SYSTEM_PROMPT,
    ADMIN_ANALYST_SYSTEM_PROMPT,
)
from app.services.llm.schemas import (
    ExplainVerificationRequest,
    VerificationExplanation,
    AskMedVerifyRequest,
    AskMedVerifyResponse,
    OCRNormalizeRequest,
    OCRNormalizedCandidate,
    AdminAIAnalyzeRequest,
    AdminAIAnalyzeResponse,
    AIHealthResponse,
    ExplanationStyle,
    LANGUAGE_NAMES,
)

logger = logging.getLogger("medverify.ai.service")


# ---------------------------------------------------------------------------
# Rate Limiting (Sliding Window per user/IP)
# ---------------------------------------------------------------------------

class RateLimiter:
    """In-memory sliding window rate limiter for LLM requests."""

    def __init__(self):
        # key -> list of request timestamps
        self._history: Dict[str, List[float]] = defaultdict(list)

    def check_and_record(self, key: str, max_requests: int, window_seconds: float = 60.0) -> bool:
        now = time.time()
        cutoff = now - window_seconds
        # Clean older entries
        self._history[key] = [t for t in self._history[key] if t > cutoff]

        if len(self._history[key]) >= max_requests:
            return False

        self._history[key].append(now)
        return True


rate_limiter = RateLimiter()

# In-memory conversational memory: session_id -> list of {"role": str, "content": str}
_conversation_memory: Dict[str, List[Dict[str, str]]] = defaultdict(list)
_MAX_HISTORY_TURNS = 4


# ---------------------------------------------------------------------------
# LLM Service Core Implementation
# ---------------------------------------------------------------------------

class LLMService:
    """Coordinates all AI intelligence capabilities with grounded safeguards."""

    # -----------------------------------------------------------------------
    # 1. Explain My Result
    # -----------------------------------------------------------------------

    def explain_verification(
        self,
        req: ExplainVerificationRequest,
        user_id: str = "anonymous",
    ) -> VerificationExplanation:
        """Provide a strictly grounded, multi-lingual explanation of a verification."""
        # 1. Rate limit
        limit = settings.openai_rate_limit_per_minute
        if not rate_limiter.check_and_record(f"user_explain:{user_id}", max_requests=limit):
            raise RuntimeError("Rate limit exceeded: Too many AI requests. Please wait a moment.")

        # 2. Fetch authoritative verification record
        doc = verifications_repo.get_by_id(req.verification_id)
        if not doc:
            raise ValueError(f"Verification record '{req.verification_id}' not found.")

        # 3. Extract evidence payload
        evidence = self._extract_grounded_evidence(doc)
        target_lang = LANGUAGE_NAMES.get(req.language, "English")

        # 4. Check AI availability
        available, reason = is_ai_available()
        if not available:
            logger.info("OpenAI unavailable (%s). Using deterministic explanation fallback.", reason)
            return self._deterministic_explanation_fallback(doc, evidence, req)

        # 5. Build prompt
        user_prompt = f"""
VERIFIED EVIDENCE RECORD (AUTHENTICITY STATUS IS ALREADY DECIDED BY MEDVERIFY):
{json.dumps(evidence, indent=2)}

REQUEST PARAMETERS:
- Tone Style: {req.style.value.upper()} (simple = consumer-friendly, technical = forensic & regulatory details)
- Target Language: {target_lang} ({req.language})

TASK:
Produce a structured JSON explanation adhering strictly to the provided evidence.
Respond ONLY with a JSON object conforming to this schema:
{{
  "summary": "Clear, grounded explanation in {target_lang}",
  "what_was_checked": ["Checked item 1", "Checked item 2"],
  "matched_evidence": ["Evidence 1 that passed", "Evidence 2 that passed"],
  "concerns": ["Any warnings, missing fields, or flagged discrepancies"],
  "next_steps": ["Actionable safe guidance for user in {target_lang}"],
  "disclaimer": "Informational disclaimer in {target_lang}"
}}
"""

        messages = [
            {"role": "system", "content": EXPLAIN_VERIFICATION_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        try:
            parsed = call_openai_json(messages, max_tokens=1000)
            return VerificationExplanation(
                summary=parsed.get("summary", ""),
                what_was_checked=parsed.get("what_was_checked", []),
                matched_evidence=parsed.get("matched_evidence", []),
                concerns=parsed.get("concerns", []),
                next_steps=parsed.get("next_steps", []),
                disclaimer=parsed.get("disclaimer", "MedVerify explanations are informational."),
                style=req.style.value,
                language=req.language,
                model_used=settings.openai_model,
                verification_id=req.verification_id,
                status=doc.get("status", "UNKNOWN"),
                confidence_score=doc.get("confidence_score", 0),
            )
        except Exception as exc:
            logger.warning("OpenAI explanation call failed: %s. Falling back to deterministic output.", exc)
            return self._deterministic_explanation_fallback(doc, evidence, req)

    # -----------------------------------------------------------------------
    # 2. Ask MedVerify
    # -----------------------------------------------------------------------

    def ask_medverify(
        self,
        req: AskMedVerifyRequest,
        user_id: str = "anonymous",
    ) -> AskMedVerifyResponse:
        """Answer user questions with strict grounding and medical safety boundaries."""
        # 1. Rate limit
        limit = settings.openai_rate_limit_per_minute
        if not rate_limiter.check_and_record(f"user_chat:{user_id}", max_requests=limit):
            raise RuntimeError("Rate limit exceeded: Too many AI requests. Please wait a moment.")

        conv_id = req.conversation_id or str(uuid.uuid4())

        # 2. Contextual verification data if provided
        verification_context = None
        if req.verification_id:
            doc = verifications_repo.get_by_id(req.verification_id)
            if doc:
                verification_context = self._extract_grounded_evidence(doc)

        target_lang = LANGUAGE_NAMES.get(req.language, "English")

        # 3. Check AI availability
        available, reason = is_ai_available()
        if not available:
            logger.info("OpenAI unavailable (%s). Using deterministic assistant fallback.", reason)
            return self._deterministic_chat_fallback(req, verification_context, conv_id)

        # 4. Assemble conversation messages
        messages = [{"role": "system", "content": ASK_MEDVERIFY_SYSTEM_PROMPT}]

        # Inject grounded context
        if verification_context:
            context_block = f"""
CURRENT ACTIVE VERIFICATION EVIDENCE (USER IS INQUIRING ABOUT THIS SPECIMEN):
{json.dumps(verification_context, indent=2)}
"""
            messages.append({"role": "system", "content": context_block})

        # Inject conversation history
        history_key = f"{user_id}:{conv_id}"
        past_turns = _conversation_memory[history_key]
        for turn in past_turns[-_MAX_HISTORY_TURNS:]:
            messages.append(turn)

        # Append current user prompt
        user_block = f"""
USER QUESTION (IN {target_lang}):
{req.question}

INSTRUCTIONS:
1. Provide a direct, reassuring, and strictly truthful answer in {target_lang}.
2. Adhere completely to the medical safety boundary: do NOT give dosage or treatment advice.
3. List 1-3 verified facts referenced in your reasoning under 'grounded_facts'.
4. Return strictly valid JSON with keys: 'answer', 'grounded_facts', 'safety_notice'.
"""
        messages.append({"role": "user", "content": user_block})

        try:
            parsed = call_openai_json(messages, max_tokens=800)
            answer = parsed.get("answer", "")
            facts = parsed.get("grounded_facts", [])
            notice = parsed.get("safety_notice", "MedVerify does not provide personalized medical advice.")

            # Record in memory
            _conversation_memory[history_key].append({"role": "user", "content": req.question})
            _conversation_memory[history_key].append({"role": "assistant", "content": answer})
            if len(_conversation_memory[history_key]) > _MAX_HISTORY_TURNS * 2:
                _conversation_memory[history_key] = _conversation_memory[history_key][-_MAX_HISTORY_TURNS * 2:]

            return AskMedVerifyResponse(
                answer=answer,
                grounded_facts=facts,
                verification_referenced=req.verification_id,
                safety_notice=notice,
                conversation_id=conv_id,
                model_used=settings.openai_model,
            )
        except Exception as exc:
            logger.warning("OpenAI chat call failed: %s. Using deterministic fallback.", exc)
            return self._deterministic_chat_fallback(req, verification_context, conv_id)

    # -----------------------------------------------------------------------
    # 3. OCR AI Normalization
    # -----------------------------------------------------------------------

    def normalize_ocr(
        self,
        req: OCRNormalizeRequest,
        user_id: str = "anonymous",
    ) -> OCRNormalizedCandidate:
        """Extract and normalize candidate packaging fields from raw OCR text."""
        limit = settings.openai_rate_limit_per_minute
        if not rate_limiter.check_and_record(f"user_ocr:{user_id}", max_requests=limit):
            raise RuntimeError("Rate limit exceeded: Please wait before submitting another OCR scan.")

        available, reason = is_ai_available()
        if not available:
            logger.info("OpenAI unavailable (%s). Using deterministic OCR regex parsing.", reason)
            return self._deterministic_ocr_fallback(req.raw_text)

        messages = [
            {"role": "system", "content": OCR_NORMALIZATION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"""
RAW OCR TEXT EXTRACTED FROM PACKAGING (UNTRUSTED INPUT):
\"\"\"
{req.raw_text[:3000]}
\"\"\"

Return a valid JSON object matching:
{{
  "medicine_name": "string or null",
  "manufacturer": "string or null",
  "gtin": "14-digit numeric string or null",
  "batch_number": "string or null",
  "serial_number": "string or null",
  "expiry_date": "YYYY-MM-DD or null",
  "strength": "string or null",
  "dosage_form": "string or null",
  "confidence_notes": ["Note about normalization or missing text"]
}}
""",
            },
        ]

        try:
            parsed = call_openai_json(messages, max_tokens=600)
            return OCRNormalizedCandidate(
                medicine_name=parsed.get("medicine_name"),
                manufacturer=parsed.get("manufacturer"),
                gtin=parsed.get("gtin"),
                batch_number=parsed.get("batch_number"),
                serial_number=parsed.get("serial_number"),
                expiry_date=parsed.get("expiry_date"),
                strength=parsed.get("strength"),
                dosage_form=parsed.get("dosage_form"),
                confidence_notes=parsed.get("confidence_notes", []),
            )
        except Exception as exc:
            logger.warning("OpenAI OCR normalization failed: %s. Using deterministic fallback.", exc)
            return self._deterministic_ocr_fallback(req.raw_text)

    # -----------------------------------------------------------------------
    # 4. Admin AI Verification Analyst
    # -----------------------------------------------------------------------

    def admin_analyze(
        self,
        req: AdminAIAnalyzeRequest,
        admin_user: Dict[str, Any],
    ) -> AdminAIAnalyzeResponse:
        """Forensic analysis over strictly authorized, aggregated admin metrics."""
        admin_id = admin_user.get("id") or admin_user.get("user_id") or "admin"
        limit = settings.openai_admin_rate_limit_per_minute
        if not rate_limiter.check_and_record(f"admin_analyze:{admin_id}", max_requests=limit):
            raise RuntimeError("Admin AI rate limit reached. Please wait a moment.")

        # 1. Fetch authorized aggregated metrics from repositories (NO arbitrary SQL!)
        analytics = verifications_repo.get_admin_analytics()

        # 2. Check AI availability
        available, reason = is_ai_available()
        if not available:
            logger.info("OpenAI unavailable (%s). Using deterministic admin summary.", reason)
            return self._deterministic_admin_fallback(req, analytics)

        user_prompt = f"""
AUTHORIZED AGGREGATED METRICS (LAST {req.time_range.upper()}):
{json.dumps(analytics, indent=2)}

ADMIN INQUIRY:
"{req.query}"

TASK:
Analyze the provided metrics and return a JSON object strictly conforming to:
{{
  "summary": "Executive summary of verification operations and findings",
  "key_findings": ["Point 1", "Point 2", "Point 3"],
  "risk_assessment": "Assessment of counterfeit threats, duplicate serial frequency, and unverified batches",
  "actionable_recommendations": ["Recommendation 1", "Recommendation 2"],
  "metrics_analyzed": {{
    "total_verifications": {analytics.get('total_verifications', 0)},
    "suspicious_rate": "{analytics.get('suspicious_rate', '0%')}"
  }}
}}
"""

        messages = [
            {"role": "system", "content": ADMIN_ANALYST_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        try:
            parsed = call_openai_json(messages, max_tokens=1200)
            return AdminAIAnalyzeResponse(
                summary=parsed.get("summary", "Analysis completed over authorized metrics."),
                key_findings=parsed.get("key_findings", []),
                risk_assessment=parsed.get("risk_assessment", "No critical anomalies flagged."),
                actionable_recommendations=parsed.get("actionable_recommendations", []),
                metrics_analyzed=parsed.get("metrics_analyzed", analytics),
                model_used=settings.openai_model,
            )
        except Exception as exc:
            logger.warning("OpenAI admin analysis call failed: %s. Using deterministic fallback.", exc)
            return self._deterministic_admin_fallback(req, analytics)

    # -----------------------------------------------------------------------
    # 5. AI Health Check
    # -----------------------------------------------------------------------

    def get_health(self) -> AIHealthResponse:
        """Return non-sensitive status of the OpenAI LLM layer."""
        available, reason = is_ai_available()
        return AIHealthResponse(
            available=available,
            provider="openai",
            model=settings.openai_model,
            reason=reason,
        )

    # -----------------------------------------------------------------------
    # Helper: Extract Grounded Evidence
    # -----------------------------------------------------------------------

    def _extract_grounded_evidence(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Strip raw MongoDB/Supabase internals and extract clean verified evidence."""
        med = doc.get("medicine") or {}
        parsed = doc.get("parsed_data") or {}
        checks = doc.get("checks") or []
        checks_clean = []
        for chk in checks:
            data = chk if isinstance(chk, dict) else (chk.model_dump() if hasattr(chk, "model_dump") else {})
            checks_clean.append({
                "field": data.get("field", ""),
                "name": data.get("name", ""),
                "status": data.get("status", "SKIP"),
                "detail": data.get("detail", ""),
            })

        return {
            "status": doc.get("status", "UNKNOWN"),
            "confidence_score": doc.get("confidence_score", 0),
            "input_type": doc.get("input_type", "QR"),
            "verification_method": doc.get("verification_method", "QR"),
            "raw_identifier": doc.get("raw_identifier", ""),
            "scanned_parameters": {
                "gtin": parsed.get("gtin") or parsed.get("product_identifier"),
                "batch_number": parsed.get("batch_number"),
                "expiry_date": parsed.get("expiry_date"),
                "serial_number": parsed.get("serial_number"),
            },
            "registered_specimen": {
                "product_name": med.get("product_name"),
                "manufacturer": med.get("manufacturer"),
                "registered_batch": med.get("batch_number"),
                "registered_expiry": med.get("expiry_date"),
                "regulatory_status": med.get("status", "Active"),
            } if med else None,
            "checks": checks_clean,
            "detected_issues": doc.get("issues") or [],
        }

    # -----------------------------------------------------------------------
    # Deterministic Failsafes (Always working even if OpenAI is down)
    # -----------------------------------------------------------------------

    def _deterministic_explanation_fallback(
        self,
        doc: Dict[str, Any],
        evidence: Dict[str, Any],
        req: ExplainVerificationRequest,
    ) -> VerificationExplanation:
        """Deterministic, grounded explanation fallback when OpenAI is offline."""
        status = doc.get("status", "UNKNOWN")
        confidence = doc.get("confidence_score", 0)
        med = doc.get("medicine") or {}
        prod_name = med.get("product_name") or evidence["scanned_parameters"].get("gtin") or "Specimen"
        mfr = med.get("manufacturer") or "Registered Manufacturer"
        issues = doc.get("issues") or []

        passed_checks = [c["name"] for c in evidence.get("checks", []) if c.get("status") == "PASS"]
        failed_checks = [c["name"] for c in evidence.get("checks", []) if c.get("status") in ("FAIL", "WARN")]

        if status == "VERIFIED":
            summary = (
                f"MedVerify authenticated {prod_name} against the authorized manufacturer registry for {mfr}. "
                f"All core security parameters, including product identifier, registered batch, and serial attributes, "
                f"matched official records with {confidence}% confidence."
            )
            next_steps = [
                "Verify that packaging tamper seals are intact before use.",
                "Store medicine according to temperature guidelines on the carton.",
            ]
        elif status == "EXPIRED":
            summary = (
                f"This specimen of {prod_name} has exceeded its official regulatory expiration date. "
                "Expired pharmaceuticals may experience chemical degradation or loss of therapeutic potency."
            )
            next_steps = [
                "Do not ingest or administer expired medicine.",
                "Return the product to your dispensing pharmacy or local medicine disposal center.",
            ]
        elif status == "SUSPICIOUS":
            summary = (
                f"MedVerify detected critical security flags for this product ({confidence}% confidence). "
                f"Discrepancies were identified: {'; '.join(issues) if issues else 'Unrecognized batch or duplicate serial reuse'}."
            )
            next_steps = [
                "Do not administer this medicine.",
                "Quarantine the product packaging for inspection.",
                "File an official quality concern report using MedVerify Report.",
            ]
        elif status == "NOT_FOUND":
            summary = (
                "The scanned product identifier is not recognized in the authorized pharmaceutical registry. "
                "The product cannot be authenticated at this time."
            )
            next_steps = [
                "Ensure the barcode or QR code is clear and undamaged, then try scanning again.",
                "Consult the dispensing pharmacy to verify authentic sourcing.",
            ]
        else:
            summary = (
                f"Verification completed with status: {status} ({confidence}% confidence). "
                "Certain packaging parameters could not be fully cross-referenced against the registry."
            )
            next_steps = [
                "Have a licensed pharmacist inspect the carton and physical seal.",
            ]

        return VerificationExplanation(
            summary=summary,
            what_was_checked=passed_checks + failed_checks or ["Product Identifier", "Batch Code", "Expiry Date"],
            matched_evidence=passed_checks or ["Product format verified"],
            concerns=issues or failed_checks or ["No critical concerns flagged"],
            next_steps=next_steps,
            disclaimer="MedVerify explanations are informational and based strictly on registered manufacturer data.",
            style=req.style.value,
            language=req.language,
            model_used="deterministic-rules-engine",
            verification_id=req.verification_id,
            status=status,
            confidence_score=confidence,
        )

    def _deterministic_chat_fallback(
        self,
        req: AskMedVerifyRequest,
        context: Optional[Dict[str, Any]],
        conv_id: str,
    ) -> AskMedVerifyResponse:
        """Deterministic answer fallback for common MedVerify questions."""
        q_lower = req.question.lower()

        if "should i take" in q_lower or "can i take" in q_lower or "dosage" in q_lower:
            answer = (
                "MedVerify cannot advise whether you should take this medicine or determine dosages. "
                "Please consult your prescribing doctor or a licensed pharmacist immediately for medical guidance."
            )
            facts = ["MedVerify is an identity verification tool, not a clinical prescriber."]
        elif "gtin" in q_lower:
            answer = (
                "A GTIN (Global Trade Item Number) is an internationally recognized 14-digit numeric code "
                "that uniquely identifies a pharmaceutical product, dosage form, and packaging variant worldwide."
            )
            facts = ["GS1 standards define GTIN as Application Identifier (01)."]
        elif "batch" in q_lower:
            answer = (
                "A batch or lot number identifies a specific production run manufactured under uniform conditions. "
                "Regulators use it to track manufacturing dates, expiry dates, and potential product recalls."
            )
            facts = ["Batch numbers are encoded with GS1 Application Identifier (10)."]
        elif context and ("why" in q_lower or "explain" in q_lower or "flag" in q_lower):
            status = context.get("status", "UNKNOWN")
            issues = context.get("detected_issues") or []
            score = context.get("confidence_score", 0)
            answer = (
                f"This medicine received status {status} with {score}% confidence. "
                + (f"Specific security concerns detected: {'; '.join(issues)}." if issues else "All parameters passed official checks.")
            )
            facts = [f"Deterministic verdict: {status}", f"Confidence: {score}%"]
        else:
            answer = (
                "MedVerify verifies pharmaceutical packaging integrity using 6-factor cryptographic and registry cross-referencing. "
                "If you suspect an altered label or unsealed carton, file a report with your dispensing pharmacy."
            )
            facts = ["Authenticity checks cross-reference manufacturer registry databases."]

        return AskMedVerifyResponse(
            answer=answer,
            grounded_facts=facts,
            verification_referenced=context.get("raw_identifier") if context else None,
            safety_notice="MedVerify does not provide personalized medical advice.",
            conversation_id=conv_id,
            model_used="deterministic-rules-engine",
        )

    def _deterministic_ocr_fallback(self, text: str) -> OCRNormalizedCandidate:
        """Regex-based normalization fallback when OpenAI is offline."""
        import re
        lines = [l.strip() for l in text.split("\n") if l.strip()]

        gtin = None
        gtin_match = re.search(r"\b(\d{14})\b", text)
        if gtin_match:
            gtin = gtin_match.group(1)

        batch = None
        batch_match = re.search(r"(?:B\.?No|Batch|Lot)[\s.:#-]*([A-Z0-9-]+)", text, re.I)
        if batch_match:
            batch = batch_match.group(1).strip()

        expiry = None
        exp_match = re.search(r"(?:Exp|Expiry)[\s.:#-]*([0-9]{2}[/-][0-9]{4}|[0-9]{4}[/-][0-9]{2})", text, re.I)
        if exp_match:
            expiry = exp_match.group(1).strip()

        med_name = lines[0] if lines else None

        return OCRNormalizedCandidate(
            medicine_name=med_name,
            gtin=gtin,
            batch_number=batch,
            expiry_date=expiry,
            confidence_notes=["Extracted via rule-based fallback parser."],
        )

    def _deterministic_admin_fallback(
        self,
        req: AdminAIAnalyzeRequest,
        analytics: Dict[str, Any],
    ) -> AdminAIAnalyzeResponse:
        """Deterministic summary of admin metrics when OpenAI is offline."""
        total = analytics.get("total_verifications", 0)
        suspicious = analytics.get("suspicious_rate", "0%")
        breakdown = analytics.get("status_breakdown", {})

        summary = (
            f"Over the selected interval, MedVerify processed {total} verifications. "
            f"Verified: {breakdown.get('VERIFIED', 0)}, Suspicious: {breakdown.get('SUSPICIOUS', 0)}, "
            f"Review: {breakdown.get('REVIEW', 0)}, Expired: {breakdown.get('EXPIRED', 0)}. "
            f"The overall suspicious alert rate is {suspicious}."
        )

        return AdminAIAnalyzeResponse(
            summary=summary,
            key_findings=[
                f"Total volume evaluated: {total}",
                f"Suspicious rate: {suspicious}",
                f"Verified count: {breakdown.get('VERIFIED', 0)}",
            ],
            risk_assessment="Routine operational volume with standard security monitoring.",
            actionable_recommendations=[
                "Review flagged suspicious verifications in the Active Investigations Queue.",
                "Ensure registered manufacturer catalogs are up to date.",
            ],
            metrics_analyzed=analytics,
            model_used="deterministic-analytics-engine",
        )


llm_service = LLMService()
