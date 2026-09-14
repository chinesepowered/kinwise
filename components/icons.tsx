import type { EventKind } from "@/lib/types";

type P = { size?: number; className?: string };
const base = (size = 16) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export const MarkIcon = ({ size = 28, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
    <path d="M16 3.5 4.5 12.2V27a1.5 1.5 0 0 0 1.5 1.5h20a1.5 1.5 0 0 0 1.5-1.5V12.2Z" fill="var(--ink)" />
    <path d="M16 22.6s-5.2-3.1-5.2-6.6a2.9 2.9 0 0 1 5.2-1.8 2.9 2.9 0 0 1 5.2 1.8c0 3.5-5.2 6.6-5.2 6.6Z" fill="var(--amber-bright)" />
  </svg>
);

export const CardIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="5.5" width="18" height="13" rx="2.2" /><path d="M3 10h18M7 15h3" /></svg>
);
export const PhoneIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M5 4h3.2l1.6 4.2-2 1.3a11 11 0 0 0 6.7 6.7l1.3-2 4.2 1.6V19a1.8 1.8 0 0 1-2 1.8A16.5 16.5 0 0 1 3.2 6 1.8 1.8 0 0 1 5 4Z" /></svg>
);
export const TextIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 5.5h16v10.5H9.5L5 19.5v-3.5H4Z" /></svg>
);
export const MailIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m4 7 8 6 8-6" /></svg>
);
export const BankIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M3 9.5 12 4l9 5.5M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3.5 20h17" /></svg>
);
export const ShieldIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3.5 5 6v5.5c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6Z" /><path d="m9 12 2.2 2.2L15.5 10" /></svg>
);
export const ShieldXIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3.5 5 6v5.5c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6Z" /><path d="m9.5 9.5 5 5m0-5-5 5" /></svg>
);
export const LockIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
);
export const BoltIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M13 3 5 13.5h6L10 21l8-10.5h-6Z" /></svg>
);
export const CheckIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="m5 12.5 4.2 4.2L19 7" /></svg>
);
export const PlayIcon = ({ size, className }: P) => (
  <svg width={size ?? 14} height={size ?? 14} viewBox="0 0 24 24" className={className}><path d="M7 4.5v15l12-7.5Z" fill="currentColor" /></svg>
);
export const ResetIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" /></svg>
);

export const KindIcon = ({ kind, size }: { kind: EventKind; size?: number }) => {
  if (kind === "card") return <CardIcon size={size} />;
  if (kind === "call") return <PhoneIcon size={size} />;
  if (kind === "text") return <TextIcon size={size} />;
  if (kind === "email") return <MailIcon size={size} />;
  return <BankIcon size={size} />;
};
