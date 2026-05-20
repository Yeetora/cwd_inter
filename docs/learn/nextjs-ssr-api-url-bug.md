# Next.js SSR과 번들러의 함정 — `ERR_INVALID_URL` 추적기

> **TL;DR**
> Next.js의 서버 사이드 렌더링(SSR) 경로에서 백엔드 API를 호출하는 코드가
> `TypeError: Failed to parse URL from /api/site-info`로 터졌다.
> 원인은 모듈 로드 시점에 평가된 환경 분기를 번들러(Turbopack)가
> 죽은 코드로 판단해 잘라낸 것. 함수 호출로 감싸 **런타임 평가를 강제**해서 해결.

---

## 0. 누구를 위한 글인가

* 자바·스프링 같은 **서버 사이드 위주로 일해온 개발자**가
* Next.js 또는 다른 React 프레임워크에서 SSR 페이지를 처음 다룰 때
* "왜 똑같은 코드가 로컬에선 되는데 배포만 하면 깨지지?" 같은 상황을 만났다면

이 글의 사례가 거의 한 번씩은 겪는 입문 단계 함정이다.
백엔드 비유를 군데군데 끼워 넣어서 처음 보는 개념도 닻을 박을 수 있게 했다.

---

## 1. 배경: Next.js는 같은 코드가 두 환경에서 돈다

### 1-1. Spring과의 비교

스프링에서 `@RestController`가 붙은 클래스는 **JVM 안에서만** 실행된다.
클라이언트(브라우저, 모바일 앱)는 그 결과만 받는다. 코드의 실행 환경이 한 군데.

```
[Spring]
 Client ─── HTTP request ──▶ JVM(Server) ─── HTTP response ──▶ Client
                          (서버에서만 코드 실행)
```

Next.js는 다르다. 같은 `.tsx` 파일이 **두 환경에서 각각 한 번씩** 실행된다.

```
[Next.js — SSR + Hydration]
 1) Client request                  → Node.js 서버에서 컴포넌트 실행 (SSR)
 2) HTML + serialized data 전송      → Client
 3) Client가 같은 컴포넌트를 JS로 다시 실행 → 이벤트 핸들러 등록 (Hydration)
 4) 이후 라우팅·상호작용은 브라우저에서
```

이 모델은 **초기 로딩 시 SEO·LCP를 좋게** 하면서도 SPA의 부드러운 상호작용을
유지하려는 절충안이다. 부작용은 **"내가 쓴 한 줄의 코드가 서버에서도 돌고 브라우저에서도 돈다"**는 것.

### 1-2. 두 환경에서 사용 가능한 API가 다르다

| API | 서버(Node.js) | 브라우저 |
|---|---|---|
| `window`, `document` | ❌ | ✅ |
| `localStorage` | ❌ | ✅ |
| `fs`, `path` | ✅ | ❌ |
| `fetch` | ✅ (단, **절대 URL만**) | ✅ (상대·절대 다 가능) |
| `process.env` | ✅ | ❌ (빌드 시점 인라인된 값만) |

특히 마지막 두 줄이 우리 사례의 씨앗.

---

## 2. 사건의 시작 — 배포 후 홈이 500

### 2-1. 배포 자동화를 막 켠 직후

GitHub Actions에 CD 파이프라인을 붙이고 main에 머지하니
**빌드·배포는 그린, smoke test가 실패**.

```
✓ Set up job
✓ Checkout
✓ Set up JDK 21
✓ Set up Node 24
✓ Configure AWS credentials
✓ Deploy
✗ Smoke test
```

스모크 테스트는 단순했다.

```bash
curl -s -o /dev/null -w "%{http_code}" http://$EIP/api/health   # → 200 ✓
curl -s -o /dev/null -w "%{http_code}" http://$EIP/             # → 500 ✗
```

백엔드 헬스체크는 200인데 프런트 홈은 500.
백엔드는 살았고 프런트만 죽었다는 뜻.

### 2-2. EC2 로그 확인

SSM Send Command로 인스턴스의 frontend 로그를 끌어왔다.

```
⨯ TypeError: Failed to parse URL from /api/portfolios?category=RESIDENTIAL&page=0&size=3
    [cause]: TypeError: Invalid URL
        code: 'ERR_INVALID_URL',
        input: '/api/portfolios?category=RESIDENTIAL&page=0&size=3'

⨯ TypeError: Failed to parse URL from /api/site-info
    [cause]: TypeError: Invalid URL
        code: 'ERR_INVALID_URL',
        input: '/api/site-info'
```

`Invalid URL`. fetch에 절대 URL이 아니라 **상대 URL이 들어가서** 터졌다.

```ts
// 의도한 동작
await fetch("http://127.0.0.1:8080/api/site-info")  // 절대 URL ✓

// 실제 일어난 일
await fetch("/api/site-info")  // 상대 URL ✗ — Node fetch는 거부
```

스프링으로 비유하면 `RestTemplate`이나 `WebClient`에 `"/api/foo"`만 던지면
`URISyntaxException`이 나는 것과 같다. 절대 URL이 필요.

---

## 3. 환경 분기는 어떻게 동작했어야 하는가

### 3-1. 우리가 처음 작성한 코드

`lib/api/client.ts`:

```ts
function resolveApiBase(): string {
  if (typeof window === "undefined") {
    // 서버사이드 — Node fetch는 절대 URL 필요
    return process.env.API_BASE_INTERNAL ?? "http://127.0.0.1:8080";
  }
  // 클라이언트사이드 — 브라우저는 상대 URL도 OK
  return process.env.NEXT_PUBLIC_API_BASE ?? "";
}

export const API_BASE = resolveApiBase();
```

`typeof window === "undefined"`는 프런트 생태계의 **정석적인 SSR/CSR 분기 패턴**이다.

* 서버(Node.js)에는 `window` 전역이 없다 → `typeof window === "undefined"` → `true`
* 브라우저에는 `window`가 있다 → `"object"` → `false`

논리적으로 보면:

* SSR이 페이지 컴포넌트를 실행할 때 `resolveApiBase()` → `true` 분기 → `http://127.0.0.1:8080` 반환
* 브라우저에서 같은 모듈을 실행할 때 → `false` 분기 → `""` (상대 URL)
* 두 환경 모두 정상 동작해야 한다

### 3-2. 환경변수 의도

운영 EC2에서 backend는 같은 호스트의 8080 포트.
**프런트와 백엔드가 같은 인스턴스에 떠 있는 단일 EC2 구성**이라
SSR fetch는 그냥 localhost로 가면 된다.

```
/opt/chaeuda/env/frontend.env
─────────────────────────────
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1
NEXT_PUBLIC_API_BASE=             # 브라우저는 같은 origin → 상대 URL
API_BASE_INTERNAL=http://127.0.0.1:8080   # SSR은 절대 URL 필요
```

systemd unit 파일이 `EnvironmentFile=/opt/chaeuda/env/frontend.env`로 주입하므로
**Node.js 프로세스 입장에서 `process.env.API_BASE_INTERNAL`은 정상적으로 읽혀야** 한다.

확인해보니 EC2의 env 파일도 정상, systemd도 정상.
그런데 왜 SSR에서 `API_BASE`가 빈 문자열로 끝났는가?

---

## 4. 진짜 원인 — 번들러의 정적 치환

### 4-1. JS의 빌드 모델은 자바와 다르다

자바는 `.java` → `.class`로 컴파일해서 JVM이 그대로 들고 있다.
런타임에 `System.getenv("FOO")`를 호출하면 그때그때 OS 환경변수를 읽어온다.

JS는 다르다. Next.js는 **번들러(Webpack 또는 Turbopack)**가 모든 모듈을
**빌드 시점에 미리 합치고 압축한다**. 게다가 같은 코드로 **두 종류의 번들**을 만든다.

```
[Next.js Build]

src/lib/api/client.ts
       │
       ▼
   ┌───────────┐
   │ Bundler   │
   │ (Turbopack)
   └───┬───┬───┘
       │   │
       │   └────────▶ .next/server/...js     (Node.js에서 실행)
       │
       └────────────▶ .next/static/.../*.js  (브라우저로 다운로드돼서 실행)
```

이 두 번들을 만들 때 번들러는 각 환경에서 사용 가능한 코드만 남기려고 한다.
이걸 **트리 셰이킹**(tree shaking) 또는 **죽은 코드 제거**(DCE)라 부른다.

### 4-2. `typeof window`는 정적 치환의 단골 메뉴

번들러 입장에서 `typeof window === "undefined"`는 **결과를 미리 알 수 있는 표현**이다.

* **서버 번들**을 만들 때: "이 코드는 Node.js에서만 도니까 `window`는 항상 없음" → `typeof window === "undefined"`를 **`true`로 미리 치환**
* **브라우저 번들**을 만들 때: "여긴 항상 브라우저니까 `window` 있음" → **`false`로 치환**

그러고 나서 **반대편 분기는 죽은 코드라서 제거**.

예시 (브라우저 번들 결과):

```js
// 원본
function resolveApiBase() {
  if (typeof window === "undefined") {
    return process.env.API_BASE_INTERNAL ?? "http://127.0.0.1:8080";
  }
  return process.env.NEXT_PUBLIC_API_BASE ?? "";
}

// 브라우저 번들에서 치환 + DCE 적용된 결과
function resolveApiBase() {
  return "";   // NEXT_PUBLIC_API_BASE 값이 빌드 시점에 인라인됨 (빈 문자열)
}
```

여기까지는 정상. 문제는 **서버 번들**.

### 4-3. 서버 번들도 같은 치환을 당했다

이론대로라면 서버 번들에서는 `typeof window === "undefined"`가 `true`로 치환되고
서버 분기가 살아남아야 한다. 그런데 **실제로 결과물을 까보니** 서버 번들도
브라우저 번들과 비슷하게 SSR 분기가 사라지고 빈 문자열만 남아있었다.

원인 가설은 셋 정도:

1. Turbopack v16의 공격적 모듈 셰어링 — 클라이언트/서버 번들이 부분적으로 같은
   바이트코드를 공유하면서 `typeof window` 치환이 둘 중 한쪽 기준으로만 됨
2. 모듈 평가 시점 — `const API_BASE = resolveApiBase()`가 모듈 로드 시 1회만 평가되는데,
   그 시점에 `process.env`가 아직 비어있었거나 다른 환경에서 평가됨
3. 또는 둘의 조합

**원인 디테일보다 중요한 교훈은** 이거다.

> **빌드 시점에 한 번 평가되는 표현식**은 번들러의 최적화 대상이 되기 쉽고,
> 런타임에 기대한 분기를 잃을 수 있다.

자바로 굳이 비유하자면 GraalVM Native Image의 build-time vs run-time initialization 이슈와
비슷하다. 어떤 정적 필드가 빌드 타임에 한 번 평가되고 그 값이 native binary에 박혀버려서
런타임 환경변수를 못 읽는 그런 류의 함정.

---

## 5. 해결책 — 런타임 평가를 강제

### 5-1. 함수 호출로 감싸기

`API_BASE`를 모듈 상수로 두지 말고 **fetch할 때마다 함수를 호출**하게 바꿨다.

```ts
// 변경 전 — 모듈 로드 시 한 번만 평가됨 (번들러가 정적 치환 가능)
export const API_BASE = resolveApiBase();

export async function api(path) {
  return fetch(`${API_BASE}${path}`);  // ← 빌드 시점에 "" 박혀버림
}
```

```ts
// 변경 후 — 매 호출마다 평가 (번들러가 함수 호출 결과를 정적 치환할 수는 없음)
function resolveApiBase() {
  if (typeof window === "undefined") {
    return process.env.API_BASE_INTERNAL || "http://127.0.0.1:8080";
  }
  return process.env.NEXT_PUBLIC_API_BASE || "";
}

export async function api(path) {
  return fetch(`${resolveApiBase()}${path}`);  // 런타임 평가 강제
}
```

함수 본문은 번들러가 inline해서 정적 치환할 수도 있지만,
**서버 번들 컨텍스트에서 호출되는 시점에는 Node.js 런타임이 살아있고
`process.env`가 채워진 상태이므로** 의도대로 `API_BASE_INTERNAL` 값을 읽는다.

### 5-2. 서버 컴포넌트용 헬퍼 별도 분리

추가로 **명시적인 서버 전용 함수**를 export해서, 서버 컴포넌트에서
직접 fetch할 때 `typeof window` 분기 자체를 안 거치게 했다.

```ts
// SSR 페이지에서 직접 fetch할 때만 사용
export function serverApiBase(): string {
  return process.env.API_BASE_INTERNAL || "http://127.0.0.1:8080";
}
```

```ts
// app/admin/(protected)/layout.tsx (Server Component)
import { serverApiBase } from "@/lib/api/client";

async function fetchMe(cookieHeader: string) {
  const res = await fetch(`${serverApiBase()}/api/admin/auth/me`, { ... });
  // ...
}
```

이렇게 하면 번들러가 `typeof window`를 어떻게 치환하든 상관없이
**호출 시점에 함수 본문이 그대로 실행**된다.

### 5-3. 결과

머지 → 자동 배포 트리거 → 2분 후 smoke test 포함 전 라우트 200.
사이트 정상 동작.

```
/                       → 200
/admin/login            → 200
/project/residential    → 200
/api/health             → 200
/api/site-info          → 200
```

---

## 6. 교훈

### 6-1. 프런트 생태계의 멘탈 모델 차이

* 자바 백엔드: **빌드 결과물 = 실행 환경**. 한 번 빌드, 한 환경에서 실행.
* Next.js: **하나의 소스 = 두 환경**. 빌드 시점에 두 번 컴파일, 다른 두 런타임에서 실행.

이 차이를 머릿속에 박아두면 "어 이게 왜 안 되지?" 하는 상황이 줄어든다.

### 6-2. 환경 분기 패턴 모음

| 패턴 | 동작 |
|---|---|
| `typeof window === "undefined"` | 가장 흔함. 서버=true, 브라우저=false. **번들러 정적 치환 대상**. |
| `"use client"` 지시문 | 파일을 클라이언트 전용으로 강제. |
| `"use server"` 지시문 | Server Action 전용. |
| 파일명 컨벤션 | `*.server.tsx`, `*.client.tsx` (일부 프레임워크) |
| 환경변수 prefix | `NEXT_PUBLIC_*`는 브라우저 번들에 인라인, 그 외는 서버 전용 |

### 6-3. "모듈 로드 시 한 번 평가" 패턴은 위험 신호

```ts
const SOMETHING = resolveAtBuildTime();   // ⚠️ 빌드 시 정적 치환 가능
const SOMETHING_ELSE = process.env.X;     // ⚠️ 마찬가지
```

이런 코드는 번들러 최적화의 사정거리에 들어간다.
환경 의존적인 값이라면 **함수 호출로 감싸 런타임 평가를 강제**하는 게 안전하다.

### 6-4. 에러 메시지를 신뢰하라

`ERR_INVALID_URL` + `input: "/api/site-info"`는 **너무 정직한 에러 메시지**였다.
"상대 URL이 fetch에 들어왔다 → 환경 분기가 무력화됐다"까지 한 줄 추론으로 도달 가능.
백엔드 디버깅과 똑같이, **로그는 항상 가장 먼저 본다**.

### 6-5. CI에 스모크 테스트는 진짜 살린다

이 버그는 사실 배포 직전에는 알 수 없었다.
로컬 `npm run dev`에서는 멀쩡히 돌고, GitHub Actions 빌드도 그린.
**오직 실제 EC2에서 SSR이 도는 순간**에만 터졌다.

만약 CD 파이프라인에 `curl http://$EIP/` 한 줄짜리 스모크 테스트가 없었다면
배포 성공으로 표시된 채 사용자가 사이트 들어가서야 알게 됐을 것이다.

`smoke test`는 양은 적어도 **실제 사용자 첫 요청과 동일한 경로**를 한 번이라도
태우는 게 핵심.

---

## 7. 더 읽을거리

* [Next.js Docs — Server Components and Server Actions](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
* [Node.js fetch — requires absolute URL](https://nodejs.org/api/globals.html#fetch)
* [Tree shaking — MDN](https://developer.mozilla.org/docs/Glossary/Tree_shaking)
* [Why `process.env` in Next.js gets inlined at build time](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)

---

## 부록 — 관련 PR

* [Yeetora/cwd_inter#10](https://github.com/Yeetora/cwd_inter/pull/10) — 자동 배포 파이프라인을 처음 켠 PR (이 버그를 노출시킴)
* [Yeetora/cwd_inter#11](https://github.com/Yeetora/cwd_inter/pull/11) — 본 글이 다룬 수정 PR
