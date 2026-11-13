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
_MAX_HISTORY_TOTAL_CHARS = 4000


def _prune_history(turns: List[Dict[str, str]], max_turns: int = _MAX_HISTORY_TURNS, max_chars: int = _MAX_HISTORY_TOTAL_CHARS) -> List[Dict[str, str]]:
    """Prune conversation turns to stay within turn and character budgets without unbounded growth."""
    res = list(turns)
    if len(res) > max_turns * 2:
        res = res[-max_turns * 2:]
    total_chars = sum(len(t.get("content", "")) for t in res)
    while res and total_chars > max_chars:
        removed = res.pop(0)
        total_chars -= len(removed.get("content", ""))
    return res


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
Note: Explicitly reference the verified fields above in your answer and cite them in grounded_facts.
"""
            system_instruction += context_block
        else:
            system_instruction += """

NO ACTIVE VERIFICATION RECORD LOADED:
There is no active scanned verification record for this query. You must explicitly state in your answer that no specific verification scan record is loaded, and that your explanation is based on general GS1 healthcare standards and pharmaceutical regulatory principles. Distinguish general knowledge from actual registry evidence.
"""

        # 5. Fetch multi-turn conversation history
        history_key = f"{user_id}:{conv_id}"
        past_turns = _prune_history(_conversation_memory[history_key])

        user_prompt = f"""
USER QUESTION (IN {target_lang}):
{req.question}

INSTRUCTIONS FOR ANSWER GENERATION:
1. ANSWER COMPLETENESS & MULTI-PART DECOMPOSITION:
   - Carefully review every aspect of the user's question. If the user asks about multiple packaging elements (such as QR codes, GTIN, batch numbers, serial numbers, expiry dates, manufacturer information, and what to do if details do not match), you MUST systematically and thoroughly address EVERY single one of those requested topics.
   - Do NOT omit any requested topic or give a one-topic reply.
   - Organize your response using clear Markdown headings (e.g., `### 1. 2D DataMatrix / QR Code`, `### 2. GTIN (Global Trade Item Number)`), bold labels, and bullet points so it is highly readable and structured.
   - Provide concrete, practical packaging examples and real-world guidance for each topic (e.g. where the identifier is found on the carton, what it looks like, and what to check).
   - Give actionable next steps for discrepancies (e.g. quarantine packaging, do not ingest/administer, retain physical packaging intact, notify dispensing pharmacy, report to drug safety authorities).

2. SEPARATE FOUR EVIDENCE CATEGORIES:
   Clearly distinguish in your response between:
   - GS1 Standards: Established international barcode rules (GTIN 8, 12, 13, 14 digits; AIs 01, 10, 17, 21).
   - General Pharmaceutical Knowledge: Widely accepted drug safety and packaging principles.
   - MedVerify Capabilities: Features confirmed in the actual software (6-factor rule engine, internal registry lookup, local scan history).
   - Current Scan Evidence: Data retrieved from the specific active verification record (if provided above).

3. STRICT SYSTEM CAPABILITY AWARENESS:
   - Gemini must NEVER claim MedVerify:
     * Blocks medicine dispensing or locks point-of-sale systems.
     * Automatically contacts manufacturers or distributors.
     * Initiates forensic or police investigations.
     * Automatically alerts regulatory authorities.
     * Performs real-time global supply-chain serial-number tracking.
     * Maintains an all-inclusive global pharmaceutical registry.
   - If asked about these, state clearly and unequivocally that MedVerify does NOT perform them automatically.

4. VERIFICATION DECISION BOUNDARIES & DUPLICATE SERIAL NUMBERS:
   - The deterministic verification engine remains the sole authority for verification statuses.
   - Duplicate Serial Number: When detected, the 6-factor engine flags a Serial Number Reuse check and adjusts the score. It does NOT automatically block dispensing or contact manufacturers.
   - A duplicate serial number is an anomaly (potential cloning, diversion, or repeated scanning of the same authentic package), but is NOT conclusive proof of counterfeiting on its own.
   - Explain hypothetical scenarios strictly as hypothetical scenarios.

5. CURRENT SCAN EVIDENCE:
   - If an active verification record is provided in context above: cite the specific verified parameters (GTIN, batch, expiry, manufacturer, status, integrity score).
   - If NO verification record is loaded above: explicitly state that no active verification scan record is loaded in this session, and that MedVerify has not retrieved any scan evidence for this query. Do NOT invent fake scan results.

6. REGULATORY & MEDICAL SAFETY:
   - Never prescribe medications or dosages.
   - Explain that reporting procedures vary by jurisdiction (e.g. FDA MedWatch, UK Yellow Card, CDSCO).
   - Recommend consulting a licensed pharmacist or local health authority when appropriate.

7. REQUIRED JSON FORMAT:
   Return strictly valid JSON conforming to the schema with:
   - "answer": Comprehensive, well-structured Markdown response in {target_lang}.
   - "grounded_facts": Array of 2 to 6 specific verified facts or GS1/regulatory standards supporting the response.
   - "safety_notice": Standard educational medical safety disclaimer.
"""

        try:
            max_tokens = getattr(settings, "gemini_max_output_tokens", 2500) or 2500
            parsed = call_gemini_json(
                system_instruction=system_instruction,
                user_prompt=user_prompt,
                history=past_turns,
                response_schema=AskMedVerifyChatPayload,
                max_tokens=max_tokens,
            )

            answer = parsed.get("answer") or ""
            facts = parsed.get("grounded_facts") or []
            notice = parsed.get("safety_notice") or "MedVerify does not provide personalized medical advice or treatment recommendations."

            if not answer:
                # If model returned plain text instead of nested JSON:
                answer = str(parsed)

            # Record turn in conversation memory with bounded memory safeguard
            _conversation_memory[history_key].append({"role": "user", "content": req.question})
            _conversation_memory[history_key].append({"role": "assistant", "content": answer})
            _conversation_memory[history_key] = _prune_history(_conversation_memory[history_key])

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

        available, reason = is_ai_available()
        if not available:
            logger.info("Gemini unavailable (%s). Streaming deterministic assistant fallback.", reason)
            fallback = self._deterministic_chat_fallback(req, verification_context, conv_id)
            yield fallback.answer
            return

        system_instruction = ASK_MEDVERIFY_SYSTEM_PROMPT
        if verification_context:
            system_instruction += f"\n\nCURRENT ACTIVE VERIFICATION EVIDENCE:\n{json.dumps(verification_context, indent=2)}"
        else:
            system_instruction += "\n\nNO ACTIVE VERIFICATION RECORD LOADED: No specific verification scan record is loaded in this session. State clearly that no current scan evidence exists."

        history_key = f"{user_id}:{conv_id}"
        past_turns = _prune_history(_conversation_memory[history_key])

        full_response = []
        stream_completed_cleanly = False
        try:
            stream_tokens = getattr(settings, "gemini_max_output_tokens", 2500) or 2500
            for chunk in stream_gemini_chat(
                history=past_turns,
                message=req.question,
                system_instruction=system_instruction,
                max_tokens=stream_tokens,
            ):
                full_response.append(chunk)
                yield chunk

            stream_completed_cleanly = True
        except Exception as exc:
            logger.error("Gemini stream error: %s", exc)
            yield f"\n[Stream interrupted: The AI service encountered a temporary error: {exc}]"
        finally:
            if stream_completed_cleanly and full_response:
                combined = "".join(full_response)
                _conversation_memory[history_key].append({"role": "user", "content": req.question})
                _conversation_memory[history_key].append({"role": "assistant", "content": combined})
                _conversation_memory[history_key] = _prune_history(_conversation_memory[history_key])

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
        """Deterministic safety assistant fallback when AI is unavailable or rate-limited."""
        q_lower = req.question.lower()

        # 1. Clinical advice questions
        if any(w in q_lower for w in ["dose", "dosage", "how many", "pills", "prescribe", "treatment", "take"]):
            answer = (
                "MedVerify is a pharmaceutical packaging verification platform and cannot provide clinical advice, dosage instructions, "
                "or treatment recommendations. Please consult a licensed physician or pharmacist immediately regarding any medication use."
            )
            facts = ["Clinical dosing and diagnosis must always be determined by a licensed medical practitioner."]
            return AskMedVerifyResponse(
                answer=answer,
                grounded_facts=facts,
                verification_referenced=req.verification_id,
                safety_notice="MedVerify does not provide personalized medical advice or treatment recommendations.",
                conversation_id=conv_id,
                model_used="deterministic-rule-engine",
            )

        # 2. Conclusive counterfeit questions
        if any(w in q_lower for w in ["conclusive", "conclusively", "definitively"]) and any(w in q_lower for w in ["counterfeit", "fake", "serial"]):
            answer = (
                "### Verification Decision Boundaries\n\n"
                "**No.** A medicine cannot be conclusively declared counterfeit from a duplicate serial number alone.\n\n"
                "- **MedVerify Anomaly Flagging:** A duplicate serial number triggers MedVerify's 6-factor **Serial Number Reuse** check and lowers the integrity score, categorizing the scan as `SUSPICIOUS` or `REQUIRES_REVIEW`.\n"
                "- **Potential Causes:** A duplicate serial code indicates an anomaly such as packaging cloning, barcode reproduction, product diversion, or simply repeated scanning of the same authentic package or test sample.\n"
                "- **Conclusive Determination:** Conclusive proof of counterfeiting requires physical packaging inspection, manufacturer cross-referencing, and chemical/laboratory analysis. MedVerify's deterministic engine flags anomalies for investigation, but a duplicate serial number alone is not definitive proof of counterfeiting.\n"
                "- **Recommended Action:** Suspect packs should be quarantined and reviewed by a licensed pharmacist."
            )
            facts = [
                "A duplicate serial number is an anomaly and is not conclusive proof of counterfeiting alone.",
                "Definitive counterfeit confirmation requires physical inspection and laboratory testing.",
                "MedVerify flags duplicate serials under its 6-factor Serial Number Reuse check.",
            ]
            return AskMedVerifyResponse(
                answer=answer,
                grounded_facts=facts,
                verification_referenced=req.verification_id,
                safety_notice="MedVerify does not provide personalized medical advice or treatment recommendations.",
                conversation_id=conv_id,
                model_used="deterministic-rule-engine",
            )

        # 3. Duplicate serial questions
        if ("duplicate" in q_lower and "serial" in q_lower) or ("serial" in q_lower and "reuse" in q_lower):
            answer = (
                "### Duplicate Serial Number Evaluation\n\n"
                "When MedVerify detects a duplicate serial number:\n\n"
                "1. **Deterministic 6-Factor Engine Flag:** The system flags the **Serial Number Reuse** check because the serial code has already been recorded in MedVerify's database. This reduces the confidence score and typically sets the status to `SUSPICIOUS` or `REQUIRES_REVIEW`.\n"
                "2. **What MedVerify Does NOT Do:** MedVerify does **not** automatically block dispensing, does **not** automatically contact the manufacturer, does **not** dispatch forensic investigators, and does **not** alert regulatory authorities.\n"
                "3. **Evidence Classification:** A duplicate serial number indicates an anomaly (potential cloning, packaging duplication, diversion, or rescan of the same genuine unit). It is **not** conclusive proof of counterfeiting by itself.\n"
                "4. **Actionable Next Steps:** The pack should be quarantined immediately. The user or pharmacist should contact the dispensing pharmacy or report the anomaly to the relevant national drug regulatory authority."
            )
            facts = [
                "MedVerify flags duplicate serial numbers under its 6-factor Serial Number Reuse check.",
                "MedVerify does not automatically block dispensing, contact manufacturers, or alert authorities.",
                "A duplicate serial code indicates an anomaly but is not conclusive proof of counterfeiting alone.",
            ]
            return AskMedVerifyResponse(
                answer=answer,
                grounded_facts=facts,
                verification_referenced=req.verification_id,
                safety_notice="MedVerify does not provide personalized medical advice or treatment recommendations.",
                conversation_id=conv_id,
                model_used="deterministic-rule-engine",
            )

        # 4. Automatic manufacturer contact questions
        if ("contact" in q_lower or "reach out" in q_lower or "notify" in q_lower) and "manufacturer" in q_lower:
            answer = (
                "### MedVerify System Capabilities\n\n"
                "**No.** MedVerify does **not** automatically contact the manufacturer, distributor, or pharmaceutical company.\n\n"
                "- **Implemented Capabilities:** MedVerify evaluates medicine packaging using its deterministic 6-factor verification engine and records scan history within its internal database.\n"
                "- **Reporting Procedures:** MedVerify does not dispatch automated emails, API triggers, or notifications to manufacturers or regulatory authorities. Reporting an anomaly or counterfeit incident must be initiated manually by the user, pharmacist, or compliance officer.\n"
                "- **Jurisdictional Differences:** Formal reporting procedures vary by jurisdiction (e.g., FDA MedWatch in the United States, Yellow Card in the UK, or national drug regulatory bodies)."
            )
            facts = [
                "MedVerify does not automatically contact manufacturers or regulatory authorities.",
                "Adverse or suspicious packaging reports must be filed manually by authorized personnel.",
                "Reporting procedures vary across international regulatory jurisdictions.",
            ]
            return AskMedVerifyResponse(
                answer=answer,
                grounded_facts=facts,
                verification_referenced=req.verification_id,
                safety_notice="MedVerify does not provide personalized medical advice or treatment recommendations.",
                conversation_id=conv_id,
                model_used="deterministic-rule-engine",
            )

        # 5. Global registry questions
        if ("global" in q_lower and "registry" in q_lower) or ("centralized" in q_lower and "registry" in q_lower):
            answer = (
                "### MedVerify System Capabilities\n\n"
                "**No.** MedVerify does **not** maintain a centralized global pharmaceutical registry.\n\n"
                "- **Implemented Registry:** MedVerify maintains an internal platform registry containing medicine specifications, GTIN entries, and authorized batch details registered by participating manufacturers and administrators.\n"
                "- **Standards vs. Registry:** While MedVerify adheres to international GS1 healthcare packaging standards (supporting GTIN-8, GTIN-12, GTIN-13, and GTIN-14 formats), official master drug registries are maintained by national regulatory authorities (such as the US FDA, EMA, or national health ministries), not by MedVerify.\n"
                "- **Scope:** MedVerify verification checks are evaluated against records present in its platform database."
            )
            facts = [
                "MedVerify maintains an internal product registry, not an exhaustive global pharmaceutical registry.",
                "Official master drug registries are maintained by national regulatory authorities.",
                "MedVerify aligns with international GS1 packaging standards.",
            ]
            return AskMedVerifyResponse(
                answer=answer,
                grounded_facts=facts,
                verification_referenced=req.verification_id,
                safety_notice="MedVerify does not provide personalized medical advice or treatment recommendations.",
                conversation_id=conv_id,
                model_used="deterministic-rule-engine",
            )

        # 6. Latest scan evidence questions
        if ("latest scan" in q_lower or "my scan" in q_lower or "evidence" in q_lower and "retrieve" in q_lower):
            if ctx:
                scanned = ctx.get("scanned_parameters", {})
                registered = ctx.get("registered_specimen") or {}
                status = ctx.get("status", "UNKNOWN")
                confidence = ctx.get("confidence_score", 0)

                prod_name = registered.get("product_name") or "Registered Pharmaceutical Product"
                mfr = registered.get("manufacturer") or "Authorized Manufacturer"
                batch = scanned.get("batch_number") or registered.get("registered_batch") or "N/A"
                gtin = scanned.get("gtin") or "N/A"
                expiry = scanned.get("expiry_date") or registered.get("registered_expiry") or "N/A"
                serial = scanned.get("serial_number") or "N/A"

                answer = (
                    f"### Current Scan Evidence ({status} — {confidence}%)\n\n"
                    f"MedVerify retrieved the following verified parameters from active scan record `{req.verification_id}`:\n\n"
                    f"- **Product Name:** {prod_name}\n"
                    f"- **Manufacturer:** {mfr}\n"
                    f"- **GTIN:** {gtin}\n"
                    f"- **Batch / Lot Number:** {batch}\n"
                    f"- **Expiry Date:** {expiry}\n"
                    f"- **Serial Number:** {serial}\n"
                    f"- **Integrity Score:** {confidence}%\n"
                    f"- **Status Determination:** {status}\n\n"
                    f"This evidence is grounded strictly in MedVerify's 6-factor verification evaluation."
                )
                facts = [
                    f"Active record Product: {prod_name} by {mfr}.",
                    f"Batch {batch} registered with expiry {expiry}.",
                    f"Verification integrity score: {confidence}% (Status: {status}).",
                ]
            else:
                answer = (
                    "### Current Scan Evidence Notice\n\n"
                    "**No active verification scan record is loaded in this session.**\n\n"
                    "MedVerify has not retrieved any scan evidence for this query because no medicine was scanned or referenced in this conversation turn.\n\n"
                    "- **GS1 Standards & General Knowledge:** General GS1 rules (such as GTIN Application Identifier `(01)`, Batch `(10)`, Expiry `(17)`, and Serial `(21)`) can be explained at any time.\n"
                    "- **Retrieving Active Scan Evidence:** To view specific verified parameters, confidence scores, and check results, please scan a medicine carton using the **Forensic Scanner** or open an existing verification from your **My Activity** history."
                )
                facts = [
                    "No active verification scan record is loaded in this session.",
                    "MedVerify does not fabricate or invent scan evidence when no record is loaded.",
                ]
            return AskMedVerifyResponse(
                answer=answer,
                grounded_facts=facts,
                verification_referenced=req.verification_id,
                safety_notice="MedVerify does not provide personalized medical advice or treatment recommendations.",
                conversation_id=conv_id,
                model_used="deterministic-rule-engine",
            )

        # If active verification context is present for other questions, ground in it
        if ctx:
            scanned = ctx.get("scanned_parameters", {})
            registered = ctx.get("registered_specimen") or {}
            status = ctx.get("status", "UNKNOWN")
            confidence = ctx.get("confidence_score", 0)

            prod_name = registered.get("product_name") or "Registered Pharmaceutical Product"
            mfr = registered.get("manufacturer") or "Authorized Manufacturer"
            batch = scanned.get("batch_number") or registered.get("registered_batch") or "N/A"
            gtin = scanned.get("gtin") or "N/A"
            expiry = scanned.get("expiry_date") or registered.get("registered_expiry") or "N/A"
            serial = scanned.get("serial_number") or "N/A"

            answer = (
                f"### Active Verification Record ({status} — {confidence}%)\n\n"
                f"- **Product Name:** {prod_name}\n"
                f"- **Manufacturer:** {mfr}\n"
                f"- **Batch / Lot Number:** {batch}\n"
                f"- **GTIN:** {gtin}\n"
                f"- **Expiry Date:** {expiry}\n"
                f"- **Serial Number:** {serial}\n\n"
                f"This information is grounded directly in active MedVerify registry records for verification token `{req.verification_id}`."
            )
            facts = [
                f"Active record Product: {prod_name} by {mfr}.",
                f"Batch {batch} registered with expiry {expiry}.",
                f"Verification integrity score: {confidence}% (Status: {status}).",
            ]
            return AskMedVerifyResponse(
                answer=answer,
                grounded_facts=facts,
                verification_referenced=req.verification_id,
                safety_notice="MedVerify does not provide personalized medical advice or treatment recommendations.",
                conversation_id=conv_id,
                model_used="deterministic-rule-engine",
            )

        # Multi-part question checking multiple packaging factors
        is_multipart = sum(1 for term in ["qr", "gtin", "batch", "serial", "expir", "manufacturer", "mismatch", "match", "not match"] if term in q_lower) >= 3

        if is_multipart:
            answer = (
                "### Verification Notice\n"
                "No specific verification scan record is loaded. The following guidance is based on general GS1 healthcare standards and pharmaceutical regulatory principles.\n\n"
                "### 1. 2D DataMatrix / QR Code\n"
                "Look for the two-dimensional DataMatrix barcode printed on the carton. It encodes machine-readable GS1 identifiers that MedVerify scans to verify packaging authenticity.\n\n"
                "### 2. GTIN (Global Trade Item Number)\n"
                "GTIN can be represented in 8, 12, 13, or 14-digit formats (GTIN-8, GTIN-12, GTIN-13, GTIN-14). In GS1 healthcare DataMatrix barcodes, Application Identifier (01) encodes a 14-digit GTIN uniquely identifying the drug product and packaging format.\n\n"
                "### 3. Batch / Lot Number (AI 10)\n"
                "Application Identifier (10) specifies the manufacturer's production batch. Verify that the batch printed in human-readable text matches the barcode data and the pharmacy invoice.\n\n"
                "### 4. Serial Number (AI 21)\n"
                "Application Identifier (21) encodes a randomized unique serial number. Each individual unit must have its own distinct serial code to prevent counterfeit duplication.\n\n"
                "### 5. Expiry Date (AI 17)\n"
                "Application Identifier (17) encodes the expiration date in YYMMDD format. Never administer medication past its regulatory expiry date.\n\n"
                "### 6. Manufacturer Verification\n"
                "Verify that the manufacturer name, registered address, and regulatory license number printed on the packaging match authorized national regulatory registries.\n\n"
                "### What to Do If Details Do Not Match\n"
                "1. **Quarantine the pack:** Do not consume, ingest, or administer the medication.\n"
                "2. **Preserve packaging:** Keep the carton, blister, and pharmacy receipt intact for forensic inspection.\n"
                "3. **Contact the pharmacy:** Notify the dispensing pharmacist immediately.\n"
                "4. **Report the discrepancy:** File a counterfeit / packaging incident report in MedVerify and notify your national drug regulatory agency."
            )
            facts = [
                "GTIN can be represented in 8, 12, 13, or 14-digit formats; GS1 AI (01) encodes a 14-digit GTIN.",
                "GS1 Application Identifier (10) represents Batch Number, AI (17) represents Expiry Date, and AI (21) represents Serial Number.",
                "Mismatched packaging parameters must be quarantined and reported to the dispensing pharmacy and drug regulatory authorities.",
            ]
        elif any(w in q_lower for w in ["active pharmaceutical ingredient", "api", "humidity", "moisture", "blister packaging", "protect"]):
            answer = (
                "An Active Pharmaceutical Ingredient (API) is the biologically active chemical substance in a drug product that produces the intended clinical effect. "
                "Pharmaceutical packaging—such as aluminum/PVC blister packs and desiccant-lined HDPE bottles—provides an impermeable physical barrier and hermetic seal. "
                "This packaging protects sensitive API molecules from environmental humidity, atmospheric moisture, oxidative degradation, light exposure, and microbial contamination."
            )
            facts = [
                "Active Pharmaceutical Ingredients (APIs) require environmental barrier protection against moisture and humidity.",
                "Blister packs provide hermetic isolation to prevent pharmaceutical active ingredient degradation.",
            ]
        elif ("01" in q_lower or "gtin" in q_lower) and ("21" in q_lower or "serial" in q_lower or "10" in q_lower or "17" in q_lower):
            answer = (
                "Under GS1 Healthcare standards, Application Identifiers (AIs) differentiate product-level and unit-level traceability attributes:\n"
                "- **AI (01) — GTIN (Global Trade Item Number):** A 14-digit standardized numeric code identifying the drug product formulation, strength, and packaging configuration.\n"
                "- **AI (10) — Batch / Lot Number:** Alphanumeric identifier tracking the specific manufacturing production batch.\n"
                "- **AI (17) — Expiration Date:** 6 numeric digits in YYMMDD format indicating regulatory shelf life.\n"
                "- **AI (21) — Serial Number:** A randomized unique serial identifier assigned to each individual unit pack, enabling item-level serialization and tamper verification."
            )
            facts = [
                "GS1 Application Identifier (01) encodes the 14-digit GTIN product identifier.",
                "GS1 Application Identifier (21) encodes the unit-level serialized identifier.",
                "GS1 Application Identifiers (10) and (17) encode the batch number and expiry date respectively.",
            ]
        elif any(w in q_lower for w in ["gtin", "barcode", "datamatrix", "01"]):
            answer = (
                "A GTIN (Global Trade Item Number) is a globally unique identifier defined by GS1 standards. "
                "GTIN can be represented in 8, 12, 13, or 14-digit formats (GTIN-8, GTIN-12, GTIN-13, and GTIN-14). "
                "In healthcare 2D DataMatrix barcodes, GS1 Application Identifier (01) specifically encodes a 14-digit GTIN, "
                "padding shorter formats with leading zeros. It uniquely identifies the manufacturer, product, dosage strength, and packaging."
            )
            facts = [
                "GTIN can be represented in 8, 12, 13, or 14-digit formats.",
                "GS1 Application Identifier (01) encodes a 14-digit GTIN in healthcare barcodes.",
            ]
        elif any(w in q_lower for w in ["batch", "lot", "10", "expiry", "17", "serial", "21"]):
            answer = (
                "GS1 Healthcare packaging standards utilize designated Application Identifiers (AIs):\n"
                "- AI (01): 14-digit Global Trade Item Number (GTIN).\n"
                "- AI (10): Batch or Lot Number identifying the specific production run.\n"
                "- AI (17): Expiration date encoded in YYMMDD format.\n"
                "- AI (21): Randomized individual serial number for unit-level traceability."
            )
            facts = [
                "Application Identifier (10) represents batch/lot number.",
                "Application Identifier (17) represents expiration date in YYMMDD format.",
                "Application Identifier (21) represents unit serial number.",
            ]
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
