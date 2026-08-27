import type { Metadata } from "next";
import Link from "next/link";
import ConfirmAlertButton from "@/components/ConfirmAlertButton";
import DeleteAlertButton from "@/components/DeleteAlertButton";
import {
  PRICE_ALERT_ACTIVE_STATUS,
  PRICE_ALERT_PENDING_STATUS,
} from "@/lib/affarioPriceAlert";
import {
  hashAlertManagementToken,
  isValidAlertManagementToken,
} from "@/lib/alertManagementToken";
import {
  readPriceAlertByToken,
  type ManagedPriceAlert,
} from "@/lib/priceAlertManagement";
import { priceAlertManagementStore } from "@/services/priceAlertManagementStore";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gestisci alert | AFFARIO",
  referrer: "no-referrer",
};

type AlertManagementPageProps = {
  params: Promise<{ token: string }>;
};

function formatPrice(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function AlertDetails({ alert }: { alert: ManagedPriceAlert }) {
  return (
    <div className="mt-8 rounded-2xl border border-gray-200 p-5">
      <p className="text-sm font-bold uppercase text-gray-500">Prodotto</p>
      <p className="mt-2 text-xl font-bold">{alert.product_title}</p>

      <dl className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-gray-600">Prezzo alla registrazione</dt>
          <dd className="mt-1 text-lg font-bold">
            {formatPrice(alert.current_price)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-600">Prezzo obiettivo AFFARIO</dt>
          <dd className="mt-1 text-lg font-bold text-green-800">
            {formatPrice(alert.target_price)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function AlertNotFound() {
  return (
    <>
      <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
        Gestisci alert
      </h1>
      <p className="mt-6 rounded-2xl bg-gray-100 p-5 font-bold text-gray-800">
        Alert non trovato o già eliminato.
      </p>
      <Link
        href="/"
        referrerPolicy="no-referrer"
        className="mt-6 inline-block font-bold text-green-800 underline underline-offset-2 hover:text-green-900"
      >
        Torna alla home AFFARIO
      </Link>
    </>
  );
}

async function findAlert(token: string): Promise<ManagedPriceAlert | null> {
  try {
    return await readPriceAlertByToken(
      token,
      {
        isValid: isValidAlertManagementToken,
        hash: hashAlertManagementToken,
      },
      priceAlertManagementStore
    );
  } catch {
    return null;
  }
}

export default async function AlertManagementPage({
  params,
}: AlertManagementPageProps) {
  const { token } = await params;
  const alert = await findAlert(token);
  const isPending = alert?.status === PRICE_ALERT_PENDING_STATUS;
  const isActive = alert?.status === PRICE_ALERT_ACTIVE_STATUS;

  return (
    <main className="flex flex-1 items-center bg-slate-50 px-4 py-10 text-gray-900 sm:py-14">
      <section className="mx-auto w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl sm:p-10">
        {!alert || (!isPending && !isActive) ? (
          <AlertNotFound />
        ) : isPending ? (
          <>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              Conferma il tuo alert
            </h1>
            <p className="mt-4 leading-relaxed text-gray-600">
              Conferma esplicitamente la richiesta. Solo dopo questa azione
              l&apos;alert diventerà attivo.
            </p>

            <AlertDetails alert={alert} />
            <ConfirmAlertButton token={token} />
          </>
        ) : (
          <>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              Gestisci questo alert
            </h1>
            <p className="mt-4 leading-relaxed text-gray-600">
              Puoi eliminare definitivamente questa richiesta di alert.
            </p>

            <AlertDetails alert={alert} />

            <DeleteAlertButton token={token} />
          </>
        )}
      </section>
    </main>
  );
}
