"""Pydantic schemas for the MedVerify LLM Intelligence Layer."""

from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ExplanationStyle(str, Enum):
    SIMPLE = "simple"
    TECHNICAL = "technical"


class SupportedLanguage(str, Enum):
    ENGLISH = "en"
    HINDI = "hi"
    MALAYALAM = "ml"
    TAMIL = "ta"
    KANNADA = "kn"


LANGUAGE_NAMES: Dict[str, str] = {
    "en": "English",
    "hi": "Hindi (हिंदी)",
    "ml": "Malayalam (മലയാളം)",
    "ta": "Tamil (தமிழ்)",
    "kn": "Kannada (ಕನ್ನಡ)",
}


# ---------------------------------------------------------------------------
# Explain My Result Schemas
# ---------------------------------------------------------------------------

class ExplainVerificationRequest(BaseModel):
    verification_id: str = Field(..., description="ID of the verification record to explain")
    style: ExplanationStyle = Field(ExplanationStyle.SIMPLE, description="Explanation tone: simple or technical")
    language: str = Field("en", description="Target language code: en, hi, ml, ta, kn")


class VerificationExplanation(BaseModel):
    summary: str = Field(..., description="Grounded, plain-language explanation of verification outcome")
    what_was_checked: List[str] = Field(default_factory=list, description="Specific parameters evaluated")
    matched_evidence: List[str] = Field(default_factory=list, description="Items matching registry specifications")
    concerns: List[str] = Field(default_factory=list, description="Anomalies, mismatches, or missing parameters")
    next_steps: List[str] = Field(default_factory=list, description="Recommended safe consumer actions")
    disclaimer: str = Field(
        "MedVerify explanations are informational and based strictly on manufacturer registry data. Consult a licensed pharmacist or physician for medical advice.",
        description="Mandatory regulatory disclaimer"
    )
    style: str = "simple"
    language: str = "en"
    model_used: str = "gpt-5.6-luna"
    verification_id: str = ""
    status: str = "UNKNOWN"
    confidence_score: int = 0


# ---------------------------------------------------------------------------
# Ask MedVerify Chat Schemas
# ---------------------------------------------------------------------------

class AskMedVerifyRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=1000, description="User question about verification or medicine security")
    verification_id: Optional[str] = Field(None, description="Optional verification record context")
    conversation_id: Optional[str] = Field(None, description="Conversation session ID for conversational memory")
    language: str = Field("en", description="Preferred response language")


class AskMedVerifyResponse(BaseModel):
    answer: str = Field(..., description="Grounded response adhering to medical safety boundaries")
    grounded_facts: List[str] = Field(default_factory=list, description="Verified facts referenced from registry or MedVerify policy")
    verification_referenced: Optional[str] = None
    safety_notice: str = "MedVerify does not provide personalized medical advice or treatment recommendations."
    conversation_id: str = ""
    model_used: str = "gpt-5.6-luna"


# ---------------------------------------------------------------------------
# OCR Normalization Schemas
# ---------------------------------------------------------------------------

class OCRNormalizeRequest(BaseModel):
    raw_text: str = Field(..., min_length=1, max_length=5000, description="Raw OCR text extracted from medicine packaging")


class OCRNormalizedCandidate(BaseModel):
    medicine_name: Optional[str] = Field(None, description="Normalized commercial trade name or null if missing")
    manufacturer: Optional[str] = Field(None, description="Normalized pharmaceutical manufacturer or null if missing")
    gtin: Optional[str] = Field(None, description="Extracted 14-digit GTIN / barcode or null if missing")
    batch_number: Optional[str] = Field(None, description="Extracted lot/batch number or null if missing")
    serial_number: Optional[str] = Field(None, description="Extracted unique serial number or null if missing")
    expiry_date: Optional[str] = Field(None, description="Normalized ISO date (YYYY-MM-DD) or null if missing")
    strength: Optional[str] = Field(None, description="Active dosage strength (e.g. 500 mg) or null if missing")
    dosage_form: Optional[str] = Field(None, description="Pharmaceutical form (e.g. Capsules, Tablets) or null if missing")
    confidence_notes: List[str] = Field(default_factory=list, description="Reasoning or notes on extraction fidelity")


# ---------------------------------------------------------------------------
# Admin AI Analyst Schemas
# ---------------------------------------------------------------------------

class AdminAIAnalyzeRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=1000, description="Forensic query or summarization prompt")
    time_range: str = Field("24h", description="Time window for aggregation: 24h, 7d, 30d, all")


class AdminAIAnalyzeResponse(BaseModel):
    summary: str = Field(..., description="Executive summary of verification operations and findings")
    key_findings: List[str] = Field(default_factory=list, description="Notable data patterns and forensic signals")
    risk_assessment: str = Field(..., description="Evaluation of counterfeit threat levels and compromised batches")
    actionable_recommendations: List[str] = Field(default_factory=list, description="Specific follow-up steps for admins")
    metrics_analyzed: Dict[str, Any] = Field(default_factory=dict, description="Aggregated metrics fed into the analysis")
    model_used: str = "gpt-5.6-luna"


# ---------------------------------------------------------------------------
# AI Health Schema
# ---------------------------------------------------------------------------

class AIHealthResponse(BaseModel):
    available: bool = Field(..., description="Whether OpenAI LLM integration is active and configured")
    provider: str = Field("openai", description="Active AI provider")
    model: str = Field(..., description="Configured model identifier")
    reason: Optional[str] = Field(None, description="Failure reason if unavailable")
