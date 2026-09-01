# library_ai_v4_1.py
import os
import json
import pandas as pd
import numpy as np
from predict_priority3 import Priority3Predictor

class LibraryAIIntegrationEngineV4:
    def __init__(self, profile_json_path=None):
        print("=========================================================")
        print("🚀 [Library AI v4.1] 고양시 도서관 다이내믹 맞춤형 수매 엔진")
        print("=========================================================\n")
        
        # 3순위 AI Engine 로드
        try:
            self.p3_engine = Priority3Predictor()
        except Exception as e:
            print(f"❌ 3순위 AI 엔진 로딩 실패: {e}")
            self.p3_engine = None

        # 📊 전국 표준 Baseline
        self.national_holding_ratio = {0: 4.5, 1: 5.0, 2: 3.0, 3: 16.9, 4: 6.5, 5: 7.5, 6: 7.1, 7: 3.8, 8: 37.8, 9: 7.75}
        self.national_loan_ratio = {0: 2.4, 1: 4.6, 2: 1.8, 3: 11.7, 4: 9.5, 5: 6.4, 6: 2.4, 7: 3.3, 8: 50.5, 9: 7.6}

        # 🏛️ 도서관별 통계 프로필 JSON 로드
        current_dir = os.path.dirname(os.path.abspath(__file__))
        json_path = profile_json_path or os.path.join(current_dir, "library_profiles.json")
        
        self.library_profiles = {}
        if os.path.exists(json_path):
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    self.library_profiles = json.load(f)
                print(f"✅ 총 {len(self.library_profiles)}개 도서관 프로필 준비 완료!")
            except Exception as e:
                print(f"⚠️ 프로필 로딩 실패: {e}")

    def calculate_priority_scores(self, wish_books_df, target_library_name="화정도서관"):
        results = []

        # Target 도서관 프로필 가져오기 (없으면 전국 기본값 사용)
        lib_data = self.library_profiles.get(target_library_name, {})
        local_holding = {int(k): v for k, v in lib_data.get("holding_ratio", {}).items()} or self.national_holding_ratio
        local_loan = {int(k): v for k, v in lib_data.get("loan_ratio", {}).items()} or self.national_loan_ratio

        for idx, row in wish_books_df.iterrows():
            title = str(row.get('도서명', '미상'))
            author = str(row.get('저자', '미상'))
            pub = str(row.get('출판사', '미상'))
            kdc_code = row.get('KDC', 800.0)
            
            try:
                kdc_main = int(float(kdc_code) // 100) if float(kdc_code) >= 10 else int(kdc_code)
            except Exception:
                kdc_main = 8

            # 🥇 1순위: 장르 보정 점수 (40점 하한선 보정)
            nat_hold = self.national_holding_ratio.get(kdc_main, 10.0)
            loc_hold = local_holding.get(kdc_main, 10.0)
            raw_p1 = round(50.0 * (nat_hold / max(0.1, loc_hold)), 1)
            score_p1 = min(100.0, max(40.0, raw_p1))

            # 🥈 2순위: 지역 특화 점수 (40점 하한선 보정)
            loc_loan_val = local_loan.get(kdc_main, 5.0)
            nat_loan_val = self.national_loan_ratio.get(kdc_main, 5.0)
            raw_p2 = round(50.0 * (loc_loan_val / max(0.1, nat_loan_val)), 1)
            score_p2 = min(100.0, max(40.0, raw_p2))

            # 🥉 3순위: AI 체급 점수
            if self.p3_engine:
                try:
                    p3_res = self.p3_engine.predict(title, author, pub, kdc_code)
                    raw_p3 = p3_res.get('3순위_체급점수', 50.0)
                    comment = p3_res.get('분석소평', '분석 완료')
                except Exception as e:
                    raw_p3 = 50.0
                    comment = f"추론 보정: {e}"
            else:
                raw_p3 = 50.0
                comment = "AI 엔진 미작동"

            score_p3 = min(100.0, max(40.0, float(raw_p3)))

            # 🏆 최종 종합 점수 (반영 비율 4:3:3)
            total_score = round((score_p1 * 0.4) + (score_p2 * 0.3) + (score_p3 * 0.3), 1)

            results.append({
                '도서명': title,
                '저자': author,
                '출판사': pub,
                '장르(KDC)': f"{kdc_main}00번대",
                '적용도서관': target_library_name,
                '1순위_장르보정점수': score_p1,
                '2순위_지역특화점수': score_p2,
                '3순위_AI체급점수': score_p3,
                '🔥최종종합점수': total_score,
                'AI분석소평': comment
            })

        result_df = pd.DataFrame(results)
        return result_df.sort_values(by='🔥최종종합점수', ascending=False).reset_index(drop=True)