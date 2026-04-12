"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./login.module.css";
import { API_BASE } from "../../lib/api";
import { getRoleHome, getSession, setSession, type SessionData } from "../../lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const session = getSession();
    if (session) {
      router.replace(getRoleHome(session.user.role));
    }
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice("");

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "로그인에 실패했습니다.");
      }

      const data = (await response.json()) as SessionData;
      setSession(data);
      router.push(getRoleHome(data.user.role));
    } catch (error) {
      const message = error instanceof Error ? error.message : "로그인 중 오류가 발생했습니다.";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>V-Link 로그인</h1>
        <p className={styles.subtitle}>로그인 후 역할에 맞는 작업 화면으로 자동 이동합니다.</p>

        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.field}>
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호를 입력하세요"
              required
            />
          </div>
          <button className={styles.button} type="submit" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        {notice && <div className={styles.notice}>{notice}</div>}

        <div className={styles.linkRow}>
          계정이 없나요? <a href="/signup">회원가입</a>
        </div>
      </section>
    </main>
  );
}
