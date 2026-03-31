"use client";

import { FormEvent, useMemo, useState } from "react";

import styles from "./dashboard.module.css";

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "IN_PROGRESS" | "COMPLETED";
type SapStatus = "PENDING" | "SUCCESS" | "FAILED";

interface DashboardSummary {
  range: { from: string; to: string };
  requestStatus: Record<RequestStatus, number>;
  monthlyTrend: Array<{ month: string; count: number }>;
  vendorWorkload: Array<{
    vendorId: string;
    vendorName: string;
    vendorCode: string;
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
  }>;
  sapStatus: Record<SapStatus, number>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return {
    from: toDateString(from),
    to: toDateString(now),
  };
}

export default function DashboardPage() {
  const range = useMemo(() => defaultRange(), []);
  const [email, setEmail] = useState("admin@vlink.local");
  const [password, setPassword] = useState("admin1234");
  const [token, setToken] = useState("");
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  async function onLogin(event: FormEvent<HTMLFormElement>) {
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
        throw new Error("로그인 실패");
      }

      const data = (await response.json()) as { accessToken: string };
      setToken(data.accessToken);
      await loadSummary(data.accessToken, from, to);
    } catch (error) {
      const message = error instanceof Error ? error.message : "로그인 오류";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary(currentToken: string, currentFrom: string, currentTo: string) {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set("from", currentFrom);
      query.set("to", currentTo);

      const response = await fetch(`${API_BASE}/dashboard/summary?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "대시보드 조회 실패");
      }

      const data = (await response.json()) as DashboardSummary;
      setSummary(data);
      setNotice("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "대시보드 조회 오류";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  const maxTrend = Math.max(...(summary?.monthlyTrend.map((item) => item.count) ?? [1]));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.subtitle}>요청/업체/SAP 통계를 운영 관점으로 확인합니다.</p>
      </header>

      {!token && (
        <section className={styles.card}>
          <form className={styles.loginForm} onSubmit={onLogin}>
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
              {loading ? "로그인 중..." : "관리자 로그인"}
            </button>
          </form>
        </section>
      )}

      {token && (
        <section className={styles.grid}>
          <article className={styles.card}>
            {notice && <div className={styles.notice}>{notice}</div>}
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="from">From</label>
                <input id="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="to">To</label>
                <input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: "10px" }}>
              <button
                className={styles.button}
                type="button"
                disabled={loading}
                onClick={() => {
                  void loadSummary(token, from, to);
                }}
              >
                통계 새로고침
              </button>
            </div>
          </article>

          {summary && (
            <>
              <article className={styles.card}>
                <h2>요청 상태</h2>
                <div className={styles.statusCards}>
                  {Object.entries(summary.requestStatus).map(([key, value]) => (
                    <div key={key} className={styles.statusCard}>
                      <p className={styles.statusLabel}>{key}</p>
                      <p className={styles.statusValue}>{value}</p>
                    </div>
                  ))}
                </div>
              </article>

              <section className={`${styles.grid} ${styles.rowTwo}`}>
                <article className={styles.card}>
                  <h2>월별 요청 추이</h2>
                  <div className={styles.barList}>
                    {summary.monthlyTrend.map((row) => (
                      <div key={row.month} className={styles.barRow}>
                        <span>{row.month}</span>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${(row.count / maxTrend) * 100}%` }} />
                        </div>
                        <span>{row.count}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className={styles.card}>
                  <h2>SAP 잡 상태</h2>
                  <div className={styles.statusCards}>
                    {Object.entries(summary.sapStatus).map(([key, value]) => (
                      <div key={key} className={styles.statusCard}>
                        <p className={styles.statusLabel}>{key}</p>
                        <p className={styles.statusValue}>{value}</p>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              <article className={styles.card}>
                <h2>업체별 작업량</h2>
                <div className={styles.vendorList}>
                  {summary.vendorWorkload.map((vendor) => (
                    <div key={vendor.vendorId} className={styles.vendorCard}>
                      <strong>
                        {vendor.vendorName} ({vendor.vendorCode})
                      </strong>
                      <span>Total: {vendor.total}</span>
                      <span>Pending: {vendor.pending}</span>
                      <span>In Progress: {vendor.inProgress}</span>
                      <span>Completed: {vendor.completed}</span>
                    </div>
                  ))}
                  {summary.vendorWorkload.length === 0 && <p>데이터가 없습니다.</p>}
                </div>
              </article>
            </>
          )}
        </section>
      )}
    </main>
  );
}

