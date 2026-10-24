import { Logo, ModeBanner, ThemeToggle } from '@aureon/ui';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <ModeBanner mode={process.env.NEXT_PUBLIC_OPERATING_MODE ?? 'sandbox'} />
      <div className="grid flex-1 lg:grid-cols-[1.05fr_1fr]">
        <section className="relative hidden overflow-hidden bg-[#0f1b2d] p-12 text-[#ece7dc] lg:flex lg:flex-col">
          <Link href="/" className="[&_*]:!text-[#ece7dc]"><Logo /></Link>
          <div className="my-auto max-w-md">
            <p className="display text-[40px] leading-[1.1]">Considered investing, <span className="text-[#d4b27a]">globally.</span></p>
            <p className="mt-5 text-[15px] leading-relaxed text-[#ece7dc]/70">
              Build a portfolio of listed stocks and ETFs with transparent pricing. Accounts, custody and execution are provided by our licensed brokerage partner.
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-6 border-t border-white/10 pt-6 text-[12.5px] text-[#ece7dc]/60">
            <div><dt>Custody</dt><dd className="mt-1 text-[#ece7dc]">Licensed partner</dd></div>
            <div><dt>Security</dt><dd className="mt-1 text-[#ece7dc]">MFA required</dd></div>
            <div><dt>Pricing</dt><dd className="mt-1 text-[#ece7dc]">Published fees</dd></div>
          </dl>
          <svg className="pointer-events-none absolute -right-24 top-24 opacity-[0.07]" width="520" height="520" viewBox="0 0 100 100" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => <circle key={i} cx="50" cy="50" r={6 + i * 5.5} fill="none" stroke="#d4b27a" strokeWidth="0.3" />)}
          </svg>
        </section>
        <section className="flex flex-col px-5 py-8 sm:px-10">
          <div className="flex items-center justify-between">
            <Link href="/" className="lg:invisible"><Logo /></Link>
            <ThemeToggle compact />
          </div>
          <div className="mx-auto my-auto w-full max-w-[400px] py-10">{children}</div>
        </section>
      </div>
    </div>
  );
}
