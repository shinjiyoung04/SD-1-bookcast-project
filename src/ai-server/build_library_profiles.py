import os
import json
import re
import pandas as pd  # type: ignore[reportMissingImports]

def build_profiles():
    print("🚀 [1/3] 덕양구 전체 도서관 CSV 통계 데이터 요약 및 JSON 생성 중...")
    
    # 스크립트 위치 및 실행 위치 탐색
    current_dir = os.path.dirname(os.path.abspath(__file__)) # ai_bookcast
    parent_dir = os.path.dirname(current_dir)                 # bookcast
    
    csv_files = []
    
    # 💡 한글 인코딩 매칭 에러 방지를 위해 os.walk로 직접 파일 탐색
    search_paths = [parent_dir, current_dir, os.getcwd()]
    for search_base in search_paths:
        for root, dirs, files in os.walk(search_base):
            for file in files:
                # CSV 파일이면서 도서관 관련 파일인지 체크
                if file.lower().endswith(".csv") and ("고양" in file or "도서관" in file or "장서" in file):
                    full_path = os.path.join(root, file)
                    if full_path not in csv_files:
                        csv_files.append(full_path)

    if not csv_files:
        print("❌ CSV 파일을 찾을 수 없습니다. 고양시립*.csv 파일이 존재하는지 확인해 주세요.")
        return

    print(f"📂 총 {len(csv_files)}개의 도서관 CSV 파일을 감지했습니다!")

    def parse_kdc_main(val):
        if pd.isna(val): return None
        match = re.search(r'^\d+(\.\d+)?', str(val).strip())
        if match:
            num = float(match.group())
            return int(num // 100) if num >= 10 else int(num)
        return None

    profiles = {}

    for file_path in csv_files:
        base_name = os.path.basename(file_path)
        # 도서관 이름 추출 (예: 화정도서관, 행신어린이도서관)
        lib_name = base_name.split(" 장서")[0].replace("고양시립", "").strip()
        
        try:
            # EUC-KR 및 UTF-8 자동 대응
            try:
                df = pd.read_csv(file_path, low_memory=False, encoding='utf-8')
            except UnicodeDecodeError:
                df = pd.read_csv(file_path, low_memory=False, encoding='cp949')

            df['KDC_MAIN'] = df['주제분류번호'].apply(parse_kdc_main)
            
            total_holding = float(df['도서권수'].sum())
            total_loan = float(df['대출건수'].sum())
            
            holding_by_kdc = df.groupby('KDC_MAIN')['도서권수'].sum()
            loan_by_kdc = df.groupby('KDC_MAIN')['대출건수'].sum()
            
            holding_ratio = (holding_by_kdc / total_holding * 100).round(2).to_dict()
            loan_ratio = (loan_by_kdc / total_loan * 100).round(2).to_dict()
            
            # KDC 0~9 빈 값 5.0으로 채우기
            holding_clean = {str(i): float(holding_ratio.get(i, 5.0)) for i in range(10)}
            loan_clean = {str(i): float(loan_ratio.get(i, 5.0)) for i in range(10)}
            
            profiles[lib_name] = {
                "holding_ratio": holding_clean,
                "loan_ratio": loan_clean,
                "total_holding": int(total_holding),
                "total_loan": int(total_loan)
            }
            print(f"  ✅ {lib_name} 프로필 추출 완료 (장서 {int(total_holding):,}권 / 대출 {int(total_loan):,}회)")
        except Exception as e:
            print(f"  ❌ {lib_name} 처리 중 에러: {e}")

    # JSON 저장 (ai_bookcast 폴더 내에 저장)
    output_json = os.path.join(current_dir, "library_profiles.json")
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(profiles, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 [성공] '{output_json}' 파일 생성 완료!")
    print(f"   총 {len(profiles)}개 도서관 데이터가 준비되었습니다.\n")

if __name__ == "__main__":
    build_profiles()