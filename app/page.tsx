export default function Home() {
  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logo}>AFFARIO</div>
        <nav style={styles.nav}>
          <a style={styles.navLink}>Come funziona</a>
          <a style={styles.navLink}>Alert</a>
          <a style={styles.navLink}>Contatti</a>
        </nav>
      </header>

      <section style={styles.hero}>
        <div style={styles.badge}>🟢 Price intelligence per acquisti online</div>

        <h1 style={styles.title}>
          Gli affari non si trovano...
          <br />
          <span style={styles.green}>si aspettano!</span>
        </h1>

        <p style={styles.subtitle}>
          Scegli il momento giusto per comprare.
        </p>

        <div style={styles.searchBox}>
          <input
            type="text"
            placeholder="Che prodotto stai pensando di comprare?"
            style={styles.input}
          />
          <button style={styles.button}>
            Analizza il prezzo
          </button>
        </div>

        <p style={styles.smallText}>
          Affario ti aiuta a capire se il prezzo di oggi è davvero conveniente.
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Come funziona</h2>

        <div style={styles.cards}>
          <div style={styles.card}>
            <div style={styles.cardIcon}>🔎</div>
            <h3>Cerca un prodotto</h3>
            <p>Inserisci il nome del prodotto che stai pensando di acquistare.</p>
          </div>

          <div style={styles.card}>
            <div style={styles.cardIcon}>📊</div>
            <h3>Analizza il prezzo</h3>
            <p>Affario confronta il prezzo attuale con lo storico e individua il momento migliore.</p>
          </div>

          <div style={styles.card}>
            <div style={styles.cardIcon}>⏰</div>
            <h3>Decidi quando comprare</h3>
            <p>Ricevi una valutazione semplice e, in futuro, potrai attivare alert intelligenti.</p>
          </div>
        </div>
      </section>

      <section style={styles.valueSection}>
        <h2 style={styles.sectionTitle}>Non è solo una ricerca prezzo.</h2>
        <p style={styles.valueText}>
          I comparatori ti dicono dove costa meno oggi. Affario ti aiuta a capire
          se oggi è davvero il momento giusto per acquistare.
        </p>
      </section>

      <footer style={styles.footer}>
        <p>© 2026 Affario.it — Progetto in fase di sviluppo</p>
      </footer>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    color: "#111827",
    fontFamily: "Arial, sans-serif",
  },

  header: {
    maxWidth: "1100px",
    margin: "0 auto",
    padding: "24px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  logo: {
    fontSize: "24px",
    fontWeight: "900",
    letterSpacing: "1px",
    color: "#16a34a",
  },

  nav: {
    display: "flex",
    gap: "20px",
    fontSize: "14px",
  },

  navLink: {
    color: "#374151",
    textDecoration: "none",
    cursor: "pointer",
  },

  hero: {
    maxWidth: "900px",
    margin: "0 auto",
    padding: "70px 20px 90px",
    textAlign: "center" as const,
  },

  badge: {
    display: "inline-block",
    marginBottom: "24px",
    padding: "8px 14px",
    borderRadius: "999px",
    background: "#dcfce7",
    color: "#166534",
    fontSize: "14px",
    fontWeight: "700",
  },

  title: {
    margin: "0",
    fontSize: "58px",
    lineHeight: "1.05",
    fontWeight: "900",
    letterSpacing: "-2px",
  },

  green: {
    color: "#16a34a",
  },

  subtitle: {
    marginTop: "22px",
    fontSize: "24px",
    color: "#4b5563",
  },

  searchBox: {
    margin: "40px auto 18px",
    maxWidth: "720px",
    display: "flex",
    gap: "12px",
    background: "white",
    padding: "12px",
    borderRadius: "18px",
    boxShadow: "0 15px 40px rgba(0,0,0,0.10)",
  },

  input: {
    flex: 1,
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "16px",
    fontSize: "16px",
    outline: "none",
  },

  button: {
    border: "none",
    borderRadius: "12px",
    background: "#16a34a",
    color: "white",
    fontSize: "16px",
    fontWeight: "700",
    padding: "0 24px",
    cursor: "pointer",
  },

  smallText: {
    color: "#6b7280",
    fontSize: "15px",
  },

  section: {
    maxWidth: "1100px",
    margin: "0 auto",
    padding: "50px 20px",
  },

  sectionTitle: {
    textAlign: "center" as const,
    fontSize: "34px",
    marginBottom: "34px",
    letterSpacing: "-1px",
  },

  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "22px",
  },

  card: {
    background: "white",
    padding: "28px",
    borderRadius: "22px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  },

  cardIcon: {
    fontSize: "34px",
    marginBottom: "12px",
  },

  valueSection: {
    maxWidth: "900px",
    margin: "30px auto 0",
    padding: "60px 20px",
    textAlign: "center" as const,
  },

  valueText: {
    fontSize: "21px",
    lineHeight: "1.6",
    color: "#4b5563",
  },

  footer: {
    padding: "30px 20px",
    textAlign: "center" as const,
    color: "#6b7280",
    fontSize: "14px",
  },
};