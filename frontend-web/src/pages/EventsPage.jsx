import { useEffect, useState } from 'react';
import { fetchEvents } from '../api/qrushApi.js';

const CATEGORIES = ['스포츠', '콘서트', '뮤지컬', '전시', '클래식'];

function ddayLabel(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  const diff = Math.round((d - today) / 86400000);
  if (Number.isNaN(diff)) return '';
  if (diff === 0) return 'D-DAY';
  return diff > 0 ? `D-${diff}` : '종료';
}

function matchTeams(title) {
  if (!title.includes('vs')) return null;
  const [a, b] = title.split(/\s*vs\s*/);
  return { a: a?.trim(), b: b?.trim() };
}

export default function EventsPage({ navigate }) {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    async function loadEvents() {
      try {
        const result = await fetchEvents();
        setEvents(result.events);
        setStatus('done');
      } catch {
        setStatus('error');
      }
    }

    loadEvents();
  }, []);

  const goBooking = (id) => navigate(`/booking?eventId=${id}`);

  return (
    <section className="tl-home">
      <div className="home-hero">
        <span className="hero-kicker">2026 FIFA WORLD CUP</span>
        <h2>대한민국 대표팀 단독 예매</h2>
        <p>조별리그부터 16강 토너먼트까지 — 지금 예매하세요</p>
      </div>

      <nav className="cat-nav" aria-label="카테고리">
        {CATEGORIES.map((c, i) => (
          <button className={i === 0 ? 'cat-chip active' : 'cat-chip'} key={c} type="button">
            {c}
          </button>
        ))}
      </nav>

      <div className="section-head">
        <h3>스포츠 · 축구</h3>
        <span>{events.length}경기</span>
      </div>

      {status === 'loading' && <div className="panel empty-state">공연 목록을 불러오는 중입니다.</div>}
      {status === 'error' && <div className="panel error-text">공연 목록을 불러오지 못했습니다.</div>}

      <div className="poster-grid">
        {events.map((event, i) => {
          const teams = matchTeams(event.title);
          return (
            <article className="poster-card" key={event.id}>
              <button
                className={`poster grad-${i % 6}`}
                onClick={() => goBooking(event.id)}
                type="button"
              >
                <span className="poster-rank">{i + 1}</span>
                <span className="poster-dday">{ddayLabel(event.date)}</span>
                <span className="poster-center">
                  {teams ? (
                    <>
                      <b>{teams.a}</b>
                      <em>VS</em>
                      <b>{teams.b}</b>
                    </>
                  ) : (
                    <b className="poster-round">ROUND OF 16</b>
                  )}
                </span>
                <span className="poster-league">FIFA WORLD CUP 2026</span>
              </button>

              <div className="poster-meta">
                <h4>{event.title}</h4>
                <p className="poster-when">
                  {event.date} {event.time}
                </p>
                <p className="poster-where">{event.venue}</p>
                <div className="poster-foot">
                  <strong>{event.price}</strong>
                  <button className="ticket-btn" onClick={() => goBooking(event.id)} type="button">
                    예매
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
