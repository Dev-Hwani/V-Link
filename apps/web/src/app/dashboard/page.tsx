"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import styles from "./dashboard.module.css";
import { API_BASE, apiJson } from "../../lib/api";
import { requestStatusLabel, requestTypeLabel, sapStatusLabel } from "../../lib/display";
import { getRoleHome, getSession } from "../../lib/session";

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "IN_PROGRESS" | "COMPLETED";
type SapStatus = "PENDING" | "SUCCESS" | "FAILED";
type ExportFormat = "csv" | "xlsx";

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

interface RequestRow {
  id: string;
  title: string;
  requestType: string;
  description: string;
  status: RequestStatus;
  dueDate: string;
  createdAt: string;
  requester: {
    id: string;
    name: string;
    email: string;
  };
  assignedVendor: {
    id: string;
    code: string;
    name: string;
  } | null;
  attachmentCount: number;
}

interface AppliedDashboardFilter {
  from: string;
  to: string;
  statusFilter: RequestStatus | "";
}

interface RequestTableResponse {
  count: number;
  items: RequestRow[];
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

function filenameFromDisposition(disposition: string | null, fallback: string) {
  if (!disposition) {
    return fallback;
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallback;
}

export default function DashboardPage() {
  const router = useRouter();
  const range = useMemo(() => defaultRange(), []);
  const [token, setToken] = useState("");
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "">("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | "">("");
  const [appliedFilter, setAppliedFilter] = useState<AppliedDashboardFilter>({
    from: range.from,
    to: range.to,
    statusFilter: "",
  });
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [tableRows, setTableRows] = useState<RequestRow[]>([]);

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
    void loadDashboard(token, from, to, statusFilter);
  }, [token]);

  async function loadDashboard(currentToken: string, currentFrom: string, currentTo: string, currentStatus: RequestStatus | "") {
    setLoading(true);
    try {
      const summaryQuery = new URLSearchParams();
      summaryQuery.set("from", currentFrom);
      summaryQuery.set("to", currentTo);

      const tableQuery = new URLSearchParams();
      tableQuery.set("from", currentFrom);
      tableQuery.set("to", currentTo);
      tableQuery.set("limit", "500");
      if (currentStatus) {
        tableQuery.set("status", currentStatus);
      }

      const [summaryData, tableData] = await Promise.all([
        apiJson<DashboardSummary>(`/dashboard/summary?${summaryQuery.toString()}`, currentToken, {
          method: "GET",
        }),
        apiJson<RequestTableResponse>(`/requests/admin/table?${tableQuery.toString()}`, currentToken, {
          method: "GET",
        }),
      ]);

      setSummary(summaryData);
      setTableRows(tableData.items);
      setAppliedFilter({
        from: currentFrom,
        to: currentTo,
        statusFilter: currentStatus,
      });
      setNotice("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "대시보드 조회에 실패했습니다.";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  async function exportTable(format: ExportFormat) {
    if (!token) {
      return;
    }

    setExporting(format);
    setNotice("");
    try {
      const query = new URLSearchParams();
      query.set("from", appliedFilter.from);
      query.set("to", appliedFilter.to);
      if (appliedFilter.statusFilter) {
        query.set("status", appliedFilter.statusFilter);
      }
      query.set("format", format);

      const response = await fetch(`${API_BASE}/requests/admin/export?${query.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `내보내기 실패 (HTTP ${response.status})`);
      }

      const blob = await response.blob();
      const defaultName = `vas-dashboard.${format}`;
      const fileName = filenameFromDisposition(response.headers.get("content-disposition"), defaultName);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "파일 내보내기에 실패했습니다.";
      setNotice(message);
    } finally {
      setExporting("");
    }
  }

  const maxTrend = Math.max(...(summary?.monthlyTrend.map((item) => item.count) ?? [1]));

  const operationalKpi = useMemo(() => {
    let open = 0;
    let overdue = 0;
    let unassigned = 0;

    const now = new Date();
    tableRows.forEach((row) => {
      if (row.status === "PENDING" || row.status === "APPROVED" || row.status === "IN_PROGRESS") {
        open += 1;
      }
      if (!row.assignedVendor) {
        unassigned += 1;
      }
      if (new Date(row.dueDate) < now && (row.status === "PENDING" || row.status === "APPROVED" || row.status === "IN_PROGRESS")) {
        overdue += 1;
      }
    });

    return { open, overdue, unassigned };
  }, [tableRows]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>대시보드</h1>
        <p className={styles.subtitle}>VAS 전체 현황 요약과 상세 표를 동시에 확인하고 즉시 내보낼 수 있습니다.</p>
      </header>

      <section className={styles.grid}>
        <article className={styles.card}>
          {notice && <div className={styles.notice}>{notice}</div>}
          <div className={styles.filterRow}>
            <div className={styles.field}>
              <label htmlFor="from">시작일</label>
              <input id="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div className={styles.field}>
              <label htmlFor="to">종료일</label>
              <input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
            <div className={styles.field}>
              <label htmlFor="status">상태 필터</label>
              <select
                id="status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as RequestStatus | "")}
              >
                <option value="">전체</option>
                <option value="PENDING">대기</option>
                <option value="APPROVED">승인</option>
                <option value="IN_PROGRESS">진행 중</option>
                <option value="COMPLETED">완료</option>
                <option value="REJECTED">반려</option>
              </select>
            </div>
          </div>
          <div className={styles.actions}>
            <button
              className={styles.button}
              type="button"
              disabled={loading}
              onClick={() => {
                void loadDashboard(token, from, to, statusFilter);
              }}
            >
              {loading ? "불러오는 중..." : "통계 새로고침"}
            </button>
            <button
              className={`${styles.button} ${styles.secondary}`}
              type="button"
              onClick={() => void exportTable("xlsx")}
              disabled={loading || exporting !== ""}
            >
              {exporting === "xlsx" ? "XLSX 생성 중..." : "XLSX 내보내기"}
            </button>
            <button
              className={`${styles.button} ${styles.secondary}`}
              type="button"
              onClick={() => void exportTable("csv")}
              disabled={loading || exporting !== ""}
            >
              {exporting === "csv" ? "CSV 생성 중..." : "CSV 내보내기"}
            </button>
          </div>
        </article>

        <section className={`${styles.grid} ${styles.kpiGrid}`}>
          <article className={styles.card}>
            <p className={styles.statusLabel}>열린 작업</p>
            <p className={styles.kpiValue}>{operationalKpi.open}</p>
          </article>
          <article className={styles.card}>
            <p className={styles.statusLabel}>지연 작업</p>
            <p className={styles.kpiValue}>{operationalKpi.overdue}</p>
          </article>
          <article className={styles.card}>
            <p className={styles.statusLabel}>미배정</p>
            <p className={styles.kpiValue}>{operationalKpi.unassigned}</p>
          </article>
          <article className={styles.card}>
            <p className={styles.statusLabel}>조회 건수</p>
            <p className={styles.kpiValue}>{tableRows.length}</p>
          </article>
        </section>

        {summary && (
          <>
            <article className={styles.card}>
              <h2>요청 상태</h2>
              <div className={styles.statusCards}>
                {Object.entries(summary.requestStatus).map(([key, value]) => (
                  <div key={key} className={styles.statusCard}>
                    <p className={styles.statusLabel}>{requestStatusLabel(key)}</p>
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
                      <p className={styles.statusLabel}>{sapStatusLabel(key)}</p>
                      <p className={styles.statusValue}>{value}</p>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <article className={styles.card}>
              <h2>업체 작업량</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>업체</th>
                      <th>전체</th>
                      <th>대기</th>
                      <th>진행 중</th>
                      <th>완료</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.vendorWorkload.map((vendor) => (
                      <tr key={vendor.vendorId}>
                        <td>
                          {vendor.vendorName} ({vendor.vendorCode})
                        </td>
                        <td>{vendor.total}</td>
                        <td>{vendor.pending}</td>
                        <td>{vendor.inProgress}</td>
                        <td>{vendor.completed}</td>
                      </tr>
                    ))}
                    {summary.vendorWorkload.length === 0 && (
                      <tr>
                        <td colSpan={5} className={styles.emptyRow}>
                          집계 데이터가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <article className={styles.card}>
              <h2>VAS 상세 표</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>제목</th>
                      <th>상태</th>
                      <th>요청유형</th>
                      <th>요청자</th>
                      <th>현재 배정 업체</th>
                      <th>마감일</th>
                      <th>상세 설명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.title}</td>
                        <td>{requestStatusLabel(row.status)}</td>
                        <td>{requestTypeLabel(row.requestType)}</td>
                        <td>{row.requester.name}</td>
                        <td>{row.assignedVendor?.name ?? "-"}</td>
                        <td>{new Date(row.dueDate).toLocaleDateString()}</td>
                        <td>{row.description || "-"}</td>
                      </tr>
                    ))}
                    {tableRows.length === 0 && (
                      <tr>
                        <td colSpan={7} className={styles.emptyRow}>
                          조회된 데이터가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </>
        )}
      </section>
    </main>
  );
}
