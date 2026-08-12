"use client";

import Link from "next/link";
import { useState } from "react";

type DeleteAlertButtonProps = {
  token: string;
};

type DeleteStatus = "idle" | "deleting" | "deleted" | "not-found" | "error";

export default function DeleteAlertButton({ token }: DeleteAlertButtonProps) {
  const [status, setStatus] = useState<DeleteStatus>("idle");

  async function deleteAlert() {
    setStatus("deleting");

    try {
      const response = await fetch("/api/alerts/manage", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        setStatus("deleted");
        return;
      }

      setStatus(response.status === 404 ? "not-found" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "deleted") {
    return (
      <div
        role="status"
        className="mt-8 rounded-2xl bg-green-50 p-5 text-green-900"
      >
        <p className="text-lg font-extrabold">Alert eliminato correttamente.</p>
        <p className="mt-2 leading-relaxed">
          La richiesta di alert è stata eliminata.
        </p>
        <Link
          href="/"
          referrerPolicy="no-referrer"
          className="mt-5 inline-block font-bold text-green-800 underline underline-offset-2 hover:text-green-900"
        >
          Torna alla home AFFARIO
        </Link>
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div
        role="alert"
        className="mt-8 rounded-2xl bg-gray-100 p-5 text-gray-800"
      >
        <p className="font-bold">Alert non trovato o già eliminato.</p>
        <Link
          href="/"
          referrerPolicy="no-referrer"
          className="mt-5 inline-block font-bold text-green-800 underline underline-offset-2 hover:text-green-900"
        >
          Torna alla home AFFARIO
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {status === "error" && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700"
        >
          Non è stato possibile eliminare l&apos;alert. Riprova.
        </p>
      )}
      <button
        type="button"
        onClick={deleteAlert}
        disabled={status === "deleting"}
        className="w-full rounded-xl bg-red-700 p-4 text-lg font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "deleting"
          ? "Eliminazione in corso..."
          : "Elimina questo alert"}
      </button>
    </div>
  );
}
