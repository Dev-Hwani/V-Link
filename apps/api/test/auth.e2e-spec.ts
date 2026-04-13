import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app-bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";

interface CreatedAccount {
  email: string;
  password: string;
}

function randomEmail(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}@example.com`;
}

function readCookieFromSetCookie(setCookieHeader: string | string[] | undefined, cookieName: string) {
  if (!setCookieHeader) {
    return "";
  }

  const setCookie = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const prefix = `${cookieName}=`;
  const match = setCookie.find((cookie) => cookie.startsWith(prefix));
  if (!match) {
    return "";
  }

  return decodeURIComponent(match.split(";")[0].slice(prefix.length));
}

describe("Auth E2E", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let createdEmails: string[] = [];

  beforeAll(async () => {
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = "100";
    process.env.AUTH_SIGNUP_RATE_LIMIT_MAX_ATTEMPTS = "100";

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({
        where: {
          email: {
            in: createdEmails,
          },
        },
      });
    }

    await app.close();
  });

  async function signupAccount(prefix: string): Promise<CreatedAccount> {
    const password = "Strong!234";
    const email = randomEmail(prefix);

    const response = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({
        email,
        password,
        name: "E2E User",
        role: "REQUESTER",
      })
      .expect(201);

    expect(response.body.user.email).toBe(email);
    createdEmails.push(email);

    return { email, password };
  }

  it("회원가입이 성공하고 인증 쿠키를 발급한다", async () => {
    const email = randomEmail("signup");

    const response = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({
        email,
        password: "Strong!234",
        name: "Signup User",
        role: "REQUESTER",
      })
      .expect(201);

    createdEmails.push(email);

    expect(response.body.user.email).toBe(email);
    expect(typeof response.body.sessionId).toBe("string");

    const setCookie = response.headers["set-cookie"];
    expect(readCookieFromSetCookie(setCookie, "access_token")).not.toBe("");
    expect(readCookieFromSetCookie(setCookie, "refresh_token")).not.toBe("");
    expect(readCookieFromSetCookie(setCookie, "csrf_token")).not.toBe("");
  });

  it("로그인 후 쿠키 인증으로 /auth/me 조회가 가능하다", async () => {
    const account = await signupAccount("login");
    const agent = request.agent(app.getHttpServer());

    const loginResponse = await agent
      .post("/auth/login")
      .send({
        email: account.email,
        password: account.password,
      })
      .expect(201);

    expect(loginResponse.body.user.email).toBe(account.email);
    expect(typeof loginResponse.body.sessionId).toBe("string");

    const meResponse = await agent.get("/auth/me").expect(200);
    expect(meResponse.body.user.email).toBe(account.email);
  });

  it("리프레시는 CSRF 헤더와 함께 성공한다", async () => {
    const account = await signupAccount("refresh");
    const agent = request.agent(app.getHttpServer());

    const loginResponse = await agent
      .post("/auth/login")
      .send({
        email: account.email,
        password: account.password,
      })
      .expect(201);

    const csrfToken = readCookieFromSetCookie(loginResponse.headers["set-cookie"], "csrf_token");
    expect(csrfToken).not.toBe("");

    const refreshResponse = await agent
      .post("/auth/refresh")
      .set("x-csrf-token", csrfToken)
      .send({})
      .expect(201);

    expect(refreshResponse.body.user.email).toBe(account.email);
    expect(typeof refreshResponse.body.sessionId).toBe("string");
  });

  it("CSRF 헤더 없이 보호된 POST 요청은 차단된다", async () => {
    const account = await signupAccount("csrf_block");
    const agent = request.agent(app.getHttpServer());

    await agent
      .post("/auth/login")
      .send({
        email: account.email,
        password: account.password,
      })
      .expect(201);

    const blockedResponse = await agent.post("/auth/logout").send({}).expect(403);
    expect(blockedResponse.body.message).toBe("Invalid CSRF token");
  });

  it("CSRF 헤더를 포함한 로그아웃 후 세션이 만료된다", async () => {
    const account = await signupAccount("logout");
    const agent = request.agent(app.getHttpServer());

    const loginResponse = await agent
      .post("/auth/login")
      .send({
        email: account.email,
        password: account.password,
      })
      .expect(201);

    const csrfToken = readCookieFromSetCookie(loginResponse.headers["set-cookie"], "csrf_token");

    await agent
      .post("/auth/logout")
      .set("x-csrf-token", csrfToken)
      .send({})
      .expect(201);

    await agent.get("/auth/me").expect(401);
  });
});
