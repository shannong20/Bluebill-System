'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui';
import { IconDroplet } from '@/components/ui/Icons';

const DEMO = { email: 'ana@aquapure.ph', password: 'password123' };

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState(DEMO.email);
  const [password, setPassword] = useState(DEMO.password);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Already signed in → skip the form.
  useEffect(() => {
    if (!loading && isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, loading, router]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__head">
          <div className="login-card__logo">
            <IconDroplet size={28} style={{ color: '#fff' }} />
          </div>
          <h1 className="login-card__title">Bluebill</h1>
          <p className="login-card__sub">Refilling Station Management</p>
        </div>

        <div className="login-card__body">
          <form onSubmit={submit}>
            {error && <div className="error-box">{error}</div>}

            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@aquapure.ph"
              required
            />

            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            <div style={{ marginTop: 20 }}>
              <Button
                type="submit"
                variant="action"
                size="lg"
                loading={busy}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </div>
          </form>

          <div className="login-hint">
            Demo account — <code>{DEMO.email}</code> / <code>{DEMO.password}</code>
            <br />
            Run <code>npm run seed</code> in <code>server/</code> first.
          </div>
        </div>
      </div>
    </div>
  );
}
