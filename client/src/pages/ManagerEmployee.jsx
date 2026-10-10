import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { Bar, Ring, Loading, StatusPill, initials } from '../components.jsx';

export default function ManagerEmployee() {
  const { id } = useParams();
  const fromMentor = useLocation().pathname.startsWith('/mentees');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);
  const load = () => api.reviewEmployee(id).then(setData).catch((ex) => setErr(ex.message));
  useEffect(() => { load(); }, [id]);
  if (err && !data) return <div className="wrap"><div className="err">{err}</div></div>;
  if (!data) return <Loading />;

  const e = data.employee;
  const allModules = data.categories.flatMap((c) => c.modules.map((m) => ({ ...m, cat: c.title, icon: c.icon })));
  const pending = allModules.filter((m) => m.status === 'submitted');

  async function act(key, fn, question) {
    if (question && !confirm(question)) return;
    setBusy(key); setErr('');
    try { await fn(); await load(); } catch (ex) { setErr(ex.message); } finally { setBusy(null); }
  }
  const approve = (m) => act('a' + m.id, () => api.approveModule(e.id, m.id));
  const retry = (m) => act('r' + m.id, () => api.retryModule(e.id, m.id));
  const resetDisc = () => act('disc', () => api.resetDisc(e.id),
    `Да разреша ли на ${e.name} да попълни личностния въпросник отново? Докато не го попълни, модулите остават заключени.`);

  return (
    <div className="wrap">
      <Link to={fromMentor ? '/mentees' : '/manager'} className="back"><Icon name="arrowl" size={16} /> {fromMentor ? 'Моите обучаеми' : 'Всички служители'}</Link>

      {/* профил */}
      <div className="card" style={{ padding: 24, display: 'flex', gap: 22, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="av" style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--orange)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22, flex: 'none' }}>
          {initials(e.name)}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 26, textTransform: 'uppercase' }}>{e.name}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{[e.position, e.store, e.company].filter(Boolean).join(' · ')}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 8, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <span><Icon name="users" size={14} /> Ментор: <b style={{ color: 'var(--ink)' }}>{e.mentor || '—'}</b></span>
            <span><Icon name="clock" size={14} /> От: <b style={{ color: 'var(--ink)' }}>{e.start_date || '—'}</b></span>
            <span><Icon name="spark" size={14} /> Личностен въпросник: {e.disc_result
              ? <><b style={{ color: 'var(--orange)' }}>{e.disc_result}</b>{' '}
                  <button className="linkbtn" style={{ color: 'var(--orange)', fontWeight: 700, fontSize: 13 }} disabled={busy === 'disc'} onClick={resetDisc}>разреши ново попълване</button></>
              : <b style={{ color: 'var(--ink)' }}>още не е попълнен</b>}</span>
          </div>
        </div>
        <Ring percent={data.overall} size={104} label="ОБЩО" />
        <div style={{ textAlign: 'center' }}>
          <div className="eyebrow" style={{ fontSize: 11 }}>Текущо ниво</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{data.level}</div>
          <div className="muted" style={{ fontSize: 13 }}>{data.completedModules}/{data.totalModules} модула</div>
        </div>
      </div>

      {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

      {/* предадени тестове – чакат решение */}
      {pending.length > 0 && (
        <div className="card" style={{ padding: '18px 22px', marginBottom: 22, borderLeft: '5px solid var(--orange)' }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Чакат твоето решение</div>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 13.5 }}>
            Тестът е предаден и заключен. Реши дали служителят продължава към следващия модул, или повтаря този.
          </p>
          {pending.map((m) => (
            <div key={m.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--line-2)' }}>
              <div style={{ flex: '1 1 220px' }}>
                <b>{m.title}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>{m.cat} · опит {m.attempts} · предаден {(m.submitted_at || '').slice(0, 10)}</div>
              </div>
              <b className="tabnum" style={{ fontSize: 20, color: m.score >= 80 ? 'var(--green)' : '#C0392B', minWidth: 56, textAlign: 'right' }}>{m.score}%</b>
              <button className="btn sm" disabled={!!busy} onClick={() => approve(m)}><Icon name="check" size={16} /> Отключи следващия</button>
              <button className="btn ghost sm" disabled={!!busy} onClick={() => retry(m)}>Да повтори</button>
            </div>
          ))}
        </div>
      )}

      {/* прогрес по категории */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', marginBottom: 22 }}>
        {data.categories.map((c) => (
          <div key={c.id} className="card" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div className="ic" style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--tint)', color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Icon name={c.icon} size={19} />
              </div>
              <b style={{ flex: 1, fontSize: 14.5 }}>{c.title}</b>
              <span className="tabnum" style={{ fontWeight: 900 }}>{c.percent}%</span>
            </div>
            <Bar percent={c.percent} />
          </div>
        ))}
      </div>

      {/* таблица по модули (като инфографиката) */}
      <div className="eyebrow" style={{ marginBottom: 10 }}>Прогрес по модули</div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr><th>Модул</th><th>Категория</th><th>Статус</th><th>Оценка</th><th>Опити</th></tr>
          </thead>
          <tbody>
            {allModules.map((m) => (
              <tr key={m.id} style={{ cursor: 'default' }}>
                <td><b>{m.title}</b></td>
                <td className="muted">{m.cat}</td>
                <td><StatusPill status={m.status} /></td>
                <td className="tabnum" style={{ fontWeight: 800, color: m.status === 'completed' ? 'var(--green)' : m.status === 'submitted' ? 'var(--orange)' : 'var(--muted)' }}>
                  {m.score != null && (m.status === 'completed' || m.status === 'submitted') ? m.score + '%' : '—'}
                </td>
                <td className="tabnum muted">{m.attempts || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
