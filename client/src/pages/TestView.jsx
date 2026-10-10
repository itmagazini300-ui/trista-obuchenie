import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { Loading } from '../components.jsx';

export default function TestView() {
  const { id } = useParams();
  const nav = useNavigate();
  const [m, setM] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api.module(id).then(setM); setAnswers({}); setResult(null); }, [id]);
  if (!m) return <Loading />;

  if (m.locked) {
    return (
      <div className="wrap" style={{ maxWidth: 640 }}>
        <Link to={'/category/' + m.category.id} className="back"><Icon name="arrowl" size={16} /> {m.category.title}</Link>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)', marginBottom: 12 }}><Icon name="lock" size={44} /></div>
          <h1 style={{ fontSize: 22, textTransform: 'uppercase' }}>Тестът е заключен</h1>
          <p className="muted" style={{ marginTop: 8 }}>{m.discRequired ? 'Първо попълни личностния въпросник.' : 'Отключва се след одобрение на предишния модул.'}</p>
          <Link to={'/category/' + m.category.id} className="btn" style={{ marginTop: 16 }}>Към категорията</Link>
        </div>
      </div>
    );
  }

  // Вече предаден (чака решение) или одобрен – не се прави отново.
  if (m.testLocked && !result) {
    return (
      <div className="wrap" style={{ maxWidth: 640 }}>
        <Link to={'/module/' + m.id} className="back"><Icon name="arrowl" size={16} /> Обратно към урока</Link>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ color: m.status === 'completed' ? 'var(--green)' : 'var(--orange)', marginBottom: 12 }}><Icon name={m.status === 'completed' ? 'checkc' : 'lock'} size={44} /></div>
          <h1 style={{ fontSize: 22, textTransform: 'uppercase' }}>{m.status === 'completed' ? 'Модулът е завършен' : 'Тестът е предаден'}</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            Резултат: <b>{m.score}%</b>.{' '}
            {m.status === 'completed' ? 'Ментор или управител одобри модула.' : 'Ментор или управител ще реши дали продължаваш към следващия модул, или повтаряш този.'}
          </p>
          <Link to={'/category/' + m.category.id} className="btn" style={{ marginTop: 16 }}>Към категорията</Link>
        </div>
      </div>
    );
  }

  const allAnswered = m.questions.every((q) => answers[q.id] !== undefined);

  async function submit() {
    if (!confirm('Да предам ли теста? След предаване той се заключва и не може да се прави отново, докато ментор или управител не реши.')) return;
    setBusy(true);
    setErr('');
    try {
      const r = await api.submitTest(id, answers);
      setResult(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (ex) {
      setErr(ex.message);
    } finally { setBusy(false); }
  }

  // Верните отговори не се показват – тестът може да бъде върнат за повторение.
  const optClass = (q, idx) => (answers[q.id] === idx ? 'opt sel' : 'opt');

  return (
    <div className="wrap" style={{ maxWidth: 780 }}>
      <Link to={'/module/' + m.id} className="back"><Icon name="arrowl" size={16} /> Обратно към урока</Link>

      {result && (
        <div className={'result-banner ' + (result.passed ? 'pass' : 'fail')}>
          <div className="rp" style={{ color: result.passed ? 'var(--green)' : '#C0392B' }}>{result.score}%</div>
          <h2>Тестът е предаден</h2>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {result.correct} от {result.total} верни отговора
          </p>
          <div style={{ marginTop: 4, fontWeight: 700, color: 'var(--orange-dk)' }}>
            Модулът е заключен. Ментор или управител ще реши дали продължаваш към следващия, или го повтаряш.
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '10px 26px 20px' }}>
        <div style={{ padding: '16px 0 4px' }}>
          <span className="eyebrow">Тест</span>
          <h1 style={{ fontSize: 22, textTransform: 'uppercase', marginTop: 4 }}>{m.title}</h1>
        </div>
        {m.questions.map((q, i) => (
          <div key={q.id} className="q">
            <div className="qt">{i + 1}. {q.text}</div>
            {q.options.map((opt, idx) => (
              <label key={idx} className={optClass(q, idx)}>
                <input type="radio" name={'q' + q.id} style={{ display: 'none' }}
                  disabled={!!result}
                  checked={answers[q.id] === idx}
                  onChange={() => setAnswers((a) => ({ ...a, [q.id]: idx }))} />
                <span className="dot" />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {!result && (
          <button className="btn" disabled={!allAnswered || busy} onClick={submit}>
            {busy ? 'Проверка…' : 'Предай теста'}
          </button>
        )}
        {!result && !allAnswered && <span className="muted" style={{ alignSelf: 'center', fontSize: 13.5 }}>Отговори на всички въпроси, за да предадеш.</span>}
        {err && <span className="err" style={{ margin: 0 }}>{err}</span>}

        {result && (
          <>
            <button className="btn" onClick={() => nav('/category/' + m.category.id)}>Към категорията</button>
            <button className="btn ghost" onClick={() => nav('/module/' + m.id)}>Към урока</button>
          </>
        )}
      </div>
    </div>
  );
}
