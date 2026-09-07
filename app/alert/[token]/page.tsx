import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import ConfirmAlertButton from "@/components/ConfirmAlertButton";
import DeleteAlertButton from "@/components/DeleteAlertButton";
import {
  PRICE_ALERT_ACTIVE_STATUS,
  PRICE_ALERT_PENDING_STATUS,
  PRICE_ALERT_TARGET_NOTIFIED_STATUS,
} from "@/lib/affarioPriceAlert";
import {
  SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE,
  TOO_MANY_REQUESTS_MESSAGE,
} from "@/lib/consumerServiceMessages";
import type { ManagedPriceAlert } from "@/lib/priceAlertManagement";
import { formatUserFacingProductTitle } from "@/lib/userFacingProductTitle";
import {
  getPriceAlertManagementPageAccessWithDevelopmentPreviews,
} from "@/services/priceAlertManagementPageAccess";

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
  const productTitle = formatUserFacingProductTitle(alert.product_title);

  return (
    <div className="mt-8 rounded-2xl border border-gray-200 p-5">
      <p className="text-sm font-bold uppercase text-gray-500">Prodotto</p>
      <p className="mt-2 break-words text-xl font-bold">{productTitle}</p>

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

function AlertAccessFailure({ rateLimited }: { rateLimited: boolean }) {
  return (
    <>
      <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
        Gestisci alert
      </h1>
      <p className="mt-6 rounded-2xl bg-gray-100 p-5 font-bold text-gray-800">
        {rateLimited
          ? TOO_MANY_REQUESTS_MESSAGE
          : SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE}
      </p>
    </>
  );
}

async function createManagementPageRequest(): Promise<Request> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const rateLimitHeaders = new Headers();

  if (forwardedFor) {
    rateLimitHeaders.set("x-forwarded-for", forwardedFor);
  }

  return new Request("https://affario.it/alert", {
    headers: rateLimitHeaders,
  });
}

export default async function AlertManagementPage({
  params,
}: AlertManagementPageProps) {
  const { token } = await params;
  const access =
    await getPriceAlertManagementPageAccessWithDevelopmentPreviews(
      await createManagementPageRequest(),
      token
    );
  const alert = access.status === "found" ? access.alert : null;
  const isPending = alert?.status === PRICE_ALERT_PENDING_STATUS;
  const isActive = alert?.status === PRICE_ALERT_ACTIVE_STATUS;
  const isTargetNotified =
    alert?.status === PRICE_ALERT_TARGET_NOTIFIED_STATUS;

  return (
    <main className="flex flex-1 items-center bg-slate-50 px-4 py-10 text-gray-900 sm:py-14">
      <section className="mx-auto w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl sm:p-10">
        {access.status === "rate-limited" ? (
          <AlertAccessFailure rateLimited />
        ) : access.status === "unavailable" ? (
          <AlertAccessFailure rateLimited={false} />
        ) : !alert || (!isPending && !isActive && !isTargetNotified) ? (
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
        ) : isActive ? (
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
        ) : (
          <>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              Alert concluso
            </h1>
            <p className="mt-4 leading-relaxed text-gray-600">
              Il Prezzo Obiettivo AFFARIO è stato raggiunto e la notifica
              target è stata completata. Puoi eliminare il record se lo
              desideri.
            </p>

            <AlertDetails alert={alert} />

            <DeleteAlertButton token={token} />
          </>
        )}
      </section>
    </main>
  );
}
