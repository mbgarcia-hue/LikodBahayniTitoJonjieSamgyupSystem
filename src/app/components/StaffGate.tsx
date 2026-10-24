import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, Navigate } from 'react-router';
import { api } from '../lib/api';
export default function StaffGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState('loading'); const [role, setRole] = useState(''); const [retry, setRetry] = useState(0); const location = useLocation();
  const requested = location.pathname.split('/')[1]; const allowed = requested === 'admin' ? 'owner' : requested;
  useEffect(() => {
    let active = true;
    const check = () => api('/staff/me').then(data => { if (active) { setRole(data.user.role); setStatus('ready'); } }).catch(e => { if (active) setStatus(e.status === 401 ? 'login' : e.status === 404 ? 'outdated' : 'error'); });
    const expire = () => setStatus('login');
    setStatus('loading'); check(); const timer = setInterval(check, 30000);
    window.addEventListener('staff-session-expired', expire);
    return () => { active = false; clearInterval(timer); window.removeEventListener('staff-session-expired', expire); };
  }, [allowed, retry]);
  if (status === 'login') return <Navigate to={`/${allowed}/login`} replace />;
  if (status === 'ready' && role !== allowed) return <Navigate to={role === 'cashier' ? '/cashier/billing' : `/${role}`} replace />;
  if (status !== 'ready') return <main className="auth-page"><div className="auth-shell"><div className="auth-card"><p role="status">{status === 'outdated' ? 'An older restaurant API is running. Restart npm run dev to load account logins.' : status === 'error' ? 'Unable to reach the restaurant API. Make sure npm run dev is running.' : 'Loading...'}</p>{status !== 'loading' && <button className="auth-submit" onClick={() => setRetry(n => n + 1)}>Try again</button>}</div></div></main>;
  return <>{children}</>;
}
