"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./sessions.module.css";
import { ApiRequestError, apiJson } from "../../lib/api";
import { clearSession, getRoleHome, getSession } from "../../lib/session";

interface SessionItem {
  id: string;
  sessionId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

interface SessionsResponse {
  count: number;
  currentSessionId: string | null;
  items: SessionItem[];
}

interface LogoutSessionResponse {
  success: boolean;
  sessionId: string;
  revokedCount: number;
  loggedOutCurrentSession: boolean;
}

function formatDateTime(value: string) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString("ko-KR");
}

function compactSessionId(value: string) {
  if (!value) {
    return "-";
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export default function SessionsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<SessionItem[]>([]);
  const [count, setCount] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [loggingOutSessionId, setLoggingOutSessionId] = useState("");

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }

    if (!["ADMIN", "REQUESTER", "VENDOR"].includes(session.user.role)) {
      router.replace(getRoleHome(session.user.role));
      return;
    }

    setToken(session.accessToken);
  }, [router]);

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadSessions(token);
  }, [token]);

  async function loadSessions(currentToken: string) {
    setLoading(true);
    setNotice("");

    try {
      const data = await apiJson<SessionsResponse>("/auth/sessions", currentToken, {
        method: "GET",
      });

      setRows(data.items);
      setCount(data.count);
      setCurrentSessionId(data.currentSessionId);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        clearSession();
        router.replace("/login");
        return;
      }

      const message = error instanceof Error ? error.message : "세션 목록 조회에 실패했습니다.";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  async function logoutAllSessions() {
    if (!token || loggingOutAll) {
      return;
    }

    const confirmed = window.confirm("모든 세션을 종료하시겠습니까? 현재 브라우저도 로그아웃됩니다.");
    if (!confirmed) {
      return;
    }

    setLoggingOutAll(true);
    setNotice("");

    try {
      await apiJson<{ success: boolean; revokedCount: number }>("/auth/logout-all", token, {
        method: "POST",
      });

      clearSession();
      router.replace("/login");
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        clearSession();
        router.replace("/login");
        return;
      }

      const message = error instanceof Error ? error.message : "전체 로그아웃 처리에 실패했습니다.";
      setNotice(message);
      setLoggingOutAll(false);
    }
  }

  async function logoutOneSession(sessionId: string) {
    if (!token || loggingOutSessionId) {
      return;
    }

    const isCurrent = currentSessionId === sessionId;
    const confirmed = window.confirm(
      isCurrent
        ? "현재 세션을 로그아웃하시겠습니까?"
        : "선택한 세션을 로그아웃하시겠습니까? 해당 기기에서 자동 로그아웃됩니다.",
    );
    if (!confirmed) {
      return;
    }

    setLoggingOutSessionId(sessionId);
    setNotice("");

    try {
      const result = await apiJson<LogoutSessionResponse>("/auth/logout-session", token, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });

      if (result.loggedOutCurrentSession) {
        clearSession();
        router.replace("/login");
        return;
      }

      setNotice("선택한 세션을 로그아웃했습니다.");
      await loadSessions(token);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        clearSession();
        router.replace("/login");
        return;
      }

      const message = error instanceof Error ? error.message : "개별 세션 로그아웃에 실패했습니다.";
      setNotice(message);
    } finally {
      setLoggingOutSessionId("");
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>내 세션</h1>
        <p className={styles.subtitle}>로그인된 세션을 확인하고, 필요 시 세션별 또는 전체 로그아웃을 실행할 수 있습니다.</p>
      </header>

      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.metaLabel}>활성 세션 수</p>
            <p className={styles.metaValue}>{count}</p>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="button" disabled={loading} onClick={() => void loadSessions(token)}>
              {loading ? "조회 중..." : "새로고침"}
            </button>
            <button
              className={`${styles.button} ${styles.danger}`}
              type="button"
              disabled={loggingOutAll || loading || loggingOutSessionId !== ""}
              onClick={() => void logoutAllSessions()}
            >
              {loggingOutAll ? "처리 중..." : "모든 기기 로그아웃"}
            </button>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>세션 ID</th>
                <th>디바이스(UA)</th>
                <th>IP</th>
                <th>생성 시각</th>
                <th>마지막 사용</th>
                <th>만료 시각</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const isCurrent = currentSessionId === item.sessionId;
                const busy = loggingOutSessionId === item.sessionId;

                return (
                  <tr key={item.id} className={isCurrent ? styles.currentRow : ""}>
                    <td title={item.sessionId}>
                      <span className={styles.sessionIdCell}>{compactSessionId(item.sessionId)}</span>
                      {isCurrent && <span className={styles.currentBadge}>현재</span>}
                    </td>
                    <td>{item.userAgent ?? "-"}</td>
                    <td>{item.ipAddress ?? "-"}</td>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>{formatDateTime(item.lastUsedAt)}</td>
                    <td>{formatDateTime(item.expiresAt)}</td>
                    <td>
                      <button
                        type="button"
                        className={`${styles.button} ${styles.small} ${styles.danger}`}
                        disabled={loading || loggingOutAll || (loggingOutSessionId !== "" && !busy)}
                        onClick={() => void logoutOneSession(item.sessionId)}
                      >
                        {busy ? "처리 중..." : "세션 로그아웃"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.emptyRow}>
                    활성 세션이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
