export const TOO_MANY_REQUESTS_MESSAGE =
  "Hai effettuato troppe richieste in poco tempo. Riprova tra qualche minuto.";

export const SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE =
  "Il servizio è temporaneamente non disponibile. Riprova tra poco.";

export function getConsumerServiceErrorMessage(
  status: number
): string | null {
  if (status === 429) {
    return TOO_MANY_REQUESTS_MESSAGE;
  }

  if (status === 503) {
    return SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE;
  }

  return null;
}
