export default function PesoSign({ className = '' }: { className?: string }) {
  return <span role="img" aria-label="Philippine peso" className={`inline-flex items-center justify-center font-sans font-semibold leading-none ${className}`}>₱</span>;
}
