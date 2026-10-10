import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { Bar, Loading, initials } from '../components.jsx';

// Какво показва таблицата според избраната карта отгоре.
const VIEWS = {
  '': { filter: () => true },
  all: { filter: () => true },
  progress: { title: 'всички, подредени по напредък', filter: () => true, sort: (a, b) => b.overall - a.overall },
  trained: { title: 'напълно обучени', filter: (e) => e.overall === 100 },
  risk: { title: 'изоставащи (под 40%)', filter: (e) => e.overall < 40, sort: (a, b) => a.overall - b.overall },
  pending: { title: 'с тестове, които чакат решение', filter: (e) => e.pendingReviews > 0 },
};

export default function ManagerHome() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const company = params.get('company') || '';
  const store = params.get('store') || '';
  const show = params.get('show') || '';
  const [data, setData] = useState(null);
  const [groups, setGroups] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  useEffect(() => {
    api.adminCompanies().then(setGroups).catch(() => setGroups({ companies: [], unassigned: { stores: [] } }));
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoadErr(null);
    api.managerOverview({ company, store })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((ex) => { if (!cancelled) setLoadErr(ex); });
    return () => { cancelled = true; };
  }, [company, store]);
  if (loadErr) {
    return (
      <div className="wrap">
        <div className="err">Таблото не можа да се зареди. Опитай отново.{loadErr.message ? ` (${loadErr.message})` : ''}</div>
      </div>
    );
  }
  if (!data || !groups) return <Loading />;

  const { stats } = data;
  const view = VIEWS[show] || VIEWS[''];
  const employees = view.sort ? [...data.employees.filter(view.filter)].sort(view.sort) : data.employees.filter(view.filter);
  const storesOf = company === 'none' ? groups.unassigned.stores
    : company ? (groups.companies.find((c) => String(c.id) === company)?.stores || [])
    : [...groups.companies.flatMap((c) => c.stores), ...groups.unassigned.stores];
  const setFilter = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  // Клик върху карта показва само тези служители; втори клик – всички.
  const toggleShow = (key) => setFilter({ company, store, show: show === key ? '' : key });
  const Card = ({ k, icon, color, value, label, hint }) => (
    <button type="button" className={'card stat click' + (show === k ? ' on' : '')} onClick={() => toggleShow(k)} title="Покажи в таблицата">
      <div className="ic" style={color}><Icon name={icon} size={24} /></div>
      <div><b>{value}</b><span>{label}</span>{hint && <span className="hint">{hint}</span>}</div>
    </button>
  );

  return (
    <div className="wrap">
      <div className="page-head">
        <div className="eyebrow">Интерфейс за управители</div>
        <h1>Обучение на екипа</h1>
        <p>Единен поглед върху развитието на всеки служител — кои модули са завършени, оценки и напредък в реално време.</p>
      </div>

      <div className="stats">
        <Card k="all" icon="users" value={stats.total} label="служители в обучение" />
        <Card k="progress" icon="trend" value={stats.avgProgress + '%'} label={'среден напредък · ' + stats.avgLevel}
          hint="колко от модулите са минати средно" />
        <Card k="trained" icon="checkc" color={{ background: 'var(--green-bg)', color: 'var(--green)' }} value={stats.fullyTrained} label="напълно обучени" />
        <Card k="risk" icon="alert" color={{ background: '#FBEAEA', color: '#C0392B' }} value={stats.atRisk} label="изостават (под 40%)" />
        <Card k="pending" icon="clock" value={stats.pendingReviews} label="теста чакат решение" />
      </div>

      <div className="card" style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div className="field" style={{ margin: 0, flex: '1 1 240px' }}><label>Фирма</label>
          <select value={company} onChange={(e) => setFilter({ company: e.target.value })}>
            <option value="">Всички фирми</option>
            {groups.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="none">— без фирма —</option>
          </select></div>
        <div className="field" style={{ margin: 0, flex: '1 1 200px' }}><label>Обект</label>
          <select value={store} onChange={(e) => setFilter({ company, store: e.target.value })}>
            <option value="">Всички обекти</option>
            {storesOf.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select></div>
        {(company || store || show) && <button className="btn ghost sm" onClick={() => setFilter({})}>Изчисти</button>}
      </div>

      {show && show !== 'all' && (
        <div className="muted" style={{ margin: '0 0 10px', fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          Показани: <b style={{ color: 'var(--ink)' }}>{view.title}</b> ({employees.length})
          <button className="linkbtn" style={{ color: 'var(--orange)', fontWeight: 700 }} onClick={() => toggleShow(show)}>покажи всички</button>
        </div>
      )}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Служител</th><th>Магазин</th><th>Фирма</th><th>Ментор</th>
              <th style={{ width: 220 }}>Прогрес</th><th>Ниво</th><th>Модули</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} onClick={() => nav('/manager/employee/' + e.id)}>
                <td>
                  <div className="emp">
                    <div className="av">{initials(e.name)}</div>
                    <div><b>{e.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{e.position}</div></div>
                  </div>
                </td>
                <td className="muted">{e.store}</td>
                <td className="muted">{e.company || '—'}</td>
                <td className="muted">{e.mentor || '—'}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}><Bar percent={e.overall} /></div>
                    <b className="tabnum" style={{ width: 42, textAlign: 'right' }}>{e.overall}%</b>
                  </div>
                </td>
                <td><span className="pill n" style={{ background: 'var(--tint)', color: 'var(--orange-dk)' }}>{e.level}</span></td>
                <td className="tabnum muted" style={{ whiteSpace: 'nowrap' }}>
                  {e.completedModules}/{e.totalModules}
                  {e.pendingReviews > 0 && <span className="pill a" style={{ marginLeft: 8 }} title="Предадени тестове, които чакат решение">{e.pendingReviews} чака</span>}
                </td>
              </tr>
            ))}
            {employees.length === 0 && <tr style={{ cursor: 'default' }}><td colSpan={7} className="muted">Няма служители за избрания филтър.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
