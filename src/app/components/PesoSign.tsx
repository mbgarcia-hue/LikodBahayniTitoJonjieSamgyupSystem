type PesoIconProps = { className?: string };

export default function PesoSign({ className = '' }: PesoIconProps) {
  return <span role="img" aria-label="Philippine peso" className={`inline-flex items-center justify-center font-sans font-semibold leading-none ${className}`}>₱</span>;
}

export function PesoCircle({ className = '' }: PesoIconProps) {
  return <svg role="img" aria-label="Philippine peso" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="9" />
    <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="12" fontWeight="700">₱</text>
  </svg>;
}

export function PesoBanknote({ className = '' }: PesoIconProps) {
  return <svg role="img" aria-label="Philippine peso" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="M5 8a2 2 0 0 1-2 2m16-2a2 2 0 0 0 2 2M5 16a2 2 0 0 0-2-2m16 2a2 2 0 0 1 2-2" />
    <text x="12" y="15" textAnchor="middle" fill="currentColor" stroke="none" fontSize="10" fontWeight="700">₱</text>
  </svg>;
}

export function PesoCoins({ className = '' }: PesoIconProps) {
  return <svg role="img" aria-label="Philippine peso" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 17.5c0 1.1 3.6 2 8 2 1.8 0 3.5-.2 4.9-.5M4 14.5c0 1.1 3.6 2 8 2 1.8 0 3.5-.2 4.9-.5M4 11.5c0 1.1 3.6 2 8 2 1.2 0 2.4-.1 3.5-.3" />
    <ellipse cx="12" cy="8" rx="8" ry="3" />
    <text x="12" y="11" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="700">₱</text>
  </svg>;
}

export function PesoReceipt({ className = '' }: PesoIconProps) {
  return <svg role="img" aria-label="Philippine peso" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 3.5h8l4 4v13l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" />
    <path d="M14 3.5v4h4" />
    <text x="11.5" y="15.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="9" fontWeight="700">₱</text>
  </svg>;
}
