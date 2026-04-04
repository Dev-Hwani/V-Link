"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./signup.module.css";
import { API_BASE } from "../../lib/api";
import { getRoleHome, getSession, setSession, type SessionData } from "../../lib/session";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"REQUESTER" | "VENDOR" | "ADMIN">("REQUESTER");
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
      const response = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          vendorCode: role === "VENDOR" ? vendorCode : undefined,
          vendorName: role === "VENDOR" ? vendorName : undefined,
          adminSignupCode: role === "ADMIN" ? adminSignupCode : undefined,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Signup failed");
      }

      const data = (await response.json()) as SessionData;
      setSession(data);
      router.push(getRoleHome(data.user.role));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signup error";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Create Requester Account</h1>
        <p className={styles.subtitle}>Public signup creates a REQUESTER account.</p>

        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.field}>
            <label htmlFor="name">Name</label>
            <input id="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
          </div>
          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="role">Role</label>
            <select id="role" value={role} onChange={(event) => setRole(event.target.value as "REQUESTER" | "VENDOR" | "ADMIN")}>
              <option value="REQUESTER">REQUESTER</option>
              <option value="VENDOR">VENDOR</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          {role === "VENDOR" && (
            <>
              <div className={styles.field}>
                <label htmlFor="vendorCode">Vendor Code</label>
                <input
                  id="vendorCode"
                  value={vendorCode}
                  onChange={(event) => setVendorCode(event.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="vendorName">Vendor Name</label>
                <input
                  id="vendorName"
                  value={vendorName}
                  onChange={(event) => setVendorName(event.target.value)}
                  required
                />
              </div>
            </>
          )}
          {role === "ADMIN" && (
            <div className={styles.field}>
              <label htmlFor="adminCode">Admin Signup Code</label>
              <input
                id="adminCode"
                value={adminSignupCode}
                onChange={(event) => setAdminSignupCode(event.target.value)}
                required
              />
            </div>
          )}
          <button className={styles.button} type="submit" disabled={loading}>
            {loading ? "Signing up..." : "Sign up"}
          </button>
        </form>

        {notice && <div className={styles.notice}>{notice}</div>}

        <div className={styles.linkRow}>
          Already have an account? <a href="/login">Login</a>
        </div>
      </section>
    </main>
  );
}
