"""
fetch_learnus.py
================
LearnUS(연세대 Moodle)에서 과제/시험/동영상 일정을 수집해
GAS(Google Apps Script) API로 Google Sheets에 직접 저장.

로컬 실행:
  python fetch_learnus.py

GitHub Actions 자동 실행:
  환경변수 LEARNUS_ID, LEARNUS_PW, GAS_URL 사용
"""

import os
import sys
import json
import hashlib
import getpass
import re
import requests
from datetime import datetime, timezone, timedelta

# ── 설정 ──────────────────────────────────────────────────────────────
BASE_URL  = "https://ys.learnus.org"
TOKEN_URL = f"{BASE_URL}/login/token.php"
API_URL   = f"{BASE_URL}/webservice/rest/server.php"

GAS_URL   = os.environ.get("GAS_URL",
    "https://script.google.com/macros/s/AKfycbwWJ563ydzFxdtXS2L99AwlixvWrFek7NYhRv6EJWgZdaRBJwhG0HpuAnFwEMSoCZXhEw/exec"
)

KST       = timezone(timedelta(hours=9))
TODAY     = datetime.now(KST).date()

# 이미 지난 마감 표시 여부 (0 = 오늘 이후만, 양수 = N일 전까지 포함)
PAST_DAYS = 0

# ── 유틸 ──────────────────────────────────────────────────────────────
def ts_to_date(ts):
    """Unix timestamp → date (KST)"""
    if not ts or ts <= 0:
        return None
    return datetime.fromtimestamp(ts, tz=KST).date()

def priority(due_date):
    if due_date is None:
        return "low"
    days = (due_date - TODAY).days
    if days <= 2:  return "high"
    if days <= 7:  return "medium"
    return "low"

def stable_id(course_name, task_name, due_str):
    """과목명+과제명+마감일 기반 고정 ID (매 실행마다 동일 → upsert 중복 방지)"""
    key = f"{course_name}|{task_name}|{due_str}"
    return "ln_" + hashlib.md5(key.encode()).hexdigest()[:12]

def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()

def next_week():
    return (TODAY + timedelta(days=7)).isoformat()

# ── 인증 ──────────────────────────────────────────────────────────────
def get_token(username, password):
    for service in ["moodle_mobile_app", "local_mobile"]:
        try:
            r = requests.post(TOKEN_URL, data={
                "username": username,
                "password": password,
                "service":  service,
            }, timeout=15)
            data = r.json()
            if "token" in data:
                print(f"  ✅ 로그인 성공 (service: {service})")
                return data["token"]
            if data.get("errorcode") == "invalidlogin":
                print("  ❌ ID 또는 PW가 틀렸습니다.")
                sys.exit(1)
        except Exception as e:
            print(f"  ⚠️  연결 오류: {e}")
    print("  ❌ 웹서비스 토큰 발급 실패. 아래 '대안' 섹션을 확인하세요.")
    sys.exit(1)

# ── Moodle API ─────────────────────────────────────────────────────────
def moodle(token, function, **params):
    try:
        r = requests.post(API_URL, data={
            "wstoken":            token,
            "wsfunction":         function,
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
        cname = courses_map.get(q.get("course", 0), q.get("coursemodule", ""))
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
    video_modules = {"vod", "ucvod", "unilvod", "url", "resource", "hvp", "assign"}
    # vod/ucvod 가 주요 동영상 타입

    for course in courses:
        contents = moodle(token, "core_course_get_contents", courseid=course["id"])
        if not contents:
            continue
        for section in contents:
            for mod in section.get("modules", []):
                modname = mod.get("modname", "").lower()
                if modname not in {"vod", "ucvod", "unilvod", "hvp"}:
                    continue
                # 이미 완료된 항목 건너뜀
                completion = mod.get("completiondata", {})
                if isinstance(completion, dict) and completion.get("state", 0) == 1:
                    continue
                due_ts  = mod.get("completionexpected", 0)
                due_date = ts_to_date(due_ts)
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

# ── GAS로 전송 ─────────────────────────────────────────────────────────
def push_to_gas(tasks):
    print(f"\n[GAS] {len(tasks)}개 항목을 Google Sheets에 전송 중...")
    success, fail = 0, 0
    for task in tasks:
        try:
            r = requests.post(GAS_URL, json={"action": "upsert", "sheet": "tasks", "data": task},
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

    # 환경변수(GitHub Actions) 또는 직접 입력
    username = os.environ.get("LEARNUS_ID") or input("\n  학번 (포털 ID): ").strip()
    password = os.environ.get("LEARNUS_PW") or getpass.getpass("  비밀번호: ")

    print("\n[1] 로그인...")
    token = get_token(username, password)

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
    print(f"  📚 {len(courses)}개: {', '.join(c['name'][:10] for c in courses)}")

    course_ids = [c["id"] for c in courses]

    print("[4] 과제 수집...")
    assignments = get_assignments(token, course_ids, courses_map)
    print(f"  📝 {len(assignments)}개")

    print("[5] 퀴즈/시험 수집...")
    quizzes = get_quizzes(token, course_ids, courses_map)
    print(f"  📖 {len(quizzes)}개")

    print("[6] 동영상 강의 수집...")
    videos = get_videos(token, courses)
    print(f"  🎬 {len(videos)}개")

    all_tasks = sorted(assignments + quizzes + videos, key=lambda t: t["due"])

    # 요약 출력
    print("\n" + "-" * 52)
    icon_map = {"assignment": "📝", "exam": "📖", "video": "🎬"}
    for t in all_tasks:
        days = (datetime.fromisoformat(t["due"]).date() - TODAY).days
        remaining = f"D-{days}" if days >= 0 else f"D+{-days}"
        print(f"  {icon_map.get(t['type'],'📌')} [{remaining:>4}] {t['subject'][:12]:<12} {t['title'][:28]}")
    print(f"\n  총 {len(all_tasks)}개 항목")

    # GAS 전송
    if all_tasks:
        push_to_gas(all_tasks)
    print("\n  🎉 완료! 앱이 다음 동기화 시 자동 반영됩니다.")

if __name__ == "__main__":
    main()
