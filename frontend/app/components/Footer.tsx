import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-24 bg-[linear-gradient(to_bottom,var(--background)_0%,var(--surface-warm)_40%,var(--surface-warm)_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <Image
              src="/chaeuda-logo.png"
              alt="채우다 by design"
              width={1536}
              height={1024}
              className="h-32 w-auto"
            />
          </div>

          <div className="text-sm">
            <div className="font-medium">Contact</div>
            <ul className="mt-3 space-y-1 text-muted">
              <li>전화: 000-0000-0000</li>
              <li>이메일: hello@example.com</li>
              <li>주소: 서울시 ○○구 ○○로 ○○</li>
            </ul>
          </div>

          <div className="text-sm">
            <div className="font-medium">Menu</div>
            <ul className="mt-3 space-y-1 text-muted">
              <li><Link href="/about" className="hover:text-foreground">About</Link></li>
              <li><Link href="/project/residential" className="hover:text-foreground">주거공간</Link></li>
              <li><Link href="/project/commercial" className="hover:text-foreground">상업공간</Link></li>
              <li><Link href="/process" className="hover:text-foreground">Process</Link></li>
              <li><Link href="/contact" className="hover:text-foreground">Contact</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border-warm pt-6 text-xs text-muted">
          © {new Date().getFullYear()} 채우다 by design. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
