import React, { useState } from 'react';
import { api } from '../api.js';
import { LEAGUES } from '../constants.js';

export default function ExportTab() {
  const [league, setLeague] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState('');

  const download = async () => {
    setDownloading(true);
    setMessage('');
    try {
      await api.exportScores(league);
      setMessage('فایل با موفقیت دانلود شد ✔');
    } catch (e) {
      setMessage('خطا: ' + e.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="tab-content">
      <h2>خروجی اکسل</h2>
      <p>
        {league
          ? 'یک فایل Excel شامل یک برگه برای هر راند این لیگ (با ستونی برای هر آیتم قوانین آن راند) به‌همراه برگه رده‌بندی دانلود می‌شود.'
          : 'یک فایل Excel شامل تمام لیگ‌ها دانلود می‌شود؛ هر راند در برگه مخصوص به خود و هر لیگ در برگه رده‌بندی مخصوص به خودش قرار می‌گیرد.'}
      </p>
      <select value={league} onChange={(e) => setLeague(e.target.value)}>
        <option value="">همه لیگ‌ها</option>
        {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <div className="save-row">
        <button className="primary" disabled={downloading} onClick={download}>
          {downloading ? 'در حال آماده‌سازی...' : 'دانلود فایل Excel'}
        </button>
        {message && <span className={message.startsWith('خطا') ? 'error' : 'message'}>{message}</span>}
      </div>
    </div>
  );
}
