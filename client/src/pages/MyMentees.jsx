import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Bar, Loading, initials } from '../components.jsx';

// Страница за ментора: неговите обучаеми и предадените тестове, които чакат решение.
export default function MyMentees() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.myMentees().then(setData).catch((ex) => setErr(ex.message)); }, []);
  if (err) return <div className="wrap"><div className="err">{err}</div></div>;
  if (!data) return <Loading />;

  const active = data.mentees.filter((m) => !m.mentorship_done_at);
  const done = data.mentees.filter((m) => m.mentorship_done_at);

  return (
    <div className="wrap">
      <div className="page-head">
        <div className="eyebrow">Ментор</div>
        <h1>Моите обучаеми</h1>
        <p>
          Когато обучаем предаде тест, модулът се заключва. Отвори служителя и реши дали продължава към следващия модул, или повтаря.
          {data.pendingReviews > 0 && <> Сега чакат <b>{data.pendingReviews}</b> {data.pendingReviews === 1 ? 'решение' : 'решения'}.</>}
        </p>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr><th>Служител</th><th>Магазин</th><th style={{ width: 200 }}>Прогрес</th><th>Модули</th><th>Въпросник</th></tr>
          </thead>
          <tbody>
            {[...active, ...done].map((e) => (
              <tr key={e.id} onClick={() => nav('/mentees/' + e.id)}>
                <td>
                  <div className="emp">
                    <div className="av">{initials(e.name)}</div>
                    <div><b>{e.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{e.mentorship_done_at ? 'завършил при теб' : e.position || ''}</div></div>
                  </div>
                </td>
                <td className="muted">{e.store || '—'}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}><Bar percent={e.overall} /></div>
                    <b className="tabnum" style={{ width: 42, textAlign: 'right' }}>{e.overall}%</b>
                  </div>
                </td>
                <td className="tabnum muted" style={{ whiteSpace: 'nowrap' }}>
                  {e.completedModules}/{e.totalModules}
                  {e.pendingReviews > 0 && <span className="pill a" style={{ marginLeft: 8 }}>{e.pendingReviews} чака</span>}
                </td>
                <td className="muted">{e.disc_result || 'не е попълнен'}</td>
              </tr>
            ))}
            {data.mentees.length === 0 && <tr style={{ cursor: 'default' }}><td colSpan={5} className="muted">Още нямаш обучаеми.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
