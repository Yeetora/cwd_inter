"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SiteInfo } from "@/lib/api/types";
import { adminApi, imageSrc } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";

export default function SiteInfoForm({ initial }: { initial: SiteInfo | null }) {
  const router = useRouter();
  const [companyPhone, setCompanyPhone] = useState(initial?.companyPhone ?? "");
  const [companyEmail, setCompanyEmail] = useState(initial?.companyEmail ?? "");
  const [companyAddress, setCompanyAddress] = useState(initial?.companyAddress ?? "");
  const [businessHours, setBusinessHours] = useState(initial?.businessHours ?? "");
  const [heroUrl, setHeroUrl] = useState<string | null>(initial?.heroImageUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function onSubmitContact(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const updated = await adminApi.updateSiteInfo({
        companyPhone: companyPhone.trim() || null,
        companyEmail: companyEmail.trim() || null,
        companyAddress: companyAddress.trim() || null,
        businessHours: businessHours.trim() || null,
      });
      setHeroUrl(updated.heroImageUrl);
      setMsg("연락처 정보가 저장되었습니다.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function onUploadHero(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const updated = await adminApi.uploadHeroImage(file);
      setHeroUrl(updated.heroImageUrl);
      setMsg("히어로 이미지가 업데이트되었습니다.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "업로드 실패");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDeleteHero() {
    if (!confirm("히어로 이미지를 삭제하시겠습니까?")) return;
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const updated = await adminApi.deleteHeroImage();
      setHeroUrl(updated.heroImageUrl);
      setMsg("히어로 이미지가 삭제되었습니다.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10 max-w-2xl">
      {/* ── 히어로 이미지 ── */}
      <section className="bg-white border border-neutral-200 p-6">
        <h2 className="text-sm font-medium tracking-[0.2em] text-neutral-500 uppercase">
          홈 메인 배너 (Hero)
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          홈 페이지 최상단에 노출되는 이미지. 권장 비율 2.5:1 (예: 1920×768).
        </p>

        <div className="mt-4">
          {heroUrl ? (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc(heroUrl) ?? ""}
                alt="현재 히어로 이미지"
                className="w-full max-h-64 object-cover border border-neutral-200"
              />
              <div className="flex gap-2">
                <label className="border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 cursor-pointer">
                  교체
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={onUploadHero}
                    disabled={busy}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={onDeleteHero}
                  disabled={busy}
                  className="border border-red-300 text-red-600 px-4 py-2 text-sm hover:bg-red-50 disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </div>
          ) : (
            <label className="block border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 cursor-pointer hover:bg-neutral-50">
              이미지 선택 (jpg/png/webp, 최대 10MB)
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onUploadHero}
                disabled={busy}
                className="hidden"
              />
            </label>
          )}
        </div>
      </section>

      {/* ── 연락처 정보 ── */}
      <form onSubmit={onSubmitContact} className="bg-white border border-neutral-200 p-6 space-y-5">
        <h2 className="text-sm font-medium tracking-[0.2em] text-neutral-500 uppercase">
          연락처 (Footer 표시)
        </h2>

        <Field label="전화번호" value={companyPhone} onChange={setCompanyPhone} placeholder="02-1234-5678" />
        <Field label="이메일" value={companyEmail} onChange={setCompanyEmail} placeholder="hello@example.com" type="email" />
        <Field label="주소" value={companyAddress} onChange={setCompanyAddress} placeholder="서울시 ○○구 ○○로 ○○" />
        <Field label="운영시간" value={businessHours} onChange={setBusinessHours} placeholder="평일 10:00 - 18:00" />

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="border border-foreground bg-foreground text-background px-6 py-2 text-sm hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "저장 중..." : "연락처 저장"}
          </button>
        </div>
      </form>

      {msg && <p className="text-sm text-emerald-600">{msg}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs tracking-[0.2em] text-neutral-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-foreground"
      />
    </div>
  );
}
