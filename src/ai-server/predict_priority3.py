import os
import re
import pickle
import pandas as pd
import numpy as np

class Priority3Predictor:
    def __init__(self, model_filename="xgboost_kdc_model.pkl", lookup_filename="power_lookup_tables.pkl"):
        """저장된 머신러닝 모델(.pkl)과 룩업 테이블(.pkl)만을 불러와 추론 준비를 마칩니다."""
        base_dir = os.path.dirname(os.path.abspath(__file__))
        
        self.model_path = os.path.join(base_dir, model_filename)
        self.lookup_path = os.path.join(base_dir, lookup_filename)

        if not os.path.exists(self.model_path) or not os.path.exists(self.lookup_path):
            raise FileNotFoundError(
                f"❌ 필요한 모델 파일(.pkl)을 찾을 수 없습니다.\n"
                f"- 모델 경로: {self.model_path}\n"
                f"- 룩업 경로: {self.lookup_path}"
            )

        print("🔄 [3순위 AI Engine] 추론 모델 및 룩업 테이블 메모리 로딩 중...")
        
        # 모델 파일(.pkl) 로드
        with open(self.model_path, "rb") as f:
            self.model = pickle.load(f)

        # 룩업 테이블 파일(.pkl) 로드
        with open(self.lookup_path, "rb") as f:
            lookup_tables = pickle.load(f)
            self.author_kdc = lookup_tables['author_kdc']
            self.pub_kdc = lookup_tables['pub_kdc']
            self.author_global = lookup_tables['author_global']
            self.pub_global = lookup_tables['pub_global']
            self.feature_columns = lookup_tables['feature_columns']
            
        print("✅ 로딩 완료! 실시간 추론 준비가 끝났습니다.\n")

    def clean_author_name(self, author_str):
        """저자명 접두사 및 특수문자 정제"""
        if pd.isna(author_str) or not author_str:
            return '미상'
        text = str(author_str)
        text = re.sub(r'(지은이|글|원작|저자|옮긴이|그림)\s*[:;]\s*', '', text)
        author_first = text.split(';')[0].split(',')[0].strip()
        return author_first if author_first else '미상'

    def predict(self, title, author, publisher, kdc_code):
        """
        도서 정보(제목, 저자, 출판사, KDC)를 입력받아 `.pkl` 기반 예측 대출건수 및 점수를 반환합니다.
        """
        clean_author = self.clean_author_name(author)
        clean_pub = str(publisher).strip() if publisher else '미상'
        
        # KDC 대분류 추출 (0~9)
        try:
            kdc_str = str(kdc_code).strip()
            kdc_prefix = kdc_str.split('.')[0]
            if len(kdc_prefix) >= 3:
                kdc_main = int(kdc_prefix[0])
            else:
                kdc_main = int(str(int(float(kdc_prefix)))[0])
        except Exception:
            kdc_main = 8 # 기본값 문학(8)

        # -----------------------------------------------------------
        # 1. 룩업 테이블(.pkl) 매칭을 통한 파워 지표 추출
        # -----------------------------------------------------------
        a_kdc_match = self.author_kdc[(self.author_kdc['정제저자'] == clean_author) & (self.author_kdc['KDC_대분류'] == kdc_main)]
        a_kdc_mean = a_kdc_match['저자_장르별_평균대출'].values[0] if not a_kdc_match.empty else 0
        a_kdc_cnt = a_kdc_match['저자_장르별_권수'].values[0] if not a_kdc_match.empty else 0

        p_kdc_match = self.pub_kdc[(self.pub_kdc['출판사'] == clean_pub) & (self.pub_kdc['KDC_대분류'] == kdc_main)]
        p_kdc_mean = p_kdc_match['출판사_장르별_평균대출'].values[0] if not p_kdc_match.empty else 0
        p_kdc_cnt = p_kdc_match['출판사_장르별_권수'].values[0] if not p_kdc_match.empty else 0

        a_glob_match = self.author_global[self.author_global['정제저자'] == clean_author]
        a_glob_mean = a_glob_match['저자_전체_평균대출'].values[0] if not a_glob_match.empty else 0

        p_glob_match = self.pub_global[self.pub_global['출판사'] == clean_pub]
        p_glob_mean = p_glob_match['출판사_전체_평균대출'].values[0] if not p_glob_match.empty else 0

        # -----------------------------------------------------------
        # 2. 모델 입력 피처 구성
        # -----------------------------------------------------------
        input_data = {col: 0 for col in self.feature_columns}
        
        kdc_col = f'KDC_대분류_{kdc_main}'
        if kdc_col in input_data:
            input_data[kdc_col] = 1

        input_data['저자_장르별_평균대출_log'] = np.log1p(a_kdc_mean)
        input_data['저자_장르별_권수'] = a_kdc_cnt
        input_data['출판사_장르별_평균대출_log'] = np.log1p(p_kdc_mean)
        input_data['출판사_장르별_권수'] = p_kdc_cnt
        input_data['저자_전체_평균대출_log'] = np.log1p(a_glob_mean)
        input_data['출판사_전체_평균대출_log'] = np.log1p(p_glob_mean)

        X_input = pd.DataFrame([input_data])[self.feature_columns]

        # -----------------------------------------------------------
        # 3. XGBoost 모델 추론 실행 (.pkl 모델 활용)
        # -----------------------------------------------------------
        pred_log = self.model.predict(X_input)[0]
        predicted_loans = int(np.expm1(pred_log))
        priority3_score = round(min(100.0, (pred_log / 11.5) * 100), 1)

        return {
            "도서명": title,
            "정제저자": clean_author,
            "출판사": clean_pub,
            "KDC대분류": f"{kdc_main}00번대",
            "예측전국대출건수": f"{predicted_loans:,}건",
            "3순위_체급점수": priority3_score,
            "분석소평": self._generate_comment(clean_author, clean_pub, a_kdc_mean, p_kdc_mean)
        }

    def _generate_comment(self, author, pub, a_power, p_power):
        comments = []
        if a_power > 10000:
            comments.append(f"전국구 베스트셀러 작가({author})의 신작입니다.")
        elif a_power > 0:
            comments.append(f"대출 실적이 있는 저자({author})입니다.")
        else:
            comments.append(f"기록에 없는 신진/미상 저자({author})입니다.")

        if p_power > 10000:
            comments.append(f"대표 출판사({pub})의 수매 신뢰도가 높습니다.")
        elif p_power > 0:
            comments.append(f"출판 이력이 있는 출판사({pub})입니다.")
            
        return " ".join(comments)


if __name__ == "__main__":
    # 외부 모듈(메인 엔진 또는 API 서버)에서 임포트하여 사용할 수 있는 순수 추론 모듈입니다.
    print("🎯 [Priority3Predictor] 모듈이 정상적으로 로드되었습니다. 다른 스크립트에서 import하여 사용하세요.")