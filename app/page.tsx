export default function Home() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#f5f7fb",
      fontFamily: "Arial, sans-serif",
      padding: "40px"
    }}>
      <section style={{
        maxWidth: "900px",
        margin: "0 auto",
        textAlign: "center"
      }}>
        <h1 style={{
          fontSize: "56px",
          marginBottom: "10px",
          color: "#111827"
        }}>
          Affario
        </h1>

        <p style={{
          fontSize: "22px",
          color: "#4b5563",
          marginBottom: "40px"
        }}>
          Ti avvisiamo quando è davvero il momento di comprare.
        </p>

        <div style={{
          background: "white",
          padding: "30px",
          borderRadius: "20px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)"
        }}>
          <input
            type="text"
            placeholder="Cerca un prodotto Amazon..."
            style={{
              width: "100%",
              padding: "18px",
              fontSize: "18px",
              borderRadius: "12px",
              border: "1px solid #d1d5db",
              marginBottom: "20px"
            }}
          />

          <button style={{
            padding: "16px 30px",
            fontSize: "18px",
            borderRadius: "12px",
            border: "none",
            background: "#111827",
            color: "white",
            cursor: "pointer"
          }}>
            Cerca Affario
          </button>
        </div>

        <div style={{
          marginTop: "50px",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "20px"
        }}>
          <div style={cardStyle}>
            <h3>Prezzi monitorati</h3>
            <p>Segui l'andamento dei prodotti che ti interessano.</p>
          </div>

          <div style={cardStyle}>
            <h3>Alert intelligenti</h3>
            <p>Ricevi un avviso quando il prezzo scende sotto la tua soglia.</p>
          </div>

          <div style={cardStyle}>
            <h3>Affario Score</h3>
            <p>Scopri se il prezzo è davvero conveniente.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

const cardStyle = {
  background: "white",
  padding: "24px",
  borderRadius: "18px",
  boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
  color: "#111827"
};