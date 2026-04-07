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
    due_str = due_date.isoformat() if due_date else (TODAY + timedelta(days=7)).isoformat()
    return {
        "id":       make_id(course, title, due_str),
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

    # YYYY-MM-DD HH:MM:SS 또는 YYYY-MM-DD HH:MM
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", text)
    if m:
        try: return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3))).date()
        except: pass

    # MM/DD 또는 M/D
    m = re.search(r"(\d{1,2})/(\d{1,2})", text)
    if m:
        month, day = int(m.group(1)), int(m.group(2))
        year = TODAY.year if (month, day) >= (TODAY.month, TODAY.day) else TODAY.year + 1
        try: return datetime(year, month, day).date()
        except: pass

    # N월 N일
    m = re.search(r"(\d{1,2})월\s*(\d{1,2})일", text)
    if m:
        month, day = int(m.group(1)), int(m.group(2))
        year = TODAY.year if (month, day) >= (TODAY.month, TODAY.day) else TODAY.year + 1
        try: return datetime(year, month, day).date()
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

# ── 과목 목록 수집 ────────────────────────────────────────────────────
def get_courses(page):
    """
    /my/ 대시보드에서 교과/학부 과목만 수집.
    비교과, 자율강좌는 제외.
    """
    page.goto(f"{BASE_URL}/my/", wait_until="networkidle", timeout=20000)
    page.wait_for_timeout(2000)

    courses = []
    # 과목 목록 행 순회
    items = page.locator(".course-info-container, .coursename, [data-region='course-content']").all()

    # 좀 더 넓게: 과목 링크가 있는 모든 행을 찾아서 배지 확인
    rows = page.locator("li, .course-listitem, [data-region='course-item'], tr").all()
    for row in rows:
        try:
            text = row.inner_text()
            # 교과/학부 배지 확인 (비교과, 자율강좌 제외)
            if "교과" not in text or "비교과" in text: continue

            link = row.locator("a[href*='/course/view.php']").first
            if not link.count(): continue

            href  = link.get_attribute("href")
            name  = link.inner_text().strip()
            if href and name:
                courses.append({"name": name, "url": href})
        except: continue

    # 중복 제거 (URL 기준)
    seen, unique = set(), []
    for c in courses:
        if c["url"] not in seen:
            seen.add(c["url"])
            unique.append(c)

    return unique

# ── 동영상 수집 ───────────────────────────────────────────────────────
def scrape_videos(page, course_name):
    tasks = []
    # ▶ play 아이콘을 가진 활동 행 탐색
    # Moodle에서 vod/ucvod 모듈은 보통 li.activity.ucvod 또는 li.activity.vod
    video_rows = page.locator(
        "li.activity.ucvod, li.activity.vod, li.activity.unilvod, "
        "li[class*='ucvod'], li[class*='vod']"
    ).all()

    for row in video_rows:
        try:
            # 이름
            name_el = row.locator(".activityname, .instancename, a").first
            name    = name_el.inner_text().strip() if name_el.count() else ""
            if not name: continue

            # 완료 여부
            done = is_completed(row)
            if done: continue

            # 날짜 범위 텍스트 (주황색/빨간색 텍스트)
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
            name = row.locator(".activityname, .instancename").first.inner_text().strip()
            href = link_el.get_attribute("href")
            if not name or not href: continue

            # 완료 여부 (체크박스)
            done = is_completed(row)
            if done: continue

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
                m = re.search(r"[Dd]ue\s*[Dd]ate[:\s]+(.{5,30})", body_text)
                if m: due_date = parse_date(m.group(1))

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
