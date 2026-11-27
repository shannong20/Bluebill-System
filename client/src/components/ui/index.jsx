import { useEffect, useRef, useState } from 'react';
import { IconClose } from './Icons';

/** Small presentational building blocks shared across every screen. */

export function Card({ title, sub, actions, children, flush = false, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card__head">
          <div>
            {title && <div className="card__title">{title}</div>}
            {sub && <div className="card__sub">{sub}</div>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className={`card__body ${flush ? 'card__body--flush' : ''}`}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, foot, chip, chipTone = 'success', children }) {
  return (
    <div className="card">
      <div className="card__body">
        <div className="kpi__row">
          <div className="kpi__label">{label}</div>
          {chip}
        </div>
        <div className="kpi__value">{value}</div>
        {foot && <div className="kpi__foot">{foot}</div>}
        {children}
      </div>
    </div>
  );
}

export function Chip({ tone = 'neutral', children }) {
  return <span className={`chip chip--${tone}`}>{children}</span>;
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={`tab ${active === tab.key ? 'tab--active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  variant = 'ghost',
  size,
  loading = false,
  className = '',
  children,
  disabled,
  ...rest
}) {
  const classes = [
    'btn',
    `btn--${variant}`,
    size ? `btn--${size}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} disabled={disabled || loading} {...rest}>
      {loading && <span className={variant === 'ghost' ? 'spinner spinner--dark' : 'spinner'} />}
      {children}
    </button>
  );
}

export function Progress({ value, tone = 'info' }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`progress__fill progress__fill--${tone}`}
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  );
}

export function Avatar({ name = '', size, title }) {
  const text = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || '')
    .join('')
    .toUpperCase() || '?';
  return (
    <div className={`avatar ${size === 'sm' ? 'avatar--sm' : ''}`} title={title || name}>
      {text}
    </div>
  );
}

export function Stepper({ value, onDecrement, onIncrement }) {
  return (
    <div className="stepper">
      <button
        type="button"
        onClick={onDecrement}
        disabled={value <= 1}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span>{value}</span>
      <button type="button" onClick={onIncrement} aria-label="Increase quantity">
        +
      </button>
    </div>
  );
}

export function State({ icon, title, message, action }) {
  return (
    <div className="state">
      {icon}
      {title && <div className="state__title">{title}</div>}
      {message && <div>{message}</div>}
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);

  // Keep the latest handler without re-binding the listener on every render.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Escape closes the dialog and the page behind it must not scroll.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('is-modal-open');

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('is-modal-open');
    };
  }, [open]);

  // Move focus into the dialog so Escape/tabbing behave as expected.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    // Prefer the first real field so typing works straight away; fall back to
    // the panel itself for dialogs that have no inputs.
    const field = panel.querySelector(
      '.modal__body [autofocus], .modal__body input:not([type="hidden"]):not([disabled]),' +
        ' .modal__body select:not([disabled]), .modal__body textarea:not([disabled])',
    );
    if (field instanceof HTMLInputElement) {
      field.focus();
      field.select();
    } else {
      (field || panel).focus();
    }
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        className={`modal ${wide ? 'modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="modal__head">
          <div className="card__title">{title}</div>
          <button
            type="button"
            className="icon-btn modal__close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <IconClose size={15} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

/**
 * Yes/no dialog for archive / permanent-delete style actions.
 * Built on the shared Modal shell so it behaves like every other popup.
 */
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  danger = false,
  onCancel,
  onConfirm,
}) {
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'action'} loading={busy} onClick={run}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ fontSize: 13.5 }}>{body}</div>
    </Modal>
  );
}
