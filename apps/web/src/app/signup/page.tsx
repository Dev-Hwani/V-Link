"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./signup.module.css";
import { API_BASE } from "../../lib/api";
import { createCookieSession, getRoleHome, getSession, setSession, type SessionUser } from "../../lib/session";

type SignupRole = "REQUESTER" | "VENDOR" | "ADMIN";

function parseApiErrorMessage(raw: string, fallback: string) {
  if (!raw.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(parsed.message) && parsed.message.length > 0) {
      return parsed.message.map((item) => String(item)).join(", ");
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    // noop
  }

  return raw;
}

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const lowered = error.message.toLowerCase();
    if (lowered.includes("failed to fetch") || lowered.includes("networkerror")) {
      return "API 서버에 연결할 수 없습니다. API 서버가 실행 중인지 확인해 주세요. (http://localhost:4000/health)";
    }
    return error.message;
  }

  return fallback;
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<SignupRole>("REQUESTER");
  const [vendorCode, setVendorCode] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [adminSignupCode, setAdminSignupCode] = useState("");
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
      const payload = {
        name,
        email,
        password,
        role,
        vendorCode: role === "VENDOR" ? vendorCode : undefined,
        vendorName: role === "VENDOR" ? vendorName : undefined,
        adminSignupCode: role === "ADMIN" ? adminSignupCode : undefined,
      };

      const response = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      if (!response.ok) {
        const raw = await response.text();
        throw new Error(parseApiErrorMessage(raw, "회원가입에 실패했습니다."));
      }

      const data = (await response.json()) as { user?: SessionUser };
      if (!data.user) {
        throw new Error("회원가입 응답이 올바르지 않습니다.");
      }
      setSession(createCookieSession({ user: data.user }));
      router.push(getRoleHome(data.user.role));
    } catch (error) {
      setNotice(resolveErrorMessage(error, "회원가입 중 오류가 발생했습니다."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>V-Link 회원가입</h1>
        <p className={styles.subtitle}>역할을 선택해 계정을 만들고, 완료 즉시 자동 로그인됩니다.</p>

        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.field}>
            <label htmlFor="name">이름</label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="이름을 입력하세요"
              required
              minLength={2}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              type="email"
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
              required
              minLength={8}
              placeholder="8자 이상 입력하세요"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="role">역할</label>
            <select id="role" value={role} onChange={(event) => setRole(event.target.value as SignupRole)}>
              <option value="REQUESTER">요청자 (REQUESTER)</option>
              <option value="VENDOR">업체 사용자 (VENDOR)</option>
              <option value="ADMIN">관리자 (ADMIN)</option>
            </select>
          </div>

          {role === "VENDOR" && (
            <>
              <div className={styles.field}>
                <label htmlFor="vendorCode">업체 코드</label>
                <input
                  id="vendorCode"
                  value={vendorCode}
                  onChange={(event) => setVendorCode(event.target.value)}
                  placeholder="예: DEVELOPMENT-CO-001"
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="vendorName">업체명</label>
                <input
                  id="vendorName"
                  value={vendorName}
                  onChange={(event) => setVendorName(event.target.value)}
                  placeholder="예: Development Co"
                  required
                />
              </div>
            </>
          )}

          {role === "ADMIN" && (
            <div className={styles.field}>
              <label htmlFor="adminCode">관리자 가입 코드</label>
              <input
                id="adminCode"
                value={adminSignupCode}
                onChange={(event) => setAdminSignupCode(event.target.value)}
                placeholder="관리자 가입 코드를 입력하세요"
                required
              />
            </div>
          )}

          <button className={styles.button} type="submit" disabled={loading}>
            {loading ? "회원가입 중..." : "회원가입"}
          </button>
        </form>

        {notice && <div className={styles.notice}>{notice}</div>}

        <div className={styles.linkRow}>
          이미 계정이 있나요? <a href="/login">로그인</a>
        </div>
      </section>
    </main>
  );
}
