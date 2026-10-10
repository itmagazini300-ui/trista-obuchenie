import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { Bar, Loading, StatusPill } from '../components.jsx';

export default function CategoryView() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => { api.catalog().then(setData); }, []);
  if (!data) return <Loading />;

  const cat = data.categories.find((c) => String(c.id) === String(id));
  if (!cat) return <div className="wrap"><p>Категорията не е намерена.</p></div>;

  return (
    <div className="wrap">
      <Link to="/" className="back"><Icon name="arrowl" size={16} /> Всички категории</Link>

      <div className="card" style={{ padding: '24px 26px', display: 'flex', gap: 18, alignItems: 'center', marginBottom: 20 }}>
        <div className="ic" style={{ width: 58, height: 58, borderRadius: 14, background: 'var(--tint)', color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name={cat.icon} size={32} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 26, textTransform: 'uppercase' }}>{cat.title}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>{cat.description}</p>
        </div>
        <div style={{ textAlign: 'right', minWidth: 130 }}>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{cat.percent}%</div>
          <div className="muted" style={{ fontSize: 13 }}>{cat.completedCount}/{cat.moduleCount} модула</div>
          <div style={{ marginTop: 8 }}><Bar percent={cat.percent} /></div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13.5, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon name="lock" size={15} /> {data.discRequired
          ? 'Модулите се отключват, след като попълниш личностния въпросник.'
          : 'Модулите се отключват един по един — след като предадеш теста, ментор или управител отключва следващия.'}
      </p>
      <div className="card">
        {cat.modules.map((m, i) => (
          m.locked ? (
            <div key={m.id} className="modrow locked" aria-disabled="true">
              <div className="num lock"><Icon name="lock" size={15} /></div>
              <div className="t">
                <b>{m.title}</b>
                <span>{data.discRequired ? 'Първо попълни личностния въпросник.'
                  : cat.modules[i - 1]?.status === 'submitted' ? 'Чака решение на ментора/управителя за предишния модул.'
                  : 'Отключва се след одобрение на предишния модул.'}</span>
              </div>
              <StatusPill status={m.status} />
            </div>
          ) : (
            <div key={m.id} className="modrow" onClick={() => nav('/module/' + m.id)} style={{ cursor: 'pointer' }}>
              <div className={'num' + (m.status === 'completed' ? ' done' : '')}>
                {m.status === 'completed' ? <Icon name="check" size={15} /> : m.status === 'submitted' ? <Icon name="clock" size={15} /> : i + 1}
              </div>
              <div className="t">
                <b>{m.title}</b>
                <span>{m.summary}{m.duration ? ` · ~${m.duration} мин` : ''}</span>
              </div>
              {(m.status === 'completed' || m.status === 'submitted') && <span className="sc">{m.score}%</span>}
              <StatusPill status={m.status} />
              <Icon name="arrowr" size={18} className="muted" />
            </div>
          )
        ))}
      </div>
    </div>
  );
}
