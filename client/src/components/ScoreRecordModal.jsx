import React, { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import ScoreForm from '../ScoreForm.jsx';
import { formatRoundTime, roundTimeToSeconds, ScoreNum } from '../formatScore.jsx';

// mode: 'view' | 'edit'. publicMode hides the judge's name and disables edit
// entirely, regardless of `mode` (used by the public history page).
export default function ScoreRecordModal({ mode, record, onClose, onSaved, publicMode }) {
  const readOnly = mode === 'view' || publicMode;
  const [{ data: rules, loading }] = useAsync(() => api.getRoundRules(record.round_id), [record.round_id]);

  const [values, setValues] = useState(record.values_json || {});
  const [judgeName, setJudgeName] = useState(record.judge_name || '');
  const [minutes, setMinutes] = useState(
    record.round_time_seconds != null ? String(Math.floor(record.round_time_seconds / 60)) : ''
  );
  const [seconds, setSeconds] = useState(
    record.round_time_seconds != null ? String(Math.floor(record.round_time_seconds % 60)) : ''
  );
  const [tenths, setTenths] = useState(
    record.round_time_seconds != null ? String(Math.round((record.round_time_seconds % 1) * 10)) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.updateScore(record.id, {
        values,
        judge_name: judgeName,
        round_time_seconds: roundTimeToSeconds(minutes, seconds, tenths),
      });
      onSaved();
    } catch (e) {
      setError(e.message || 'خطا در ذخیره‌سازی');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-card record-modal">
        <h3>{readOnly ? 'مشاهده رکورد امتیاز' : 'ویرایش رکورد امتیاز'}</h3>
        <div className="record-modal-meta">
          <div><span>تیم</span><strong>{record.team_name}</strong></div>
          <div><span>لیگ</span><strong>{record.league}</strong></div>
          <div><span>راند</span><strong>{record.round_label || `راند ${record.round_number}`}</strong></div>
          <label>
            <span>زمان راند</span>
            <div className="time-inputs" dir="ltr" title="دقیقه : ثانیه">
              <input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" className="time-box" aria-label="دقیقه" disabled={readOnly} />
              <span className="time-sep" aria-hidden="true">:</span>
              <input type="number" min={0} max={59} value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="00" className="time-box" aria-label="ثانیه" disabled={readOnly} />
              <span className="time-sep" aria-hidden="true">.</span>
              <input type="number" min={0} max={9} value={tenths} onChange={(e) => setTenths(e.target.value)} placeholder="0" className="time-box time-box--tenths" aria-label="دهم ثانیه" disabled={readOnly} />
            </div>
          </label>
          {!publicMode && (
            <label>
              <span>نام داور</span>
              <input value={judgeName} onChange={(e) => setJudgeName(e.target.value)} placeholder="اختیاری" disabled={readOnly} />
            </label>
          )}
        </div>

        {loading && <p>در حال بارگذاری قوانین راند...</p>}
        {rules && <ScoreForm sections={rules.sections} values={values} onValuesChange={setValues} readOnly={readOnly} />}
        {!loading && !rules && (
          <p className="error">قوانین این راند بارگذاری نشد؛ امتیاز نهایی ثبت‌شده: <ScoreNum value={record.final_total} /></p>
        )}

        <div className="signature-block signature-block-readonly">
          <div className="signature-readonly-name">
            <span>کاپیتان تیم</span>
            <strong>{record.captain_name || '—'}</strong>
          </div>
          {record.captain_signature ? (
            <>
              <img src={record.captain_signature} alt="امضای کاپیتان تیم" className="signature-preview" />
              <span className="signature-hint">امضای تاییدکننده این راند</span>
            </>
          ) : (
            <span className="muted">امضایی برای این راند ثبت نشده</span>
          )}
        </div>

        {error && <p className="login-error">{error}</p>}

        <div className="confirm-actions">
          {!readOnly && (
            <button type="button" className="primary" disabled={saving} onClick={save}>
              {saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
            </button>
          )}
          <button type="button" disabled={saving} onClick={onClose}>
            {readOnly ? 'بستن' : 'انصراف'}
          </button>
        </div>
      </div>
    </div>
  );
}
