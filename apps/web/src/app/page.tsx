"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getRoleHome, getSession, type SessionData } from "../lib/session";
import { roleLabel } from "../lib/display";
import styles from "./home.module.css";

export default function HomePage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);

  useEffect(() => {
    setSession(getSession());
    setSessionReady(true);
  }, []);

  const roleName = session ? roleLabel(session.user.role) : "";

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>V-Link</h1>
        <p className={styles.subtitle}>VAS 요청 접수부터 승인/배정, 작업 완료, SAP 연동까지 한 흐름으로 관리합니다.</p>
      </section>

      {!sessionReady && <p className={styles.loading}>세션 확인 중...</p>}

      {sessionReady && !session && (
        <section className={styles.grid}>
          <article className={styles.card}>
            <h2>빠른 시작</h2>
            <p>처음 사용자라면 회원가입 후 즉시 로그인되어 역할에 맞는 작업 화면으로 이동합니다.</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/signup">
                회원가입
              </Link>
              <Link className={styles.secondary} href="/login">
                로그인
              </Link>
            </div>
          </article>

          <article className={styles.card}>
            <h2>기본 업무 흐름</h2>
            <ol className={styles.steps}>
              <li>요청자가 요청서를 등록하고 첨부를 업로드합니다.</li>
              <li>관리자가 승인/반려와 업체 배정을 처리합니다.</li>
              <li>업체가 작업 시작/완료 처리 후 이력을 남깁니다.</li>
            </ol>
          </article>
        </section>
      )}

      {sessionReady && session && (
        <section className={styles.grid}>
          <article className={styles.card}>
            <h2>현재 로그인 정보</h2>
            <p>
              <strong>{session.user.email}</strong>
            </p>
            <p>역할: {roleName}</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href={getRoleHome(session.user.role)}>
                내 작업 화면으로 이동
              </Link>
            </div>
          </article>

          <article className={styles.card}>
            <h2>빠른 이동</h2>
            <div className={styles.actions}>
              {session.user.role === "ADMIN" && (
                <>
                  <Link className={styles.secondary} href="/dashboard">
                    대시보드
                  </Link>
                  <Link className={styles.secondary} href="/calendar">
                    캘린더
                  </Link>
                </>
              )}
              {session.user.role === "REQUESTER" && (
                <Link className={styles.secondary} href="/calendar">
                  캘린더
                </Link>
              )}
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
