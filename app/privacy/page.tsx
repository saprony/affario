import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Informativa Privacy",
  description:
    "Informativa sul trattamento dei dati personali del servizio AFFARIO.",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPrivacyContactEmail(): string {
  const email = process.env.PRIVACY_CONTACT_EMAIL?.trim();

  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new Error(
      "Configurazione PRIVACY_CONTACT_EMAIL mancante o non valida."
    );
  }

  return email;
}

export default function PrivacyPage() {
  const privacyContactEmail = getPrivacyContactEmail();
  const sectionClassName = "space-y-3";
  const headingClassName = "text-lg font-bold text-gray-900";

  return (
    <main className="flex-1 bg-slate-50 px-4 py-10 text-gray-900 sm:py-14">
      <article className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-xl sm:p-10">
        <header>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Informativa Privacy
          </h1>
          <p className="mt-3 leading-relaxed text-gray-600">
            Informativa sul trattamento dei dati personali ai sensi del
            Regolamento (UE) 2016/679
          </p>
        </header>

        <div className="mt-10 space-y-9 leading-relaxed text-gray-700">
          <section className={sectionClassName}>
            <h2 className={headingClassName}>Titolare del trattamento</h2>
            <div>
              <p>Francesco Saporito</p>
              <p>
                Email:{" "}
                <a
                  href={`mailto:${privacyContactEmail}`}
                  className="font-semibold text-green-700 underline underline-offset-2 hover:text-green-800"
                >
                  {privacyContactEmail}
                </a>
              </p>
            </div>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>Dati trattati</h2>
            <p>
              Per il servizio di alert prezzo AFFARIO tratta i dati necessari
              alla gestione della richiesta, tra cui:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>indirizzo email;</li>
              <li>prodotto monitorato;</li>
              <li>prezzo desiderato;</li>
              <li>prezzo del prodotto al momento dell&apos;attivazione;</li>
              <li>data e stato dell&apos;alert.</li>
            </ul>
            <p>
              I fornitori tecnici utilizzati per l&apos;erogazione del servizio
              possono inoltre trattare dati tecnici strettamente necessari al
              funzionamento e alla sicurezza dell&apos;infrastruttura.
            </p>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>Finalità del trattamento</h2>
            <p>I dati vengono utilizzati esclusivamente per:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>creare e gestire l&apos;alert prezzo richiesto dall&apos;utente;</li>
              <li>identificare il prodotto e la soglia di prezzo scelta;</li>
              <li>
                inviare, quando il sistema di notifiche sarà operativo,
                comunicazioni strettamente relative all&apos;alert richiesto;
              </li>
              <li>
                garantire sicurezza e corretto funzionamento tecnico del
                servizio.
              </li>
            </ul>
            <p>
              I dati raccolti tramite l&apos;alert non sono utilizzati per
              newsletter, pubblicità, profilazione commerciale o marketing
              senza una distinta base giuridica.
            </p>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>Base giuridica</h2>
            <p>
              Il trattamento è necessario per fornire il servizio di alert
              richiesto dall&apos;utente, ai sensi dell&apos;art. 6, par. 1, lett. b)
              del Regolamento (UE) 2016/679.
            </p>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>Natura del conferimento</h2>
            <p>
              Fornire l&apos;indirizzo email è necessario per utilizzare il
              servizio di alert. In mancanza dell&apos;indirizzo email non è
              possibile attivare il servizio.
            </p>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>Conservazione</h2>
            <p>
              I dati sono conservati per il tempo necessario a mantenere attivo
              e gestire l&apos;alert richiesto e vengono eliminati quando non sono
              più necessari alla finalità per cui sono stati raccolti, salvo
              eventuali obblighi di legge. L&apos;utente può richiederne la
              cancellazione contattando il Titolare.
            </p>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>
              Destinatari e fornitori tecnici
            </h2>
            <p>
              I dati possono essere trattati da fornitori tecnici necessari
              all&apos;erogazione del servizio, quali servizi di hosting, database
              e, quando attivato, invio email, che operano secondo i rispettivi
              ruoli e obblighi applicabili in materia di protezione dei dati.
            </p>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>Trasferimenti di dati</h2>
            <p>
              Qualora l&apos;utilizzo di fornitori tecnici comporti trasferimenti
              di dati verso Paesi al di fuori dello Spazio Economico Europeo,
              tali trasferimenti saranno effettuati nel rispetto delle garanzie
              previste dal Regolamento (UE) 2016/679.
            </p>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>Diritti dell&apos;interessato</h2>
            <p>L&apos;utente può, nei casi previsti dalla normativa:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>chiedere accesso ai propri dati;</li>
              <li>chiedere rettifica;</li>
              <li>chiedere cancellazione;</li>
              <li>chiedere limitazione del trattamento;</li>
              <li>esercitare il diritto alla portabilità ove applicabile;</li>
              <li>esercitare gli altri diritti previsti dalla normativa.</li>
            </ul>
            <p>
              Per esercitare i propri diritti, l&apos;utente può contattare il
              Titolare all&apos;indirizzo{" "}
              <a
                href={`mailto:${privacyContactEmail}`}
                className="font-semibold text-green-700 underline underline-offset-2 hover:text-green-800"
              >
                {privacyContactEmail}
              </a>
              .
            </p>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>Reclamo</h2>
            <p>
              L&apos;interessato ha diritto di proporre reclamo all&apos;autorità di
              controllo competente, incluso il Garante per la protezione dei
              dati personali.
            </p>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>
              Processi decisionali automatizzati
            </h2>
            <p>
              I dati personali raccolti per il servizio alert non sono
              utilizzati per processi decisionali automatizzati che producano
              effetti giuridici o analogamente significativi sull&apos;utente.
            </p>
          </section>

          <section className={sectionClassName}>
            <h2 className={headingClassName}>Aggiornamenti</h2>
            <p>Ultimo aggiornamento: 11 agosto 2026</p>
          </section>
        </div>
      </article>
    </main>
  );
}
