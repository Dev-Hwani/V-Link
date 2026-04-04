"use client";

import { useEffect, useState } from "react";

import { getRoleHome, getSession } from "../lib/session";

export default function HomePage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionRoleHome, setSessionRoleHome] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session) {
      setSessionRoleHome(getRoleHome(session.user.role));
      setSessionEmail(session.user.email);
      setSessionRole(session.user.role);
    } else {
      setSessionRoleHome(null);
      setSessionEmail(null);
      setSessionRole(null);
    }
    setSessionReady(true);
  }, []);

  return (
    <main style={{ padding: "24px", fontFamily: "\"Pretendard\", \"Noto Sans KR\", sans-serif" }}>
      <h1>V-Link</h1>
      {!sessionReady && <p>로딩 중...</p>}
      {sessionReady && !sessionRoleHome && (
        <>
          <p>로그인 또는 회원가입 후 역할에 맞는 화면으로 이동하세요.</p>
          <ul>
            <li>
              <a href="/login">Login</a>
            </li>
            <li>
              <a href="/signup">Signup</a>
            </li>
          </ul>
        </>
      )}

      {sessionReady && sessionRoleHome && (
        <>
          <p>
            현재 로그인: <strong>{sessionEmail}</strong> ({sessionRole})
          </p>
          <ul>
            <li>
              <a href={sessionRoleHome}>내 작업 화면으로 이동</a>
            </li>
          </ul>
        </>
      )}
    </main>
  );
}
