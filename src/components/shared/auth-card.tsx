import * as React from "react";

/** Content of the glass auth card (the card itself is drawn by the auth layout). */
export function AuthCard({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-7 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {description ? <p className="mt-2 text-sm text-white/65">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="mt-7 border-t border-white/10 pt-6 text-center text-sm text-white/60">{footer}</div> : null}
    </div>
  );
}
