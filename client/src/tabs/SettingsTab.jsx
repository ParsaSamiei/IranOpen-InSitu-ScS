import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';

export default function SettingsTab() {
  const [{ data: settings, loading, error }, reload] = useAsync(() => api.getSettings(), []);
  const [competition_name, setName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [logo_url, setLogoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (settings) {
      setName(settings.competition_name || '');
      setSubtitle(settings.subtitle || '');
      setLogoUrl(settings.logo_url || '');
    }
  }, [settings]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.updateSettings({ competition_name, subtitle, logo_url });
      setMessage('تنظیمات با موفقیت ذخیره شد ✔');
      reload();
    } catch (err) {
      setMessage('خطا: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tab-content">
      <h2>تنظیمات مسابقه</h2>
      <p className="rule-item-type-hint">
        این اطلاعات در سربرگ سایت عمومی و پنل داوری نمایش داده می‌شود — بدون نیاز به تغییر کد یا انتشار مجدد.
      </p>

      {loading && <p>در حال بارگذاری...</p>}
      {error && <p className="error">{error}</p>}

      {settings && (
        <form onSubmit={save} className="card">
          {logo_url && (
            <div className="settings-preview">
              <img src={logo_url} alt="پیش‌نمایش لوگو" onError={(e) => { e.target.style.display = 'none'; }} />
              <span className="muted">پیش‌نمایش لوگو</span>
            </div>
          )}
          <div className="form-grid">
            <label>
              <span>نام مسابقه</span>
              <input value={competition_name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              <span>زیرعنوان (اختیاری)</span>
              <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            </label>
            <label>
              <span>آدرس تصویر لوگو (اختیاری)</span>
              <input value={logo_url} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
            </label>
          </div>
          <div className="btn-row">
            <button type="submit" className="primary" disabled={saving}>{saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}</button>
            {message && <span className={message.startsWith('خطا') ? 'error' : 'message'}>{message}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
