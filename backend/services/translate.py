"""검색어 한국어 → 영어 번역 (Moment-DETR/CLIP은 영어 검색어가 필요합니다).

로컬 모델(Helsinki-NLP/opus-mt-ko-en)을 쓰므로 API 키가 필요 없습니다.
처음 한 번은 모델(약 300MB)을 내려받습니다. 실패하면 원문을 그대로 돌려줍니다.
"""
import logging
import os
import re
from functools import lru_cache

logger = logging.getLogger("uvicorn.error")

MODEL_NAME = os.getenv("TRANSLATE_MODEL", "Helsinki-NLP/opus-mt-ko-en")
HANGUL_RE = re.compile(r"[가-힣ㄱ-ㅎㅏ-ㅣ]")


@lru_cache(maxsize=1)
def _load():
    import torch
    from transformers import MarianMTModel, MarianTokenizer

    tokenizer = MarianTokenizer.from_pretrained(MODEL_NAME)
    model = MarianMTModel.from_pretrained(MODEL_NAME)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device).eval()
    return tokenizer, model, device


@lru_cache(maxsize=256)
def to_english(query: str) -> str:
    q = query.strip()
    if not q or not HANGUL_RE.search(q):
        return q  # 이미 영어(한글 없음)면 그대로

    try:
        import torch

        tokenizer, model, device = _load()
        batch = tokenizer(
            [q], return_tensors="pt", padding=True, truncation=True, max_length=128
        ).to(device)
        with torch.no_grad():
            out = model.generate(**batch, max_length=64, num_beams=4)
        text = tokenizer.decode(out[0], skip_special_tokens=True).strip()
        return text or q
    except Exception as e:
        logger.warning("검색어 번역 실패, 원문을 사용합니다: %s", e)
        return q