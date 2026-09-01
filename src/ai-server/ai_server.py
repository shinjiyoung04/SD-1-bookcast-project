from __future__ import annotations

import math
import os
import importlib
from datetime import datetime, timezone
from typing import Optional, Union

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from library_ai_v4_1 import LibraryAIIntegrationEngineV4


pd = importlib.import_module("pandas")


MODEL_VERSION = "library-ai-v4.1-dynamic-library-20260722-v3"
DEFAULT_LIBRARY_NAME = "화정도서관"

app = FastAPI(
    title="BookCast AI Priority Engine - Dynamic Multi Library",
    version=MODEL_VERSION,
)

cors_origins = [
    value.strip()
    for value in os.getenv(
        "AI_CORS_ORIGINS",
        "http://localhost:5173,http://localhost:8080",
    ).split(",")
    if value.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ai_engine = LibraryAIIntegrationEngineV4()


class BookAnalysisRequest(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=255,
    )
    author: str = Field(
        default="저자미상",
        max_length=255,
    )
    publisher: str = Field(
        default="출판사미상",
        max_length=255,
    )
    kdc: Union[
        str,
        float,
        int,
    ] = 300.0
    library_name: Optional[str] = DEFAULT_LIBRARY_NAME


class ApprovalPredictionRequest(
    BookAnalysisRequest
):
    application_id: int = Field(
        gt=0,
    )
    book_id: Optional[int] = Field(
        default=None,
        gt=0,
    )
    vote_count: int = Field(
        default=0,
        ge=0,
    )
    recent_vote_count_7d: int = Field(
        default=0,
        ge=0,
    )


def to_py_float(
    value,
    default=50.0,
):
    try:
        if value is None:
            return float(default)

        if hasattr(
            value,
            "item",
        ):
            value = value.item()

        result = float(value)

        if (
            pd.isna(result)
            or math.isinf(result)
        ):
            return float(default)

        return round(
            result,
            2,
        )
    except Exception:
        return float(default)


def clamp_score(
    value,
    default=50.0,
):
    return round(
        max(
            0.0,
            min(
                100.0,
                to_py_float(
                    value,
                    default=default,
                ),
            ),
        ),
        2,
    )


def normalize_kdc(value):
    try:
        parsed = float(value)

        if (
            pd.isna(parsed)
            or math.isinf(parsed)
            or parsed < 0
        ):
            return 300.0

        return parsed
    except (
        TypeError,
        ValueError,
    ):
        return 300.0


def normalize_library_name(
    value: Optional[str],
) -> str:
    normalized = str(
        value or ""
    ).strip()

    return (
        normalized
        or DEFAULT_LIBRARY_NAME
    )


def run_dynamic_model(
    request: BookAnalysisRequest,
) -> dict:
    kdc_value = normalize_kdc(
        request.kdc
    )

    target_library = (
        normalize_library_name(
            request.library_name
        )
    )

    input_df = pd.DataFrame(
        [
            {
                "도서명": (
                    request.title
                    or "제목없음"
                ),
                "저자": (
                    request.author
                    or "저자미상"
                ),
                "출판사": (
                    request.publisher
                    or "출판사미상"
                ),
                "KDC": kdc_value,
            }
        ]
    )

    result_df = (
        ai_engine
        .calculate_priority_scores(
            input_df,
            target_library_name=target_library,
        )
    )

    if result_df.empty:
        raise RuntimeError(
            "AI 엔진이 분석 결과를 반환하지 않았습니다."
        )

    row = result_df.iloc[0]

    p1 = clamp_score(
        row.get(
            "1순위_장르보정점수"
        )
    )
    p2 = clamp_score(
        row.get(
            "2순위_지역특화점수"
        )
    )
    p3 = clamp_score(
        row.get(
            "3순위_AI체급점수"
        )
    )
    final_score = clamp_score(
        row.get(
            "🔥최종종합점수"
        )
    )

    return {
        "title": str(
            row.get(
                "도서명",
                request.title,
            )
        ),
        "author": str(
            row.get(
                "저자",
                request.author,
            )
        ),
        "publisher": str(
            row.get(
                "출판사",
                request.publisher,
            )
        ),
        "kdc_main": str(
            row.get(
                "장르(KDC)",
                "미분류",
            )
        ),
        "applied_library": str(
            row.get(
                "적용도서관",
                target_library,
            )
        ),
        "p1_genre_balance": p1,
        "p2_local_affinity": p2,
        "p3_ai_capacity": p3,
        "base_priority_score": final_score,
        "ai_comment": str(
            row.get(
                "AI분석소평",
                "",
            )
        ),
    }


def calculate_vote_adjustment(
    vote_count: int,
    recent_vote_count_7d: int,
) -> float:
    raw_adjustment = (
        3.0
        * math.log1p(
            max(
                0,
                vote_count,
            )
        )
        + 2.0
        * math.log1p(
            max(
                0,
                recent_vote_count_7d,
            )
        )
    )

    return round(
        min(
            15.0,
            raw_adjustment,
        ),
        2,
    )


def convert_priority_to_approval_rate(
    final_score: float,
) -> float:
    probability = 100.0 / (
        1.0
        + math.exp(
            -(
                float(final_score)
                - 50.0
            )
            / 10.0
        )
    )

    return round(
        probability,
        2,
    )


@app.get("/")
def read_root():
    return {
        "status": "online",
        "engine": "Library AI v4.1 Dynamic Multi-Library Connected",
        "model_version": MODEL_VERSION,
        "library_profile_count": len(
            ai_engine.library_profiles
        ),
    }


@app.get("/health")
def health_check():
    return {
        "status": "UP",
        "model_loaded": (
            ai_engine.p3_engine
            is not None
        ),
        "model_version": MODEL_VERSION,
        "library_profile_count": len(
            ai_engine.library_profiles
        ),
        "available_libraries": sorted(
            ai_engine.library_profiles.keys()
        ),
        "model_file": "xgboost_kdc_model.pkl",
        "lookup_file": "power_lookup_tables.pkl",
        "profile_file": "library_profiles.json",
    }


@app.post(
    "/api/ai/analyze-priority"
)
def analyze_priority(
    request: BookAnalysisRequest,
):
    try:
        result = run_dynamic_model(
            request
        )

        return {
            "success": True,
            **result,
            "final_score": result[
                "base_priority_score"
            ],
            "model_version": MODEL_VERSION,
            "scores": {
                "p1_genre_balance": result[
                    "p1_genre_balance"
                ],
                "p2_local_affinity": result[
                    "p2_local_affinity"
                ],
                "p3_ai_capacity": result[
                    "p3_ai_capacity"
                ],
                "final_score": result[
                    "base_priority_score"
                ],
            },
        }
    except Exception as exception:
        raise HTTPException(
            status_code=500,
            detail=(
                "다중 도서관 AI 분석 실패: "
                f"{exception}"
            ),
        ) from exception


@app.post(
    "/api/ai/predict-approval"
)
def predict_approval(
    request: ApprovalPredictionRequest,
):
    try:
        result = run_dynamic_model(
            request
        )

        vote_adjustment = (
            calculate_vote_adjustment(
                request.vote_count,
                request.recent_vote_count_7d,
            )
        )

        final_score = clamp_score(
            result[
                "base_priority_score"
            ]
            + vote_adjustment
        )

        approval_probability = (
            convert_priority_to_approval_rate(
                final_score
            )
        )

        return {
            "success": True,
            "application_id": request.application_id,
            "book_id": request.book_id,
            "approval_probability": approval_probability,
            "popularity_score": result[
                "p3_ai_capacity"
            ],
            "vote_adjustment": vote_adjustment,
            "final_score": final_score,
            "base_priority_score": result[
                "base_priority_score"
            ],
            "p1_genre_balance": result[
                "p1_genre_balance"
            ],
            "p2_local_affinity": result[
                "p2_local_affinity"
            ],
            "p3_ai_capacity": result[
                "p3_ai_capacity"
            ],
            "kdc_main": result[
                "kdc_main"
            ],
            "applied_library": result[
                "applied_library"
            ],
            "ai_comment": result[
                "ai_comment"
            ],
            "model_version": MODEL_VERSION,
            "predicted_at": (
                datetime.now(
                    timezone.utc
                ).isoformat()
            ),
            "calibration_type": (
                "PRIORITY_SIGMOID_V1"
            ),
            "probability_notice": (
                "실제 승인·거절 학습 확률이 아니라 "
                "도서관별 수매 우선순위와 시민투표를 "
                "변환한 예상 승인율입니다."
            ),
        }
    except Exception as exception:
        raise HTTPException(
            status_code=500,
            detail=(
                "다중 도서관 AI 예상 승인율 계산 실패: "
                f"{exception}"
            ),
        ) from exception


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "ai_server:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )
