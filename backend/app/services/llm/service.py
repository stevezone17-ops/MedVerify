"""MedVerify LLM Service powered by Google Gemini.

Orchestrates:
1. Explain My Result (grounded, multilingual, simple/technical)
2. Ask MedVerify assistant (open-ended conversational AI, multi-turn memory, strict medical safety)
3. Packaging OCR AI Normalization
4. Admin AI Verification Analyst (aggregated analytics only)
5. Streaming Conversational Generator
6. Rate limiting & Failsafe deterministic fallback
"""

import json
import logging
import time
import uuid
from collections import defaultdict
from typing import Optional, Dict, Any, List, Generator

from app.config import settings
from app.db.repositories import verifications_repo
from app.services.llm.client import (
    call_gemini_json,
    call_gemini_chat,
    stream_gemini_chat,
    is_ai_available,
    resolve_active_model,
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
    VerificationExplanationPayload,
    AskMedVerifyRequest,
    AskMedVerifyResponse,
    AskMedVerifyChatPayload,
    OCRNormalizeRequest,
    OCRNormalizedCandidate,
    AdminAIAnalyzeRequest,
    AdminAIAnalyzeResponse,
    AdminAIAnalyzePayload,
    AIHealthResponse,
    ExplanationStyle,
    LANGUAGE_NAMES,
)

logger = logging.getLogger("medverify.gemini.service")


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
_MAX_HISTORY_TURNS = 6


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
        limit = getattr(settings, "gemini_rate_limit_per_minute", 15) or 15
        if not rate_limiter.check_and_record(f"user_explain:{user_id}", max_requests=limit):
            raise RuntimeError("Rate limit exceeded: Too many AI requests. Please wait a moment.")

        # 2. Fetch authoritative verification record
        doc = verifications_repo.get_by_id(req.verification_id)
        if not doc:
            raise ValueError(f"Verification record '{req.verification_id}' not found.")

        # 3. Extract evidence payload (never includes personal user records)
        evidence = self._extract_grounded_evidence(doc)
        target_lang = LANGUAGE_NAMES.get(req.language, "English")

        # 4. Check AI availability
        available, reason = is_ai_available()
        if not available:
            logger.info("Gemini unavailable (%s). Using deterministic explanation fallback.", reason)
            return self._deterministic_explanation_fallback(doc, evidence, req)

        # 5. Build prompt
        user_prompt = f"""
VERIFIED EVIDENCE RECORD (AUTHENTICITY STATUS IS DECIDED EXCLUSIVELY BY MEDVERIFY'S FORENSIC ENGINE):
{json.dumps(evidence, indent=2)}

REQUEST PARAMETERS:
- Tone Style: {req.style.value.upper()} (simple = consumer-friendly, technical = forensic & regulatory details)
- Target Language: {target_lang} ({req.language})

TASK:
Produce a structured JSON explanation adhering strictly to the provided evidence.
You must NOT determine or alter the verification status. Explain the verified findings clearly.
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

        try:
            parsed = call_gemini_json(
                system_instruction=EXPLAIN_VERIFICATION_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                response_schema=VerificationExplanationPayload,
                max_tokens=1000,
            )
            active_model = resolve_active_model()
            return VerificationExplanation(
                summary=parsed.get("summary", ""),
                what_was_checked=parsed.get("what_was_checked", []),
                matched_evidence=parsed.get("matched_evidence", []),
                concerns=parsed.get("concerns", []),
                next_steps=parsed.get("next_steps", []),
                disclaimer=parsed.get("disclaimer", "MedVerify explanations are informational and based strictly on manufacturer registry data."),
                style=req.style.value,
                language=req.language,
                model_used=active_model,
                verification_id=req.verification_id,
                status=doc.get("status", "UNKNOWN"),
                confidence_score=doc.get("confidence_score", 0),
            )
        except Exception as exc:
            logger.warning("Gemini explanation call failed: %s. Falling back to deterministic output.", exc)
            return self._deterministic_explanation_fallback(doc, evidence, req)

    # -----------------------------------------------------------------------
    # 2. Ask MedVerify (Open-Ended Multi-Turn Conversational Assistant)
    # -----------------------------------------------------------------------

    def ask_medverify(
        self,
        req: AskMedVerifyRequest,
        user_id: str = "anonymous",
    ) -> AskMedVerifyResponse:
        """Answer natural language user questions with multi-turn memory and strict safety."""
        # 1. Rate limit
        limit = getattr(settings, "gemini_rate_limit_per_minute", 15) or 15
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
            logger.info("Gemini unavailable (%s). Using deterministic assistant fallback.", reason)
            return self._deterministic_chat_fallback(req, verification_context, conv_id)

        # 4. Assemble system prompt with contextual evidence
        system_instruction = ASK_MEDVERIFY_SYSTEM_PROMPT
        if verification_context:
            context_block = f"""

CURRENT ACTIVE VERIFICATION EVIDENCE (USER IS INQUIRING ABOUT THIS SPECIFIC PRODUCT):
{json.dumps(verification_context, indent=2)}
"""
            system_instruction += context_block

        # 5. Fetch multi-turn conversation history
        history_key = f"{user_id}:{conv_id}"
        past_turns = _conversation_memory[history_key]

        user_prompt = f"""
USER QUESTION (IN {target_lang}):
{req.question}

INSTRUCTIONS:
1. Provide a comprehensive, helpful, natural language answer in {target_lang}.
2. Adhere completely to the medical safety boundary: do NOT give dosage, prescription, or personalized clinical treatment advice.
3. List 1-3 verified facts or standards referenced in your reasoning under 'grounded_facts'.
4. Return strictly valid JSON with keys:
{{
  "answer": "Grounded natural language answer in {target_lang}",
  "grounded_facts": ["Fact 1", "Fact 2"],
  "safety_notice": "MedVerify does not provide personalized medical advice or treatment recommendations."
}}
"""

        try:
            parsed = call_gemini_json(
                system_instruction=system_instruction,
                user_prompt=user_prompt,
                response_schema=AskMedVerifyChatPayload,
                max_tokens=1000,
            )

            answer = parsed.get("answer") or ""
            facts = parsed.get("grounded_facts") or []
            notice = parsed.get("safety_notice") or "MedVerify does not provide personalized medical advice or treatment recommendations."

            if not answer:
                # If model returned plain text instead of nested JSON:
                answer = str(parsed)

            # Record turn in conversation memory
            _conversation_memory[history_key].append({"role": "user", "content": req.question})
            _conversation_memory[history_key].append({"role": "assistant", "content": answer})
            if len(_conversation_memory[history_key]) > _MAX_HISTORY_TURNS * 2:
                _conversation_memory[history_key] = _conversation_memory[history_key][-_MAX_HISTORY_TURNS * 2:]

            active_model = resolve_active_model()
            return AskMedVerifyResponse(
                answer=answer,
                grounded_facts=facts,
                verification_referenced=req.verification_id,
                safety_notice=notice,
                conversation_id=conv_id,
                model_used=active_model,
            )

        except Exception as exc:
            logger.warning("Gemini chat call failed: %s. Using deterministic fallback.", exc)
            return self._deterministic_chat_fallback(req, verification_context, conv_id)

    def stream_ask_medverify(
        self,
        req: AskMedVerifyRequest,
        user_id: str = "anonymous",
    ) -> Generator[str, None, None]:
        """Stream conversational tokens chunk by chunk using Google Gemini streaming."""
        limit = getattr(settings, "gemini_rate_limit_per_minute", 15) or 15
        if not rate_limiter.check_and_record(f"user_stream:{user_id}", max_requests=limit):
            yield "Rate limit exceeded. Please wait a moment before sending more queries."
            return

        conv_id = req.conversation_id or str(uuid.uuid4())
        verification_context = None
        if req.verification_id:
            doc = verifications_repo.get_by_id(req.verification_id)
            if doc:
                verification_context = self._extract_grounded_evidence(doc)

        system_instruction = ASK_MEDVERIFY_SYSTEM_PROMPT
        if verification_context:
            system_instruction += f"\n\nCURRENT VERIFIED EVIDENCE:\n{json.dumps(verification_context, indent=2)}"

        history_key = f"{user_id}:{conv_id}"
        past_turns = _conversation_memory[history_key]

        full_response = []
        try:
            for chunk in stream_gemini_chat(
                history=past_turns,
                message=req.question,
                system_instruction=system_instruction,
                max_tokens=900,
            ):
                full_response.append(chunk)
                yield chunk

            combined = "".join(full_response)
            _conversation_memory[history_key].append({"role": "user", "content": req.question})
            _conversation_memory[history_key].append({"role": "assistant", "content": combined})
            if len(_conversation_memory[history_key]) > _MAX_HISTORY_TURNS * 2:
                _conversation_memory[history_key] = _conversation_memory[history_key][-_MAX_HISTORY_TURNS * 2:]

        except Exception as exc:
            logger.error("Gemini stream error: %s", exc)
            yield f"\n[MedVerify AI notice: {exc}]"

    # -----------------------------------------------------------------------
    # 3. OCR AI Normalization
    # -----------------------------------------------------------------------

    def normalize_ocr(
        self,
        req: OCRNormalizeRequest,
        user_id: str = "anonymous",
    ) -> OCRNormalizedCandidate:
        """Extract and normalize candidate packaging fields from raw OCR text."""
        limit = getattr(settings, "gemini_rate_limit_per_minute", 15) or 15
        if not rate_limiter.check_and_record(f"user_ocr:{user_id}", max_requests=limit):
            raise RuntimeError("Rate limit exceeded: Please wait before submitting another OCR scan.")

        available, reason = is_ai_available()
        if not available:
            logger.info("Gemini unavailable (%s). Using deterministic OCR regex parsing.", reason)
            return self._deterministic_ocr_fallback(req.raw_text)

        user_prompt = f"""
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
"""

        try:
            parsed = call_gemini_json(
                system_instruction=OCR_NORMALIZATION_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                response_schema=OCRNormalizedCandidate,
                max_tokens=800,
            )
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
            logger.warning("Gemini OCR normalization failed: %s. Using deterministic fallback.", exc)
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
        limit = getattr(settings, "gemini_admin_rate_limit_per_minute", 40) or 40
        if not rate_limiter.check_and_record(f"admin_analyze:{admin_id}", max_requests=limit):
            raise RuntimeError("Admin AI rate limit reached. Please wait a moment.")

        # 1. Fetch authorized aggregated metrics from repositories (NO arbitrary SQL!)
        analytics = verifications_repo.get_admin_analytics()

        # 2. Check AI availability
        available, reason = is_ai_available()
        if not available:
            logger.info("Gemini unavailable (%s). Using deterministic admin summary.", reason)
            return self._deterministic_admin_fallback(req, analytics)

        user_prompt = f"""
AUTHORIZED AGGREGATED METRICS (LAST {req.time_range.upper()}):
{json.dumps(analytics, indent=2)}

ADMIN INQUIRY:
\"{req.query}\"

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

        try:
            parsed = call_gemini_json(
                system_instruction=ADMIN_ANALYST_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                response_schema=AdminAIAnalyzePayload,
                max_tokens=1500,
            )
            active_model = resolve_active_model()
            return AdminAIAnalyzeResponse(
                summary=parsed.get("summary", "Analysis completed over authorized metrics."),
                key_findings=parsed.get("key_findings", []),
                risk_assessment=parsed.get("risk_assessment", "No critical anomalies flagged."),
                actionable_recommendations=parsed.get("actionable_recommendations", []),
                metrics_analyzed=parsed.get("metrics_analyzed", analytics),
                model_used=active_model,
            )
        except Exception as exc:
            logger.warning("Gemini admin analysis call failed: %s. Using deterministic fallback.", exc)
            return self._deterministic_admin_fallback(req, analytics)

    # -----------------------------------------------------------------------
    # 5. AI Health Check
    # -----------------------------------------------------------------------

    def get_health(self) -> AIHealthResponse:
        """Return non-sensitive status of the Gemini LLM layer."""
        available, reason = is_ai_available()
        active_model = resolve_active_model() if available else (getattr(settings, "gemini_model", "gemini-3.5-flash") or "gemini-3.5-flash")
        configured_model = getattr(settings, "gemini_model", "gemini-3.5-flash") or "gemini-3.5-flash"
        return AIHealthResponse(
            available=available,
            provider="google-gemini",
            model=configured_model,
            active_model=active_model,
            reason=reason,
        )

    # -----------------------------------------------------------------------
    # Helper: Extract Grounded Evidence (Stripping all PII)
    # -----------------------------------------------------------------------

    def _extract_grounded_evidence(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Strip raw MongoDB/Supabase internals and PII; extract clean verified evidence."""
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
    # Deterministic Failsafes (Always working even if offline or missing API key)
    # -----------------------------------------------------------------------

    def _deterministic_explanation_fallback(
        self,
        doc: Dict[str, Any],
        evidence: Dict[str, Any],
        req: ExplainVerificationRequest,
    ) -> VerificationExplanation:
        """Deterministic, grounded explanation fallback when AI is unavailable."""
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
                f"{prod_name} by {mfr} successfully matched authorized manufacturer registry records "
                f"with an integrity score of {confidence}%. All GS1 packaging parameters were authenticated."
            )
            next_steps = [
                "Inspect the carton for intact physical tamper-evident seals.",
                "Store according to package temperature requirements.",
                "Administer as prescribed by your licensed physician.",
            ]
        elif status in ("SUSPICIOUS", "FLAGGED"):
            summary = (
                f"Critical forensic discrepancies were detected for {prod_name}. "
                f"The verification engine flagged the item with an integrity score of {confidence}%."
            )
            next_steps = [
                "Do NOT consume or administer this medicine.",
                "Retain the physical packaging intact for regulatory inspection.",
                "Report this package immediately to your pharmacy or regulatory authority.",
            ]
        elif status == "EXPIRED":
            summary = (
                f"{prod_name} is past its regulatory expiration date. "
                "Expired pharmaceutical products may degrade in potency or form harmful chemical breakdown products."
            )
            next_steps = [
                "Do NOT consume expired medication.",
                "Return to an authorized pharmacy take-back program for safe disposal.",
            ]
        else:
            summary = (
                f"Verification completed with status '{status}' ({confidence}%). "
                "Some packaging parameters could not be validated against the active registry."
            )
            next_steps = [
                "Request manual verification from a licensed pharmacist before dispensing.",
                "Check whether the 2D DataMatrix code is legible and undamaged.",
            ]

        return VerificationExplanation(
            summary=summary,
            what_was_checked=passed_checks + failed_checks or ["GTIN Registry Match", "Batch Integrity", "Expiry Status"],
            matched_evidence=passed_checks or ["Authorized Manufacturer Record"],
            concerns=issues or (failed_checks if failed_checks else ["None detected"]),
            next_steps=next_steps,
            disclaimer="MedVerify explanations are informational and based strictly on manufacturer registry data. Consult a physician or pharmacist for clinical advice.",
            style=req.style.value,
            language=req.language,
            model_used="deterministic-rule-engine",
            verification_id=req.verification_id,
            status=status,
            confidence_score=confidence,
        )

    def _deterministic_chat_fallback(
        self,
        req: AskMedVerifyRequest,
        ctx: Optional[Dict[str, Any]],
        conv_id: str,
    ) -> AskMedVerifyResponse:
        """Deterministic safety assistant fallback when AI is unavailable."""
        q_lower = req.question.lower()

        if any(w in q_lower for w in ["dose", "dosage", "how many", "pills", "prescribe", "treatment", "take"]):
            answer = (
                "MedVerify is a packaging verification platform and cannot provide clinical advice, dosage instructions, "
                "or treatment recommendations. Please consult a licensed physician or pharmacist immediately regarding any medication use."
            )
            facts = ["Clinical dosing must always be determined by a licensed medical practitioner."]
        elif any(w in q_lower for w in ["gtin", "barcode", "datamatrix", "01"]):
            answer = (
                "A GTIN (Global Trade Item Number) is a globally unique 14-digit number defined by GS1 standards. "
                "In pharmaceuticals, it identifies the specific manufacturer, drug product, strength, and packaging format."
            )
            facts = ["GS1 Application Identifier (01) defines the 14-digit pharmaceutical GTIN."]
        elif any(w in q_lower for w in ["batch", "lot", "10"]):
            answer = (
                "The batch or lot number (GS1 AI 10) identifies the specific manufacturing production run. "
                "It allows regulatory authorities and manufacturers to trace product safety and manage recalls."
            )
            facts = ["GS1 Application Identifier (10) specifies the manufacturer's production batch."]
        elif any(w in q_lower for w in ["fake", "counterfeit", "suspicious", "tamper", "authentic"]):
            answer = (
                "MedVerify AI cannot determine or declare whether a medicine is authentic or counterfeit. "
                "The MedVerify 6-factor cryptographic verification engine is the sole authority for evaluating packaging integrity. "
                "If you suspect medicine packaging has been tampered with or contains invalid serial codes, do not consume it. "
                "Keep the physical package and consult a licensed pharmacist or notify your dispensing pharmacy and national drug safety agency."
            )
            facts = [
                "The MedVerify verification engine is the sole authority for evaluating product integrity.",
                "Suspicious or tampered pharmaceuticals must never be ingested.",
            ]
        else:
            answer = (
                "MedVerify evaluates medicine security through 6-factor forensic verification, checking GTIN registry records, "
                "batch status, serial uniqueness, and cryptographic checksums. You can ask about verification results or packaging standards."
            )
            facts = ["MedVerify enforces GS1 Healthcare packaging verification standards."]

        return AskMedVerifyResponse(
            answer=answer,
            grounded_facts=facts,
            verification_referenced=req.verification_id,
            safety_notice="MedVerify does not provide personalized medical advice or treatment recommendations.",
            conversation_id=conv_id,
            model_used="deterministic-rule-engine",
        )

    def _deterministic_ocr_fallback(self, raw_text: str) -> OCRNormalizedCandidate:
        """Deterministic regex-based fallback for OCR normalization."""
        import re
        gtin_match = re.search(r"\b(\d{14})\b", raw_text)
        gtin = gtin_match.group(1) if gtin_match else None

        date_match = re.search(r"\b(\d{4}[-/]\d{2}[-/]\d{2})\b", raw_text)
        exp_date = date_match.group(1).replace("/", "-") if date_match else None

        batch_match = re.search(r"(?:LOT|BATCH|B\.NO|BN)[:.\s]*([A-Z0-9_-]+)", raw_text, re.IGNORECASE)
        batch = batch_match.group(1) if batch_match else None

        return OCRNormalizedCandidate(
            medicine_name=None,
            manufacturer=None,
            gtin=gtin,
            batch_number=batch,
            serial_number=None,
            expiry_date=exp_date,
            strength=None,
            dosage_form=None,
            confidence_notes=["Extracted via deterministic fallback regex patterns."],
        )

    def _deterministic_admin_fallback(
        self,
        req: AdminAIAnalyzeRequest,
        analytics: Dict[str, Any],
    ) -> AdminAIAnalyzeResponse:
        """Deterministic admin analysis fallback."""
        total = analytics.get("total_verifications", 0)
        suspicious = analytics.get("suspicious_count", 0)
        return AdminAIAnalyzeResponse(
            summary=f"Analysis computed over {total} recorded verifications. Operational telemetry active.",
            key_findings=[
                f"Total verifications logged: {total}",
                f"Suspicious / anomalous cases: {suspicious}",
                "Forensic verification engine running in active mode.",
            ],
            risk_assessment="Operational indicators within baseline parameters. Monitor duplicate serial queries.",
            actionable_recommendations=[
                "Review flagged anomalies in the Investigations Queue.",
                "Ensure manufacturer registry batches are updated periodically.",
            ],
            metrics_analyzed=analytics,
            model_used="deterministic-rule-engine",
        )


llm_service = LLMService()
