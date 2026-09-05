import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import ScoreForm from '../ScoreForm.jsx';
import SignaturePad from '../SignaturePad.jsx';
import { formatRoundTime, roundTimeToSeconds, ScoreNum } from '../formatScore.jsx';
import { calcRoundTotals } from '../scoreCalc.js';
import { LEAGUES } from '../constants.js';

function SavedTrySheet({ tryRecord, sections, tryNumber }) {
  return (
    <section className="try-sheet try-sheet--saved">
      <header className="try-sheet-header">
        <h3>تلاش {tryNumber}</h3>
        <div className="try-sheet-meta">
          {tryRecord.round_time_seconds != null && (
            <span>زمان: <span className="num-ltr" dir="ltr">{formatRoundTime(tryRecord.round_time_seconds)}</span></span>
          )}
          <span>امتیاز: <strong><ScoreNum value={tryRecord.final_total} /></strong></span>
          {tryRecord.judge_name && <span>داور: {tryRecord.judge_name}</span>}
        </div>
      </header>
      <ScoreForm sections={sections} values={tryRecord.values_json || {}} readOnly />
    </section>
  );
}

export default function ScoreEntryTab() {
  const [league, setLeague] = useState(LEAGUES[0]);
  const [{ data: teams }] = useAsync(() => api.getTeams(league), [league]);
  const [{ data: rounds }] = useAsync(() => api.getRounds(league), [league]);
  const [teamId, setTeamId] = useState('');
  const [roundId, setRoundId] = useState('');
  const [judge, setJudge] = useState('');
  const [roundMinutes, setRoundMinutes] = useState('');
  const [roundSeconds, setRoundSeconds] = useState('');
  const [roundTenths, setRoundTenths] = useState('');
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [captainName, setCaptainName] = useState('');
  const [captainSignature, setCaptainSignature] = useState(null);

  // Round timer: start/stop stopwatch that auto-fills the minute/second/tenth
  // boxes above. The boxes stay editable by hand once the timer is stopped.
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerIntervalRef = useRef(null);
  const timerStartRef = useRef(0);
  const [resetTimerConfirmOpen, setResetTimerConfirmOpen] = useState(false);
  const newTryAnchorRef = useRef(null);

  // Auto-select the first round for this league once rounds load.
  useEffect(() => {
    if (rounds && rounds.length > 0 && !rounds.some((r) => String(r.id) === String(roundId))) {
      setRoundId(String(rounds[0].id));
    }
    if (rounds && rounds.length === 0) setRoundId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds]);

  const [{ data: rules, loading: rulesLoading }] = useAsync(
    () => (roundId ? api.getRoundRules(roundId) : Promise.resolve(null)),
    [roundId]
  );
  const round = rules?.round;
  const sections = rules?.sections || [];
  const allowsMultipleTries = !!round?.allows_multiple_tries;

  const [{ data: existingTriesRaw, loading: triesLoading }, reloadTries] = useAsync(
    () => (
      allowsMultipleTries && teamId && roundId
        ? api.getScores({ team_id: teamId, round_id: roundId })
        : Promise.resolve([])
    ),
    [allowsMultipleTries, teamId, roundId]
  );

  const existingTries = useMemo(() => {
    const list = [...(existingTriesRaw || [])];
    list.sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return ta - tb || a.id - b.id;
    });
    return list;
  }, [existingTriesRaw]);

  const sharedSignatureTry = existingTries.find((t) => t.captain_signature);
  const hasSharedSignature = !!sharedSignatureTry?.captain_signature;
  const nextTryNumber = existingTries.length + 1;

  useEffect(() => {
    if (!timerRunning) return undefined;
    timerStartRef.current = Date.now() - elapsedMs;
    timerIntervalRef.current = setInterval(() => {
      const ms = Date.now() - timerStartRef.current;
      setElapsedMs(ms);
      setRoundMinutes(String(Math.floor(ms / 60000)));
      setRoundSeconds(String(Math.floor((ms % 60000) / 1000) % 60));
      setRoundTenths(String(Math.floor((ms % 1000) / 100)));
    }, 100);
    return () => clearInterval(timerIntervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning]);

  const toggleTimer = () => setTimerRunning((r) => !r);
  const resetTimer = () => {
    setTimerRunning(false);
    setElapsedMs(0);
    setRoundMinutes('');
    setRoundSeconds('');
    setRoundTenths('');
  };
  const requestResetTimer = () => setResetTimerConfirmOpen(true);
  const confirmResetTimer = () => {
    resetTimer();
    setResetTimerConfirmOpen(false);
  };

  const selectedTeam = (teams || []).find((t) => String(t.id) === String(teamId));

  const previewTotals = useMemo(() => calcRoundTotals(sections, values, round), [sections, values, round]);

  const clearSheetFields = ({ keepSignature = false } = {}) => {
    setValues({});
    setRoundMinutes('');
    setRoundSeconds('');
    setRoundTenths('');
    setTimerRunning(false);
    setElapsedMs(0);
    if (!keepSignature) {
      setCaptainName('');
      setCaptainSignature(null);
    }
  };

  // Reset everything (including team) whenever the league changes.
  useEffect(() => {
    setTeamId('');
    clearSheetFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league]);

  // Clear sheet when switching rounds (team stays selected).
  useEffect(() => {
    clearSheetFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  // New team → fresh signature context.
  useEffect(() => {
    clearSheetFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const advanceToNextRound = () => {
    if (!rounds || !round) return;
    const ordered = [...rounds].sort((a, b) => (a.sort_order - b.sort_order) || (a.round_number - b.round_number));
    const idx = ordered.findIndex((r) => r.id === round.id);
    if (idx >= 0 && idx < ordered.length - 1) setRoundId(String(ordered[idx + 1].id));
  };

  const openConfirm = () => {
    if (!teamId) { setMessage('لطفا تیم را انتخاب کنید'); return; }
    if (!roundId) { setMessage('لطفا راند را انتخاب کنید'); return; }
    setMessage('');
    setConfirmOpen(true);
  };

  const needsSignature = !!round?.requires_captain_signature;
  const needsTimer = !!round?.requires_timer;
  // Multi-try: signature once for the team+round; later tries reuse it.
  const needsSignatureNow = needsSignature && !(allowsMultipleTries && hasSharedSignature);

  const save = async () => {
    if (needsSignatureNow && !captainSignature) {
      setMessage('برای ثبت راند، کاپیتان تیم باید امضا کند');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const round_time_seconds = roundTimeToSeconds(roundMinutes, roundSeconds, roundTenths);
      await api.addScore({
        team_id: teamId,
        round_id: roundId,
        values,
        judge_name: judge,
        round_time_seconds: needsTimer ? (round_time_seconds || 0) : null,
        captain_name: needsSignatureNow ? captainName : (captainName || sharedSignatureTry?.captain_name || null),
        captain_signature: needsSignatureNow ? captainSignature : (captainSignature || null),
      });
      setMessage(allowsMultipleTries
        ? `تلاش ${nextTryNumber} ذخیره شد ✔ می‌توانید تلاش بعدی را پایین صفحه ثبت کنید.`
        : 'امتیاز با موفقیت ذخیره شد ✔');
      setConfirmOpen(false);
      if (allowsMultipleTries) {
        clearSheetFields({ keepSignature: true });
        try {
          await reloadTries();
        } catch {
          // Score already saved; list refresh failure shouldn't look like a save error.
        }
        requestAnimationFrame(() => {
          newTryAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } else {
        clearSheetFields();
        advanceToNextRound();
      }
    } catch (e) {
      setMessage('خطا: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const showForm = !rulesLoading && sections.length > 0 && (!allowsMultipleTries || !!teamId);

  return (
    <div className="tab-content">
      <h2>ثبت امتیاز راند</h2>
      <div className="entry-controls">
        <label className="entry-field">
          <span className="entry-field-label">لیگ</span>
          <select value={league} onChange={(e) => setLeague(e.target.value)}>
            {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="entry-field entry-field--team">
          <span className="entry-field-label">تیم</span>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">-- انتخاب تیم --</option>
            {(teams || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="entry-field entry-field--round">
          <span className="entry-field-label">راند</span>
          <select value={roundId} onChange={(e) => setRoundId(e.target.value)}>
            {(rounds || []).length === 0 && <option value="">راندی تعریف نشده</option>}
            {(rounds || []).map((r) => (
              <option key={r.id} value={r.id}>{r.label || `راند ${r.round_number}`}</option>
            ))}
          </select>
        </label>
        {needsTimer && !allowsMultipleTries && (
          <label className="entry-field entry-field--time">
            <span className="entry-field-label">زمان راند</span>
            <div className="time-inputs" dir="ltr" title="دقیقه : ثانیه">
              <input type="number" min={0} value={roundMinutes} onChange={(e) => setRoundMinutes(e.target.value)} placeholder="0" className="time-box" aria-label="دقیقه" disabled={timerRunning} />
              <span className="time-sep" aria-hidden="true">:</span>
              <input type="number" min={0} max={59} value={roundSeconds} onChange={(e) => setRoundSeconds(e.target.value)} placeholder="00" className="time-box" aria-label="ثانیه" disabled={timerRunning} />
              <span className="time-sep" aria-hidden="true">.</span>
              <input type="number" min={0} max={9} value={roundTenths} onChange={(e) => setRoundTenths(e.target.value)} placeholder="0" className="time-box time-box--tenths" aria-label="دهم ثانیه" disabled={timerRunning} />
            </div>
          </label>
        )}
        <label className="entry-field">
          <span className="entry-field-label">نام داور</span>
          <input value={judge} onChange={(e) => setJudge(e.target.value)} placeholder="اختیاری" />
        </label>
      </div>

      {allowsMultipleTries && (
        <p className="try-mode-hint">
          این راند چند تلاش کامل دارد؛ بهترین امتیاز (و در صورت تساوی کمترین زمان) در رده‌بندی لحاظ می‌شود. امضای کاپیتان فقط یک‌بار برای همه تلاش‌ها لازم است.
        </p>
      )}

      {needsTimer && !allowsMultipleTries && (
        <div className="timer-row">
          <span className="timer-row-label">تایمر راند:</span>
          <span className="timer-display" dir="ltr">{formatRoundTime(elapsedMs / 1000)}</span>
          <button type="button" className={timerRunning ? 'timer-btn timer-btn--stop' : 'timer-btn timer-btn--start'} onClick={toggleTimer}>
            {timerRunning ? '⏸ توقف' : '▶ شروع'}
          </button>
          <button type="button" className="timer-btn timer-btn--reset" onClick={requestResetTimer} disabled={timerRunning}>
            ریست
          </button>
          <span className="timer-hint">تایمر جعبه‌های دقیقه/ثانیه/دهم‌ثانیه را پر می‌کند؛ پس از توقف می‌توانید آن‌ها را دستی هم اصلاح کنید.</span>
        </div>
      )}

      {resetTimerConfirmOpen && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-timer-title">
          <div className="confirm-card confirm-card--small">
            <h3 id="reset-timer-title">آیا از ریست تایمر مطمئن هستید؟</h3>
            <p className="confirm-hint">زمان ثبت‌شده فعلی پاک می‌شود و باید تایمر را دوباره شروع کنید.</p>
            <div className="confirm-actions">
              <button type="button" className="primary danger" onClick={confirmResetTimer}>بله، ریست شود</button>
              <button type="button" onClick={() => setResetTimerConfirmOpen(false)}>انصراف</button>
            </div>
          </div>
        </div>
      )}

      {rulesLoading && <p>در حال بارگذاری قوانین راند...</p>}
      {!rulesLoading && roundId && sections.length === 0 && (
        <p className="muted">برای این راند هنوز بخش یا آیتمی در قوانین امتیازدهی تعریف نشده است. از تب «قوانین امتیازدهی» آن را تنظیم کنید.</p>
      )}

      {allowsMultipleTries && teamId && (
        <div className="prior-tries">
          {triesLoading && <p className="muted">در حال بارگذاری تلاش‌های قبلی...</p>}
          {!triesLoading && existingTries.map((t, i) => (
            <SavedTrySheet
              key={t.id}
              tryRecord={t}
              sections={sections}
              tryNumber={t.try_number || i + 1}
            />
          ))}
        </div>
      )}

      {allowsMultipleTries && !teamId && sections.length > 0 && (
        <p className="muted">برای دیدن تلاش‌ها و ثبت تلاش جدید، ابتدا تیم را انتخاب کنید.</p>
      )}

      {showForm && (
        <div ref={newTryAnchorRef} className="try-sheet try-sheet--new">
          {allowsMultipleTries && (
            <header className="try-sheet-header">
              <h3>تلاش {nextTryNumber} (جدید)</h3>
            </header>
          )}
          {needsTimer && allowsMultipleTries && (
            <>
              <div className="try-sheet-time-row">
                <label className="entry-field entry-field--time">
                  <span className="entry-field-label">زمان این تلاش</span>
                  <div className="time-inputs" dir="ltr" title="دقیقه : ثانیه">
                    <input type="number" min={0} value={roundMinutes} onChange={(e) => setRoundMinutes(e.target.value)} placeholder="0" className="time-box" aria-label="دقیقه" disabled={timerRunning} />
                    <span className="time-sep" aria-hidden="true">:</span>
                    <input type="number" min={0} max={59} value={roundSeconds} onChange={(e) => setRoundSeconds(e.target.value)} placeholder="00" className="time-box" aria-label="ثانیه" disabled={timerRunning} />
                    <span className="time-sep" aria-hidden="true">.</span>
                    <input type="number" min={0} max={9} value={roundTenths} onChange={(e) => setRoundTenths(e.target.value)} placeholder="0" className="time-box time-box--tenths" aria-label="دهم ثانیه" disabled={timerRunning} />
                  </div>
                </label>
              </div>
              <div className="timer-row">
                <span className="timer-row-label">تایمر:</span>
                <span className="timer-display" dir="ltr">{formatRoundTime(elapsedMs / 1000)}</span>
                <button type="button" className={timerRunning ? 'timer-btn timer-btn--stop' : 'timer-btn timer-btn--start'} onClick={toggleTimer}>
                  {timerRunning ? '⏸ توقف' : '▶ شروع'}
                </button>
                <button type="button" className="timer-btn timer-btn--reset" onClick={requestResetTimer} disabled={timerRunning}>
                  ریست
                </button>
              </div>
            </>
          )}
          <ScoreForm sections={sections} values={values} onValuesChange={setValues} />
        </div>
      )}

      {showForm && (
        <div className="save-row">
          <button disabled={saving || !roundId || !teamId} onClick={openConfirm} className="primary">
            {allowsMultipleTries ? `بررسی و ثبت تلاش ${nextTryNumber}` : 'بررسی و ثبت امتیاز'}
          </button>
          {message && <span className={message.startsWith('خطا') ? 'error' : 'message'}>{message}</span>}
        </div>
      )}

      {confirmOpen && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="confirm-card">
            <h3 id="confirm-title">
              {allowsMultipleTries
                ? `آیا از ثبت تلاش ${nextTryNumber} مطمئن هستید؟`
                : 'آیا از ثبت امتیاز مطمئن هستید؟'}
            </h3>
            <p className="confirm-hint">لطفاً قبل از ذخیره، اطلاعات زیر را یک‌بار دیگر بررسی کنید.</p>
            <dl className="confirm-summary">
              <div><dt>تیم</dt><dd>{selectedTeam?.name || '—'}</dd></div>
              <div><dt>لیگ</dt><dd>{league}</dd></div>
              <div><dt>راند</dt><dd>{round?.label || `راند ${round?.round_number}`}</dd></div>
              {allowsMultipleTries && (
                <div><dt>شماره تلاش</dt><dd>{nextTryNumber}</dd></div>
              )}
              {needsTimer && (
                <div><dt>زمان راند</dt><dd><span className="num-ltr" dir="ltr">{formatRoundTime(roundTimeToSeconds(roundMinutes, roundSeconds, roundTenths))}</span></dd></div>
              )}
              {sections.map((sec) => (
                <div key={sec.key}><dt>{sec.label}</dt><dd><ScoreNum value={previewTotals.sectionResults[sec.key]?.total || 0} /></dd></div>
              ))}
              <div className="confirm-final"><dt>امتیاز نهایی</dt><dd><ScoreNum value={previewTotals.final_total} /></dd></div>
            </dl>

            {needsSignatureNow ? (
              <div className="signature-block">
                <label className="signature-name-label">
                  <span>نام کاپیتان تیم</span>
                  <input value={captainName} onChange={(e) => setCaptainName(e.target.value)} placeholder="نام و نام خانوادگی" />
                </label>
                <p className="confirm-hint">
                  {allowsMultipleTries
                    ? 'این امضا برای همه تلاش‌های این تیم در این راند معتبر است.'
                    : 'کاپیتان تیم با امضای زیر، صحت امتیازهای ثبت‌شده در این راند را تایید می‌کند.'}
                </p>
                <SignaturePad value={captainSignature} onChange={setCaptainSignature} />
              </div>
            ) : needsSignature && hasSharedSignature ? (
              <div className="signature-block signature-block-readonly">
                <div className="signature-readonly-name">
                  <span>کاپیتان تیم</span>
                  <strong>{sharedSignatureTry.captain_name || '—'}</strong>
                </div>
                <img src={sharedSignatureTry.captain_signature} alt="امضای کاپیتان تیم" className="signature-preview" />
                <span className="signature-hint">امضا قبلاً برای تلاش‌های این راند ثبت شده است</span>
              </div>
            ) : (
              <div className="signature-block">
                <label className="signature-name-label">
                  <span>نام کاپیتان تیم (اختیاری)</span>
                  <input value={captainName} onChange={(e) => setCaptainName(e.target.value)} placeholder="نام و نام خانوادگی" />
                </label>
              </div>
            )}

            <div className="confirm-actions">
              <button
                type="button"
                className="primary"
                disabled={saving || (needsSignatureNow && !captainSignature)}
                onClick={save}
                title={needsSignatureNow && !captainSignature ? 'ابتدا کاپیتان تیم باید امضا کند' : undefined}
              >
                {saving ? 'در حال ذخیره...' : 'بله، ذخیره شود'}
              </button>
              <button type="button" disabled={saving} onClick={() => setConfirmOpen(false)}>
                بازگشت و بررسی مجدد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
