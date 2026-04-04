"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./requester.module.css";
import { API_BASE, apiJson } from "../../lib/api";
import { getRoleHome, getSession } from "../../lib/session";

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "IN_PROGRESS" | "COMPLETED";

interface RequestItem {
  id: string;
  title: string;
  requestType: string;
  team: string;
  dueDate: string;
  description: string | null;
  status: RequestStatus;
}

export default function RequesterPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const [requestType, setRequestType] = useState("LABELING");
  const [title, setTitle] = useState("");
  const [team, setTeam] = useState("OPS");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }

    if (session.user.role !== "REQUESTER") {
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

  async function loadRequests(currentToken: string) {
    setLoading(true);
    try {
      const data = await apiJson<RequestItem[]>("/requests", currentToken, { method: "GET" });
      setRequests(data);
      if (data.length > 0 && !data.some((item) => item.id === selectedId)) {
        setSelectedId(data[0].id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "요청 목록 조회 오류";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setLoading(true);
    setNotice("");
    try {
      const created = await apiJson<RequestItem>("/requests", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType,
          title,
          dueDate: new Date(`${dueDate}T00:00:00.000Z`).toISOString(),
          team,
          description,
        }),
      });

      setSelectedId(created.id);

      if (file) {
        const form = new FormData();
        form.append("file", file);
        const uploadResponse = await fetch(`${API_BASE}/requests/${created.id}/attachments`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        });

        if (!uploadResponse.ok) {
          const text = await uploadResponse.text();
          throw new Error(text || "첨부 업로드 실패");
        }
      }

      await loadRequests(token);

      setTitle("");
      setDescription("");
      setFile(null);
      setNotice("요청 생성 완료");
    } catch (error) {
      const message = error instanceof Error ? error.message : "요청 생성 오류";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Requester Console</h1>
        <p className={styles.subtitle}>요청 생성, 첨부 업로드, 요청 상태 확인이 가능합니다.</p>
      </header>

      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2 className={styles.sectionTitle}>요청 생성</h2>
          <form onSubmit={createRequest}>
            <div className={styles.field}>
              <label htmlFor="type">작업 종류</label>
              <input id="type" value={requestType} onChange={(event) => setRequestType(event.target.value)} required />
            </div>
            <div className={styles.field}>
              <label htmlFor="title">제목</label>
              <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} required />
            </div>
            <div className={styles.field}>
              <label htmlFor="team">팀</label>
              <input id="team" value={team} onChange={(event) => setTeam(event.target.value)} required />
            </div>
            <div className={styles.field}>
              <label htmlFor="dueDate">납기</label>
              <input id="dueDate" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
            </div>
            <div className={styles.field}>
              <label htmlFor="desc">상세 내용</label>
              <textarea id="desc" value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div className={styles.field}>
              <label htmlFor="file">첨부 파일</label>
              <input
                id="file"
                type="file"
                onChange={(event) => {
                  const fileTarget = event.target.files?.[0] ?? null;
                  setFile(fileTarget);
                }}
              />
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={loading}>
                요청 등록
              </button>
            </div>
          </form>
        </article>

        <article className={styles.card}>
          <h2 className={styles.sectionTitle}>내 요청 목록</h2>
          <div className={styles.actions}>
            <button className={styles.button} type="button" onClick={() => void loadRequests(token)} disabled={loading}>
              새로고침
            </button>
          </div>
          <div className={styles.list}>
            {requests.map((item) => (
              <div
                key={item.id}
                className={styles.item}
                style={{
                  borderColor: item.id === selectedId ? "#2f6ddd" : undefined,
                  boxShadow: item.id === selectedId ? "0 0 0 2px rgba(47, 109, 221, 0.2)" : undefined,
                }}
                onClick={() => setSelectedId(item.id)}
              >
                <strong>{item.title}</strong>
                <div className={styles.meta}>
                  {item.status} / {item.requestType} / {item.team} / {new Date(item.dueDate).toLocaleDateString()}
                </div>
                <div className={styles.meta}>{item.description ?? "-"}</div>
              </div>
            ))}
            {requests.length === 0 && <p>요청이 없습니다.</p>}
          </div>
        </article>
      </section>
    </main>
  );
}
