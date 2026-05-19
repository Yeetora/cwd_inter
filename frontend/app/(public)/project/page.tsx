import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Project" };

export default function ProjectIndexPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-28">
      <p className="text-xs tracking-[0.3em] text-muted">PROJECT</p>
      <h1 className="mt-4 text-3xl font-light md:text-4xl">포트폴리오</h1>
      <p className="mt-4 max-w-2xl text-muted">
        주거와 상업, 두 영역에서 진행한 프로젝트들을 확인하실 수 있습니다.
      </p>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <Link
          href="/project/residential"
          className="group relative aspect-[4/3] overflow-hidden bg-neutral-100"
        >
          <div className="absolute inset-0 flex flex-col items-start justify-end p-8 transition-colors group-hover:bg-black/5">
            <div className="text-xs tracking-[0.2em] text-muted">RESIDENTIAL</div>
            <div className="mt-2 text-2xl font-light md:text-3xl">주거공간 →</div>
          </div>
        </Link>
        <Link
          href="/project/commercial"
          className="group relative aspect-[4/3] overflow-hidden bg-neutral-100"
        >
          <div className="absolute inset-0 flex flex-col items-start justify-end p-8 transition-colors group-hover:bg-black/5">
            <div className="text-xs tracking-[0.2em] text-muted">COMMERCIAL</div>
            <div className="mt-2 text-2xl font-light md:text-3xl">상업공간 →</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
