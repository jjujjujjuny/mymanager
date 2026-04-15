"""
fetch_learnus.py
================
Playwright로 연세대 SSO 로그인 후 LearnUS를 직접 스크래핑:
  - 동영상: 과목 페이지에서 날짜 범위 파싱
  - 과제:   과제 상세 페이지의 Due date 행 파싱
  - 시험:   과목공지 게시판 텍스트에서 날짜+키워드 파싱

수집 결과를 GAS API로 Google Sheets에 저장.
"""

import os, sys, re, hashlib, getpass
import requests
from datetime import datetime, timezone, timedelta

# ── 설정 ──────────────────────────────────────────────────────────────
BASE_URL  = "https://ys.learnus.org"
GAS_URL   = os.environ.get("GAS_URL",
    "https://script.google.com/macros/s/AKfycbwWJ563ydzFxdtXS2L99AwlixvWrFek7NYhRv6EJWgZdaRBJwhG0HpuAnFwEMSoCZXhEw/exec"
)
KST   = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).date()

# ── 유틸 ──────────────────────────────────────────────────────────────
def priority(due_date):
    if not due_date: return "low"
    d = (due_date - TODAY).days
    return "high" if d <= 2 else "medium" if d <= 7 else "low"

def make_id(course, name, due):
    return "ln_" + hashlib.md5(f"{course}|{name}|{due}".encode()).hexdigest()[:12]

def make_task(course, title, task_type, due_date, notes="", done=False):
    # ID 생성에는 고정값 사용 (due_date=None이어도 날마다 바뀌지 않도록)
    id_due = due_date.isoformat() if due_date else "no-due"
    due_str = due_date.isoformat() if due_date else (TODAY + timedelta(days=7)).isoformat()
    return {
        "id":       "ln_" + hashlib.md5(f"{course}|{title}|{id_due}".encode()).hexdigest()[:12],
        "title":    title,
        "subject":  course,
        "type":     task_type,
        "priority": priority(due_date),
        "due":      due_str,
        "notes":    notes,
        "done":     done,
        "created":  datetime.now(KST).isoformat(),
    }

def parse_date(text):
    """다양한 날짜 형식 파싱 → date 객체"""
    if not text: return None
    text = str(text).strip()

    # YYYY-MM-DD HH:MM:SS 또는 YYYY-MM-DD HH:MM (시간 포함)
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?", text)
    if m:
        try:
            year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
            hour   = int(m.group(4)) if m.group(4) else 12  # 시간 없으면 정오로 간주
            minute = int(m.group(5)) if m.group(5) else 0
            d = datetime(year, month, day)
            # 자정(00:00) 마감은 사실상 전날 끝 → 하루 빼기
            if hour == 0 and minute == 0:
                d -= timedelta(days=1)
            return d.date()
        except: pass

    # MM/DD 또는 M/D
    m = re.search(r"(\d{1,2})/(\d{1,2})", text)
    if m:
        month, day = int(m.group(1)), int(m.group(2))
        year = TODAY.year if (month, day) >= (TODAY.month, TODAY.day) else TODAY.year + 1
        try: return datetime(year, month, day).date()
        except: pass

    # N월 N일 [N시 N분] 형식
    m = re.search(r"(\d{1,2})월\s*(\d{1,2})일(?:\s*.*?(\d{1,2})시(?:\s*(\d{1,2})분)?)?", text)
    if m:
        month, day = int(m.group(1)), int(m.group(2))
        hour   = int(m.group(3)) if m.group(3) else 12
        minute = int(m.group(4)) if m.group(4) else 0
        year = TODAY.year if (month, day) >= (TODAY.month, TODAY.day) else TODAY.year + 1
        try:
            d = datetime(year, month, day)
            if hour == 0 and minute == 0:
                d -= timedelta(days=1)
            return d.date()
        except: pass

    return None

def parse_video_end_date(text):
    """
    '2026-04-07 00:00:00 ~ 2026-04-13 23:59:59 (Late: ...)' 형식에서
    Late 이전의 종료일(2026-04-13)만 추출
    """
    m = re.search(r"~\s*(\d{4}-\d{2}-\d{2})", text)
    if m:
        return parse_date(m.group(1))
    return None

def is_completed(row):
    """활동 행의 완료 체크박스 상태 확인"""
    try:
        # 체크된 이미지 또는 checked 속성
        checked_img = row.locator("img[title*='완료'], img[title*='Completed'], img[alt*='완료']").count()
        if checked_img: return True
        checkbox = row.locator("input[type='checkbox']")
        if checkbox.count():
            return checkbox.first.is_checked()
    except:
        pass
    return False

def find_sel(page, selectors):
    for s in selectors:
        try:
            if page.locator(s).count() > 0: return s
        except: pass
    return None

# ── SSO 로그인 ────────────────────────────────────────────────────────
def login(pw, username, password):
    from playwright.sync_api import TimeoutError as PWTimeout
    browser = pw.chromium.launch(headless=True)
    ctx  = browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
    page = ctx.new_page()

    print("  → learnus.org 접속...")
    page.goto(f"{BASE_URL}/login/index.php", wait_until="networkidle", timeout=20000)

    for sel in ["text=연세포털 로그인", "a:has-text('연세포털 로그인')",
                "a[href*='infra.yonsei']", "a[href*='PmSSOService']"]:
        try:
            page.click(sel, timeout=4000)
            page.wait_for_load_state("networkidle", timeout=15000)
            break
        except PWTimeout: continue

    id_sel = find_sel(page, ['input[name="userid"]','input[name="username"]','input[type="text"]'])
    pw_sel = find_sel(page, ['input[name="password"]','input[name="passwd"]','input[type="password"]'])
    if not id_sel or not pw_sel:
        print(f"  ❌ 로그인 폼 없음. URL: {page.url}")
        browser.close(); sys.exit(1)

    page.fill(id_sel, username)
    page.fill(pw_sel, password)
    for sel in ['button[type="submit"]','input[type="submit"]','button:has-text("로그인")']:
        try: page.click(sel, timeout=3000); break
        except PWTimeout: continue
    else: page.keyboard.press("Enter")

    try: page.wait_for_url(f"{BASE_URL}/**", timeout=15000)
    except PWTimeout: pass
    page.wait_for_load_state("networkidle", timeout=10000)
    print(f"  ✅ 로그인 완료 ({page.url[:50]}...)")
    return page, browser

# ── 이번 학기 수강 과목 코드 (고정) ─────────────────────────────────
COURSE_CODES = [
    "MAT2013.02-00",  # 확률통계
    "MAT2017.01-00",  # 공학수학(4)
    "MEU3002.02-00",  # 메카니즘설계
    "MEU3005.01-00",  # 기계공학실험(2)
    "MEU3010.01-00",  # 마이크로기계시스템
    "MEU4002.01-00",  # 기계공학세미나
]

# ── 과목 목록 수집 ────────────────────────────────────────────────────
def get_courses(page):
    """
    학위과정 페이지(/local/ubion/user/index.php)에서 수강 과목 링크 수집.
    해당 페이지에는 본인 교과 과목만 표시됨.
    """
    page.goto(f"{BASE_URL}/local/ubion/user/index.php", wait_until="networkidle", timeout=20000)
    page.wait_for_timeout(2000)

    all_links = page.locator("a[href*='/course/view.php']").all()

    courses = []
    seen = set()
    for a in all_links:
        try:
            href = a.get_attribute("href") or ""
            name = a.inner_text().strip().replace("\n", " ")
            if not href or not name or href in seen:
                continue
            seen.add(href)
            courses.append({"name": name, "url": href})
        except:
            continue

    return courses

# ── 동영상 수집 ───────────────────────────────────────────────────────
def scrape_videos(page, course_name):
    tasks = []
    # Moodle에서 vod/ucvod 모듈: li.activity.ucvod, li.activity.vod
    # li[class*='vod']는 ucvod도 매칭되어 중복 발생 → 명시적 클래스만 사용
    video_rows = page.locator(
        "li.activity.ucvod, li.activity.vod, li.activity.unilvod"
    ).all()

    seen_names = set()
    for row in video_rows:
        try:
            # 이름: .instancename 텍스트만 (배지/아이콘 제외)
            name_el = row.locator(".instancename").first
            if not name_el.count():
                name_el = row.locator(".activityname").first
            name = name_el.inner_text().strip().split("\n")[0].strip() if name_el.count() else ""
            if not name or name in seen_names: continue
            seen_names.add(name)

            # 완료 여부
            if is_completed(row): continue

            # 날짜 범위 텍스트에서 종료일 추출
            row_text = row.inner_text()
            due_date = parse_video_end_date(row_text)

            # 이미 지난 경우 스킵
            if due_date and (due_date - TODAY).days < 0: continue

            tasks.append(make_task(course_name, name, "video", due_date))
        except: continue

    return tasks

# ── 과제 수집 ─────────────────────────────────────────────────────────
def scrape_assignments(page, course_name):
    tasks = []
    # assign 모듈 (과제)
    assign_rows = page.locator(
        "li.activity.assign, li[class*='assign']"
    ).all()

    for row in assign_rows:
        try:
            # 이름 & 링크
            link_el = row.locator("a[href*='/mod/assign/']").first
            if not link_el.count(): continue
            name_el = row.locator(".instancename").first
            if not name_el.count():
                name_el = row.locator(".activityname").first
            name = name_el.inner_text().strip().split("\n")[0].strip() if name_el.count() else ""
            href = link_el.get_attribute("href")
            if not name or not href: continue

            # 완료 여부는 상세 페이지의 submission status로만 판별 (is_completed 오탐 방지)

            # 과제 상세 페이지 방문
            page.goto(href, wait_until="networkidle", timeout=15000)
            page.wait_for_timeout(500)

            due_date = None
            sub_done = False

            # Submission status 테이블에서 Due date 읽기
            rows_tbl = page.locator("table tr").all()
            for tr in rows_tbl:
                try:
                    cells = tr.locator("td").all()
                    if len(cells) >= 2:
                        key = cells[0].inner_text().strip().lower()
                        val = cells[1].inner_text().strip()
                        if "due" in key or "마감" in key:
                            due_date = parse_date(val)
                        if "submission status" in key or "제출 상태" in key:
                            sub_done = "no attempt" not in val.lower() and val != "-"
                except: continue

            # 본문에서 "Due date: ..." 형식도 시도
            if not due_date:
                body_text = page.inner_text("body")
                m = re.search(r"[Dd]ue\s*[Dd]ate[:\s]+(.{5,60})", body_text)
                if m: due_date = parse_date(m.group(1))

            # 상세 페이지에서도 못 찾으면 과제 이름에서 파싱 (예: "마감 5월 13일")
            if not due_date:
                due_date = parse_date(name)

            # 이미 제출했거나 지난 경우 스킵
            if sub_done: continue
            if due_date and (due_date - TODAY).days < 0: continue

            tasks.append(make_task(course_name, name, "assignment", due_date))

            # 뒤로 가기
            page.go_back(wait_until="networkidle", timeout=15000)
            page.wait_for_timeout(500)

        except:
            try: page.go_back(wait_until="networkidle", timeout=10000)
            except: pass
            continue

    return tasks

# ── 시험 수집 (과목공지 게시판) ──────────────────────────────────────
def scrape_exams(page, course_name):
    tasks = []
    EXAM_KEYWORDS = ["퀴즈", "quiz", "시험", "exam", "test", "중간", "기말"]

    # 과목공지 / 공지사항 포럼 링크 탐색
    notice_links = page.locator(
        "a[href*='/mod/forum/'], a[href*='/mod/board/']"
    ).all()

    forum_url = None
    for a in notice_links:
        try:
            txt = a.inner_text().strip().lower()
            href = a.get_attribute("href") or ""
            if any(k in txt for k in ["공지", "notice", "announcement"]):
                forum_url = href
                break
        except: continue

    if not forum_url: return tasks

    try:
        page.goto(forum_url, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(1000)

        # 게시물 링크 수집
        post_links = page.locator("a[href*='/mod/forum/discuss.php'], a[href*='/mod/board/']").all()

        for post_link in post_links[:10]:  # 최근 10개만
            try:
                subject = post_link.inner_text().strip()
                href    = post_link.get_attribute("href")

                # 시험 관련 키워드 포함 여부
                if not any(k.lower() in subject.lower() for k in EXAM_KEYWORDS):
                    continue

                page.goto(href, wait_until="networkidle", timeout=15000)
                body = page.inner_text("body")

                # 날짜 파싱
                due_date = None
                for line in body.split("\n"):
                    if any(k in line for k in ["일시", "날짜", "date", "일정"]):
                        d = parse_date(line)
                        if d and d >= TODAY:
                            due_date = d
                            break
                if not due_date:
                    # 본문 전체에서 미래 날짜 탐색
                    for m in re.finditer(r"(\d{1,2})월\s*(\d{1,2})일", body):
                        d = parse_date(m.group(0))
                        if d and d >= TODAY:
                            due_date = d
                            break

                if due_date:
                    tasks.append(make_task(course_name, subject[:60], "exam", due_date, notes="공지사항 참고"))

                page.go_back(wait_until="networkidle", timeout=10000)
                page.wait_for_timeout(300)
            except:
                try: page.go_back(wait_until="networkidle", timeout=10000)
                except: pass
                continue

        page.go_back(wait_until="networkidle", timeout=10000)
    except: pass

    return tasks

# ── GAS 전송 ──────────────────────────────────────────────────────────
def push_to_gas(tasks):
    print(f"\n[GAS] {len(tasks)}개 → Google Sheets 전송 중...")
    ok = fail = 0
    for t in tasks:
        try:
            r = requests.post(GAS_URL, json={"action":"upsert","sheet":"tasks","data":t}, timeout=15)
            if r.status_code == 200: ok += 1
            else: fail += 1
        except Exception as e:
            print(f"  ⚠️  {t['title'][:25]}: {e}"); fail += 1
    print(f"  ✅ 성공 {ok}개 / ❌ 실패 {fail}개")

# ── 메인 ──────────────────────────────────────────────────────────────
def main():
    from playwright.sync_api import sync_playwright

    print("=" * 52)
    print("  LearnUS 일정 자동 수집기")
    print(f"  기준일: {TODAY} (KST)")
    print("=" * 52)

    username = os.environ.get("LEARNUS_ID") or input("\n  학번 (포털 ID): ").strip()
    password = os.environ.get("LEARNUS_PW") or getpass.getpass("  비밀번호: ")

    with sync_playwright() as pw:
        print("\n[1] 로그인...")
        page, browser = login(pw, username, password)

        print("[2] 수강 과목 조회 (교과/학부만)...")
        courses = get_courses(page)
        if not courses:
            print("  ❌ 과목을 찾을 수 없습니다.")
            browser.close(); sys.exit(1)
        print(f"  📚 {len(courses)}개 과목:")
        for c in courses: print(f"     - {c['name'][:40]}")

        all_tasks = []
        for i, course in enumerate(courses, 1):
            cname = course["name"]
            print(f"\n[{i+2}] {cname[:30]}...")
            page.goto(course["url"], wait_until="networkidle", timeout=20000)
            page.wait_for_timeout(1500)

            videos  = scrape_videos(page, cname)
            assigns = scrape_assignments(page, cname)

            # 과목공지 탐색을 위해 과목 페이지 다시 방문
            page.goto(course["url"], wait_until="networkidle", timeout=20000)
            page.wait_for_timeout(1000)
            exams = scrape_exams(page, cname)

            print(f"  📝 과제 {len(assigns)}개 / 🎬 동영상 {len(videos)}개 / 📖 시험공지 {len(exams)}개")
            all_tasks.extend(videos + assigns + exams)

        browser.close()

    if not all_tasks:
        print("\n  ℹ️  수집된 미완료 항목 없음")
        sys.exit(0)

    # 동일 ID 중복 제거 (같은 과목+제목+마감일 조합)
    seen_ids = set()
    deduped = []
    for t in all_tasks:
        if t["id"] not in seen_ids:
            seen_ids.add(t["id"])
            deduped.append(t)
    if len(deduped) < len(all_tasks):
        print(f"  🔧 중복 제거: {len(all_tasks) - len(deduped)}개")
    all_tasks = deduped

    all_tasks.sort(key=lambda t: t["due"])
    print("\n" + "-" * 52)
    for t in all_tasks:
        days = (datetime.fromisoformat(t["due"]).date() - TODAY).days
        rem  = f"D-{days}" if days >= 0 else f"D+{-days}"
        icon = {"assignment":"📝","exam":"📖","video":"🎬"}.get(t["type"],"📌")
        print(f"  {icon} [{rem:>4}] {t['subject'][:14]:<14} {t['title'][:26]}")
    print(f"\n  총 {len(all_tasks)}개")

    push_to_gas(all_tasks)
    print("\n  🎉 완료!")

if __name__ == "__main__":
    main()
