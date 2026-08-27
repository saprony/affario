"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ConfirmAlertButtonProps = {
  token: string;
};

type ConfirmationStatus =
  | "idle"
  | "confirming"
  | "confirmed"
  | "not-found"
  | "error";

export default function ConfirmAlertButton({
  token,
}: ConfirmAlertButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<ConfirmationStatus>("idle");

  async function confirmAlert() {
    setStatus("confirming");

    try {
      const response = await fetch("/api/alerts/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        setStatus("confirmed");
        router.refresh();
        return;
      }

      setStatus(response.status === 404 ? "not-found" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "confirmed") {
    return (
      <p
        role="status"
        className="mt-8 rounded-2xl bg-green-50 p-5 font-bold text-green-900"
      >
        Alert confermato. Ora è attivo.
      </p>
    );
  }

  return (
    <div className="mt-8">
      {status === "not-found" && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-gray-100 p-4 font-semibold text-gray-800"
        >
          Alert non trovato o già eliminato.
        </p>
      )}
      {status === "error" && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-4 font-semibold text-red-700"
        >
          Non è stato possibile confermare l&apos;alert. Riprova.
        </p>
      )}
      <button
        type="button"
        onClick={confirmAlert}
        disabled={status === "confirming" || status === "not-found"}
        className="w-full rounded-xl bg-green-700 p-4 text-lg font-bold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "confirming" ? "Conferma in corso..." : "Conferma alert"}
      </button>
    </div>
  );
}
