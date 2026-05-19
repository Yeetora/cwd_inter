import { API_BASE } from "./client";
import type {
  Category,
  PageResponse,
  PortfolioDetail,
  PortfolioListItem,
} from "./types";

export type AdjacentResponse = {
  previous: { id: number; title: string } | null;
  next: { id: number; title: string } | null;
};

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export const publicApi = {
  listPortfolios: (category: Category, page = 0, size = 12) =>
    getJson<PageResponse<PortfolioListItem>>(
      `/api/portfolios?category=${category}&page=${page}&size=${size}`
    ),

  getPortfolio: (id: number) => getJson<PortfolioDetail>(`/api/portfolios/${id}`),

  getAdjacent: (id: number, category: Category) =>
    getJson<AdjacentResponse>(`/api/portfolios/${id}/adjacent?category=${category}`),
};
