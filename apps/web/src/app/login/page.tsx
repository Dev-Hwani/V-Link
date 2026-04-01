"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./login.module.css";
import { API_BASE } from "../../lib/api";
import { getRoleHome, setSession, type SessionData } from "../../lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@vlink.local");
  const [password, setPassword] = useState("admin1234");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

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
        throw new Error(text || "로그인 실패");
      }

      const data = (await response.json()) as SessionData;
      setSession(data);
      router.push(getRoleHome(data.user.role));
    } catch (error) {
      const message = error instanceof Error ? error.message : "로그인 오류";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>V-Link Login</h1>
        <p className={styles.subtitle}>로그인 후 권한에 맞는 작업 화면으로 이동합니다.</p>

        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input id="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button className={styles.button} type="submit" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        {notice && <div className={styles.notice}>{notice}</div>}
      </section>
    </main>
  );
}

