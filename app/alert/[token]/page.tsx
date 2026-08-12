import type { Metadata } from "next";
import Link from "next/link";
import DeleteAlertButton from "@/components/DeleteAlertButton";
import {
  hashAlertManagementToken,
  isValidAlertManagementToken,
} from "@/lib/alertManagementToken";
import { getSupabaseServerClient } from "@/services/supabaseServer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gestisci alert | AFFARIO",
  referrer: "no-referrer",
};

type AlertManagementPageProps = {
  params: Promise<{ token: string }>;
};

type ManagedAlert = {
  product_title: string;
  current_price: number;
  target_price: number;
};

function formatPrice(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
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

async function findAlert(token: string): Promise<ManagedAlert | null> {
  if (!isValidAlertManagementToken(token)) {
    return null;
  }

  const tokenHash = hashAlertManagementToken(token);

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("price_alerts")
      .select("product_title, current_price, target_price")
      .eq("manage_token_hash", tokenHash)
      .maybeSingle<ManagedAlert>();

    if (error || !data) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export default async function AlertManagementPage({
  params,
}: AlertManagementPageProps) {
  const { token } = await params;
  const alert = await findAlert(token);

  return (
    <main className="flex flex-1 items-center bg-slate-50 px-4 py-10 text-gray-900 sm:py-14">
      <section className="mx-auto w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl sm:p-10">
        {!alert ? (
          <AlertNotFound />
        ) : (
          <>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              Gestisci questo alert
            </h1>
            <p className="mt-4 leading-relaxed text-gray-600">
              Puoi eliminare definitivamente questa richiesta di alert.
            </p>

            <div className="mt-8 rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-bold uppercase text-gray-500">
                Prodotto
              </p>
              <p className="mt-2 text-xl font-bold">{alert.product_title}</p>

              <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-gray-600">
                    Prezzo alla registrazione
                  </dt>
                  <dd className="mt-1 text-lg font-bold">
                    {formatPrice(alert.current_price)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600">Prezzo desiderato</dt>
                  <dd className="mt-1 text-lg font-bold text-green-800">
                    {formatPrice(alert.target_price)}
                  </dd>
                </div>
              </dl>
            </div>

            <DeleteAlertButton token={token} />
          </>
        )}
      </section>
    </main>
  );
}
