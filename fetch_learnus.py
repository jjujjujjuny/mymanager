"""
fetch_learnus.py
================
Playwright로 연세대 SSO 로그인 후
LearnUS Moodle API로 과제/시험/동영상 일정을 수집해
GAS(Google Apps Script) API로 Google Sheets에 직접 저장.
"""

import os
import sys
import re
import json
import hashlib
import getpass
import requests
from datetime import datetime, timezone, timedelta

# ── 설정 ──────────────────────────────────────────────────────────────
BASE_URL  = "https://ys.learnus.org"
API_URL   = f"{BASE_URL}/webservice/rest/server.php"
GAS_URL   = os.environ.get("GAS_URL",
    "https://script.google.com/macros/s/AKfycbwWJ563ydzFxdtXS2L99AwlixvWrFek7NYhRv6EJWgZdaRBJwhG0HpuAnFwEMSoCZXhEw/exec"
)

KST       = timezone(timedelta(hours=9))
TODAY     = datetime.now(KST).date()
PAST_DAYS = 0

# ── 유틸 ──────────────────────────────────────────────────────────────
def ts_to_date(ts):
    if not ts or ts <= 0:
        return None
    return datetime.fromtimestamp(ts, tz=KST).date()

def priority(due_date):
    if due_date is None: return "low"
    days = (due_date - TODAY).days
    if days <= 2:  return "high"
    if days <= 7:  return "medium"
    return "low"

def stable_id(course, name, due):
    key = f"{course}|{name}|{due}"
    return "ln_" + hashlib.md5(key.encode()).hexdigest()[:12]

def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()

def next_week():
    return (TODAY + timedelta(days=7)).isoformat()

# ── Playwright SSO 로그인 ─────────────────────────────────────────────
def sso_login(username, password):
    """
    Playwright 헤드리스 브라우저로:
    1. learnus.org 접속 → 학위과정 탭 클릭
    2. SSO 로그인 폼 입력
    3. 세션 쿠키 추출
    4. 쿠키로 Moodle mobile 토큰 발급
    """
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        page = context.new_page()

        # Step 1: learnus 접속
        print("  → learnus.org 접속...")
        page.goto(f"{BASE_URL}/login/index.php", wait_until="networkidle", timeout=20000)
        print(f"  → 현재 URL: {page.url[:60]}...")

        # Step 2: "연세포털 로그인" 버튼 클릭 → infra.yonsei.ac.kr 로 이동
        for selector in [
            "text=연세포털 로그인",
            "a:has-text('연세포털 로그인')",
            "button:has-text('연세포털 로그인')",
            "a[href*='infra.yonsei']",
            "a[href*='PmSSOService']",
            "a[href*='oauth2']",
        ]:
            try:
                page.click(selector, timeout=4000)
                page.wait_for_load_state("networkidle", timeout=15000)
                print(f"  → 클릭 성공: {selector}")
                break
            except PWTimeout:
                continue

        print(f"  → SSO 페이지: {page.url[:70]}...")

        # Step 4: ID/PW 입력 필드 탐색 및 입력
        id_selectors = [
            'input[name="userid"]', 'input[name="username"]',
            'input[name="id"]',     'input[name="loginid"]',
            'input[type="text"]',
        ]
        pw_selectors = [
            'input[name="password"]', 'input[name="passwd"]',
            'input[name="pw"]',       'input[type="password"]',
        ]

        id_field = _find_selector(page, id_selectors)
        pw_field = _find_selector(page, pw_selectors)

        if not id_field or not pw_field:
            print(f"  ❌ 로그인 폼 필드를 찾을 수 없습니다.")
            print(f"  현재 URL: {page.url}")
            print(f"  페이지 텍스트: {page.inner_text('body')[:400]}")
            browser.close()
            sys.exit(1)

        print(f"  → 폼 필드 발견: ID={id_field}, PW={pw_field}")
        page.fill(id_field, username)
        page.fill(pw_field, password)

        # Step 5: 제출
        submit_selectors = [
            'button[type="submit"]', 'input[type="submit"]',
            'button:has-text("로그인")', 'button:has-text("Login")',
            'input[value="로그인"]',
        ]
        submitted = False
        for sel in submit_selectors:
            try:
                page.click(sel, timeout=3000)
                submitted = True
                break
            except PWTimeout:
                continue

        if not submitted:
            page.keyboard.press("Enter")

        # Step 6: 로그인 완료 대기
        try:
            page.wait_for_url(f"{BASE_URL}/**", timeout=15000)
        except PWTimeout:
            pass
        page.wait_for_load_state("networkidle", timeout=10000)
        print(f"  → 로그인 후 URL: {page.url[:60]}...")

        # 로그인 성공 확인
        body_text = page.inner_text("body")
        if "로그아웃" not in body_text and "logout" not in page.url.lower():
            if "잘못된" in body_text or "incorrect" in body_text.lower() or "invalid" in body_text.lower():
                print("  ❌ ID 또는 PW가 틀렸습니다.")
            else:
                print(f"  ⚠️  로그인 확인 불명확. 계속 진행합니다.")

        print("  ✅ 로그인 완료!")

        # Step 7: 쿠키 추출
        cookies = {c["name"]: c["value"] for c in context.cookies()}

        # Step 8: Moodle mobile 토큰 발급
        token = _get_moodle_token_with_cookies(cookies)
        browser.close()
        return token

def _find_selector(page, selectors):
    """페이지에서 존재하는 첫 번째 selector 반환"""
    for sel in selectors:
        try:
            if page.locator(sel).count() > 0:
                return sel
        except Exception:
            continue
    return None

def _get_moodle_token_with_cookies(cookies):
    """세션 쿠키로 Moodle mobile 토큰 발급"""
    import random, string, base64

    passport = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    url = f"{BASE_URL}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport={passport}"

    session = requests.Session()
    for name, value in cookies.items():
        session.cookies.set(name, value)

    r = session.get(url, allow_redirects=False, timeout=15)
    location = r.headers.get("Location", "")

    if not location:
        r = session.get(url, allow_redirects=True, timeout=15)
        location = r.url

    # moodlemobile://token=BASE64 형식
    match = re.search(r"token=([A-Za-z0-9+/=_-]+)", location)
    if match:
        token_b64 = match.group(1)
        try:
            padding = 4 - len(token_b64) % 4
            decoded = base64.b64decode(token_b64 + "=" * padding).decode("utf-8")
            token = decoded.split(":::")[0]
            print(f"  ✅ Moodle 토큰 발급 성공")
            return token
        except Exception:
            pass

    # 32자리 hex 토큰 형식
    match = re.search(r"[a-f0-9]{32}", location)
    if match:
        print(f"  ✅ Moodle 토큰 발급 성공")
        return match.group(0)

    print(f"  ❌ 토큰 추출 실패. Location: {location[:150]}")
    sys.exit(1)

# ── Moodle REST API ────────────────────────────────────────────────────
def moodle(token, function, **params):
    try:
        r = requests.post(API_URL, data={
            "wstoken": token,
            "wsfunction": function,
            "moodlewsrestformat": "json",
            **params,
        }, timeout=20)
        data = r.json()
        if isinstance(data, dict) and data.get("exception"):
            return None
        return data
    except Exception:
        return None

# ── 수집 함수들 ────────────────────────────────────────────────────────
def get_courses(token, userid):
    courses = moodle(token, "core_enrol_get_users_courses", userid=userid)
    return [{"id": c["id"], "name": c["fullname"]} for c in (courses or [])]

def get_assignments(token, course_ids, courses_map):
    tasks = []
    result = moodle(token, "mod_assign_get_assignments",
                    **{f"courseids[{i}]": cid for i, cid in enumerate(course_ids)})
    if not result:
        return tasks
    for course in result.get("courses", []):
        cname = courses_map.get(course["id"], "")
        for a in course.get("assignments", []):
            due_date = ts_to_date(a.get("duedate", 0))
            if due_date and (due_date - TODAY).days < -PAST_DAYS:
                continue
            due_str = due_date.isoformat() if due_date else next_week()
            tasks.append({
                "id":       stable_id(cname, a["name"], due_str),
                "title":    a["name"],
                "subject":  cname,
                "type":     "assignment",
                "priority": priority(due_date),
                "due":      due_str,
                "notes":    strip_html(a.get("intro", ""))[:100],
                "done":     False,
                "created":  datetime.now(KST).isoformat(),
            })
    return tasks

def get_quizzes(token, course_ids, courses_map):
    tasks = []
    result = moodle(token, "mod_quiz_get_quizzes_by_courses",
                    **{f"courseids[{i}]": cid for i, cid in enumerate(course_ids)})
    if not result:
        return tasks
    for q in result.get("quizzes", []):
        due_date = ts_to_date(q.get("timeclose", 0))
        if due_date and (due_date - TODAY).days < -PAST_DAYS:
            continue
        cname = courses_map.get(q.get("course", 0), "")
        due_str = due_date.isoformat() if due_date else next_week()
        timelimit_min = (q.get("timelimit") or 0) // 60
        tasks.append({
            "id":       stable_id(cname, q["name"], due_str),
            "title":    q["name"],
            "subject":  cname,
            "type":     "exam",
            "priority": priority(due_date),
            "due":      due_str,
            "notes":    f"제한시간: {timelimit_min}분" if timelimit_min else "",
            "done":     False,
            "created":  datetime.now(KST).isoformat(),
        })
    return tasks

def get_videos(token, courses):
    tasks = []
    for course in courses:
        contents = moodle(token, "core_course_get_contents", courseid=course["id"])
        if not contents:
            continue
        for section in contents:
            for mod in section.get("modules", []):
                if mod.get("modname", "").lower() not in {"vod", "ucvod", "unilvod", "hvp"}:
                    continue
                completion = mod.get("completiondata", {})
                if isinstance(completion, dict) and completion.get("state", 0) == 1:
                    continue
                due_date = ts_to_date(mod.get("completionexpected", 0))
                if due_date and (due_date - TODAY).days < -PAST_DAYS:
                    continue
                due_str = due_date.isoformat() if due_date else next_week()
                tasks.append({
                    "id":       stable_id(course["name"], mod["name"], due_str),
                    "title":    mod["name"],
                    "subject":  course["name"],
                    "type":     "video",
                    "priority": priority(due_date),
                    "due":      due_str,
                    "notes":    section.get("name", ""),
                    "done":     False,
                    "created":  datetime.now(KST).isoformat(),
                })
    return tasks

# ── GAS 전송 ──────────────────────────────────────────────────────────
def push_to_gas(tasks):
    print(f"\n[GAS] {len(tasks)}개 → Google Sheets 전송 중...")
    success, fail = 0, 0
    for task in tasks:
        try:
            r = requests.post(GAS_URL,
                              json={"action": "upsert", "sheet": "tasks", "data": task},
                              timeout=15)
            if r.status_code == 200:
                success += 1
            else:
                fail += 1
        except Exception as e:
            print(f"  ⚠️  전송 실패: {task['title'][:30]} — {e}")
            fail += 1
    print(f"  ✅ 성공 {success}개 / ❌ 실패 {fail}개")

# ── 메인 ──────────────────────────────────────────────────────────────
def main():
    print("=" * 52)
    print("  LearnUS 일정 자동 수집기")
    print(f"  기준일: {TODAY} (KST)")
    print("=" * 52)

    username = os.environ.get("LEARNUS_ID") or input("\n  학번 (포털 ID): ").strip()
    password = os.environ.get("LEARNUS_PW") or getpass.getpass("  비밀번호: ")

    print("\n[1] 연세대 SSO 로그인...")
    token = sso_login(username, password)

    print("[2] 사용자 정보...")
    info = moodle(token, "core_webservice_get_site_info") or {}
    userid = info.get("userid")
    if not userid:
        print("  ❌ 사용자 정보 조회 실패")
        sys.exit(1)
    print(f"  👤 {info.get('fullname', username)}")

    print("[3] 수강 과목...")
    courses = get_courses(token, userid)
    if not courses:
        print("  ⚠️  수강 과목 없음")
        sys.exit(1)
    courses_map = {c["id"]: c["name"] for c in courses}
    print(f"  📚 {len(courses)}개")

    course_ids = [c["id"] for c in courses]

    print("[4] 과제...")
    assignments = get_assignments(token, course_ids, courses_map)
    print(f"  📝 {len(assignments)}개")

    print("[5] 퀴즈/시험...")
    quizzes = get_quizzes(token, course_ids, courses_map)
    print(f"  📖 {len(quizzes)}개")

    print("[6] 동영상 강의...")
    videos = get_videos(token, courses)
    print(f"  🎬 {len(videos)}개")

    all_tasks = sorted(assignments + quizzes + videos, key=lambda t: t["due"])

    print("\n" + "-" * 52)
    icon_map = {"assignment": "📝", "exam": "📖", "video": "🎬"}
    for t in all_tasks:
        days = (datetime.fromisoformat(t["due"]).date() - TODAY).days
        remaining = f"D-{days}" if days >= 0 else f"D+{-days}"
        print(f"  {icon_map.get(t['type'],'📌')} [{remaining:>4}] {t['subject'][:12]:<12} {t['title'][:28]}")
    print(f"\n  총 {len(all_tasks)}개 항목")

    if all_tasks:
        push_to_gas(all_tasks)

    print("\n  🎉 완료! 앱이 다음 동기화 시 자동 반영됩니다.")

if __name__ == "__main__":
    main()
