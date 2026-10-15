def temporal_iou(a, b):
    start = max(float(a["start_time"]), float(b["start_time"]))
    end = min(float(a["end_time"]), float(b["end_time"]))

    intersection = max(0.0, end - start)

    duration_a = float(a["end_time"]) - float(a["start_time"])
    duration_b = float(b["end_time"]) - float(b["start_time"])

    union = duration_a + duration_b - intersection

    return intersection / union if union > 0 else 0.0


def rank_by_consensus_v3(visual, ko, en, overlap_threshold=0.5):
    """
    Consensus V3 실험용.

    입력:
        visual: Moment-DETR 후보
        ko: MiniLM 한국어 후보
        en: MiniLM 영어 후보

    출력:
        consensus_score 내림차순 후보 목록

    Ground Truth는 사용하지 않는다.
    """

    groups = {
        "visual": visual[:3],
        "ko": ko[:3],
        "en": en[:3],
    }

    candidates = []

    for source, group in groups.items():
        for rank, candidate in enumerate(group, 1):
            item = dict(candidate)

            item["rank_source"] = source
            item["original_rank"] = rank
            item["rank_score"] = 1.0 / rank

            candidates.append(item)

    for candidate in candidates:
        source = candidate["rank_source"]

        supports = {}

        for other_source, group in groups.items():
            if other_source == source:
                continue

            best_iou = max(
                (
                    temporal_iou(candidate, other)
                    for other in group
                ),
                default=0.0
            )

            supports[other_source] = best_iou

        matching_sources = [
            s for s, overlap in supports.items()
            if overlap >= overlap_threshold
        ]

        bonus = 0.0

        # Visual과 자막 검색이 함께 동의
        if source == "visual":
            if "ko" in matching_sources or "en" in matching_sources:
                bonus += 0.6

            if "ko" in matching_sources and "en" in matching_sources:
                bonus += 0.2

        # 자막 후보에 Visual이 동의
        else:
            if "visual" in matching_sources:
                bonus += 0.6

            # KO와 EN은 같은 MiniLM이므로 가산점 축소
            other_text_source = "en" if source == "ko" else "ko"

            if other_text_source in matching_sources:
                bonus += 0.2

        candidate["support_iou"] = supports
        candidate["support_sources"] = matching_sources
        candidate["agreement_bonus"] = bonus

        candidate["consensus_score"] = (
            candidate["rank_score"] + bonus
        )

    return sorted(
        candidates,
        key=lambda x: x["consensus_score"],
        reverse=True
    )
