"""검색어 한국어 → 영어 번역 (Moment-DETR/CLIP은 영어 검색어가 필요합니다).

로컬 모델(Helsinki-NLP/opus-mt-ko-en)을 쓰므로 API 키가 필요 없습니다.
처음 한 번은 모델(약 300MB)을 내려받습니다. 실패하면 원문을 그대로 돌려줍니다.
"""
import logging
import os
import re
import threading

logger = logging.getLogger("uvicorn.error")

MODEL_NAME = os.getenv("TRANSLATE_MODEL", "Helsinki-NLP/opus-mt-ko-en")
HANGUL_RE = re.compile(r"[가-힣ㄱ-ㅎㅏ-ㅣ]")

# 모델 로딩은 한 번에 하나만 합니다. (서버 시작 직후 워밍업과 첫 검색이 동시에 로딩하면
# "Cannot copy out of meta tensor" 오류가 날 수 있습니다.)
_LOAD_LOCK = threading.Lock()
_model_cache = None
_translations: dict[str, str] = {}  # 성공한 번역만 저장합니다 (실패는 저장하지 않음)


def _load():
    global _model_cache
    with _LOAD_LOCK:
        if _model_cache is None:
            import torch
            from transformers import MarianMTModel, MarianTokenizer

            tokenizer = MarianTokenizer.from_pretrained(MODEL_NAME)
            try:
                model = MarianMTModel.from_pretrained(MODEL_NAME)
                model.to("cpu")  # meta 텐서가 남아 있으면 여기서 바로 오류가 납니다
            except Exception as e:
                logger.warning("번역 모델 기본 로딩 실패, 다른 방식으로 다시 시도합니다: %s", e)
                model = MarianMTModel.from_pretrained(MODEL_NAME, low_cpu_mem_usage=False)
            device = "cuda" if torch.cuda.is_available() else "cpu"
            model.to(device).eval()
            _model_cache = (tokenizer, model, device)
        return _model_cache


def to_english(query: str) -> str:
    q = query.strip()
    if not q or not HANGUL_RE.search(q):
        return q  # 이미 영어(한글 없음)면 그대로
    if q in _translations:
        return _translations[q]

    try:
        import torch

        tokenizer, model, device = _load()
        batch = tokenizer(
            [q], return_tensors="pt", padding=True, truncation=True, max_length=128
        ).to(device)
        with torch.no_grad():
            out = model.generate(**batch, max_length=64, num_beams=4)
        text = tokenizer.decode(out[0], skip_special_tokens=True).strip()
        if text:
            if len(_translations) > 256:
                _translations.clear()
            _translations[q] = text
            return text
        return q
    except Exception as e:
        logger.warning("검색어 번역 실패, 원문을 사용합니다: %s", e)
        return q