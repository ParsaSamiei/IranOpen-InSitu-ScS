import { useEffect, useState } from 'react';

export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const reload = () => {
    setState((s) => ({ ...s, loading: true }));
    return fn().then((data) => {
      setState({ data, loading: false, error: null });
      return data;
    }).catch((error) => {
      setState({ data: null, loading: false, error: error.message });
      throw error;
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload().catch(() => {}); }, deps);
  return [state, reload];
}
