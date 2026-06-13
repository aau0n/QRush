import { useEffect, useState } from 'react';
import { fetchEvents } from '../api/qrushApi.js';

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

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">02 Events</p>
        <h2>공연 목록</h2>
        <p>예매할 경기를 선택하세요.</p>
      </div>

      {status === 'loading' && <div className="panel empty-state">공연 목록을 불러오는 중입니다.</div>}
      {status === 'error' && <div className="panel error-text">공연 목록을 불러오지 못했습니다.</div>}

      <div className="event-grid">
        {events.map((event) => (
          <article className="event-card" key={event.id}>
            <div className="event-cover">
              <span>{event.date.slice(5).replace('-', '.')}</span>
            </div>
            <div className="event-body">
              <h3>{event.title}</h3>
              <p>{event.description}</p>
              <dl>
                <div>
                  <dt>일시</dt>
                  <dd>
                    {event.date} {event.time}
                  </dd>
                </div>
                <div>
                  <dt>장소</dt>
                  <dd>{event.venue}</dd>
                </div>
                <div>
                  <dt>가격</dt>
                  <dd>{event.price}</dd>
                </div>
              </dl>
              <button
                className="primary-button"
                onClick={() => navigate(`/booking?eventId=${event.id}`)}
                type="button"
              >
                예매하러 가기
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
