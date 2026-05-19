export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

export class ApiError extends Error {
  status: number;
  code?: string;
  validationErrors?: { field: string; message: string }[];

  constructor(status: number, message: string, code?: string, validationErrors?: { field: string; message: string }[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.validationErrors = validationErrors;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const init: RequestInit = {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(headers as Record<string, string> | undefined),
    },
    ...rest,
  };
  if (body !== undefined) {
    init.body = body instanceof FormData ? body : JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, init);
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const message = (json && typeof json === "object" && "message" in json && typeof json.message === "string")
      ? json.message
      : `HTTP ${res.status}`;
    const code = (json && typeof json === "object" && "error" in json && typeof json.error === "string")
      ? json.error
      : undefined;
    const validationErrors = (json && typeof json === "object" && "validationErrors" in json && Array.isArray(json.validationErrors))
      ? json.validationErrors as { field: string; message: string }[]
      : undefined;
    throw new ApiError(res.status, message, code, validationErrors);
  }
  return json as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 서버 컴포넌트에서 호출할 때 클라이언트 쿠키를 백엔드로 전달. */
export async function apiServer<T = unknown>(path: string, cookieHeader: string, options: RequestOptions = {}): Promise<T> {
  return api<T>(path, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      Cookie: cookieHeader,
    },
  });
}
