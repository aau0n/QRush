export default function JsonPreview({ title, data }) {
  if (!data) {
    return (
      <section className="panel empty-state">
        <h3>{title}</h3>
        <p>표시할 JSON 데이터가 없습니다.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="section-title">
        <h3>{title}</h3>
      </div>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </section>
  );
}