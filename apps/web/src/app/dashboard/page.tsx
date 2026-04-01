"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import styles from "./dashboard.module.css";
import { apiJson } from "../../lib/api";
import { clearSession, getRoleHome, getSession } from "../../lib/session";

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
  const router = useRouter();
  const range = useMemo(() => defaultRange(), []);
  const [token, setToken] = useState("");
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }

    if (session.user.role !== "ADMIN") {
      router.replace(getRoleHome(session.user.role));
      return;
    }

    setToken(session.accessToken);
  }, [router]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadSummary(token, from, to);
  }, [token]);

  async function loadSummary(currentToken: string, currentFrom: string, currentTo: string) {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set("from", currentFrom);
      query.set("to", currentTo);

      const data = await apiJson<DashboardSummary>(`/dashboard/summary?${query.toString()}`, currentToken, {
        method: "GET",
      });
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

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.subtitle}>요청/업체/SAP 통계를 운영 관점으로 확인합니다.</p>
      </header>

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
          <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
            <button className={styles.button} type="button" onClick={logout}>
              로그아웃
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
    </main>
  );
}

