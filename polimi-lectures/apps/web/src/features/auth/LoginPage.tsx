import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, KeyRound, Lock, ShieldCheck, User } from 'lucide-react';
import { services } from '@/services';
import { config } from '@/config';
import { toAppError } from '@/lib/errors';
import { Button, Input } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { useAuth } from './AuthContext';

type Step = { kind: 'credentials' } | { kind: 'otp'; challengeId: string; hint?: string };

export function LoginPage() {
  const { session, setSession } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';

  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [personCode, setPersonCode] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  if (session) return <Navigate to={from} replace />;

  async function submitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      const res = await services.auth.startLogin(personCode.trim(), password);
      setPassword(''); // never keep the password around longer than needed
      if (res.type === 'authenticated') {
        setSession(res.session);
        navigate(from, { replace: true });
      } else setStep({ kind: 'otp', challengeId: res.challengeId, hint: res.hint });
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      setLoading(false);
    }
  }

  async function submitOtp(e: FormEvent) {
    e.preventDefault();
    if (step.kind !== 'otp') return;
    setError(undefined);
    setLoading(true);
    try {
      const s = await services.auth.verifyOtp(step.challengeId, otp);
      setSession(s);
      navigate(from, { replace: true });
    } catch (err) {
      const appErr = toAppError(err);
      setError(appErr.message);
      setOtp('');
      if (appErr.code === 'OTP_EXPIRED') setStep({ kind: 'credentials' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="absolute -bottom-40 -right-32 size-[520px] rounded-full bg-brand-500/30 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Logo className="size-9" />
          <span className="text-[15px] font-semibold tracking-tight">Polimi Lectures</span>
        </div>
        <div className="relative mt-auto max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Every lecture, searchable and in sync.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-brand-100/80">
            Watch your course recordings with AI-generated transcripts that follow along, jump to any moment with a click, and ask questions about what was said.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-6 text-sm">
            {[['Synced', 'transcripts'], ['Search', 'every word'], ['Ask', 'the lecture']].map(([a, b]) => (
              <div key={a}><div className="font-semibold">{a}</div><div className="text-brand-100/70">{b}</div></div>
            ))}
          </div>
        </div>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo className="size-8" />
            <span className="font-semibold">Polimi Lectures</span>
          </div>

          {step.kind === 'credentials' ? (
            <form onSubmit={submitCredentials} noValidate>
              <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
              <p className="mt-1.5 text-sm text-slate-500">Use your Politecnico di Milano credentials.</p>

              <div className="mt-8 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-slate-700">Person code</span>
                  <Input icon={<User className="size-4" />} inputMode="numeric" autoComplete="username" placeholder="e.g. 10712345" value={personCode} onChange={(e) => setPersonCode(e.target.value)} invalid={!!error} autoFocus required />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-slate-700">Password</span>
                  <Input icon={<Lock className="size-4" />} type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!error} required />
                </label>
              </div>
              {error && <FormError msg={error} />}
              <Button type="submit" className="mt-6 w-full" loading={loading} disabled={!personCode || !password}>
                {loading ? 'Signing in…' : 'Continue'}
              </Button>
            </form>
          ) : (
            <form onSubmit={submitOtp} noValidate>
              <button type="button" onClick={() => { setStep({ kind: 'credentials' }); setError(undefined); setOtp(''); }} className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800">
                <ArrowLeft className="size-3.5" /> Back
              </button>
              <div className="mb-5 grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><ShieldCheck className="size-5" /></div>
              <h2 className="text-2xl font-semibold tracking-tight">Two-step verification</h2>
              <p className="mt-1.5 text-sm text-slate-500">{step.hint ?? 'Enter the verification code to continue.'}</p>
              <label className="mt-8 block">
                <span className="mb-1.5 block text-[13px] font-medium text-slate-700">One-time code</span>
                <Input
                  icon={<KeyRound className="size-4" />} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" autoFocus
                  className="font-mono text-base tracking-[0.4em]" value={otp} invalid={!!error}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>
              {error && <FormError msg={error} />}
              <Button type="submit" className="mt-6 w-full" loading={loading} disabled={otp.length !== 6}>
                {loading ? 'Verifying…' : 'Verify and sign in'}
              </Button>
            </form>
          )}

          {config.useMocks && (
            <div className="mt-8 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-800">
              <strong>Demo mode</strong> — no real Polimi login. Use any 8-digit person code and a 6+ character password, then any 6-digit code (<code>000000</code> fails, password <code>wrongpass</code> fails).
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function FormError({ msg }: { msg: string }) {
  return (
    <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
      <AlertCircle className="mt-px size-4 shrink-0" /> {msg}
    </p>
  );
}
