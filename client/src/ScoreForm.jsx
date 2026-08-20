import React, { useMemo } from 'react';
import { ScoreNum } from './formatScore.jsx';
import { calcSection } from './scoreCalc.js';

function ItemDetails({ item, value, onChange, readOnly }) {
  if (item.type === 'binary') {
    return (
      <label className="detail-single">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={readOnly} />
      </label>
    );
  }

  if (item.type === 'multi') {
    const arr = Array.isArray(value) ? value : [];
    const toggle = (opt) => {
      const has = arr.includes(opt);
      onChange(has ? arr.filter((o) => o !== opt) : [...arr, opt]);
    };
    return (
      <div className="opt-grid">
        {(item.options || []).map((opt) => (
          <label key={opt} className={'opt-chip' + (arr.includes(opt) ? ' checked' : '') + (readOnly ? ' opt-chip-disabled' : '')}>
            <span className="opt-chip-label">{opt}</span>
            <input type="checkbox" checked={arr.includes(opt)} onChange={() => toggle(opt)} disabled={readOnly} />
          </label>
        ))}
      </div>
    );
  }

  if (item.type === 'choice') {
    return (
      <div className="opt-grid opt-grid-wide">
        {(item.choices || []).map((c) => (
          <label key={c.label} className={'opt-chip opt-chip-wide' + (value === c.value ? ' checked' : '') + (readOnly ? ' opt-chip-disabled' : '')}>
            <span className="opt-chip-label">{c.label}</span>
            <input
              type="radio"
              name={item.key}
              checked={value === c.value}
              onChange={() => onChange(c.value)}
              disabled={readOnly}
            />
          </label>
        ))}
      </div>
    );
  }

  if (item.type === 'scale') {
    return (
      <div className="detail-numeric">
        <input
          type="number"
          min={0}
          max={item.points}
          value={value ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="num-input"
          disabled={readOnly}
        />
        <span className="numeric-hint">از {item.points}</span>
      </div>
    );
  }

  if (item.type === 'counter') {
    return (
      <div className="detail-numeric">
        <input
          type="number"
          min={0}
          value={value ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="num-input"
          disabled={readOnly}
        />
        <span className="numeric-hint">بار</span>
      </div>
    );
  }

  return null;
}

function ItemRow({ item, value, rowScore, onChange, readOnly }) {
  return (
    <tr className="item-row">
      <td className="col-label">{item.label}</td>
      <td className="col-pts"><ScoreNum value={item.points} /></td>
      <td className="col-details">
        <ItemDetails item={item} value={value} onChange={onChange} readOnly={readOnly} />
      </td>
      <td className="col-total"><ScoreNum value={rowScore} /></td>
    </tr>
  );
}

// Sections cycle through 5 color tones (tone-0..tone-4) instead of 4 fixed
// named ones, since the rule builder allows any number of sections per round.
function Section({ section, index, values, onChange, readOnly }) {
  const { total, breakdown } = useMemo(() => calcSection(section.items, values), [section.items, values]);
  const tone = index % 5;

  return (
    <div className={`sheet-section tone-${tone}`}>
      <div className="section-band">{section.label}</div>
      <table className="sheet-table">
        <thead>
          <tr>
            <th className="col-label">شرح آیتم</th>
            <th className="col-pts">امتیاز</th>
            <th className="col-details">جزئیات</th>
            <th className="col-total">جمع</th>
          </tr>
        </thead>
        <tbody>
          {section.items.map((item) => (
            <ItemRow
              key={item.key}
              item={item}
              value={values[item.key]}
              rowScore={breakdown[item.key]}
              onChange={(v) => onChange({ ...values, [item.key]: v })}
              readOnly={readOnly}
            />
          ))}
          {section.items.length === 0 && (
            <tr><td colSpan={4} className="muted">آیتمی برای این بخش تعریف نشده</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="section-total-row">
            <td className="total-label" colSpan={3}>جمع بخش {section.label}</td>
            <td className="col-total"><ScoreNum value={total} /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// sections: [{ key, label, items: [{key,label,type,points,options?,choices?}] }]
// values: { [sectionKey]: { [itemKey]: value } }
export default function ScoreForm({ sections, values, onValuesChange, readOnly }) {
  const v = values || {};

  const final = useMemo(
    () => (sections || []).reduce((sum, sec) => sum + calcSection(sec.items, v[sec.key] || {}).total, 0),
    [sections, v]
  );

  const update = (key, sectionValues) => onValuesChange({ ...v, [key]: sectionValues });

  if (!sections || sections.length === 0) {
    return <p className="muted">برای این راند هنوز بخش یا آیتمی در قوانین امتیازدهی تعریف نشده است.</p>;
  }

  return (
    <div className="score-form">
      {sections.map((section, i) => (
        <Section
          key={section.key}
          section={section}
          index={i}
          values={v[section.key] || {}}
          onChange={(s) => update(section.key, s)}
          readOnly={readOnly}
        />
      ))}
      <div className="final-total">
        <span>امتیاز نهایی کل</span>
        <strong><ScoreNum value={final} /></strong>
      </div>
    </div>
  );
}
