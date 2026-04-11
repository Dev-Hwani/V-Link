"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./vendor.module.css";
import { apiJson } from "../../lib/api";
import { requestStatusLabel, requestTypeLabel } from "../../lib/display";
import { notifyRequestsUpdated } from "../../lib/realtime";
import { getRoleHome, getSession } from "../../lib/session";

type RequestStatus = "PENDING" | "APPROVED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";

interface VendorInfo {
  id: string;
  name: string;
  code: string;
}

interface RequestSummary {
  id: string;
  title: string;
  requestType: string;
  team: string;
  dueDate: string;
  description: string | null;
  status: RequestStatus;
  assignedVendor: VendorInfo | null;
}

interface RequestDetail extends RequestSummary {
  createdAt: string;
  completedAt: string | null;
  rejectedReason: string | null;
  attachments: Array<{ id: string; originalName: string; path: string; createdAt: string }>;
  histories: Array<{ id: string; toStatus: RequestStatus; reason: string | null; createdAt: string }>;
}

export default function VendorPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<RequestDetail | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const selectedStatus = selected?.status ?? "PENDING";
  const canStart = selectedStatus === "APPROVED";
  const canComplete = selectedStatus === "APPROVED" || selectedStatus === "IN_PROGRESS";

  const selectedStatusClass = useMemo(() => {
    return `${styles.badge} ${styles[selectedStatus] ?? styles.PENDING}`;
  }, [selectedStatus]);
  const summary = useMemo(() => {
    const base = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
    };

    requests.forEach((item) => {
      base[item.status] += 1;
    });

    return base;
  }, [requests]);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }

    if (session.user.role !== "VENDOR") {
      router.replace(getRoleHome(session.user.role));
      return;
    }

    setToken(session.accessToken);
  }, [router]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadRequests(token);
  }, [token]);

  useEffect(() => {
    if (!token || !selectedId) {
      return;
    }
    void loadDetail(token, selectedId);
  }, [token, selectedId]);

  async function loadRequests(currentToken: string) {
    setLoading(true);
    try {
      const data = await apiJson<RequestSummary[]>("/requests", currentToken, { method: "GET" });
      setRequests(data);

      if (data.length === 0) {
        setSelectedId("");
        setSelected(null);
        setNotice("현재 배정된 작업이 없습니다.");
      } else if (!selectedId || !data.some((item) => item.id === selectedId)) {
        setSelectedId(data[0].id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "목록 조회에 실패했습니다.";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(currentToken: string, requestId: string) {
    try {
      const data = await apiJson<RequestDetail>(`/requests/${requestId}`, currentToken, { method: "GET" });
      setSelected(data);
      setNote("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "상세 조회에 실패했습니다.";
      setNotice(message);
    }
  }

  async function startWork() {
    if (!token || !selectedId) {
      return;
    }

    setLoading(true);
    try {
      await apiJson(`/requests/${selectedId}/start`, token, { method: "PATCH" });
      await loadRequests(token);
      await loadDetail(token, selectedId);
      setNotice("작업 시작 처리 완료");
      notifyRequestsUpdated();
    } catch (error) {
      const message = error instanceof Error ? error.message : "작업 시작 처리에 실패했습니다.";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  async function completeWork() {
    if (!token || !selectedId) {
      return;
    }

    setLoading(true);
    try {
      await apiJson(`/requests/${selectedId}/complete`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      await loadRequests(token);
      await loadDetail(token, selectedId);
      setNotice("작업 완료 처리 완료");
      notifyRequestsUpdated();
    } catch (error) {
      const message = error instanceof Error ? error.message : "작업 완료 처리에 실패했습니다.";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>업체 작업 화면</h1>
        <p className={styles.subtitle}>배정된 작업 확인 후 시작/완료 상태를 업데이트합니다.</p>
      </header>

      <section className={styles.summaryRow}>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>승인 대기 작업</span>
          <strong>{summary.APPROVED}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>진행 중 작업</span>
          <strong>{summary.IN_PROGRESS}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>완료 작업</span>
          <strong>{summary.COMPLETED}</strong>
        </article>
      </section>

      {token && (
        <section className={styles.grid}>
          <article className={styles.card}>
            <h2 className={styles.sectionTitle}>배정 목록</h2>
            {notice && <div className={styles.notice}>{notice}</div>}
            <div className={styles.list}>
              {requests.map((request) => {
                const activeClass = request.id === selectedId ? styles.itemActive : "";
                return (
                  <button
                    key={request.id}
                    type="button"
                    className={`${styles.item} ${activeClass}`}
                    onClick={() => setSelectedId(request.id)}
                  >
                    <div className={styles.rowTop}>
                      <p className={styles.requestTitle}>{request.title}</p>
                      <span className={`${styles.badge} ${styles[request.status]}`}>{requestStatusLabel(request.status)}</span>
                    </div>
                    <p className={styles.meta}>
                      {requestTypeLabel(request.requestType)} / {request.team} / 마감{" "}
                      {new Date(request.dueDate).toLocaleDateString()}
                    </p>
                  </button>
                );
              })}
              {requests.length === 0 && <p>배정된 요청이 없습니다.</p>}
            </div>
          </article>

          <article className={styles.card}>
            <h2 className={styles.sectionTitle}>작업 상세</h2>
            {!selected && <p>왼쪽 목록에서 요청을 선택하세요.</p>}
            {selected && (
              <>
                <div className={styles.detailRows}>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>제목</span>
                    {selected.title}
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>상태</span>
                    <span className={selectedStatusClass}>{requestStatusLabel(selected.status)}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>유형 / 팀</span>
                    {requestTypeLabel(selected.requestType)} / {selected.team}
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>마감일</span>
                    {new Date(selected.dueDate).toLocaleString()}
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>업체</span>
                    {selected.assignedVendor?.name ?? "-"}
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>설명</span>
                    {selected.description ?? "-"}
                  </div>
                </div>

                <div className={styles.field}>
                  <label htmlFor="note">완료 메모</label>
                  <textarea
                    id="note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="완료 메모를 입력하세요"
                  />
                </div>

                <div className={styles.actions}>
                  <button className={styles.button} type="button" onClick={() => void loadRequests(token)} disabled={loading}>
                    목록 새로고침
                  </button>
                  <button
                    className={`${styles.button} ${styles.buttonAlt}`}
                    type="button"
                    onClick={startWork}
                    disabled={!canStart || loading}
                  >
                    시작 처리
                  </button>
                  <button
                    className={`${styles.button} ${styles.buttonGhost}`}
                    type="button"
                    onClick={completeWork}
                    disabled={!canComplete || loading}
                  >
                    완료 처리
                  </button>
                </div>

                <h3 className={styles.sectionTitle} style={{ marginTop: "16px" }}>
                  상태 이력
                </h3>
                <ol className={styles.timeline}>
                  {selected.histories.map((history) => (
                    <li key={history.id}>
                      {requestStatusLabel(history.toStatus)} / {new Date(history.createdAt).toLocaleString()}
                      {history.reason ? ` / ${history.reason}` : ""}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </article>
        </section>
      )}
    </main>
  );
}
