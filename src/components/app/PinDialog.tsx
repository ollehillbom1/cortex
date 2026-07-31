"use client";

import { useState } from "react";
import type { Profile } from "@/lib/domain/types";
import { verifyPin } from "@/lib/security/pin";
import { useT } from "@/lib/i18n/useT";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/** Asks for a profile's 4-digit PIN and resolves via onResult. */
export function PinDialog({
  profile,
  onResult,
}: {
  profile: Profile;
  onResult: (ok: boolean) => void;
}) {
  const { t } = useT();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!profile.pin || busy) return;
    setBusy(true);
    const ok = await verifyPin(pin, profile.pin);
    setBusy(false);
    if (ok) {
      onResult(true);
    } else {
      setError(true);
      setPin("");
    }
  };

  return (
    <Dialog
      label={t("Enter PIN for {name}", { name: profile.name })}
      onClose={() => onResult(false)}
    >
      <p className="text-lg font-bold">{t("Enter PIN for {name}", { name: profile.name })}</p>
      <input
        autoFocus
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={pin}
        onChange={(e) => {
          setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
          setError(false);
        }}
        onKeyDown={(e) => e.key === "Enter" && pin.length === 4 && void submit()}
        aria-label={t("PIN code")}
        className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-[var(--color-accent-2)]"
      />
      <p role="alert" className="mt-1.5 min-h-5 text-sm text-[var(--color-bad)]">
        {error ? t("Wrong PIN — try again.") : ""}
      </p>
      <div className="mt-3 flex gap-3">
        <Button variant="ghost" onClick={() => onResult(false)} className="flex-1">
          {t("Cancel")}
        </Button>
        <Button
          onClick={() => void submit()}
          disabled={pin.length !== 4 || busy}
          className="flex-1"
        >
          {t("Unlock")}
        </Button>
      </div>
    </Dialog>
  );
}
