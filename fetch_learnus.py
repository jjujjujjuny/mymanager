"""
fetch_learnus.py
================
연세대 SSO(infra.yonsei.ac.kr)로 로그인 후
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
from bs4 import BeautifulSoup
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

# ── SSO 로그인 → Moodle 토큰 발급 ────────────────────────────────────
def sso_login(username, password):
    """
    흐름:
    1. learnus.org/login.php → SSO 버튼 링크 탐색
    2. SSO 링크 클릭 → infra.yonsei.ac.kr 폼으로 이동
    3. 연세대 ID/PW 제출
    4. 세션 쿠키 획득
    5. Moodle mobile 토큰 발급
    """
    from urllib.parse import urlparse, urljoin

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })

    # Step 1: learnus 로그인 페이지 접속
    print("  → learnus.org 접속...")
    r = session.get(f"{BASE_URL}/login/index.php", allow_redirects=True, timeout=15)
    print(f"  → 로그인 페이지: {r.url[:60]}...")

    soup = BeautifulSoup(r.text, "html.parser")

    # Step 2: SSO/OAuth 링크 탐색 (연세포털, SSO, OAuth2 버튼)
    sso_url = _find_sso_link(soup, r.url)
    if sso_url:
        print(f"  → SSO 링크 발견: {sso_url[:60]}...")
        r = session.get(sso_url, allow_redirects=True, timeout=15)
        print(f"  → SSO 페이지: {r.url[:60]}...")
        soup = BeautifulSoup(r.text, "html.parser")

    # Step 3: 로그인 폼 탐색
    form = soup.find("form")
    if not form:
        # 폼이 없으면 페이지 내용 일부 출력 (디버그)
        print(f"  ❌ 로그인 폼을 찾을 수 없습니다.")
        print(f"  현재 URL: {r.url}")
        print(f"  페이지 미리보기: {soup.get_text()[:300]}")
        sys.exit(1)

    base_url = r.url
    action = form.get("action", base_url)
    if not action.startswith("http"):
        action = urljoin(base_url, action)

    # 숨겨진 필드 수집
    hidden = {
        inp["name"]: inp.get("value", "")
        for inp in form.find_all("input", type="hidden")
        if inp.get("name")
    }

    # ID/PW 필드명 자동 탐지
    id_field = _find_field(form, ["userid", "username", "id", "loginid", "user_id"])
    pw_field = _find_field(form, ["password", "passwd", "pw", "pass"])

    print(f"  → 폼 필드: ID={id_field}, PW={pw_field}")
    print(f"  → POST → {action[:60]}...")

    # Step 4: 자격증명 제출
    payload = {**hidden, id_field: username, pw_field: password}
    r = session.post(action, data=payload, allow_redirects=True, timeout=15)

    # 로그인 성공 여부 확인
    if "로그아웃" not in r.text and "logout" not in r.text.lower() and "dashboard" not in r.url:
        err_soup = BeautifulSoup(r.text, "html.parser")
        err_msg = err_soup.find(class_=re.compile(r"error|alert|invalid", re.I))
        detail = err_msg.get_text(strip=True)[:80] if err_msg else "응답 확인 필요"
        print(f"  ❌ SSO 로그인 실패: {detail}")
        print(f"  현재 URL: {r.url}")
        sys.exit(1)

    print("  ✅ SSO 로그인 성공!")

    # Step 4: Moodle mobile 토큰 발급
    token = _get_moodle_token(session)
    return token

def _find_sso_link(soup, base_url):
    """learnus 로그인 페이지에서 SSO/OAuth2/연세포털 링크 탐색"""
    from urllib.parse import urljoin
    keywords = ["sso", "oauth", "yonsei", "연세", "포털", "infra", "PmSSO"]
    for a in soup.find_all("a", href=True):
        href = a["href"]
        text = a.get_text(strip=True)
        if any(k.lower() in href.lower() or k.lower() in text.lower() for k in keywords):
            return href if href.startswith("http") else urljoin(base_url, href)
    # 버튼 형태일 수도 있음
    for btn in soup.find_all(["button", "input"], type=["submit", "button"]):
        text = btn.get_text(strip=True) or btn.get("value", "")
        if any(k.lower() in text.lower() for k in keywords):
            form = btn.find_parent("form")
            if form and form.get("action"):
                action = form["action"]
                return action if action.startswith("http") else urljoin(base_url, action)
    return None

def _find_field(form, candidates):
    """폼에서 후보 필드명 중 실제 존재하는 것 반환"""
    all_inputs = form.find_all("input")
    names = [inp.get("name", "").lower() for inp in all_inputs]
    for c in candidates:
        if c in names:
            return c
    # 못 찾으면 text/password 타입 순서대로 반환
    for inp in all_inputs:
        if inp.get("type") == "text" and inp.get("name"):
            return inp["name"]
    return candidates[0]

def _get_moodle_token(session):
    """세션 쿠키로 Moodle mobile 토큰 발급"""
    import random, string, urllib.parse

    passport = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    url = f"{BASE_URL}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport={passport}"

    r = session.get(url, allow_redirects=False, timeout=15)

    # 리다이렉트 Location 헤더에서 토큰 추출
    location = r.headers.get("Location", "")
    if not location:
        # 리다이렉트를 따라가서 최종 URL에서 추출
        r = session.get(url, allow_redirects=True, timeout=15)
        location = r.url

    # moodlemobile://token=BASE64_STRING 형식
    match = re.search(r"token=([A-Za-z0-9+/=]+)", location)
    if match:
        import base64
        token_b64 = match.group(1)
        try:
            decoded = base64.b64decode(token_b64 + "==").decode("utf-8")
            # 형식: "PRIVATETOKEN:::PUBLICTOKEN" 또는 그냥 토큰
            token = decoded.split(":::")[0]
            print(f"  ✅ Moodle 토큰 발급 성공")
            return token
        except Exception:
            pass

    # 직접 토큰이 URL에 있는 경우
    match = re.search(r"token=([a-f0-9]{32})", location)
    if match:
        print(f"  ✅ Moodle 토큰 발급 성공")
        return match.group(1)

    print(f"  ❌ 토큰 추출 실패. Location: {location[:100]}")
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
    print("  LearnUS 일정 자동 수집기 (SSO 방식)")
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
