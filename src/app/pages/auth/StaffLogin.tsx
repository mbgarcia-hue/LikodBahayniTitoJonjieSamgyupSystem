import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router';
import { User, Lock, Eye, EyeOff, ArrowLeft, ChefHat, Receipt, Crown } from 'lucide-react';
import { api } from '../../lib/api';
import { useRestaurant } from '../../context/RestaurantContext';
import restaurantLogo from '@/imports/685301822_878436815273126_809105010315524518_n-removebg-preview.png';
export default function StaffLogin() {
  const location = useLocation(); const navigate = useNavigate(); const { refresh } = useRestaurant();
  const requested = location.pathname.split('/')[1];
  const role = requested === 'admin' ? 'owner' : requested;
  const title = role.charAt(0).toUpperCase() + role.slice(1);
  const Icon = role === 'kitchen' ? ChefHat : role === 'owner' ? Crown : Receipt;
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try { await api('/staff/login', { username: username.trim(), password, role }); await refresh(); navigate(role === 'kitchen' ? '/kitchen' : role === 'owner' ? '/owner' : '/cashier/billing', { replace: true }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="auth-page">
    <div className="auth-glow" aria-hidden="true" />
    <section className="auth-shell">
      <Link to="/" className="auth-back"><ArrowLeft size={16} /> Back to home</Link>
      <header className="auth-brand"><img src={restaurantLogo} alt="Likod Bahay ni Tito Jonjie logo" /><h1>Likod Bahay ni Tito Jonjie</h1><p>Samgyupsal</p></header>
      <div className="auth-card">
        <div className="auth-role-icon"><Icon size={24} /></div>
        <h2>{title} Login</h2><p className="auth-description">Sign in to your {role} account to continue.</p>
        <form onSubmit={signIn}>
          <label htmlFor="username">Username</label><div className="auth-input"><User size={18} aria-hidden="true" /><input id="username" name="username" autoComplete="username" placeholder="Enter your username" maxLength={100} required value={username} onChange={e => setUsername(e.target.value)} disabled={busy} /></div>
          <label htmlFor="password">Password</label><div className="auth-input"><Lock size={18} aria-hidden="true" /><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" maxLength={256} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /><button type="button" className="auth-reveal" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          {error && <p role="alert" className="auth-error">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        </form>
      </div>
      <nav className="auth-roles" aria-label="Choose staff login">{['cashier', 'kitchen', 'owner'].map(r => <Link key={r} to={`/${r}/login`} aria-current={role === r ? 'page' : undefined} onClick={() => { setUsername(''); setPassword(''); setError(''); }}>{r.charAt(0).toUpperCase() + r.slice(1)}</Link>)}</nav>
      <p className="auth-footer">Restaurant Management System</p>
    </section>
  </main>;
}
