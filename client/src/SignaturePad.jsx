import React, { useEffect, useRef, useState } from 'react';

// A small canvas-based signature pad. Captures mouse, touch, and pen strokes
// and reports the drawing to the parent as a base64 PNG data URL (or null
// when cleared/empty). Used so a team captain can sign off on a round's
// scoresheet before it's saved.
//
// - value: existing signature data URL, if any (used to redraw when editing)
// - onChange(dataUrlOrNull): called after each stroke ends, and on clear
// - disabled: renders a static, non-interactive view (used in read-only modals)
export default function SignaturePad({ value, onChange, disabled }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [empty, setEmpty] = useState(!value);

  // Size the canvas's internal pixel buffer to match its displayed size times
  // devicePixelRatio, so strokes stay crisp on high-DPI screens. Redraw any
  // existing signature (e.g. when re-opening a record) after resizing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1b2740';

    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value;
    }
    // Only re-run this on mount; resizing mid-signing isn't a case we need
    // to handle since the dialog doesn't resize while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const start = (e) => {
    if (disabled) return;
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
  };

  const move = (e) => {
    if (disabled || !drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const point = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    setEmpty(false);
  };

  const end = () => {
    if (disabled || !drawingRef.current) return;
    drawingRef.current = false;
    onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        className={'signature-canvas' + (disabled ? ' signature-canvas-disabled' : '')}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      {!disabled && (
        <div className="signature-pad-actions">
          <span className="signature-hint">
            {empty ? 'کاپیتان تیم اینجا امضا کند' : 'امضا ثبت شد ✔'}
          </span>
          <button type="button" className="signature-clear-btn" onClick={clear}>
            پاک کردن
          </button>
        </div>
      )}
    </div>
  );
}
