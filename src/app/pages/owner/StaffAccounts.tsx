import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, UserPlus, Users } from 'lucide-react';
import { api } from '../../lib/api';

type StaffAccount = { id: string; username: string; role: 'cashier' | 'kitchen'; fullName: string; email: string; phone: string };
type ResetRequest = { id: string; createdAt: string; username: string; role: 'cashier' | 'kitchen'; fullName: string };
type AccountData = { accounts: StaffAccount[]; resetRequests: ResetRequest[] };

const fieldClass = 'w-full rounded-lg border border-amber-600/40 bg-[#1A1210] px-4 py-3 text-amber-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-600/30';
const labelClass = 'mb-2 block text-sm text-amber-200/80';

export default function OwnerStaffAccounts() {
  const [data, setData] = useState<AccountData>({ accounts: [], resetRequests: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [showInitialPassword, setShowInitialPassword] = useState(false);
  const [showResetPasswords, setShowResetPasswords] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const result = await api('/staff/accounts');
    setData(result);
  }, []);

  useEffect(() => {
    refresh().catch(e => setError((e as Error).message)).finally(() => setLoading(false));
  }, [refresh]);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setError(''); setNotice(''); setBusy(true);
    try {
      await api('/staff/accounts', {
        username: values.get('username'),
        password: values.get('password'),
        role: values.get('role'),
        fullName: values.get('fullName'),
        email: values.get('email'),
        phone: values.get('phone'),
      });
      form.reset();
      await refresh();
      setNotice('Staff account created. Share the username and password with the staff member in person.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>, request: ResetRequest) {
    event.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    try {
      await api(`/staff/password-reset-requests/${request.id}/reset`, { password: passwords[request.id] });
      setPasswords(current => ({ ...current, [request.id]: '' }));
      await refresh();
      setNotice(`Password reset for ${request.username}. Share the temporary password with them in person.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="p-6 text-amber-100 md:p-8">
    <header className="mb-8">
      <h1 className="text-3xl font-bold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Staff Accounts</h1>
      <p className="mt-2 text-amber-500/60">Create cashier and kitchen logins, and help staff recover access.</p>
    </header>

    {error && <p role="alert" className="mb-5 rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-red-200">{error}</p>}
    {notice && <p role="status" className="mb-5 rounded-lg border border-green-500/40 bg-green-950/30 p-4 text-green-200">{notice}</p>}

    <div className="grid gap-6 xl:grid-cols-2">
      <form className="space-y-5 rounded-xl border border-amber-600/30 bg-[#252018] p-6 shadow-md md:p-8" onSubmit={createAccount}>
        <h2 className="flex items-center gap-2 text-xl font-semibold text-amber-300"><UserPlus size={21} /> Create a staff account</h2>
        <div>
          <label htmlFor="role" className={labelClass}>Account type</label>
          <select id="role" name="role" className={fieldClass} defaultValue="cashier">
            <option value="cashier">Cashier</option><option value="kitchen">Kitchen</option>
          </select>
        </div>
        <div>
          <label htmlFor="fullName" className={labelClass}>Full name</label>
          <input id="fullName" name="fullName" className={fieldClass} required maxLength={100} />
        </div>
        <div>
          <label htmlFor="username" className={labelClass}>Username</label>
          <input id="username" name="username" className={fieldClass} required minLength={3} maxLength={40} pattern="[A-Za-z0-9._-]+" autoComplete="off" />
          <p className="mt-1 text-xs text-amber-500/60">Use 3–40 letters, numbers, dots, underscores, or hyphens.</p>
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>Initial password</label>
          <div className="relative">
            <input id="password" name="password" type={showInitialPassword ? 'text' : 'password'} className={`${fieldClass} pr-12`} required minLength={8} maxLength={256} autoComplete="new-password" />
            <button type="button" className="absolute inset-y-0 right-0 flex items-center px-4 text-amber-400/70 hover:text-amber-300" aria-label={showInitialPassword ? 'Hide initial password' : 'Show initial password'} aria-pressed={showInitialPassword} onClick={() => setShowInitialPassword(show => !show)}>
              {showInitialPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>Email (optional)</label>
          <input id="email" name="email" type="email" className={fieldClass} maxLength={200} />
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>Phone number (optional)</label>
          <input id="phone" name="phone" type="tel" className={fieldClass} maxLength={40} />
        </div>
        <button className="auth-submit" disabled={busy}>{busy ? 'Saving…' : 'Create account'}</button>
      </form>

      <section className="space-y-6">
        <div className="rounded-xl border border-amber-600/30 bg-[#252018] p-6 shadow-md md:p-8">
          <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold text-amber-300"><Users size={21} /> Staff accounts</h2>
          {loading ? <p role="status" className="text-amber-200/70">Loading accounts…</p> : data.accounts.length === 0
            ? <p className="text-amber-200/60">No cashier or kitchen accounts have been created.</p>
            : <ul className="divide-y divide-amber-600/20">
              {data.accounts.map(account => <li key={account.id} className="py-4 first:pt-0 last:pb-0">
                <p className="font-medium text-amber-100">{account.fullName} <span className="text-sm font-normal capitalize text-amber-400/70">· {account.role}</span></p>
                <p className="mt-1 text-sm text-amber-200/70">Username: {account.username}</p>
                {(account.email || account.phone) && <p className="mt-1 text-sm text-amber-500/60">{[account.email, account.phone].filter(Boolean).join(' · ')}</p>}
              </li>)}
            </ul>}
        </div>

        <div className="rounded-xl border border-amber-600/30 bg-[#252018] p-6 shadow-md md:p-8">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold text-amber-300"><KeyRound size={21} /> Password recovery requests</h2>
          <p className="mb-5 text-sm text-amber-500/70">Reset a staff member’s password here, then give them the temporary password in person. Their existing sessions will be signed out.</p>
          {loading ? <p role="status" className="text-amber-200/70">Loading requests…</p> : data.resetRequests.length === 0
            ? <p className="text-amber-200/60">No pending password reset requests.</p>
            : <ul className="space-y-5">
              {data.resetRequests.map(request => <li key={request.id} className="rounded-lg border border-amber-600/20 bg-[#1A1210] p-4">
                <p className="font-medium text-amber-100">{request.fullName} <span className="text-sm font-normal capitalize text-amber-400/70">· {request.role}</span></p>
                <p className="mt-1 text-sm text-amber-200/70">Username: {request.username}</p>
                <p className="mt-1 text-xs text-amber-500/60">Requested {new Date(request.createdAt).toLocaleString()}</p>
                <form className="mt-4" onSubmit={event => resetPassword(event, request)}>
                  <label htmlFor={`reset-${request.id}`} className={labelClass}>Temporary password (at least 8 characters)</label>
                  <div className="relative">
                    <input id={`reset-${request.id}`} type={showResetPasswords[request.id] ? 'text' : 'password'} className={`${fieldClass} pr-12`} required minLength={8} maxLength={256} autoComplete="new-password" value={passwords[request.id] || ''} onChange={event => setPasswords(current => ({ ...current, [request.id]: event.target.value }))} />
                    <button type="button" className="absolute inset-y-0 right-0 flex items-center px-4 text-amber-400/70 hover:text-amber-300" aria-label={showResetPasswords[request.id] ? 'Hide temporary password' : 'Show temporary password'} aria-pressed={Boolean(showResetPasswords[request.id])} onClick={() => setShowResetPasswords(current => ({ ...current, [request.id]: !current[request.id] }))}>
                      {showResetPasswords[request.id] ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <button className="auth-submit" disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</button>
                </form>
              </li>)}
            </ul>}
        </div>
      </section>
    </div>
  </main>;
}
