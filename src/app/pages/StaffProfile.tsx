import { useState, useEffect } from 'react';
import { User, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';
type Profile = { username: string; fullName: string; email: string; phone: string; role: string };
export default function StaffProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentPassword, setCurrent] = useState(''); const [newPassword, setNew] = useState(''); const [confirmPassword, setConfirm] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { api('/staff/me').then(data => setProfile(data.user)).catch(e => setError(e.message)); }, []);
  const input = 'w-full rounded-lg border border-amber-600/40 bg-[#1A1210] px-4 py-3 text-amber-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-600/30';
  const label = 'block text-sm text-amber-200/80 mb-2';
  if (!profile) return <main className="dining"><p>{error || 'Loading profile…'}</p></main>;
  return <main className="p-6 md:p-8 text-amber-100"><h1 className="text-3xl font-bold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Profile Settings</h1><p className="text-amber-500/60 mt-2 mb-8">Manage your account information and password</p><div className="max-w-2xl space-y-6">
    <form className="rounded-xl bg-[#252018] border border-amber-600/30 p-6 md:p-8 space-y-5" onSubmit={async e => { e.preventDefault(); setBusy(true); try { const data = await api('/staff/profile', { fullName: profile.fullName, email: profile.email, phone: profile.phone }, 'PATCH'); setProfile(data.user); toast.success('Profile saved'); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>
      <div className="flex items-center gap-4"><div className="rounded-full bg-amber-700/50 p-4"><User size={28} /></div><div><h2 className="text-xl font-semibold text-amber-300">{profile.username}</h2><p className="capitalize text-amber-500/80">{profile.role}</p></div></div>
      {(['fullName', 'email', 'phone'] as const).map(field => <div key={field}><label htmlFor={field} className={label}>{field === 'fullName' ? 'Full name' : field === 'email' ? 'Email address' : 'Phone number'}</label><input id={field} className={input} type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'} required={field === 'fullName'} maxLength={field === 'fullName' ? 100 : field === 'email' ? 200 : 40} value={profile[field]} onChange={e => setProfile({ ...profile, [field]: e.target.value })} /></div>)}
      <button disabled={busy} className="auth-submit">Save changes</button>
    </form>
    <form className="rounded-xl bg-[#252018] border border-amber-600/30 p-6 md:p-8 space-y-5" onSubmit={async e => { e.preventDefault(); if (newPassword !== confirmPassword) { toast.error('New passwords do not match'); return; } setBusy(true); try { await api('/staff/password', { currentPassword, newPassword }); setCurrent(''); setNew(''); setConfirm(''); toast.success('Password changed. Other sessions have been signed out.'); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}><h2 className="text-xl text-amber-300 font-semibold flex items-center gap-2"><Lock size={20} /> Change password</h2>
      <div><label htmlFor="currentPassword" className={label}>Current password</label><input id="currentPassword" type="password" autoComplete="current-password" className={input} required maxLength={256} value={currentPassword} onChange={e => setCurrent(e.target.value)} /></div>
      <div><label htmlFor="newPassword" className={label}>New password (at least 8 characters)</label><input id="newPassword" type="password" autoComplete="new-password" className={input} required minLength={8} maxLength={256} value={newPassword} onChange={e => setNew(e.target.value)} /></div>
      <div><label htmlFor="confirmPassword" className={label}>Confirm new password</label><input id="confirmPassword" type="password" autoComplete="new-password" className={input} required minLength={8} maxLength={256} value={confirmPassword} onChange={e => setConfirm(e.target.value)} /></div><button className="auth-submit" disabled={busy}>Update password</button>
    </form></div></main>;
}
