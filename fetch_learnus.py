"""
fetch_learnus.py
================
Playwright로 연세대 SSO 로그인 후
LearnUS Moodle API로 과제/시험/동영상 일정을 수집해
GAS(Google Apps Script) API로 Google Sheets에 직접 저장.
"""

import os, sys, re, hashlib, getpass, base64, random, string
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
    if not ts or ts <= 0: return None
    return datetime.fromtimestamp(ts, tz=KST).date()

def priority(due_date):
    if due_date is None: return "low"
    days = (due_date - TODAY).days
    if days <= 2: return "high"
    if days <= 7: return "medium"
    return "low"

def stable_id(course, name, due):
    return "ln_" + hashlib.md5(f"{course}|{name}|{due}".encode()).hexdigest()[:12]

def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()

def next_week():
    return (TODAY + timedelta(days=7)).isoformat()

def find_selector(page, selectors):
    for sel in selectors:
        try:
            if page.locator(sel).count() > 0:
                return sel
        except Exception:
            continue
    return None

# ── SSO 로그인 + 토큰 발급 (단일 Playwright 세션) ─────────────────────
def sso_login(username, password):
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        page = context.new_page()

        # 1. learnus 접속
        print("  → learnus.org 접속...")
        page.goto(f"{BASE_URL}/login/index.php", wait_until="networkidle", timeout=20000)
        print(f"  → 현재 URL: {page.url[:60]}...")

        # 2. '연세포털 로그인' 버튼 클릭
        for sel in ["text=연세포털 로그인", "a:has-text('연세포털 로그인')",
                    "a[href*='infra.yonsei']", "a[href*='PmSSOService']", "a[href*='oauth2']"]:
            try:
                page.click(sel, timeout=4000)
                page.wait_for_load_state("networkidle", timeout=15000)
                print(f"  → 클릭 성공: {sel}")
                break
            except PWTimeout:
                continue
        print(f"  → SSO 페이지: {page.url[:70]}...")

        # 3. ID/PW 입력
        id_sel = find_selector(page, ['input[name="userid"]', 'input[name="username"]',
                                      'input[name="id"]', 'input[type="text"]'])
        pw_sel = find_selector(page, ['input[name="password"]', 'input[name="passwd"]',
                                      'input[type="password"]'])
        if not id_sel or not pw_sel:
            print(f"  ❌ 로그인 폼 필드를 찾을 수 없습니다. URL: {page.url}")
            print(f"  페이지 텍스트: {page.inner_text('body')[:300]}")
            browser.close(); sys.exit(1)

        print(f"  → 폼 필드: ID={id_sel}, PW={pw_sel}")
        page.fill(id_sel, username)
        page.fill(pw_sel, password)

        # 4. 제출
        for sel in ['button[type="submit"]', 'input[type="submit"]',
                    'button:has-text("로그인")', 'input[value="로그인"]']:
            try:
                page.click(sel, timeout=3000); break
            except PWTimeout:
                continue
        else:
            page.keyboard.press("Enter")

        try:
            page.wait_for_url(f"{BASE_URL}/**", timeout=15000)
        except PWTimeout:
            pass
        page.wait_for_load_state("networkidle", timeout=10000)
        print(f"  → 로그인 후 URL: {page.url[:60]}...")
        print("  ✅ 로그인 완료!")

        # 5. 같은 세션으로 mobile launch → 토큰 추출
        print("  → Moodle 토큰 발급 시도...")
        passport = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
        launch_url = f"{BASE_URL}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport={passport}"

        captured = {"url": ""}
        def on_req(req):
            if "moodlemobile" in req.url or ("token=" in req.url and "learnus" not in req.url):
                captured["url"] = req.url
        page.on("request", on_req)

        try:
            page.goto(launch_url, wait_until="networkidle", timeout=15000)
        except Exception:
            pass

        loc = captured["url"] or page.url
        print(f"  [디버그] launch URL: {loc[:120]}")
        browser.close()

    # 토큰 파싱
    token = _parse_token(loc)
    if token:
        print("  ✅ Moodle 토큰 발급 성공")
        return token

    print(f"  ❌ 토큰 추출 실패")
    sys.exit(1)

def _parse_token(loc):
    # Base64 인코딩 형식 (moodlemobile://token=BASE64)
    m = re.search(r"token=([A-Za-z0-9+/=_-]{20,})", loc)
    if m:
        try:
            raw = m.group(1)
            pad = 4 - len(raw) % 4
            decoded = base64.b64decode(raw + "=" * pad).decode("utf-8")
            print(f"  [디버그] 디코딩: {decoded[:80]}")
            return decoded.split(":::")[0]
        except Exception as e:
            print(f"  [디버그] Base64 실패: {e}")
    # 32자리 hex 형식
    m = re.search(r"[a-f0-9]{32}", loc)
    if m:
        return m.group(0)
    return None

# ── Moodle REST API ────────────────────────────────────────────────────
def moodle(token, function, debug=False, **params):
    try:
        r = requests.post(API_URL, data={
            "wstoken": token, "wsfunction": function,
            "moodlewsrestformat": "json", **params,
        }, timeout=20)
        data = r.json()
        if debug:
            print(f"  [디버그] {function}: {str(data)[:300]}")
        if isinstance(data, dict) and data.get("exception"):
            return None
        return data
    except Exception as e:
        if debug: print(f"  [디버그] 예외: {e}")
        return None

# ── 수집 함수들 ────────────────────────────────────────────────────────
def get_courses(token, userid):
    courses = moodle(token, "core_enrol_get_users_courses", userid=userid)
    return [{"id": c["id"], "name": c["fullname"]} for c in (courses or [])]

def get_assignments(token, course_ids, courses_map):
    tasks = []
    result = moodle(token, "mod_assign_get_assignments",
                    **{f"courseids[{i}]": cid for i, cid in enumerate(course_ids)})
    if not result: return tasks
    for course in result.get("courses", []):
        cname = courses_map.get(course["id"], "")
        for a in course.get("assignments", []):
            due_date = ts_to_date(a.get("duedate", 0))
            if due_date and (due_date - TODAY).days < -PAST_DAYS: continue
            due_str = due_date.isoformat() if due_date else next_week()
            tasks.append({
                "id": stable_id(cname, a["name"], due_str), "title": a["name"],
                "subject": cname, "type": "assignment", "priority": priority(due_date),
                "due": due_str, "notes": strip_html(a.get("intro", ""))[:100],
                "done": False, "created": datetime.now(KST).isoformat(),
            })
    return tasks

def get_quizzes(token, course_ids, courses_map):
    tasks = []
    result = moodle(token, "mod_quiz_get_quizzes_by_courses",
                    **{f"courseids[{i}]": cid for i, cid in enumerate(course_ids)})
    if not result: return tasks
    for q in result.get("quizzes", []):
        due_date = ts_to_date(q.get("timeclose", 0))
        if due_date and (due_date - TODAY).days < -PAST_DAYS: continue
        cname = courses_map.get(q.get("course", 0), "")
        due_str = due_date.isoformat() if due_date else next_week()
        timelimit_min = (q.get("timelimit") or 0) // 60
        tasks.append({
            "id": stable_id(cname, q["name"], due_str), "title": q["name"],
            "subject": cname, "type": "exam", "priority": priority(due_date),
            "due": due_str, "notes": f"제한시간: {timelimit_min}분" if timelimit_min else "",
            "done": False, "created": datetime.now(KST).isoformat(),
        })
    return tasks

def get_videos(token, courses):
    tasks = []
    for course in courses:
        contents = moodle(token, "core_course_get_contents", courseid=course["id"])
        if not contents: continue
        for section in contents:
            for mod in section.get("modules", []):
                if mod.get("modname", "").lower() not in {"vod", "ucvod", "unilvod", "hvp"}:
                    continue
                completion = mod.get("completiondata", {})
                if isinstance(completion, dict) and completion.get("state", 0) == 1:
                    continue
                due_date = ts_to_date(mod.get("completionexpected", 0))
                if due_date and (due_date - TODAY).days < -PAST_DAYS: continue
                due_str = due_date.isoformat() if due_date else next_week()
                tasks.append({
                    "id": stable_id(course["name"], mod["name"], due_str),
                    "title": mod["name"], "subject": course["name"],
                    "type": "video", "priority": priority(due_date),
                    "due": due_str, "notes": section.get("name", ""),
                    "done": False, "created": datetime.now(KST).isoformat(),
                })
    return tasks

# ── GAS 전송 ──────────────────────────────────────────────────────────
def push_to_gas(tasks):
    print(f"\n[GAS] {len(tasks)}개 → Google Sheets 전송 중...")
    success, fail = 0, 0
    for task in tasks:
        try:
            r = requests.post(GAS_URL,
                json={"action": "upsert", "sheet": "tasks", "data": task}, timeout=15)
            success += 1 if r.status_code == 200 else 0
            fail    += 0 if r.status_code == 200 else 1
        except Exception as e:
            print(f"  ⚠️  전송 실패: {task['title'][:30]} — {e}"); fail += 1
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
    print(f"  토큰 앞 8자리: {token[:8]}...")
    info = moodle(token, "core_webservice_get_site_info", debug=True) or {}
    userid = info.get("userid")
    if not userid:
        print("  ❌ 사용자 정보 조회 실패"); sys.exit(1)
    print(f"  👤 {info.get('fullname', username)}")

    print("[3] 수강 과목...")
    courses = get_courses(token, userid)
    if not courses:
        print("  ⚠️  수강 과목 없음"); sys.exit(1)
    courses_map = {c["id"]: c["name"] for c in courses}
    print(f"  📚 {len(courses)}개")

    course_ids = [c["id"] for c in courses]

    print("[4] 과제..."); assignments = get_assignments(token, course_ids, courses_map); print(f"  📝 {len(assignments)}개")
    print("[5] 퀴즈/시험..."); quizzes = get_quizzes(token, course_ids, courses_map); print(f"  📖 {len(quizzes)}개")
    print("[6] 동영상 강의..."); videos = get_videos(token, courses); print(f"  🎬 {len(videos)}개")

    all_tasks = sorted(assignments + quizzes + videos, key=lambda t: t["due"])

    print("\n" + "-" * 52)
    for t in all_tasks:
        days = (datetime.fromisoformat(t["due"]).date() - TODAY).days
        remaining = f"D-{days}" if days >= 0 else f"D+{-days}"
        icon = {"assignment":"📝","exam":"📖","video":"🎬"}.get(t["type"],"📌")
        print(f"  {icon} [{remaining:>4}] {t['subject'][:12]:<12} {t['title'][:28]}")
    print(f"\n  총 {len(all_tasks)}개 항목")

    if all_tasks:
        push_to_gas(all_tasks)
    print("\n  🎉 완료! 앱이 다음 동기화 시 자동 반영됩니다.")

if __name__ == "__main__":
    main()
