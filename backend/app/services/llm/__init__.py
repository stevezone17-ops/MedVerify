"""MedVerify Real LLM Intelligence Layer.

Provides grounded explanation, interaction, OCR normalization,
and admin analytics services backed by the official OpenAI API.
"""

from app.services.llm.service import llm_service
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
)

__all__ = [
    "llm_service",
    "ExplainVerificationRequest",
    "VerificationExplanation",
    "AskMedVerifyRequest",
    "AskMedVerifyResponse",
    "OCRNormalizeRequest",
    "OCRNormalizedCandidate",
    "AdminAIAnalyzeRequest",
    "AdminAIAnalyzeResponse",
    "AIHealthResponse",
]
