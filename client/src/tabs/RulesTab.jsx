import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { LEAGUES } from '../constants.js';

const ITEM_TYPES = [
  { value: 'binary', label: 'بله/خیر (تیک)' },
  { value: 'multi', label: 'چندگزینه‌ای (چند مورد قابل انتخاب)' },
  { value: 'choice', label: 'انتخابی (فقط یک مورد)' },
  { value: 'scale', label: 'عددی با سقف امتیاز' },
  { value: 'counter', label: 'شمارشی (هر بار تکرار = امتیاز)' },
];

function RoundForm({ league, initial, onSubmit, onCancel }) {
  const [round_number, setRoundNumber] = useState(initial?.round_number ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [requires_timer, setRequiresTimer] = useState(initial?.requires_timer ?? true);
  const [requires_captain_signature, setRequiresSignature] = useState(initial?.requires_captain_signature ?? true);
  const [floor_negative_total_to_zero, setFloorNegativeTotal] = useState(initial?.floor_negative_total_to_zero ?? false);
  const [allows_multiple_tries, setAllowsMultipleTries] = useState(initial?.allows_multiple_tries ?? false);
  const [sort_order, setSortOrder] = useState(initial?.sort_order ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        league,
        round_number: Number(round_number),
        label: label.trim() || null,
        requires_timer,
        requires_captain_signature,
        floor_negative_total_to_zero,
        allows_multiple_tries,
        sort_order: sort_order === '' ? Number(round_number) : Number(sort_order),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="card">
      <div className="form-grid">
        <label>
          <span>شماره راند</span>
          <input type="number" min={1} value={round_number} onChange={(e) => setRoundNumber(e.target.value)} required />
        </label>
        <label>
          <span>عنوان راند (اختیاری)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثلاً: راند مقدماتی" />
        </label>
        <label>
          <span>ترتیب نمایش (اختیاری)</span>
          <input type="number" value={sort_order} onChange={(e) => setSortOrder(e.target.value)} placeholder={String(round_number || '')} />
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={requires_timer} onChange={(e) => setRequiresTimer(e.target.checked)} />
          <span>این راند به تایمر نیاز دارد</span>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={requires_captain_signature} onChange={(e) => setRequiresSignature(e.target.checked)} />
          <span>این راند به امضای کاپیتان نیاز دارد</span>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={floor_negative_total_to_zero} onChange={(e) => setFloorNegativeTotal(e.target.checked)} />
          <span>اگر مجموع امتیاز راند منفی شد، صفر در نظر گرفته شود</span>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={allows_multiple_tries} onChange={(e) => setAllowsMultipleTries(e.target.checked)} />
          <span>چند تلاش کامل مجاز است (بهترین امتیاز برای رده‌بندی)</span>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="btn-row">
        <button type="submit" className="primary" disabled={saving}>{saving ? 'در حال ذخیره...' : 'ذخیره راند'}</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={saving}>انصراف</button>}
      </div>
    </form>
  );
}

function parseOptionsText(text) {
  return text.split('\n').map((s) => s.trim()).filter(Boolean);
}

function parseChoicesText(text) {
  return text.split('\n').map((s) => s.trim()).filter(Boolean).map((line) => {
    const [label, value] = line.split('|').map((s) => s.trim());
    return { label: label || line, value: Number(value) || 0 };
  });
}

function ItemForm({ initial, onSubmit, onCancel }) {
  const [key, setKey] = useState(initial?.key ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [type, setType] = useState(initial?.type ?? 'binary');
  const [points, setPoints] = useState(initial?.points ?? 0);
  const [optionsText, setOptionsText] = useState((initial?.options || []).join('\n'));
  const [choicesText, setChoicesText] = useState((initial?.choices || []).map((c) => `${c.label}|${c.value}`).join('\n'));
  const [sort_order, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        key: key.trim(),
        label: label.trim(),
        type,
        points: Number(points) || 0,
        options: type === 'multi' ? parseOptionsText(optionsText) : undefined,
        choices: type === 'choice' ? parseChoicesText(choicesText) : undefined,
        sort_order: Number(sort_order) || 0,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="card" style={{ marginBottom: 10 }}>
      <div className="form-grid">
        <label>
          <span>کلید یکتا (انگلیسی، بدون فاصله)</span>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="مثلاً: launched" required disabled={!!initial} />
        </label>
        <label>
          <span>عنوان نمایشی</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} required />
        </label>
        <label>
          <span>نوع آیتم</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        {type !== 'choice' && (
          <label>
            <span>{type === 'scale' ? 'سقف امتیاز' : type === 'counter' ? 'امتیاز هر بار' : 'امتیاز'}</span>
            <input type="number" step="any" value={points} onChange={(e) => setPoints(e.target.value)} />
          </label>
        )}
        <label>
          <span>ترتیب نمایش</span>
          <input type="number" value={sort_order} onChange={(e) => setSortOrder(e.target.value)} />
        </label>
      </div>

      {type === 'multi' && (
        <label style={{ display: 'block', marginBottom: 10 }}>
          <span className="rule-item-type-hint">هر گزینه در یک خط. هر گزینه‌ی انتخاب‌شده {points || 0} امتیاز می‌دهد.</span>
          <textarea rows={3} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder={'وظیفه ۱\nوظیفه ۲\nوظیفه ۳'} />
        </label>
      )}
      {type === 'choice' && (
        <label style={{ display: 'block', marginBottom: 10 }}>
          <span className="rule-item-type-hint">هر گزینه در یک خط، به‌صورت «عنوان|امتیاز» — فقط یکی قابل انتخاب است.</span>
          <textarea rows={3} value={choicesText} onChange={(e) => setChoicesText(e.target.value)} placeholder={'ضعیف|0\nخوب|5\nعالی|10'} />
        </label>
      )}

      {error && <p className="error">{error}</p>}
      <div className="btn-row">
        <button type="submit" className="primary" disabled={saving}>{saving ? 'در حال ذخیره...' : 'ذخیره آیتم'}</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={saving}>انصراف</button>}
      </div>
    </form>
  );
}

function ItemRow({ item, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <ItemForm
        initial={item}
        onCancel={() => setEditing(false)}
        onSubmit={async (payload) => { await onEdit(item.id, payload); setEditing(false); }}
      />
    );
  }
  return (
    <div className="item-editor-row">
      <span>{item.label}</span>
      <span>{ITEM_TYPES.find((t) => t.value === item.type)?.label || item.type}</span>
      <span>{item.type === 'choice' ? '—' : item.points}</span>
      <span className="item-editor-options">
        {item.type === 'multi' && (item.options || []).join('، ')}
        {item.type === 'choice' && (item.choices || []).map((c) => `${c.label}(${c.value})`).join('، ')}
      </span>
      <span className="btn-row">
        <button type="button" className="link" onClick={() => setEditing(true)}>ویرایش</button>
        <button type="button" className="link-danger" onClick={() => onDelete(item.id)}>حذف</button>
      </span>
    </div>
  );
}

function SectionEditor({ section, onReload }) {
  const [editingSection, setEditingSection] = useState(false);
  const [sLabel, setSLabel] = useState(section.label);
  const [sKey, setSKey] = useState(section.key);
  const [addingItem, setAddingItem] = useState(false);

  const saveSection = async (e) => {
    e.preventDefault();
    await api.updateSection(section.id, { key: sKey.trim(), label: sLabel.trim() });
    setEditingSection(false);
    onReload();
  };

  const deleteSection = async () => {
    if (!confirm(`حذف بخش «${section.label}» و تمام آیتم‌های آن؟`)) return;
    await api.deleteSection(section.id);
    onReload();
  };

  return (
    <div className="section-editor">
      <div className="section-editor-header">
        {editingSection ? (
          <form onSubmit={saveSection} className="inline-form" style={{ flex: 1 }}>
            <input value={sLabel} onChange={(e) => setSLabel(e.target.value)} placeholder="عنوان بخش" />
            <input value={sKey} onChange={(e) => setSKey(e.target.value)} placeholder="کلید بخش" />
            <button type="submit">ذخیره</button>
            <button type="button" onClick={() => setEditingSection(false)}>انصراف</button>
          </form>
        ) : (
          <>
            <h4>{section.label}</h4>
            <div className="btn-row">
              <button type="button" className="link" onClick={() => setEditingSection(true)}>ویرایش بخش</button>
              <button type="button" className="link-danger" onClick={deleteSection}>حذف بخش</button>
            </div>
          </>
        )}
      </div>

      {section.items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          onEdit={async (id, payload) => { await api.updateItem(id, payload); onReload(); }}
          onDelete={async (id) => { if (confirm('حذف این آیتم؟')) { await api.deleteItem(id); onReload(); } }}
        />
      ))}
      {section.items.length === 0 && <p className="muted">آیتمی در این بخش نیست.</p>}

      {addingItem ? (
        <ItemForm
          onCancel={() => setAddingItem(false)}
          onSubmit={async (payload) => { await api.createItem(section.id, payload); setAddingItem(false); onReload(); }}
        />
      ) : (
        <button type="button" onClick={() => setAddingItem(true)}>+ افزودن آیتم</button>
      )}
    </div>
  );
}

export default function RulesTab() {
  const [league, setLeague] = useState(LEAGUES[0]);
  const [{ data: rounds }, reloadRounds] = useAsync(() => api.getRounds(league), [league]);
  const [selectedRoundId, setSelectedRoundId] = useState('');
  const [addingRound, setAddingRound] = useState(false);
  const [editingRoundId, setEditingRoundId] = useState(null);
  const [addingSection, setAddingSection] = useState(false);
  const [sectionForm, setSectionForm] = useState({ key: '', label: '', sort_order: 0 });
  const [sectionError, setSectionError] = useState('');

  useEffect(() => {
    if (rounds && rounds.length > 0 && !rounds.some((r) => String(r.id) === String(selectedRoundId))) {
      setSelectedRoundId(String(rounds[0].id));
    }
    if (rounds && rounds.length === 0) setSelectedRoundId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds]);

  const [{ data: rules }, reloadRules] = useAsync(
    () => (selectedRoundId ? api.getRoundRules(selectedRoundId) : Promise.resolve(null)),
    [selectedRoundId]
  );

  const addSection = async (e) => {
    e.preventDefault();
    setSectionError('');
    try {
      await api.createSection(selectedRoundId, sectionForm);
      setSectionForm({ key: '', label: '', sort_order: 0 });
      setAddingSection(false);
      reloadRules();
    } catch (err) {
      setSectionError(err.message);
    }
  };

  return (
    <div className="tab-content">
      <h2>قوانین امتیازدهی</h2>
      <p className="rule-item-type-hint">
        در این تب می‌توانید راندهای هر لیگ و بخش/آیتم‌های امتیازدهی هر راند را بدون نیاز به تغییر کد تعریف کنید.
      </p>

      <select value={league} onChange={(e) => { setLeague(e.target.value); setSelectedRoundId(''); }}>
        {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>

      <ul className="round-list">
        {(rounds || []).map((r) => (
          <li key={r.id}>
            {editingRoundId === r.id ? (
              <div className="card" style={{ width: '100%' }}>
                <RoundForm
                  league={league}
                  initial={r}
                  onCancel={() => setEditingRoundId(null)}
                  onSubmit={async (payload) => { await api.updateRound(r.id, payload); setEditingRoundId(null); reloadRounds(); reloadRules(); }}
                />
              </div>
            ) : (
              <div className={'round-list-item' + (String(r.id) === String(selectedRoundId) ? ' active' : '')} onClick={() => setSelectedRoundId(String(r.id))}>
                <span className="round-list-item-title">{r.label || `راند ${r.round_number}`}</span>
                <span className="round-list-item-meta">
                  <span className={'flag-badge' + (r.requires_timer ? ' flag-badge--on' : '')}>تایمر {r.requires_timer ? 'الزامی' : 'غیرفعال'}</span>
                  <span className={'flag-badge' + (r.requires_captain_signature ? ' flag-badge--on' : '')}>امضا {r.requires_captain_signature ? 'الزامی' : 'غیرفعال'}</span>
                  <span className={'flag-badge' + (r.floor_negative_total_to_zero ? ' flag-badge--on' : '')}>
                    منفی → صفر {r.floor_negative_total_to_zero ? 'فعال' : 'غیرفعال'}
                  </span>
                  <span className={'flag-badge' + (r.allows_multiple_tries ? ' flag-badge--on' : '')}>
                    چند تلاش {r.allows_multiple_tries ? 'فعال' : 'غیرفعال'}
                  </span>
                  <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setEditingRoundId(r.id); }}>ویرایش</button>
                  <button
                    type="button"
                    className="link-danger"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`حذف راند «${r.label || r.round_number}»؟`)) return;
                      try { await api.deleteRound(r.id); reloadRounds(); } catch (err) { alert(err.message); }
                    }}
                  >
                    حذف
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
        {(rounds || []).length === 0 && <li className="muted">راندی برای این لیگ تعریف نشده.</li>}
      </ul>

      {addingRound ? (
        <RoundForm
          league={league}
          onCancel={() => setAddingRound(false)}
          onSubmit={async (payload) => { const r = await api.createRound(payload); setAddingRound(false); reloadRounds(); setSelectedRoundId(String(r.id)); }}
        />
      ) : (
        <button type="button" onClick={() => setAddingRound(true)}>+ افزودن راند جدید</button>
      )}

      {rules && (
        <div style={{ marginTop: 22 }}>
          <div className="card-header">
            <h3>بخش‌ها و آیتم‌های «{rules.round.label || `راند ${rules.round.round_number}`}»</h3>
          </div>

          {rules.sections.map((section) => (
            <SectionEditor key={section.id} section={section} onReload={reloadRules} />
          ))}

          {addingSection ? (
            <form onSubmit={addSection} className="card">
              <div className="form-grid">
                <label>
                  <span>کلید بخش (انگلیسی)</span>
                  <input value={sectionForm.key} onChange={(e) => setSectionForm((s) => ({ ...s, key: e.target.value }))} placeholder="مثلاً: performance" required />
                </label>
                <label>
                  <span>عنوان بخش</span>
                  <input value={sectionForm.label} onChange={(e) => setSectionForm((s) => ({ ...s, label: e.target.value }))} placeholder="مثلاً: عملکرد ربات" required />
                </label>
                <label>
                  <span>ترتیب نمایش</span>
                  <input type="number" value={sectionForm.sort_order} onChange={(e) => setSectionForm((s) => ({ ...s, sort_order: e.target.value }))} />
                </label>
              </div>
              {sectionError && <p className="error">{sectionError}</p>}
              <div className="btn-row">
                <button type="submit" className="primary">ذخیره بخش</button>
                <button type="button" onClick={() => setAddingSection(false)}>انصراف</button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setAddingSection(true)}>+ افزودن بخش جدید</button>
          )}
        </div>
      )}
    </div>
  );
}
